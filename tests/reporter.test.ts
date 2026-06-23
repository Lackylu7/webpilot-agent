import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/agent/reporter";
import type { AgentPlan, BrowserSnapshot, ExtractedFact } from "@/lib/types/agent";

const plan: AgentPlan = {
  goal: "Compare products",
  targets: [],
  steps: [],
  riskPolicy: "Read-only"
};

const snapshots: BrowserSnapshot[] = [
  {
    target: "Notion",
    url: "https://www.notion.com/pricing",
    title: "Notion Pricing",
    excerpt: "Pricing page",
    capturedAt: "2026-01-01T00:00:00.000Z",
    sourceType: "seed"
  }
];

const facts: ExtractedFact[] = [
  {
    product: "Notion",
    plan: "Plus",
    price: "$10",
    billing: "/user/mo",
    notes: "Small teams",
    sourceUrl: "https://www.notion.com/pricing",
    confidence: 0.8
  }
];

describe("buildReport", () => {
  it("creates markdown with facts and sources", () => {
    const report = buildReport(plan, snapshots, facts);

    expect(report.markdown).toContain("| Notion | Plus | $10 | /user/mo | Small teams |");
    expect(report.markdown).toContain("[Notion](https://www.notion.com/pricing)");
    expect(report.sources).toHaveLength(1);
  });
});
