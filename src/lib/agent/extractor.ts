import type { BrowserSnapshot, ExtractedFact } from "@/lib/types/agent";
import { seedFacts } from "./seed-data";

const planNames = [
  "Free Forever",
  "Free",
  "Starter",
  "Basic",
  "Plus",
  "Unlimited",
  "Business",
  "Pro",
  "Team",
  "Enterprise"
];

export async function extractFacts(snapshot: BrowserSnapshot): Promise<ExtractedFact[]> {
  const seededFacts = seedFacts(snapshot.target);
  if (snapshot.sourceType === "seed" && seededFacts.length > 0) {
    return seededFacts;
  }

  const llmFacts = await extractWithLlm(snapshot);
  if (llmFacts.length > 0) return llmFacts;

  const heuristicFacts = extractWithHeuristics(snapshot);
  if (heuristicFacts.length > 0) return heuristicFacts;

  return seededFacts;
}

function extractWithHeuristics(snapshot: BrowserSnapshot): ExtractedFact[] {
  const text = snapshot.excerpt;
  const priceMatches = [...text.matchAll(/\$[\d]+(?:\.\d+)?|Custom|Free/gi)].map((match) => match[0]);
  const facts: ExtractedFact[] = [];

  for (const plan of planNames) {
    const index = text.toLowerCase().indexOf(plan.toLowerCase());
    if (index < 0) continue;
    const windowText = text.slice(Math.max(0, index - 120), index + 220);
    const price = windowText.match(/\$[\d]+(?:\.\d+)?|Custom|Free/i)?.[0] ?? priceMatches[facts.length] ?? "Not listed";
    facts.push({
      product: snapshot.target,
      plan,
      price: price.toLowerCase() === "free" ? "$0" : price,
      billing: windowText.match(/user|seat/i) ? "/user/mo" : "/mo",
      notes: compactNote(windowText),
      sourceUrl: snapshot.url,
      confidence: snapshot.sourceType === "browser" ? 0.66 : 0.56
    });
  }

  return dedupeFacts(facts).slice(0, 5);
}

async function extractWithLlm(snapshot: BrowserSnapshot): Promise<ExtractedFact[]> {
  if (!process.env.OPENAI_API_KEY || process.env.WEBPILOT_DEMO_MODE === "true") {
    return [];
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
              "Extract pricing or comparison facts from a browser page excerpt. Return only JSON with a facts array. If data is missing, return an empty facts array."
          },
          {
            role: "user",
            content: JSON.stringify({
              target: snapshot.target,
              sourceUrl: snapshot.url,
              title: snapshot.title,
              excerpt: snapshot.excerpt
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "extracted_web_facts",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["facts"],
              properties: {
                facts: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["product", "plan", "price", "billing", "notes", "confidence"],
                    properties: {
                      product: { type: "string" },
                      plan: { type: "string" },
                      price: { type: "string" },
                      billing: { type: "string" },
                      notes: { type: "string" },
                      confidence: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        }
      })
    });

    if (!response.ok) return [];
    const json = await response.json();
    const text = json.output_text;
    if (typeof text !== "string") return [];
    const parsed = JSON.parse(text) as { facts: Omit<ExtractedFact, "sourceUrl">[] };
    return parsed.facts.map((fact) => ({ ...fact, sourceUrl: snapshot.url }));
  } catch {
    return [];
  }
}

function compactNote(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Extracted from page context.";
  return normalized.slice(0, 120);
}

function dedupeFacts(facts: ExtractedFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.product}:${fact.plan}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
