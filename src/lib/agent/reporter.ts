import type { AgentPlan, AgentReport, BrowserSnapshot, ExtractedFact } from "@/lib/types/agent";

export function buildReport(plan: AgentPlan, snapshots: BrowserSnapshot[], facts: ExtractedFact[]): AgentReport {
  const products = [...new Set(facts.map((fact) => fact.product))];
  const title = products.length > 1 ? `Comparison report: ${products.join(" vs ")}` : `Research report: ${plan.goal}`;
  const grouped = groupByProduct(facts);
  const summary = buildSummary(products, grouped);
  const takeaways = buildTakeaways(products, grouped);
  const sources = snapshots.map((snapshot) => ({
    title: snapshot.title,
    url: snapshot.url,
    target: snapshot.target,
    sourceType: snapshot.sourceType
  }));
  const markdown = [
    `# ${title}`,
    "",
    summary,
    "",
    "## Extracted facts",
    "",
    "| Product | Plan | Price | Billing | Notes |",
    "|---|---|---:|---|---|",
    ...facts.map((fact) => `| ${fact.product} | ${fact.plan} | ${fact.price} | ${fact.billing} | ${escapePipe(fact.notes)} |`),
    "",
    "## Key takeaways",
    "",
    ...takeaways.map((takeaway) => `- ${takeaway}`),
    "",
    "## Sources",
    "",
    ...sources.map((source, index) => `${index + 1}. [${source.target}](${source.url}) - ${source.title}`)
  ].join("\n");

  return {
    title,
    summary,
    takeaways,
    markdown,
    sources
  };
}

function groupByProduct(facts: ExtractedFact[]) {
  return facts.reduce<Record<string, ExtractedFact[]>>((acc, fact) => {
    acc[fact.product] ??= [];
    acc[fact.product].push(fact);
    return acc;
  }, {});
}

function buildSummary(products: string[], grouped: Record<string, ExtractedFact[]>) {
  if (products.length === 0) {
    return "WebPilot could not extract enough structured facts. Review the sources and rerun with more specific targets.";
  }

  const freePlans = products.filter((product) => grouped[product]?.some((fact) => fact.price === "$0"));
  return `${products.join(", ")} were reviewed through read-only browser sessions. ${freePlans.length} of ${products.length} targets expose a free or starter option in the extracted data, while paid tiers differ mainly by collaboration controls, automation limits, and enterprise security.`;
}

function buildTakeaways(products: string[], grouped: Record<string, ExtractedFact[]>) {
  const takeaways = products.map((product) => {
    const plans = grouped[product] ?? [];
    const cheapestPaid = plans.find((fact) => fact.price.startsWith("$") && fact.price !== "$0");
    if (!cheapestPaid) {
      return `${product} needs manual review for paid pricing because no explicit paid tier was extracted.`;
    }
    return `${product}'s lowest extracted paid tier is ${cheapestPaid.plan} at ${cheapestPaid.price} ${cheapestPaid.billing}.`;
  });

  takeaways.push("Use official pricing pages as primary sources and treat dynamic or sales-led enterprise pricing as lower confidence.");
  return takeaways;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|");
}
