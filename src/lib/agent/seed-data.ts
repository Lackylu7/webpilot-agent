import type { BrowserSnapshot, ExtractedFact, ResearchTarget } from "@/lib/types/agent";
import { nowIso } from "@/lib/utils/time";

type KnownProduct = {
  name: string;
  query: string;
  url: string;
  title: string;
  excerpt: string;
  facts: Omit<ExtractedFact, "sourceUrl">[];
};

export const knownProducts: Record<string, KnownProduct> = {
  notion: {
    name: "Notion",
    query: "Notion pricing",
    url: "https://www.notion.com/pricing",
    title: "Notion Pricing",
    excerpt:
      "Notion offers a free plan for individuals, plus paid Plus, Business, and Enterprise tiers for teams that need collaboration, admin controls, and security.",
    facts: [
      {
        product: "Notion",
        plan: "Free",
        price: "$0",
        billing: "/mo",
        notes: "Personal workspace with limited team collaboration.",
        confidence: 0.82
      },
      {
        product: "Notion",
        plan: "Plus",
        price: "$10",
        billing: "/user/mo",
        notes: "Small teams; usually lower when billed annually.",
        confidence: 0.78
      },
      {
        product: "Notion",
        plan: "Business",
        price: "$18",
        billing: "/user/mo",
        notes: "Advanced team permissions and admin controls.",
        confidence: 0.78
      },
      {
        product: "Notion",
        plan: "Enterprise",
        price: "Custom",
        billing: "annual",
        notes: "SAML SSO, advanced security, and enterprise support.",
        confidence: 0.74
      }
    ]
  },
  clickup: {
    name: "ClickUp",
    query: "ClickUp pricing",
    url: "https://clickup.com/pricing",
    title: "ClickUp Pricing",
    excerpt:
      "ClickUp positions its pricing around a Free Forever tier, Unlimited, Business, and Enterprise plans for teams that want project management and productivity workflows.",
    facts: [
      {
        product: "ClickUp",
        plan: "Free Forever",
        price: "$0",
        billing: "/mo",
        notes: "Free tier with storage and feature limits.",
        confidence: 0.82
      },
      {
        product: "ClickUp",
        plan: "Unlimited",
        price: "$7",
        billing: "/user/mo",
        notes: "Unlimited storage and core team features on annual billing.",
        confidence: 0.78
      },
      {
        product: "ClickUp",
        plan: "Business",
        price: "$12",
        billing: "/user/mo",
        notes: "More automation, dashboards, and advanced workspace controls.",
        confidence: 0.78
      },
      {
        product: "ClickUp",
        plan: "Enterprise",
        price: "Custom",
        billing: "annual",
        notes: "Contract sales, security, and support controls.",
        confidence: 0.74
      }
    ]
  },
  linear: {
    name: "Linear",
    query: "Linear pricing",
    url: "https://linear.app/pricing",
    title: "Linear Pricing",
    excerpt:
      "Linear focuses on product development teams, with paid plans that add more seats, administration, integrations, and enterprise security controls.",
    facts: [
      {
        product: "Linear",
        plan: "Free",
        price: "$0",
        billing: "/mo",
        notes: "Starter usage for small teams and personal projects.",
        confidence: 0.74
      },
      {
        product: "Linear",
        plan: "Basic",
        price: "$8",
        billing: "/user/mo",
        notes: "Core issue tracking and product development workflows.",
        confidence: 0.72
      },
      {
        product: "Linear",
        plan: "Business",
        price: "$16",
        billing: "/user/mo",
        notes: "Advanced team controls and support features.",
        confidence: 0.72
      },
      {
        product: "Linear",
        plan: "Enterprise",
        price: "Custom",
        billing: "annual",
        notes: "SAML SSO, security, and enterprise administration.",
        confidence: 0.7
      }
    ]
  }
};

export function knownProductForName(name: string) {
  return knownProducts[name.toLowerCase().replace(/[^a-z0-9]/g, "")];
}

export function knownTarget(name: string): ResearchTarget | undefined {
  const product = knownProductForName(name);
  if (!product) return undefined;
  return {
    name: product.name,
    query: product.query,
    officialUrl: product.url
  };
}

export function seedSnapshot(target: string): BrowserSnapshot | undefined {
  const product = knownProductForName(target);
  if (!product) return undefined;
  return {
    target: product.name,
    url: product.url,
    title: product.title,
    excerpt: product.excerpt,
    capturedAt: nowIso(),
    sourceType: "seed"
  };
}

export function seedFacts(target: string) {
  const product = knownProductForName(target);
  if (!product) return [];
  return product.facts.map((fact) => ({
    ...fact,
    sourceUrl: product.url
  }));
}
