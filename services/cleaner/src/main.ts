import { FirehoseClient } from "@aws-sdk/client-firehose";
import { SQSClient } from "@aws-sdk/client-sqs";

import { loadConfig } from "./config.js";
import { FirehoseWriter } from "./firehose.js";
import { consoleLogger } from "./logger.js";
import { CleanerWorker } from "./worker.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const sqsClient = new SQSClient({});

  const worker = new CleanerWorker({
    queueUrl: config.queueUrl,
    sqsClient: {
      receive: (command) => sqsClient.send(command),
      delete: (command) => sqsClient.send(command)
    },
    firehoseWriter: new FirehoseWriter({
      streamName: config.firehoseStreamName,
      client: new FirehoseClient({})
    }),
    waitTimeSeconds: config.waitTimeSeconds,
    maxMessages: config.maxMessages
  });

  try {
    await worker.run(controller.signal);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

void main().catch(() => {
  consoleLogger.error("Cleaner 启动失败", {
    code: "STARTUP_FAILED"
  });
  process.exitCode = 1;
});
