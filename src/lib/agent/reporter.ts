import type { AgentPlan, AgentReport, BrowserSnapshot, ExtractedFact } from "@/lib/types/agent";

export function buildReport(plan: AgentPlan, snapshots: BrowserSnapshot[], facts: ExtractedFact[]): AgentReport {
  const products = [...new Set(facts.map((fact) => fact.product))];
  const title = products.length > 1 ? `对比报告：${products.join(" vs ")}` : `调研报告：${plan.goal}`;
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
    "## 抽取结果",
    "",
    "| 产品 | 方案 | 价格 | 计费 | 备注 |",
    "|---|---|---:|---|---|",
    ...facts.map((fact) => `| ${fact.product} | ${fact.plan} | ${fact.price} | ${fact.billing} | ${escapePipe(fact.notes)} |`),
    "",
    "## 关键结论",
    "",
    ...takeaways.map((takeaway) => `- ${takeaway}`),
    "",
    "## 来源",
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
    return "WebPilot 没有抽取到足够的结构化事实。你可以检查来源，或者换一个更具体的任务重新运行。";
  }

  const freePlans = products.filter((product) => grouped[product]?.some((fact) => fact.price === "$0"));
  return `WebPilot 通过只读浏览会话调研了 ${products.join("、")}。抽取结果显示，${products.length} 个对象中有 ${freePlans.length} 个提供免费或入门方案；付费层级的主要差异集中在协作权限、自动化限制和企业安全能力。`;
}

function buildTakeaways(products: string[], grouped: Record<string, ExtractedFact[]>) {
  const takeaways = products.map((product) => {
    const plans = grouped[product] ?? [];
    const cheapestPaid = plans.find((fact) => fact.price.startsWith("$") && fact.price !== "$0");
    if (!cheapestPaid) {
      return `${product} 没有抽取到明确的付费套餐，需要人工复核官网定价页。`;
    }
    return `${product} 抽取到的最低付费套餐是 ${cheapestPaid.plan}，价格为 ${cheapestPaid.price} ${cheapestPaid.billing}。`;
  });

  takeaways.push("官网定价页应作为主要来源；动态价格和销售制企业套餐需要降低置信度并人工确认。");
  return takeaways;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|");
}
