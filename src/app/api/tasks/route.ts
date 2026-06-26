import { clearRuns, importRuns, listRuns } from "@/lib/store/runs";
import type { AgentRun } from "@/lib/types/agent";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRuns();
  return Response.json({ runs });
}

export async function DELETE() {
  await clearRuns();
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { runs?: AgentRun[] } | AgentRun[] | null;
  const incoming = Array.isArray(body) ? body : body?.runs;
  if (!Array.isArray(incoming)) {
    return Response.json({ error: "请上传包含 runs 数组的历史备份文件。" }, { status: 400 });
  }

  const runs = await importRuns(incoming);
  return Response.json({ ok: true, runs });
}
