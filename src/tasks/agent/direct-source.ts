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

export function parsePlayStoreAppId(rawUrl: string): string | null {
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

export function isPlayStoreAppUrl(rawUrl: string): boolean {
  return Boolean(parsePlayStoreAppId(rawUrl));
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
    .replace(/<br\s*\/?>/gi, "\n")
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

function splitHtmlDescriptionIntoParagraphs(value: string): string[] {
  return uniqueStrings(
    decodeHtmlEntities(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/•/g, "\n• ")
      .split(/\n{2,}|\n(?=• )/)
      .map((chunk) => chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((chunk) => chunk.length >= 40),
    8
  );
}

function extractRichPlayStoreDescription(html: string): string {
  const raw =
    html.match(/data-g-id="description">([\s\S]*?)<\/div>/i)?.[1] ??
    html.match(/"description":"([^"]{40,4000})"/i)?.[1] ??
    "";
  return normalizeHtmlText(raw);
}

function extractRichPlayStoreDescriptionParagraphs(html: string): string[] {
  const raw =
    html.match(/data-g-id="description">([\s\S]*?)<\/div>/i)?.[1] ??
    html.match(/"description":"([^"]{40,4000})"/i)?.[1] ??
    "";
  return splitHtmlDescriptionIntoParagraphs(raw);
}

function extractPlayStoreCategory(html: string): string {
  return (
    extractFirstMatch(html, [
      /"applicationCategory":"([^"]{1,120})"/i,
      /itemprop="genre"[\s\S]{0,200}?aria-hidden="true">([^<]{1,120})</i
    ]) || ""
  );
}

function extractPlayStoreDeveloper(html: string): string {
  return extractFirstMatch(html, [
    /"author":\{"@type":"Person","name":"([^"]+)"/i
  ]);
}

function buildAsoAuditNotes(input: {
  appName: string;
  appId: string | null;
  shortDescription: string;
  longDescription: string;
  category: string;
  developer: string;
}): string[] {
  const titleKeywords = input.appName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3 && !["offline", "online", "free", "app"].includes(token))
    .slice(0, 3);
  const keywordNote =
    titleKeywords.length > 0
      ? `Primary title keywords detected from the current listing: ${titleKeywords.join(", ")}.`
      : "";
  const shortDescriptionNote = input.shortDescription
    ? `Current short description: ${input.shortDescription}`
    : "";
  const positioningNote = input.longDescription
    ? `The long description currently emphasizes: ${input.longDescription
        .split(".")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(". ")}.`
    : "";
  const metadataNote = [
    input.category ? `Category: ${input.category}.` : "",
    input.developer ? `Developer: ${input.developer}.` : "",
    input.appId ? `Package ID: ${input.appId}.` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return uniqueStrings(
    [shortDescriptionNote, keywordNote, positioningNote, metadataNote].filter(Boolean),
    6
  );
}

function buildPlayStoreFallbackPage(input: {
  url: string;
  appName: string;
  fullTitle: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  developer: string;
  appId: string | null;
}): AgentPageDigest {
  const auditNotes = buildAsoAuditNotes({
    appName: input.appName,
    appId: input.appId,
    shortDescription: input.shortDescription,
    longDescription: input.longDescription,
    category: input.category,
    developer: input.developer
  });
  const descriptionParagraphs = splitHtmlDescriptionIntoParagraphs(input.longDescription);
  const paragraphs = uniqueStrings(
    [
      input.shortDescription,
      ...descriptionParagraphs.slice(0, 4),
      ...auditNotes
    ].filter((value) => value.length >= 35),
    8
  );

  return {
    title: input.fullTitle || input.appName,
    url: normalizePlayStoreUrl(input.url),
    description: input.shortDescription,
    h1: input.appName || null,
    headings: uniqueStrings(
      ["About this app", input.category, input.developer, "Current ASO audit"].filter(Boolean),
      6
    ),
    paragraphs,
    capturedAt: new Date().toISOString()
  };
}

async function fetchPlayStoreAppMetadata(url: string): Promise<{
  appName: string;
  fullTitle: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  developer: string;
  appId: string | null;
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
    const shortDescription = extractFirstMatch(html, [
      /<meta[^>]+name="description"[^>]+content="([\s\S]*?)"/i,
      /<meta[^>]+property="og:description"[^>]+content="([\s\S]*?)"/i
    ]);
    const longDescription = extractRichPlayStoreDescription(html);
    const category = extractPlayStoreCategory(html);
    const developer = extractPlayStoreDeveloper(html);
    const appName =
      cleanAppTitle(h1) ||
      cleanAppTitle(fullTitle) ||
      humanizePackageId(appId) ||
      "";

    if (!appName && !shortDescription && !longDescription) {
      return null;
    }

    return {
      appName,
      fullTitle,
      shortDescription,
      longDescription,
      category,
      developer,
      appId,
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
  result.snippet = metadata.shortDescription || metadata.longDescription || result.snippet;
  result.page = buildPlayStoreFallbackPage({
    url: metadata.normalizedUrl,
    appName: metadata.appName || humanizePackageId(appId) || result.title,
    fullTitle: metadata.fullTitle || result.title,
    shortDescription: metadata.shortDescription || metadata.longDescription || result.snippet,
    longDescription: metadata.longDescription || metadata.shortDescription || result.snippet,
    category: metadata.category,
    developer: metadata.developer,
    appId: metadata.appId
  });
  result.reviewStatus = "read";
  result.dwellSeconds = Math.max(result.dwellSeconds ?? 0, 2);
  result.skipReason = undefined;
  result.qualityScore = Math.max(result.qualityScore ?? 0, 0.85);
  result.qualitySignals = uniqueStrings(
    [
      ...(result.qualitySignals ?? []),
      "play store html fallback",
      "direct app metadata",
      metadata.category ? `category: ${metadata.category.toLowerCase()}` : ""
    ].filter(Boolean),
    8
  );
  result.contentType = "review";
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
