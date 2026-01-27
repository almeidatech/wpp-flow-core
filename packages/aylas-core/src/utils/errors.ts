import { ErrorCode } from '../config/types';

export { ErrorCode };

export class AylasError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AylasError';
    Error.captureStackTrace(this, this.constructor);
  }
}
