export interface CleanerConfig {
  queueUrl: string;
  firehoseStreamName: string;
  waitTimeSeconds: number;
  maxMessages: number;
  maxRuntimeMs: number;
  emptyPollsBeforeExit: number;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv
): CleanerConfig {
  const queueUrl = environment.INGEST_QUEUE_URL?.trim();
  const firehoseStreamName =
    environment.FIREHOSE_STREAM_NAME?.trim();
  if (!queueUrl || !firehoseStreamName) {
    throw new TypeError("Cleaner 环境变量配置不完整");
  }

  return {
    queueUrl,
    firehoseStreamName,
    waitTimeSeconds: parseInteger(
      environment.SQS_WAIT_TIME_SECONDS,
      20,
      0,
      20
    ),
    maxMessages: parseInteger(
      environment.SQS_MAX_MESSAGES,
      10,
      1,
      10
    ),
    maxRuntimeMs:
      parseInteger(
        environment.CLEANER_MAX_RUNTIME_SECONDS,
        240,
        30,
        840
      ) * 1_000,
    emptyPollsBeforeExit: parseInteger(
      environment.CLEANER_EMPTY_POLLS_BEFORE_EXIT,
      2,
      1,
      10
    )
  };
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new TypeError("Cleaner 数值环境变量无效");
  }
  return parsed;
}
