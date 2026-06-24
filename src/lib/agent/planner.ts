import type { AgentPlan, ResearchTarget } from "@/lib/types/agent";
import { knownTarget } from "./seed-data";

const fallbackTargets = ["Notion", "ClickUp", "Linear"];
const knownNames = ["Notion", "ClickUp", "Linear"];

export function extractTargets(task: string): ResearchTarget[] {
  const normalized = new Map<string, ResearchTarget>();

  for (const name of knownNames) {
    if (task.toLowerCase().includes(name.toLowerCase())) {
      const known = knownTarget(name);
      if (known) normalized.set(known.name.toLowerCase(), known);
    }
  }

  const explicit = task.match(/[A-Z][A-Za-z0-9.+-]*(?:\s[A-Z][A-Za-z0-9.+-]*)*/g) ?? [];
  const commaParts = task
    .split(/[,，、]| and | vs | versus | 和 | 与 |及/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates = [...explicit, ...commaParts]
    .map((part) => part.replace(/^(compare|research|analyze|调研|对比|比较|帮我|pricing|price)\s*/i, ""))
    .map((part) => part.replace(/\s*(pricing|prices|features|定价|价格|功能).*$/i, ""))
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 32);

  for (const candidate of candidates) {
    const known = knownTarget(candidate);
    if (!known) continue;
    normalized.set(known.name.toLowerCase(), known);
  }

  if (normalized.size < 2) {
    for (const name of fallbackTargets) {
      const known = knownTarget(name);
      if (known) normalized.set(known.name.toLowerCase(), known);
    }
  }

  return [...normalized.values()].slice(0, Number(process.env.WEBPILOT_MAX_PAGES ?? 5));
}

export async function createPlan(task: string): Promise<AgentPlan> {
  const llmPlan = await createPlanWithLlm(task);
  if (llmPlan) return llmPlan;

  const targets = extractTargets(task);
  return {
    goal: task,
    targets,
    steps: [
      "理解调研目标，识别需要对比的对象。",
      "优先定位每个对象的官网或官方定价页面。",
      "以只读方式打开网页并读取页面内容。",
      "抽取价格、套餐名称、计费方式和关键限制。",
      "把不同来源的信息整理成统一对比表。",
      "生成包含关键结论和来源链接的中文报告。"
    ],
    riskPolicy:
      "默认只读浏览。Agent 不会登录、提交表单、购买、下载文件或执行破坏性操作，除非用户明确确认。"
  };
}

async function createPlanWithLlm(task: string): Promise<AgentPlan | null> {
  if (!process.env.OPENAI_API_KEY || process.env.WEBPILOT_DEMO_MODE === "true") {
    return null;
  }

  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "你是浏览器调研 Agent 的规划器。请返回中文 JSON，字段包括 goal、targets、steps、riskPolicy。targets 是 {name, query, officialUrl?} 数组。"
          },
          {
            role: "user",
            content: task
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "browser_research_plan",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["goal", "targets", "steps", "riskPolicy"],
              properties: {
                goal: { type: "string" },
                targets: {
                  type: "array",
                  minItems: 1,
                  maxItems: 6,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "query"],
                    properties: {
                      name: { type: "string" },
                      query: { type: "string" },
                      officialUrl: { type: "string" }
                    }
                  }
                },
                steps: {
                  type: "array",
                  minItems: 3,
                  maxItems: 8,
                  items: { type: "string" }
                },
                riskPolicy: { type: "string" }
              }
            }
          }
        }
      })
    });

    if (!response.ok) return null;
    const json = await response.json();
    const text = json.output_text;
    if (typeof text !== "string") return null;
    const plan = JSON.parse(text) as AgentPlan;
    return {
      ...plan,
      targets: plan.targets.map((target) => knownTarget(target.name) ?? target)
    };
  } catch {
    return null;
  }
}
