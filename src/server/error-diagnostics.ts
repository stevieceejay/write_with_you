// Return only recognized error codes. Never serialize messages, URLs, or error objects.
const knownCodes = new Set([
  "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR", "CONFLICT", "RATE_LIMITED", "UNAVAILABLE", "INTERNAL_ERROR",
  "EACCES", "EPERM", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_TLS_CERT_ALTNAME_INVALID",
]);
export function errorCodes(error: unknown): string[] {
  const found = new Set<string>(), seen = new Set<object>();
  function visit(value: unknown, depth = 0) {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 8) return;
    seen.add(value);
    const item = value as Record<string, unknown>;
    for (const key of ["code", "errorCode"]) {
      const code = item[key];
      if (typeof code === "string" && (knownCodes.has(code) || /^P\d{4}$/.test(code) || /^[0-9][A-Z0-9]{4}$/.test(code))) found.add(code);
    }
    for (const key of ["cause", "originalError", "meta", "driverAdapterError"]) visit(item[key], depth + 1);
    if (Array.isArray(item.errors)) item.errors.slice(0, 20).forEach(child => visit(child, depth + 1));
  }
  visit(error);
  return found.size ? [...found] : ["UNKNOWN"];
}
export function dashboardDiagnostic(error: unknown, stage: "SESSION" | "DATA") {
  const codes = errorCodes(error);
  const hint = codes.some(code => ["P2021", "P2022", "42P01", "42703"].includes(code)) ? "Database tables or columns do not match the application schema. Check migration status."
    : codes.some(code => ["EACCES", "EPERM"].includes(code)) ? "The operating environment denied access to a required service."
    : codes.some(code => ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "P1001", "P1002"].includes(code)) ? "A required service could not be reached."
    : codes.includes("FORBIDDEN") ? "The account is restricted or needs email verification."
    : "Inspect the failed authenticated request; no sensitive error details are logged.";
  return `dashboard_load_failed stage=${stage} code=${codes.join(",")} — ${hint}`;
}
