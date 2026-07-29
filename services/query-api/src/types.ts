export interface QueryApiConfig {
  readonly region: string;
  readonly database: string;
  readonly view: string;
  readonly workgroup: string;
  readonly allowedProjects: readonly string[];
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly cacheTtlMs: number;
  readonly queryTimeoutMs: number;
  readonly pollIntervalMs: number;
}

export type QueryApiEnvironment = Readonly<
  Partial<Record<string, string | undefined>>
>;
