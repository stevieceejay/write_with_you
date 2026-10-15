export async function GET() {
  return Response.json({ ok: true, service: "write-with-you" }, { headers: { "Cache-Control": "no-store" } });
}
