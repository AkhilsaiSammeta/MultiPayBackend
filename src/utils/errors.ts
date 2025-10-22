export type AppErrorOptions = {
  status?: number;
  code?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  cause?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'INTERNAL_SERVER_ERROR';
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
