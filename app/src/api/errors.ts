export class DashboardApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
  }
}
