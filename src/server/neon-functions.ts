import "server-only";
import { fail } from "./errors.ts";

export async function analyzeText(text: string) {
  const base = process.env.NEON_FUNCTION_HELLO_BASE_URL;
  const key = process.env.FUNCTION_API_KEY;
  if (!base || !key || key.length < 32) fail("UNAVAILABLE", "Text analysis is not configured.");
  const url = new URL(base);
  if (url.protocol !== "https:") fail("UNAVAILABLE", "Text analysis requires an HTTPS endpoint.");
  let response: Response;
  try {
    response = await fetch(url.origin, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
  } catch { fail("UNAVAILABLE", "Text analysis is temporarily unavailable."); }
  if (!response.ok) fail("UNAVAILABLE", "Text analysis could not be completed.");
  const result = await response.json();
  for (const name of ["wordCount", "characterCount", "paragraphCount"]) {
    if (!Number.isSafeInteger(result[name]) || result[name] < 0) fail("UNAVAILABLE", "Text analysis returned an invalid response.");
  }
  return { wordCount: result.wordCount as number, characterCount: result.characterCount as number, paragraphCount: result.paragraphCount as number };
}
