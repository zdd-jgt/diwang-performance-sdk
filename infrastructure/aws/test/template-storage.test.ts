import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const templatePath = fileURLToPath(
  new URL("../template-storage.yaml", import.meta.url)
);
const template = parse(
  readFileSync(templatePath, "utf8")
) as CloudFormationTemplate;

describe("template-storage.yaml", () => {
  it("限制 ProjectName，确保最长 Firehose 名称不超过 64 字符", () => {
    const projectName = parameter("ProjectName");
    const environments = parameter("Environment").AllowedValues as string[];
    const longestEnvironment = Math.max(
      ...environments.map((value) => value.length)
    );

    expect(projectName).toMatchObject({
      Type: "String",
      MaxLength: 43,
      AllowedPattern: "^[a-z0-9-]+$"
    });
    expect(
      Number(projectName.MaxLength) +
        1 +
        longestEnvironment +
        "-telemetry".length
    ).toBe(64);
  });

  it("定义保留、加密且禁止公开访问的数据桶和查询结果桶", () => {
    for (const logicalId of [
      "TelemetryDataBucket",
      "AthenaResultsBucket"
    ]) {
      const bucket = resource(logicalId);
      expect(bucket).toMatchObject({
        Type: "AWS::S3::Bucket",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: "AES256"
                }
              }
            ]
          },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true
          }
        }
      });
    }
    expect(
      resource("AthenaResultsBucket").Properties?.LifecycleConfiguration
    ).toMatchObject({
      Rules: [
        expect.objectContaining({
          Status: "Enabled",
          ExpirationInDays: 7
        })
      ]
    });
  });

  it("Glue 表完整映射 Cleaner 固定列并按服务端日期投影分区", () => {
    const tableInput = resource("TelemetryGlueTable").Properties
      ?.TableInput as Record<string, unknown>;
    const descriptor = tableInput.StorageDescriptor as Record<
      string,
      unknown
    >;
    const columns = descriptor.Columns as Array<{
      Name: string;
      Type: string;
    }>;

    expect(columns.map((column) => column.Name)).toEqual([
      "schemaVersion",
      "receivedAt",
      "partitionDate",
      "requestId",
      "batchId",
      "recordId",
      "eventId",
      "projectId",
      "sessionId",
      "clientTimestamp",
      "sdkVersion",
      "release",
      "traceId",
      "sampleRate",
      "pageUrl",
      "referrer",
      "browserName",
      "browserVersion",
      "osName",
      "osVersion",
      "platformType",
      "eventType",
      "metricName",
      "metricValue",
      "metricRating",
      "errorKind",
      "errorMessage",
      "errorStack",
      "errorSourceUrl",
      "errorLine",
      "errorColumn"
    ]);
    expect(tableInput.PartitionKeys).toEqual([
      { Name: "partition_date", Type: "string" }
    ]);
    expect(tableInput.Parameters).toMatchObject({
      classification: "parquet",
      compressionType: "snappy",
      "projection.enabled": "true",
      "projection.partition_date.type": "date",
      "projection.partition_date.format": "yyyy-MM-dd"
    });
    expect(JSON.stringify(tableInput.Parameters)).toContain(
      "${!partition_date}"
    );
  });

  it("Firehose 使用 DirectPut、动态日期分区和 Snappy Parquet 转换", () => {
    const firehose = resource("TelemetryDeliveryStream");
    const destination = firehose.Properties
      ?.ExtendedS3DestinationConfiguration as Record<string, unknown>;
    const conversion = destination.DataFormatConversionConfiguration as {
      Enabled?: boolean;
      OutputFormatConfiguration?: {
        Serializer?: {
          ParquetSerDe?: Record<string, unknown>;
        };
      };
      SchemaConfiguration?: Record<string, unknown>;
    };
    const processing = destination.ProcessingConfiguration as {
      Processors?: Array<{
        Type?: string;
        Parameters?: Array<Record<string, string>>;
      }>;
    };

    expect(firehose.Properties?.DeliveryStreamType).toBe("DirectPut");
    expect(destination).toMatchObject({
      Prefix:
        "telemetry/partition_date=!{partitionKeyFromQuery:partition_date}/",
      FileExtension: ".parquet",
      CompressionFormat: "UNCOMPRESSED",
      DynamicPartitioningConfiguration: {
        Enabled: true
      }
    });
    expect(processing.Processors).toEqual([
      {
        Type: "MetadataExtraction",
        Parameters: [
          {
            ParameterName: "MetadataExtractionQuery",
            ParameterValue: "{partition_date:.partitionDate}"
          },
          {
            ParameterName: "JsonParsingEngine",
            ParameterValue: "JQ-1.6"
          }
        ]
      }
    ]);
    expect(conversion.Enabled).toBe(true);
    expect(
      conversion.OutputFormatConfiguration?.Serializer?.ParquetSerDe
    ).toMatchObject({
      Compression: "SNAPPY",
      EnableDictionaryCompression: true
    });
    expect(conversion.SchemaConfiguration).toMatchObject({
      DatabaseName: { Ref: "TelemetryGlueDatabase" },
      TableName: { Ref: "TelemetryGlueTable" },
      VersionId: "LATEST"
    });
  });

  it("IAM 仅允许 Firehose 写目标桶且 Cleaner 只写目标流", () => {
    const deliveryPolicies = resource("FirehoseDeliveryRole").Properties
      ?.Policies as Array<{
      PolicyDocument: {
        Statement: Array<Record<string, unknown>>;
      };
    }>;
    const statements = deliveryPolicies[0]?.PolicyDocument.Statement ?? [];
    expect(JSON.stringify(statements)).not.toContain('"Resource":"*"');

    const cleanerStatement = (
      resource("CleanerFirehoseWritePolicy").Properties
        ?.PolicyDocument as {
        Statement: Array<Record<string, unknown>>;
      }
    ).Statement[0];
    expect(cleanerStatement).toEqual({
      Sid: "PutOnlyToTelemetryStream",
      Effect: "Allow",
      Action: ["firehose:PutRecordBatch"],
      Resource: {
        "Fn::GetAtt": ["TelemetryDeliveryStream", "Arn"]
      }
    });
  });

  it("Athena 工作组限制扫描量并提供租户、日期、recordId 去重", () => {
    const workGroup = resource("TelemetryAthenaWorkGroup").Properties
      ?.WorkGroupConfiguration as Record<string, unknown>;
    expect(workGroup).toMatchObject({
      BytesScannedCutoffPerQuery: {
        Ref: "AthenaBytesScannedCutoff"
      },
      EnforceWorkGroupConfiguration: true,
      PublishCloudWatchMetricsEnabled: true,
      ResultConfiguration: {
        EncryptionConfiguration: {
          EncryptionOption: "SSE_S3"
        }
      }
    });

    const dedupQuery = queryString("CreateDeduplicatedViewQuery");
    expect(normalizeSql(dedupQuery)).toContain(
      "partition by projectid, partition_date, recordid"
    );
    expect(dedupQuery).toContain("FROM ${GlueTableName} AS raw");
    expect(dedupQuery.toLowerCase()).toContain(
      "where duplicate_rank = 1"
    );

    const percentileQuery = queryString(
      "CoreWebVitalsPercentilesQuery"
    );
    expect(percentileQuery).toContain("approx_percentile(metricvalue, 0.50)");
    expect(percentileQuery).toContain("approx_percentile(metricvalue, 0.95)");
    expect(percentileQuery).toContain("approx_percentile(metricvalue, 0.99)");
    expect(percentileQuery).toContain("partition_date BETWEEN");
    expect(percentileQuery).toContain("INTERVAL '6' DAY");
    expect(percentileQuery).not.toContain("INTERVAL '7' DAY");
  });

  it("独立 SQL 与模板查询保持关键语义一致", () => {
    const dedupSql = readSql("create-telemetry-deduplicated-view.sql");
    const percentileSql = readSql(
      "core-web-vitals-percentiles-7d.sql"
    );
    expect(normalizeSql(dedupSql)).toContain(
      "partition by projectid, partition_date, recordid"
    );
    expect(dedupSql.toLowerCase()).toContain("duplicate_rank = 1");
    expect(percentileSql).toContain("telemetry_deduplicated");
    expect(percentileSql).toContain("partition_date BETWEEN");
    expect(percentileSql).toContain("INTERVAL '6' DAY");
    expect(percentileSql).not.toContain("INTERVAL '7' DAY");
  });
});

function resource(logicalId: string): CloudFormationResource {
  const value = template.Resources[logicalId];
  if (!value) {
    throw new Error(`缺少资源: ${logicalId}`);
  }
  return value;
}

function parameter(name: string): Record<string, unknown> {
  const value = template.Parameters[name];
  if (!value) {
    throw new Error(`缺少参数: ${name}`);
  }
  return value;
}

function readSql(filename: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../sql/${filename}`, import.meta.url)),
    "utf8"
  );
}

function queryString(logicalId: string): string {
  const query = resource(logicalId).Properties?.QueryString;
  if (typeof query === "string") {
    return query;
  }
  if (
    query &&
    typeof query === "object" &&
    "Fn::Sub" in query &&
    typeof query["Fn::Sub"] === "string"
  ) {
    return query["Fn::Sub"];
  }
  throw new Error(`查询字符串格式无效: ${logicalId}`);
}

function normalizeSql(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

interface CloudFormationResource {
  Type?: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: Record<string, unknown>;
}

interface CloudFormationTemplate {
  Parameters: Record<string, Record<string, unknown>>;
  Resources: Record<string, CloudFormationResource | undefined>;
}
