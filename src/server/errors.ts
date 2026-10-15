export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "RATE_LIMITED" | "UNAVAILABLE" | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function fail(code: ErrorCode, message: string): never {
  throw new AppError(code, message);
}

export function publicError(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  const databaseCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["P2002", "P2003", "P2014", "P2025", "P2034"].includes(databaseCode)) {
    return { code: "CONFLICT" as const, message: "The record changed or is still referenced. Reload and try again." };
  }
  return { code: "INTERNAL_ERROR" as const, message: "The operation could not be completed." };
}

export const errorStatus: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_ERROR: 400,
  CONFLICT: 409, RATE_LIMITED: 429, UNAVAILABLE: 503, INTERNAL_ERROR: 500,
};
