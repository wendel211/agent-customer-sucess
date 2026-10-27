export class AppError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) { super(code); this.name = 'AppError'; }
}
export function requirePermission(ctx: { permissions: string[] }, permission: string): void {
  if (!ctx.permissions.includes(permission)) throw new AppError('FORBIDDEN', 403);
}
export function safeErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'TIMEOUT';
  return 'ANALYSIS_FAILED';
}
