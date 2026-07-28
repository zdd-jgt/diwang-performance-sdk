export type LogContext = Record<string, string | number>;

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export const consoleLogger: Logger = {
  info: (message, context = {}) => {
    console.info(JSON.stringify({ level: "info", message, ...context }));
  },
  warn: (message, context = {}) => {
    console.warn(JSON.stringify({ level: "warn", message, ...context }));
  },
  error: (message, context = {}) => {
    console.error(JSON.stringify({ level: "error", message, ...context }));
  }
};
