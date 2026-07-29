import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const templatePath = fileURLToPath(
  new URL("../template-cleaner.yaml", import.meta.url)
);
const template = parse(
  readFileSync(templatePath, "utf8")
) as CloudFormationTemplate;

describe("template-cleaner.yaml", () => {
  it("创建扫描型保留 ECR 仓库并限制镜像数量", () => {
    expect(resource("CleanerRepository")).toMatchObject({
      Type: "AWS::ECR::Repository",
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: {
        ImageScanningConfiguration: {
          ScanOnPush: true
        },
        ImageTagMutability: "IMMUTABLE",
        EncryptionConfiguration: {
          EncryptionType: "AES256"
        }
      }
    });
    expect(
      String(
        resource("CleanerRepository").Properties?.LifecyclePolicy &&
          (
            resource("CleanerRepository").Properties
              ?.LifecyclePolicy as Record<string, unknown>
          ).LifecyclePolicyText
      )
    ).toContain('"countNumber":10');
  });

  it("Fargate Task 使用最小规格、ARM64 和只读文件系统", () => {
    const task = resource("CleanerTaskDefinition").Properties;
    const containers = task?.ContainerDefinitions as Array<
      Record<string, unknown>
    >;

    expect(task).toMatchObject({
      Cpu: "256",
      Memory: "512",
      NetworkMode: "awsvpc",
      RequiresCompatibilities: ["FARGATE"],
      RuntimePlatform: {
        CpuArchitecture: "ARM64",
        OperatingSystemFamily: "LINUX"
      }
    });
    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      Name: "cleaner",
      Essential: true,
      ReadonlyRootFilesystem: true,
      Environment: expect.arrayContaining([
        {
          Name: "CLEANER_MAX_RUNTIME_SECONDS",
          Value: "240"
        },
        {
          Name: "CLEANER_EMPTY_POLLS_BEFORE_EXIT",
          Value: "2"
        }
      ])
    });
  });

  it("安全组零入站且仅允许 HTTPS 出站", () => {
    const group = resource("CleanerSecurityGroup").Properties;
    expect(group?.SecurityGroupIngress).toBeUndefined();
    expect(group?.SecurityGroupEgress).toEqual([
      {
        Description: "AWS service HTTPS endpoints",
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        CidrIp: "0.0.0.0/0"
      }
    ]);
  });

  it("Task Role 只消费目标队列并写入目标 Firehose", () => {
    const policies = resource("CleanerTaskRole").Properties
      ?.Policies as Array<{
      PolicyDocument: {
        Statement: Array<Record<string, unknown>>;
      };
    }>;
    expect(policies[0]?.PolicyDocument.Statement).toEqual([
      expect.objectContaining({
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes"
        ],
        Resource: { Ref: "IngestQueueArn" }
      }),
      expect.objectContaining({
        Action: ["firehose:PutRecordBatch"],
        Resource: { Ref: "FirehoseDeliveryStreamArn" }
      })
    ]);
  });

  it("Scheduler 默认禁用并每五分钟启动一个公网 Fargate Task", () => {
    expect(template.Parameters.ScheduleState).toMatchObject({
      Default: "DISABLED",
      AllowedValues: ["ENABLED", "DISABLED"]
    });
    const schedule = resource("CleanerSchedule").Properties;
    const target = schedule?.Target as Record<string, unknown>;
    const ecs = target.EcsParameters as Record<string, unknown>;

    expect(schedule).toMatchObject({
      ScheduleExpression: "rate(5 minutes)",
      State: { Ref: "ScheduleState" },
      FlexibleTimeWindow: { Mode: "OFF" }
    });
    expect(ecs).toMatchObject({
      LaunchType: "FARGATE",
      PlatformVersion: "LATEST",
      TaskCount: 1,
      TaskDefinitionArn: { Ref: "CleanerTaskDefinition" },
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: "ENABLED",
          Subnets: [{ Ref: "PublicSubnetId" }]
        }
      }
    });
    expect(target.DeadLetterConfig).toEqual({
      Arn: {
        "Fn::GetAtt": ["CleanerScheduleDeadLetterQueue", "Arn"]
      }
    });
  });

  it("Cleaner 日志默认保留 14 天", () => {
    expect(template.Parameters.LogRetentionDays?.Default).toBe(14);
    expect(resource("CleanerLogGroup").Properties?.RetentionInDays).toEqual({
      Ref: "LogRetentionDays"
    });
  });
});

function resource(logicalId: string): CloudFormationResource {
  const value = template.Resources[logicalId];
  if (!value) {
    throw new Error(`缺少资源: ${logicalId}`);
  }
  return value;
}

interface CloudFormationResource {
  Type?: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: Record<string, unknown>;
}

interface CloudFormationTemplate {
  Parameters: Record<string, Record<string, unknown> | undefined>;
  Resources: Record<string, CloudFormationResource | undefined>;
}
