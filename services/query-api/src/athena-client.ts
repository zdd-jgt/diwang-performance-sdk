import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand
} from "@aws-sdk/client-athena";

import type { QueryApiConfig } from "./types.js";

export type AthenaQueryState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface AthenaStartInput {
  readonly sql: string;
  readonly database: string;
  readonly workgroup: string;
}

export interface AthenaResultPage {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | null)[])[];
  readonly nextToken?: string;
}

export interface AthenaGateway {
  start(input: AthenaStartInput): Promise<string>;
  state(queryExecutionId: string): Promise<AthenaQueryState>;
  results(queryExecutionId: string, nextToken?: string): Promise<AthenaResultPage>;
  stop(queryExecutionId: string): Promise<void>;
}

export interface AthenaTable {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, string | null>>[];
}

export class AthenaQueryFailure extends Error {
  public constructor(
    public readonly kind: "failed" | "cancelled" | "timeout" | "unavailable"
  ) {
    super(
      kind === "timeout"
        ? "Athena 查询超时，请稍后重试"
        : kind === "cancelled"
          ? "Athena 查询已取消"
          : kind === "failed"
            ? "Athena 查询执行失败"
            : "Athena 暂时不可用"
    );
    this.name = "AthenaQueryFailure";
  }
}

function normalizeState(value?: string): AthenaQueryState {
  switch (value) {
    case "QUEUED":
    case "RUNNING":
    case "SUCCEEDED":
    case "FAILED":
    case "CANCELLED":
      return value;
    default:
      throw new AthenaQueryFailure("unavailable");
  }
}

export class AwsAthenaGateway implements AthenaGateway {
  private readonly client: AthenaClient;

  public constructor(region: string, client?: AthenaClient) {
    this.client = client ?? new AthenaClient({ region });
  }

  public async start(input: AthenaStartInput): Promise<string> {
    const response = await this.client.send(
      new StartQueryExecutionCommand({
        QueryString: input.sql,
        QueryExecutionContext: { Database: input.database },
        WorkGroup: input.workgroup
      })
    );
    if (!response.QueryExecutionId) {
      throw new AthenaQueryFailure("unavailable");
    }
    return response.QueryExecutionId;
  }

  public async state(queryExecutionId: string): Promise<AthenaQueryState> {
    const response = await this.client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
    return normalizeState(response.QueryExecution?.Status?.State);
  }

  public async results(
    queryExecutionId: string,
    nextToken?: string
  ): Promise<AthenaResultPage> {
    const response = await this.client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        ...(nextToken ? { NextToken: nextToken } : {}),
        MaxResults: 1000
      })
    );
    const columns =
      response.ResultSet?.ResultSetMetadata?.ColumnInfo?.map(
        (column) => column.Name ?? ""
      ) ?? [];
    const rows =
      response.ResultSet?.Rows?.map(
        (row) => row.Data?.map((cell) => cell.VarCharValue ?? null) ?? []
      ) ?? [];

    return {
      columns,
      rows,
      ...(response.NextToken ? { nextToken: response.NextToken } : {})
    };
  }

  public async stop(queryExecutionId: string): Promise<void> {
    await this.client.send(
      new StopQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
  }
}

export interface AthenaQueryExecutorOptions {
  readonly now?: () => number;
  readonly delay?: (milliseconds: number) => Promise<void>;
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function rowToRecord(
  columns: readonly string[],
  values: readonly (string | null)[]
): Readonly<Record<string, string | null>> {
  return Object.fromEntries(
    columns.map((column, index) => [column, values[index] ?? null])
  );
}

function isHeaderRow(
  columns: readonly string[],
  values: readonly (string | null)[]
): boolean {
  return (
    columns.length > 0 &&
    columns.every((column, index) => values[index] === column)
  );
}

export class AthenaQueryExecutor {
  private readonly now: () => number;
  private readonly delay: (milliseconds: number) => Promise<void>;

  public constructor(
    private readonly gateway: AthenaGateway,
    private readonly config: QueryApiConfig,
    options: AthenaQueryExecutorOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.delay = options.delay ?? defaultDelay;
  }

  public async execute(sql: string): Promise<AthenaTable> {
    let queryExecutionId: string;
    try {
      queryExecutionId = await this.gateway.start({
        sql,
        database: this.config.database,
        workgroup: this.config.workgroup
      });
    } catch (error) {
      if (error instanceof AthenaQueryFailure) throw error;
      throw new AthenaQueryFailure("unavailable");
    }

    const deadline = this.now() + this.config.queryTimeoutMs;
    try {
      await this.waitForSuccess(queryExecutionId, deadline);
      return await this.readAllResults(queryExecutionId);
    } catch (error) {
      if (error instanceof AthenaQueryFailure) throw error;
      throw new AthenaQueryFailure("unavailable");
    }
  }

  private async waitForSuccess(
    queryExecutionId: string,
    deadline: number
  ): Promise<void> {
    while (this.now() <= deadline) {
      const state = await this.gateway.state(queryExecutionId);
      if (state === "SUCCEEDED") return;
      if (state === "FAILED") throw new AthenaQueryFailure("failed");
      if (state === "CANCELLED") throw new AthenaQueryFailure("cancelled");
      await this.delay(this.config.pollIntervalMs);
    }

    try {
      await this.gateway.stop(queryExecutionId);
    } catch {
      // 停止失败不能覆盖超时这一主错误，也不得泄漏 AWS 原始异常。
    }
    throw new AthenaQueryFailure("timeout");
  }

  private async readAllResults(
    queryExecutionId: string
  ): Promise<AthenaTable> {
    let nextToken: string | undefined;
    let columns: readonly string[] = [];
    const rows: Readonly<Record<string, string | null>>[] = [];
    let firstPage = true;

    do {
      const page = await this.gateway.results(queryExecutionId, nextToken);
      if (columns.length === 0) columns = page.columns;
      const pageRows =
        firstPage && page.rows[0] && isHeaderRow(columns, page.rows[0])
          ? page.rows.slice(1)
          : page.rows;
      rows.push(...pageRows.map((row) => rowToRecord(columns, row)));
      nextToken = page.nextToken;
      firstPage = false;
    } while (nextToken);

    return { columns, rows };
  }
}

export function createAthenaQueryExecutor(
  config: QueryApiConfig
): AthenaQueryExecutor {
  return new AthenaQueryExecutor(
    new AwsAthenaGateway(config.region),
    config
  );
}
