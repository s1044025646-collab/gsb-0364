/** 统一错误码：API 与 CLI 共用。 */
export type ErrorCode =
  | 'INVALID_PARAM'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'STILL_UNDETERMINED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function invalid(message: string, details?: unknown): AppError {
  return new AppError('INVALID_PARAM', message, details);
}

export function notFound(message: string, details?: unknown): AppError {
  return new AppError('NOT_FOUND', message, details);
}
