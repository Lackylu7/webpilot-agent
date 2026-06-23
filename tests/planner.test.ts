import { describe, expect, it } from "vitest";
import { extractTargets } from "@/lib/agent/planner";

describe("extractTargets", () => {
  it("extracts known SaaS targets from a comparison prompt", () => {
    const targets = extractTargets("Compare Notion, ClickUp, and Linear pricing");

    expect(targets.map((target) => target.name)).toEqual(["Notion", "ClickUp", "Linear"]);
    expect(targets[0].officialUrl).toContain("notion");
  });

  it("falls back to demo targets when prompt is too vague", () => {
    const targets = extractTargets("compare project management pricing");

    expect(targets.length).toBeGreaterThanOrEqual(3);
  });
});
