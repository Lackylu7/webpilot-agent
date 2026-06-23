import { listRuns } from "@/lib/store/runs";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRuns();
  return Response.json({ runs });
}
