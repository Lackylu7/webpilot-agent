import { getRunStoreInfo } from "@/lib/store/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getRunStoreInfo();
  const browser = await browserStatus();
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const demoMode = process.env.WEBPILOT_DEMO_MODE === "true";

  return Response.json({
    ok: true,
    runtime: {
      node: process.version,
      platform: process.platform,
      demoMode,
      runModeDefault: demoMode ? "demo" : "smart",
      timeoutMs: Number(process.env.WEBPILOT_TIMEOUT_MS ?? 15000),
      maxPages: Number(process.env.WEBPILOT_MAX_PAGES ?? 5),
      browserHeadless: process.env.WEBPILOT_BROWSER_HEADLESS !== "false"
    },
    llm: {
      enabled: hasOpenAIKey && !demoMode,
      configured: hasOpenAIKey,
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      baseUrl: safeBaseUrl(process.env.OPENAI_BASE_URL)
    },
    browser,
    store
  });
}

async function browserStatus() {
  try {
    const { chromium } = await import("playwright");
    return {
      available: true,
      name: "Chromium",
      executablePath: chromium.executablePath()
    };
  } catch (error) {
    return {
      available: false,
      name: "Chromium",
      error: error instanceof Error ? error.message : "Playwright browser runtime unavailable"
    };
  }
}

function safeBaseUrl(value?: string) {
  if (!value) return "https://api.openai.com/v1";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "custom";
  }
}
