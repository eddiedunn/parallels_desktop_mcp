/**
 * Common error types for the application
 */

/**
 * Error type for command execution failures
 */
export interface CommandError extends Error {
  stdout?: string;
  stderr?: string;
  code?: number;
  signal?: string;
}

/**
 * Type guard to check if an error is a CommandError
 */
export function isCommandError(error: unknown): error is CommandError {
  return (
    error instanceof Error &&
    (typeof (error as CommandError).stdout === 'string' ||
      typeof (error as CommandError).stderr === 'string' ||
      typeof (error as CommandError).code === 'number')
  );
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}