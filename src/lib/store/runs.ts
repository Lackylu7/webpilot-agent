import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRun } from "@/lib/types/agent";

const configuredMaxRuns = Number(process.env.WEBPILOT_HISTORY_LIMIT ?? 100);
const maxRuns = Number.isFinite(configuredMaxRuns) && configuredMaxRuns > 0 ? configuredMaxRuns : 100;

function dataDir() {
  return process.env.WEBPILOT_DATA_DIR ?? path.join(process.cwd(), "data");
}

function runsPath() {
  return path.join(dataDir(), "runs.json");
}

export async function listRuns(): Promise<AgentRun[]> {
  try {
    const raw = await readFile(runsPath(), "utf8");
    const runs = JSON.parse(raw) as AgentRun[];
    if (!Array.isArray(runs)) return [];
    return runs.filter(isRunLike).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveRun(run: AgentRun) {
  await mkdir(dataDir(), { recursive: true });
  const runs = await listRuns();
  const next = mergeRuns([run, ...runs]);
  await writeRuns(next);
}

export async function clearRuns() {
  await mkdir(dataDir(), { recursive: true });
  await writeRuns([]);
}

export async function importRuns(incoming: AgentRun[]) {
  const current = await listRuns();
  const next = mergeRuns([...incoming.filter(isRunLike), ...current]);
  await writeRuns(next);
  return next;
}

export async function getRunStoreInfo() {
  const runs = await listRuns();
  let sizeBytes = 0;
  try {
    sizeBytes = (await stat(runsPath())).size;
  } catch {
    sizeBytes = 0;
  }
  return {
    dataDir: dataDir(),
    runsPath: runsPath(),
    runCount: runs.length,
    maxRuns,
    sizeBytes,
    latestRunAt: runs[0]?.createdAt ?? null
  };
}

function mergeRuns(runs: AgentRun[]) {
  const seen = new Set<string>();
  const merged: AgentRun[] = [];
  for (const run of runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    merged.push(run);
  }
  return merged.slice(0, maxRuns);
}

async function writeRuns(runs: AgentRun[]) {
  await mkdir(dataDir(), { recursive: true });
  const destination = runsPath();
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(runs, null, 2), "utf8");
  await rename(temporary, destination);
}

function isRunLike(value: unknown): value is AgentRun {
  const run = value as Partial<AgentRun>;
  return Boolean(
    run &&
      typeof run.id === "string" &&
      typeof run.task === "string" &&
      typeof run.status === "string" &&
      typeof run.activeStage === "string" &&
      typeof run.createdAt === "string" &&
      Array.isArray(run.timeline) &&
      Array.isArray(run.snapshots) &&
      Array.isArray(run.facts)
  );
}
