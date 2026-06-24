import type { AgentPlan, ResearchTarget } from "@/lib/types/agent";
import { knownTarget } from "./seed-data";

const fallbackTargets = ["Notion", "ClickUp", "Linear"];

export function extractTargets(task: string): ResearchTarget[] {
  const explicit = task.match(/[A-Z][A-Za-z0-9.+-]*(?:\s[A-Z][A-Za-z0-9.+-]*)*/g) ?? [];
  const commaParts = task
    .split(/[,，、]| and | vs | versus /i)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates = [...explicit, ...commaParts]
    .map((part) => part.replace(/^(compare|research|analyze|調研|对比|比较|帮我|pricing|price)\s+/i, ""))
    .map((part) => part.replace(/\s+(pricing|prices|features|定价|价格|功能).*$/i, ""))
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 32);

  const normalized = new Map<string, ResearchTarget>();
  for (const candidate of candidates) {
    const known = knownTarget(candidate);
    const name = known?.name ?? candidate;
    const key = name.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, known ?? { name, query: `${name} pricing features` });
    }
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
      "Parse the research goal and identify comparable targets.",
      "Resolve likely official pages for each target.",
      "Open each page in a read-only browser session.",
      "Extract pricing, plan names, billing model, and notable limits.",
      "Normalize extracted facts into a comparison table.",
      "Draft a cited report with key takeaways and source links."
    ],
    riskPolicy:
      "Read-only browsing only. The agent will not log in, submit forms, purchase items, or download files without explicit approval."
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
              "You create compact browser research plans. Return only JSON with goal, targets, steps, and riskPolicy. targets is an array of {name, query, officialUrl?}."
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
