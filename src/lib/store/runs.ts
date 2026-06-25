import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRun } from "@/lib/types/agent";

const dataDir = path.join(process.cwd(), "data");
const runsPath = path.join(dataDir, "runs.json");

export async function listRuns(): Promise<AgentRun[]> {
  try {
    const raw = await readFile(runsPath, "utf8");
    const runs = JSON.parse(raw) as AgentRun[];
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveRun(run: AgentRun) {
  await mkdir(dataDir, { recursive: true });
  const runs = await listRuns();
  const next = [run, ...runs.filter((item) => item.id !== run.id)].slice(0, 50);
  await writeFile(runsPath, JSON.stringify(next, null, 2), "utf8");
}

export async function clearRuns() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(runsPath, "[]", "utf8");
}
