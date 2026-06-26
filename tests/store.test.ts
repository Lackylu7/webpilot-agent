import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRuns, importRuns, listRuns, saveRun } from "@/lib/store/runs";
import type { AgentRun } from "@/lib/types/agent";

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "webpilot-runs-"));
  process.env.WEBPILOT_DATA_DIR = tempDir;
});

afterEach(async () => {
  delete process.env.WEBPILOT_DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

describe("run store", () => {
  it("saves runs newest first and replaces duplicate ids", async () => {
    await saveRun(makeRun("a", "2026-01-01T00:00:00.000Z", "Original task"));
    await saveRun(makeRun("b", "2026-01-02T00:00:00.000Z", "Newer task"));
    await saveRun(makeRun("a", "2026-01-03T00:00:00.000Z", "Replaced task"));

    const runs = await listRuns();

    expect(runs.map((run) => run.id)).toEqual(["a", "b"]);
    expect(runs[0].task).toBe("Replaced task");
  });

  it("imports history backups and ignores malformed rows", async () => {
    await saveRun(makeRun("local", "2026-01-01T00:00:00.000Z", "Local task"));

    const imported = await importRuns([
      makeRun("backup", "2026-01-02T00:00:00.000Z", "Backup task"),
      { id: "bad" } as AgentRun
    ]);

    expect(imported.map((run) => run.id)).toEqual(["backup", "local"]);
  });

  it("clears local history", async () => {
    await saveRun(makeRun("a", "2026-01-01T00:00:00.000Z", "Task"));
    await clearRuns();

    await expect(listRuns()).resolves.toEqual([]);
  });
});

function makeRun(id: string, createdAt: string, task: string): AgentRun {
  return {
    id,
    task,
    status: "completed",
    activeStage: "report",
    createdAt,
    updatedAt: createdAt,
    timeline: [],
    snapshots: [],
    facts: []
  };
}
