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
    query: "Notion 定价",
    url: "https://www.notion.com/pricing",
    title: "Notion 定价",
    excerpt:
      "Notion 提供免费版，以及面向团队协作、权限管理和安全控制的 Plus、Business、Enterprise 等付费方案。",
    facts: [
      {
        product: "Notion",
        plan: "免费版",
        price: "$0",
        billing: "/月",
        notes: "适合个人工作区，团队协作能力有限。",
        confidence: 0.82
      },
      {
        product: "Notion",
        plan: "Plus",
        price: "$10",
        billing: "/用户/月",
        notes: "适合小团队，年付通常更便宜。",
        confidence: 0.78
      },
      {
        product: "Notion",
        plan: "Business",
        price: "$18",
        billing: "/用户/月",
        notes: "提供更高级的团队权限和管理控制。",
        confidence: 0.78
      },
      {
        product: "Notion",
        plan: "Enterprise",
        price: "定制",
        billing: "年付",
        notes: "包含 SAML SSO、高级安全和企业支持。",
        confidence: 0.74
      }
    ]
  },
  clickup: {
    name: "ClickUp",
    query: "ClickUp 定价",
    url: "https://clickup.com/pricing",
    title: "ClickUp 定价",
    excerpt:
      "ClickUp 的定价围绕 Free Forever、Unlimited、Business 和 Enterprise 展开，面向项目管理和团队生产力场景。",
    facts: [
      {
        product: "ClickUp",
        plan: "Free Forever",
        price: "$0",
        billing: "/月",
        notes: "免费层有存储和部分功能限制。",
        confidence: 0.82
      },
      {
        product: "ClickUp",
        plan: "Unlimited",
        price: "$7",
        billing: "/用户/月",
        notes: "年付价格，包含无限存储和核心团队功能。",
        confidence: 0.78
      },
      {
        product: "ClickUp",
        plan: "Business",
        price: "$12",
        billing: "/用户/月",
        notes: "提供更多自动化、仪表盘和高级工作区控制。",
        confidence: 0.78
      },
      {
        product: "ClickUp",
        plan: "Enterprise",
        price: "定制",
        billing: "年付",
        notes: "需要联系销售，包含安全和支持控制。",
        confidence: 0.74
      }
    ]
  },
  linear: {
    name: "Linear",
    query: "Linear 定价",
    url: "https://linear.app/pricing",
    title: "Linear 定价",
    excerpt:
      "Linear 面向产品研发团队，付费方案主要增加席位、管理能力、集成和企业安全控制。",
    facts: [
      {
        product: "Linear",
        plan: "免费版",
        price: "$0",
        billing: "/月",
        notes: "适合小团队和个人项目的入门使用。",
        confidence: 0.74
      },
      {
        product: "Linear",
        plan: "Basic",
        price: "$8",
        billing: "/用户/月",
        notes: "提供核心 issue 跟踪和产品研发工作流。",
        confidence: 0.72
      },
      {
        product: "Linear",
        plan: "Business",
        price: "$16",
        billing: "/用户/月",
        notes: "包含高级团队控制和支持能力。",
        confidence: 0.72
      },
      {
        product: "Linear",
        plan: "Enterprise",
        price: "定制",
        billing: "年付",
        notes: "包含 SAML SSO、安全和企业管理能力。",
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
