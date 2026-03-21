import type { AgentPageDigest, AgentResearchResult, AgentSearchResult } from "../../types";

function uniqueStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (typeof limit === "number" && output.length >= limit) {
      break;
    }
  }

  return output;
}

function normalizeExtractedUrl(value: string): string {
  return value.replace(/[),.;:!?]+$/, "");
}

function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parsePlayStoreAppId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes("play.google.com")) {
      return null;
    }
    if (!parsed.pathname.includes("/store/apps/details")) {
      return null;
    }
    const appId = parsed.searchParams.get("id")?.trim();
    return appId || null;
  } catch {
    return null;
  }
}

function humanizePackageId(appId: string | null): string | null {
  if (!appId) {
    return null;
  }

  const ignored = new Set([
    "com",
    "net",
    "org",
    "io",
    "app",
    "apps",
    "android",
    "mobile",
    "studio",
    "official"
  ]);

  const words = appId
    .split(".")
    .flatMap((segment) => segment.split(/[^a-z0-9]+/i))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2 && !ignored.has(segment.toLowerCase()));

  if (words.length === 0) {
    return null;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cleanAppTitle(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s*[|:-]\s*Apps on Google Play\s*$/i, "")
    .replace(/\s*[|:-]\s*Google Play\s*$/i, "")
    .replace(/^‎/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderProvidedSourceTitle(raw: string | null | undefined): boolean {
  const normalized = cleanAppTitle(raw).toLowerCase();
  return normalized.startsWith("provided source url:");
}

function quoteTerm(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").replace(/"/g, "").trim();
  return normalized ? `"${normalized}"` : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCharCode(Number(codePoint)));
}

function normalizeHtmlText(value: string | null | undefined): string {
  return decodeHtmlEntities(String(value ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlayStoreUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes("play.google.com")) {
      return rawUrl;
    }
    if (!parsed.searchParams.get("hl")) {
      parsed.searchParams.set("hl", "en");
    }
    if (!parsed.searchParams.get("gl")) {
      parsed.searchParams.set("gl", "us");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function extractFirstMatch(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    const normalized = normalizeHtmlText(match);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function buildPlayStoreFallbackPage(input: {
  url: string;
  appName: string;
  fullTitle: string;
  description: string;
}): AgentPageDigest {
  const paragraphs = uniqueStrings(
    [
      input.description,
      `Google Play listing for ${input.appName}. Package ID: ${parsePlayStoreAppId(input.url) ?? "unknown"}.`
    ].filter((value) => value.length >= 40),
    3
  );

  return {
    title: input.fullTitle || input.appName,
    url: normalizePlayStoreUrl(input.url),
    description: input.description,
    h1: input.appName || null,
    headings: uniqueStrings(["About this app", "Google Play listing"], 4),
    paragraphs,
    capturedAt: new Date().toISOString()
  };
}

async function fetchPlayStoreAppMetadata(url: string): Promise<{
  appName: string;
  fullTitle: string;
  description: string;
  normalizedUrl: string;
} | null> {
  const normalizedUrl = normalizePlayStoreUrl(url);
  const appId = parsePlayStoreAppId(normalizedUrl);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(normalizedUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const fullTitle =
      extractFirstMatch(html, [
        /<meta[^>]+property="og:title"[^>]+content="([\s\S]*?)"/i,
        /<title>([\s\S]*?)<\/title>/i
      ]) || humanizePackageId(appId) || "";
    const h1 = extractFirstMatch(html, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    ]);
    const description = extractFirstMatch(html, [
      /<meta[^>]+name="description"[^>]+content="([\s\S]*?)"/i,
      /<meta[^>]+property="og:description"[^>]+content="([\s\S]*?)"/i,
      /"description":"([^"]{20,800})"/i
    ]);
    const appName =
      cleanAppTitle(h1) ||
      cleanAppTitle(fullTitle) ||
      humanizePackageId(appId) ||
      "";

    if (!appName && !description) {
      return null;
    }

    return {
      appName,
      fullTitle,
      description,
      normalizedUrl
    };
  } catch {
    return null;
  }
}

function pickMeaningfulSourceTitle(result?: AgentSearchResult): string {
  const pageH1 = cleanAppTitle(result?.page?.h1);
  if (pageH1) {
    return pageH1;
  }

  const pageTitle = cleanAppTitle(result?.page?.title);
  if (pageTitle && !isPlaceholderProvidedSourceTitle(pageTitle)) {
    return pageTitle;
  }

  const resultTitle = cleanAppTitle(result?.title);
  if (resultTitle && !isPlaceholderProvidedSourceTitle(resultTitle)) {
    return resultTitle;
  }

  return "";
}

function buildGenericSourceQueries(
  title: string,
  maxQueries: number
): string[] {
  const exactTitle = quoteTerm(title);
  if (!exactTitle) {
    return [];
  }

  return uniqueStrings(
    [
      `${exactTitle} reviews complaints`,
      `site:reddit.com ${exactTitle} complaints`,
      `${exactTitle} feature requests`,
      `${exactTitle} alternatives competitor`,
      `${exactTitle} growth ASO keywords`
    ],
    maxQueries
  );
}

function buildPlayStoreQueries(input: {
  url: string;
  result?: AgentSearchResult;
  maxQueries: number;
}): string[] {
  const appId = parsePlayStoreAppId(input.url);
  const appName =
    pickMeaningfulSourceTitle(input.result) ||
    humanizePackageId(appId) ||
    "this app";
  const quotedName = quoteTerm(appName);
  const quotedAppId = quoteTerm(appId);
  const combinedTerms = [quotedName, quotedAppId].filter(Boolean).join(" ");
  const exactTerms = combinedTerms || quotedName || quotedAppId || `"${input.url}"`;

  return uniqueStrings(
    [
      `site:play.google.com ${exactTerms} reviews complaints`,
      `site:reddit.com ${exactTerms} app complaints`,
      `${exactTerms} app feature requests`,
      `${exactTerms} app alternatives competitor`,
      `${exactTerms} app ASO keywords downloads reviews`
    ],
    input.maxQueries
  );
}

function findDirectSourceResultForUrl(
  directResearch: AgentResearchResult[],
  url: string
): AgentSearchResult | undefined {
  for (const research of directResearch) {
    for (const result of research.results) {
      if (result.url === url || result.page?.url === url) {
        return result;
      }
    }
  }
  return undefined;
}

export function extractInstructionUrls(instruction: string): string[] {
  const matches = instruction.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return uniqueStrings(matches.map((match) => normalizeExtractedUrl(match)));
}

export function buildProvidedSourceQueryLabel(url: string): string {
  return `Provided source: ${url}`;
}

export function buildProvidedSourceSeedResult(url: string): AgentSearchResult {
  const hostname = hostnameOf(url);
  return {
    title: `Provided source URL: ${hostname || url}`,
    url,
    snippet: "Source URL provided directly in the instruction. Review this page first before broader research.",
    site: hostname || "provided-source"
  };
}

export async function enrichProvidedSourceSeedResult(
  result: AgentSearchResult
): Promise<AgentSearchResult> {
  const appId = parsePlayStoreAppId(result.url);
  if (!appId) {
    return result;
  }

  const metadata = await fetchPlayStoreAppMetadata(result.url);
  if (!metadata) {
    if (isPlaceholderProvidedSourceTitle(result.title)) {
      const fallbackTitle = humanizePackageId(appId);
      if (fallbackTitle) {
        result.title = fallbackTitle;
      }
    }
    return result;
  }

  result.title = metadata.appName || cleanAppTitle(metadata.fullTitle) || result.title;
  result.snippet = metadata.description || result.snippet;
  result.page = buildPlayStoreFallbackPage({
    url: metadata.normalizedUrl,
    appName: metadata.appName || humanizePackageId(appId) || result.title,
    fullTitle: metadata.fullTitle || result.title,
    description: metadata.description
  });
  result.reviewStatus = "read";
  result.dwellSeconds = Math.max(result.dwellSeconds ?? 0, 2);
  result.skipReason = undefined;
  return result;
}

export function buildDirectSourceResearchQueries(input: {
  instruction: string;
  directResearch: AgentResearchResult[];
  maxQueries: number;
}): string[] {
  const urls = extractInstructionUrls(input.instruction);
  const queries: string[] = [];

  for (const url of urls) {
    const result = findDirectSourceResultForUrl(input.directResearch, url);
    const playStoreAppId = parsePlayStoreAppId(url);

    if (playStoreAppId) {
      queries.push(
        ...buildPlayStoreQueries({
          url,
          result,
          maxQueries: input.maxQueries
        })
      );
      continue;
    }

    const title =
      pickMeaningfulSourceTitle(result);
    if (title) {
      queries.push(...buildGenericSourceQueries(title, input.maxQueries));
    }
  }

  return uniqueStrings(queries, input.maxQueries);
}
