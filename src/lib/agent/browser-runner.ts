import type { BrowserSnapshot, ResearchTarget } from "@/lib/types/agent";
import { nowIso } from "@/lib/utils/time";
import { seedSnapshot } from "./seed-data";

export async function browseTarget(target: ResearchTarget): Promise<BrowserSnapshot> {
  if (process.env.WEBPILOT_DEMO_MODE === "true") {
    const seeded = seedSnapshot(target.name);
    if (seeded) return seeded;
  }

  const url = target.officialUrl ?? searchUrl(target.query);
  const browserResult = await tryPlaywright(target.name, url);
  if (browserResult) return browserResult;

  const fetchResult = await tryFetch(target.name, url);
  if (fetchResult) return fetchResult;

  const seeded = seedSnapshot(target.name);
  if (seeded) return seeded;

  return {
    target: target.name,
    url,
    title: target.name,
    excerpt: `The live page could not be reached. WebPilot kept the source in the report so the user can inspect it manually: ${url}`,
    capturedAt: nowIso(),
    sourceType: "seed"
  };
}

function searchUrl(query: string) {
  const encoded = encodeURIComponent(query);
  return `https://duckduckgo.com/html/?q=${encoded}`;
}

async function tryPlaywright(target: string, url: string): Promise<BrowserSnapshot | null> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: process.env.WEBPILOT_BROWSER_HEADLESS !== "false"
    });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    });
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Number(process.env.WEBPILOT_TIMEOUT_MS ?? 15000)
    });
    const title = await page.title();
    const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    await browser.close();

    return {
      target,
      url: page.url(),
      title: title || target,
      excerpt: compactExcerpt(text),
      capturedAt: nowIso(),
      sourceType: "browser"
    };
  } catch {
    return null;
  }
}

async function tryFetch(target: string, url: string): Promise<BrowserSnapshot | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      },
      signal: AbortSignal.timeout(Number(process.env.WEBPILOT_TIMEOUT_MS ?? 15000))
    });
    if (!response.ok) return null;
    const html = await response.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? target;
    return {
      target,
      url: response.url,
      title,
      excerpt: compactExcerpt(stripHtml(html)),
      capturedAt: nowIso(),
      sourceType: "fetch"
    };
  } catch {
    return null;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactExcerpt(text: string, maxLength = 900) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
