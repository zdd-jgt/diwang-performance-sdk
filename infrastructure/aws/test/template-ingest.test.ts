import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const templatePath = fileURLToPath(
  new URL("../template-ingest.yaml", import.meta.url)
);
const template = parse(
  readFileSync(templatePath, "utf8")
) as CloudFormationTemplate;

describe("template-ingest.yaml", () => {
  it("定义 API Gateway、Lambda、FIFO SQS 和保留型 DLQ", () => {
    expect(template.Transform).toBe("AWS::Serverless-2016-10-31");
    expect(template.Resources.IngestHttpApi?.Type).toBe(
      "AWS::Serverless::HttpApi"
    );
    expect(template.Resources.IngestFunction?.Type).toBe(
      "AWS::Serverless::Function"
    );
    expect(template.Resources.IngestQueue?.Properties).toMatchObject({
      FifoQueue: true,
      ContentBasedDeduplication: false,
      SqsManagedSseEnabled: true,
      MaximumMessageSize: 262144,
      RedrivePolicy: {
        maxReceiveCount: 5
      }
    });
    expect(template.Resources.IngestDeadLetterQueue).toMatchObject({
      Type: "AWS::SQS::Queue",
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: {
        FifoQueue: true,
        MessageRetentionPeriod: 1209600
      }
    });
  });

  it("HTTP API 只映射 POST /v1/collect 并配置限流", () => {
    const api = template.Resources.IngestHttpApi?.Properties;
    const collect =
      template.Resources.IngestFunction?.Properties?.Events?.Collect
        ?.Properties;

    expect(collect).toMatchObject({
      Path: "/v1/collect",
      Method: "POST",
      PayloadFormatVersion: "2.0"
    });
    expect(api?.DefaultRouteSettings).toEqual({
      ThrottlingBurstLimit: { Ref: "ApiBurstLimit" },
      ThrottlingRateLimit: { Ref: "ApiRateLimit" }
    });
    expect(JSON.stringify(api?.AccessLogSettings)).not.toContain(
      "sourceIp"
    );
  });

  it("Lambda 只获得目标队列 SendMessage 权限", () => {
    const functionProperties =
      template.Resources.IngestFunction?.Properties;
    const policy = functionProperties?.Policies?.[0];

    expect(functionProperties).toMatchObject({
      Handler: "index.handler",
      CodeUri: "../../services/ingest/dist/",
      Environment: {
        Variables: {
          INGEST_QUEUE_URL: { Ref: "IngestQueue" }
        }
      }
    });
    expect(policy?.Statement).toEqual([
      expect.objectContaining({
        Effect: "Allow",
        Action: ["sqs:SendMessage"],
        Resource: {
          "Fn::GetAtt": ["IngestQueue", "Arn"]
        }
      })
    ]);
    expect(JSON.stringify(policy)).not.toContain('"*"');
  });
});

interface CloudFormationResource {
  Type?: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: {
    [key: string]: unknown;
    Events?: {
      Collect?: {
        Properties?: Record<string, unknown>;
      };
    };
    Policies?: Array<{
      Statement?: unknown[];
    }>;
    DefaultRouteSettings?: Record<string, unknown>;
    AccessLogSettings?: Record<string, unknown>;
  };
}

interface CloudFormationTemplate {
  Transform?: string;
  Resources: Record<string, CloudFormationResource | undefined>;
}
