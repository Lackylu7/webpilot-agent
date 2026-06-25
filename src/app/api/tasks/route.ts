import { clearRuns, listRuns } from "@/lib/store/runs";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRuns();
  return Response.json({ runs });
}

export async function DELETE() {
  await clearRuns();
  return Response.json({ ok: true });
}
