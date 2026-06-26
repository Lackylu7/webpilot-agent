import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgent } from "@/lib/agent/runner";
import { listRuns } from "@/lib/store/runs";
import type { RunEvent } from "@/lib/types/agent";

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "webpilot-runner-"));
  process.env.WEBPILOT_DATA_DIR = tempDir;
  process.env.WEBPILOT_DEMO_MODE = "true";
});

afterEach(async () => {
  delete process.env.WEBPILOT_DATA_DIR;
  delete process.env.WEBPILOT_DEMO_MODE;
  await rm(tempDir, { recursive: true, force: true });
});

describe("runAgent cancellation", () => {
  it("persists a cancelled run when the signal is already aborted", async () => {
    const controller = new AbortController();
    const events: RunEvent[] = [];
    controller.abort();

    const run = await runAgent("Compare Notion and Linear pricing", (event) => events.push(event), {
      runMode: "demo",
      signal: controller.signal
    });

    expect(run.status).toBe("cancelled");
    expect(run.timeline.at(-1)?.title).toBe("运行已停止");
    expect(events.at(-1)?.type).toBe("done");
    await expect(listRuns()).resolves.toHaveLength(1);
  });
});
