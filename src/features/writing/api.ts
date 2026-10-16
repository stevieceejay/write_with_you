export class APIError extends Error {
  readonly code: string;
  constructor(message: string, code = "UNAVAILABLE") { super(message); this.code = code; }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: "no-store", headers: { ...(options?.body ? { "content-type": "application/json" } : {}), ...options?.headers } }); }
  catch (error) { if (error instanceof Error && error.name === "AbortError") throw error; throw new APIError("We couldn’t connect. Your unsaved writing is still here."); }
  let body;
  try { body = await response.json(); } catch { throw new APIError("The server returned an unexpected response. Please try again."); }
  if (!response.ok || !body.ok) throw new APIError(body.error?.message ?? "Something went wrong. Please try again.", body.error?.code);
  return body.data as T;
}
