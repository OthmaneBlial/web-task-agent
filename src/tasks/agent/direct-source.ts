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

function looksLikeAndroidAppId(value: string | null | undefined): value is string {
  const normalized = String(value ?? "").trim();
  return /^[a-z0-9_]+(?:\.[a-z0-9_]+){2,}$/i.test(normalized);
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

export function parseAppBrainAppId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes("appbrain.com")) {
      return null;
    }

    const queryAppId = parsed.searchParams.get("q")?.trim();
    if (looksLikeAndroidAppId(queryAppId)) {
      return queryAppId;
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      if (looksLikeAndroidAppId(segment)) {
        return segment;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function parseDirectAppId(rawUrl: string): string | null {
  return parsePlayStoreAppId(rawUrl) ?? parseAppBrainAppId(rawUrl);
}

function buildPlayStoreDetailsUrl(appId: string): string {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=en&gl=us`;
}

export function isDirectAppUrl(rawUrl: string): boolean {
  return Boolean(parseDirectAppId(rawUrl));
}

export function isPlayStoreAppUrl(rawUrl: string): boolean {
  return Boolean(parseDirectAppId(rawUrl));
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

function normalizeAppListingTitle(raw: string | null | undefined): string {
  const cleaned = cleanAppTitle(raw);
  if (!cleaned) {
    return "";
  }

  const brandSplit = cleaned.match(/^[^:|/]{2,30}[:|/]\s*(.+)$/);
  const withoutBrand = brandSplit ? brandSplit[1] : cleaned;
  const modifierMatch = withoutBrand.match(/^(offline|online|free|pro|lite|premium|ad[-\s]?free|no[-\s]?ads)\s+(.+)$/i);
  if (modifierMatch) {
    return `${modifierMatch[2].trim()} ${modifierMatch[1].trim()}`.replace(/\s+/g, " ").trim();
  }

  return withoutBrand.replace(/\s+/g, " ").trim();
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
    const directAppId = parseDirectAppId(rawUrl);
    if (directAppId && !rawUrl.includes("play.google.com/store/apps/details")) {
      return buildPlayStoreDetailsUrl(directAppId);
    }

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

function buildPlayStoreSearchUrl(query: string): string {
  return `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=en&gl=us`;
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

function cleanKeywordToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const DIRECT_APP_STOP_WORDS = new Set([
  "android",
  "app",
  "apps",
  "best",
  "builder",
  "create",
  "creator",
  "download",
  "downloads",
  "editor",
  "free",
  "google",
  "maker",
  "offline",
  "online",
  "play",
  "private",
  "professional",
  "secure",
  "signup",
  "store",
  "tool",
  "tools"
]);

function derivePrimaryMarketKeyword(appName: string): string {
  const stopWords = new Set([
    "offline",
    "online",
    "free",
    "pro",
    "plus",
    "app",
    "apps"
  ]);
  const words = appName
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !stopWords.has(cleanKeywordToken(word)));

  if (words.length >= 2) {
    return `${words[0]} ${words[1]}`.toLowerCase();
  }
  if (words.length === 1) {
    return words[0]!.toLowerCase();
  }

  return cleanAppTitle(appName).toLowerCase();
}

function normalizeQueryPhrase(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function titleCasePhrase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractMeaningfulWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => /[a-z]/i.test(word))
    .filter((word) => !DIRECT_APP_STOP_WORDS.has(word));
}

function instructionHasAsoAuditIntent(instruction: string): boolean {
  return /(aso|app ?store|play ?store|downloads?|downloads|popular|popularity|ranking|keywords?|listing|rewrite|rewrite its|visibility|installs?)/i.test(
    instruction
  );
}

function deriveDirectAppKeywordPhrases(result?: AgentSearchResult, limit: number = 4): string[] {
  const appName = pickMeaningfulSourceTitle(result);
  const titleWords = extractMeaningfulWords(appName);
  const primaryKeyword = derivePrimaryMarketKeyword(appName);

  const phrases = [
    primaryKeyword,
    titleWords.slice(0, 3).join(" "),
    titleWords.slice(0, 2).join(" "),
    `${primaryKeyword} app`,
    `${primaryKeyword} android`
  ]
    .map(normalizeQueryPhrase)
    .filter((phrase) => phrase.length >= 4);

  return uniqueStrings(phrases, limit);
}

function buildDirectAppQueries(input: {
  instruction: string;
  url: string;
  result?: AgentSearchResult;
  maxQueries: number;
}): string[] {
  const appId = parseDirectAppId(input.url);
  const appName = pickMeaningfulSourceTitle(input.result) || humanizePackageId(appId) || "this app";
  const quotedName = quoteTerm(appName);
  const quotedAppId = quoteTerm(appId);
  const keywordPhrases = deriveDirectAppKeywordPhrases(input.result, 4);
  const primaryKeyword = keywordPhrases[0] ?? normalizeQueryPhrase(appName);
  const quotedPrimaryKeyword = quoteTerm(primaryKeyword);
  const targetQueryCount = instructionHasAsoAuditIntent(input.instruction)
    ? Math.max(input.maxQueries, 11)
    : Math.max(input.maxQueries, 6);
  const candidates: string[] = [];

  if (quotedName && quotedAppId) {
    candidates.push(`site:play.google.com ${quotedName} ${quotedAppId} reviews complaints`);
    candidates.push(`site:reddit.com ${quotedName} ${quotedAppId} app complaints`);
    candidates.push(`${quotedName} ${quotedAppId} app feature requests`);
  }

  if (quotedPrimaryKeyword) {
    candidates.push(`site:play.google.com ${quotedPrimaryKeyword} android app`);
    candidates.push(`site:play.google.com ${quotedPrimaryKeyword} app reviews complaints`);
    candidates.push(`site:reddit.com ${quotedPrimaryKeyword} app complaints`);
    candidates.push(`${quotedPrimaryKeyword} android app alternatives`);
    candidates.push(`${quotedPrimaryKeyword} app feature requests`);
    candidates.push(`${quotedPrimaryKeyword} app subscription complaints`);
    candidates.push(`${quotedPrimaryKeyword} app keywords visibility`);
    candidates.push(`${quotedPrimaryKeyword} app low downloads reasons`);
  }

  for (const keyword of keywordPhrases.slice(1)) {
    const quotedKeyword = quoteTerm(keyword);
    if (!quotedKeyword) {
      continue;
    }
    candidates.push(`site:play.google.com ${quotedKeyword} android app`);
    candidates.push(`site:reddit.com ${quotedKeyword} app complaints`);
    candidates.push(`${quotedKeyword} app reviews`);
  }

  if (quotedName) {
    candidates.push(`${quotedName} app reviews`);
    candidates.push(`${quotedName} app complaints`);
    candidates.push(`${quotedName} ASO keywords`);
  }

  return uniqueStrings(candidates, targetQueryCount);
}

function extractPlayStoreSearchAppIds(html: string, limit: number = 24): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const match of html.matchAll(/\/store\/apps\/details\?id=([a-z0-9._]+)/ig)) {
    const appId = String(match[1] ?? "").trim();
    if (!looksLikeAndroidAppId(appId) || seen.has(appId)) {
      continue;
    }
    seen.add(appId);
    ids.push(appId);
    if (ids.length >= limit) {
      break;
    }
  }

  return ids;
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
  const listingText = [input.appName, input.shortDescription, input.longDescription]
    .filter(Boolean)
    .join(" ");
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
  const atsNote = /\b(resume|cv)\b/i.test(listingText)
    ? "ATS compatibility: Verify exported resumes stay machine-readable and keep clean formatting."
    : "";
  const metadataNote = [
    input.category ? `Category: ${input.category}.` : "",
    input.developer ? `Developer: ${input.developer}.` : "",
    input.appId ? `Package ID: ${input.appId}.` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return uniqueStrings(
    [shortDescriptionNote, keywordNote, positioningNote, atsNote, metadataNote].filter(Boolean),
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
    const cleanedH1 = normalizeAppListingTitle(h1);
    const cleanedFullTitle = normalizeAppListingTitle(fullTitle);
    const appName =
      cleanedFullTitle ||
      cleanedH1 ||
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

async function fetchPlayStoreSearchAppIds(query: string, limit: number = 24): Promise<string[]> {
  try {
    const response = await fetch(buildPlayStoreSearchUrl(query), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    return extractPlayStoreSearchAppIds(html, limit);
  } catch {
    return [];
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
  const appId = parseDirectAppId(result.url);
  if (!appId) {
    return result;
  }

  const metadata = await fetchPlayStoreAppMetadata(normalizePlayStoreUrl(result.url));
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

export async function buildDirectAppBenchmarkResearch(
  result: AgentSearchResult
): Promise<AgentResearchResult | null> {
  const [benchmark] = await buildDirectAppBenchmarkResearches(result, {
    maxKeywords: 1
  });
  return benchmark ?? null;
}

export async function buildDirectAppBenchmarkResearches(
  result: AgentSearchResult,
  options?: {
    maxKeywords?: number;
  }
): Promise<AgentResearchResult[]> {
  const appId = parseDirectAppId(result.url);
  const appName = pickMeaningfulSourceTitle(result);
  if (!appId || !appName) {
    return [];
  }

  const benchmarkKeywords = deriveDirectAppKeywordPhrases(
    result,
    Math.max(1, Math.min(options?.maxKeywords ?? 3, 5))
  );
  const researchResults: AgentResearchResult[] = [];

  for (const keyword of benchmarkKeywords) {
    const rankedAppIds = await fetchPlayStoreSearchAppIds(keyword, 24);
    if (rankedAppIds.length === 0) {
      continue;
    }

    const targetRank = rankedAppIds.findIndex((candidate) => candidate === appId);
    const competitorIds = rankedAppIds.filter((candidate) => candidate !== appId).slice(0, 5);
    const competitorResults: AgentSearchResult[] = [];

    for (let index = 0; index < competitorIds.length; index += 1) {
      const competitorId = competitorIds[index]!;
      const metadata = await fetchPlayStoreAppMetadata(buildPlayStoreDetailsUrl(competitorId));
      if (!metadata) {
        continue;
      }

      competitorResults.push({
        title: metadata.appName || cleanAppTitle(metadata.fullTitle) || competitorId,
        url: metadata.normalizedUrl,
        snippet: `Play Store search rank #${index + 1} for keyword "${keyword}". ${metadata.shortDescription || metadata.longDescription}`.trim(),
        site: "play.google.com",
        reviewStatus: "read",
        dwellSeconds: 2,
        qualityScore: 0.88,
        qualitySignals: uniqueStrings(
          [
            "play store benchmark result",
            `benchmark rank ${index + 1}`,
            metadata.category ? `category: ${metadata.category.toLowerCase()}` : ""
          ].filter(Boolean),
          8
        ),
        contentType: "review",
        page: buildPlayStoreFallbackPage({
          url: metadata.normalizedUrl,
          appName: metadata.appName || competitorId,
          fullTitle: metadata.fullTitle || competitorId,
          shortDescription: metadata.shortDescription || metadata.longDescription || "",
          longDescription: metadata.longDescription || metadata.shortDescription || "",
          category: metadata.category,
          developer: metadata.developer,
          appId: metadata.appId
        })
      });
    }

    const visibilitySummary = targetRank === -1
      ? `${appName} (${appId}) was not found in the top ${rankedAppIds.length} Play Store search results for "${keyword}".`
      : `${appName} (${appId}) appears at Play Store search rank #${targetRank + 1} for "${keyword}".`;
    const competitorSummary = competitorResults.length > 0
      ? `Top visible competitors for this keyword include ${competitorResults.slice(0, 3).map((entry) => entry.title).join(", ")}.`
      : "No competitor details could be fetched from Play Store search results.";

    const benchmarkSummary: AgentSearchResult = {
      title: `Play Store benchmark for "${keyword}"`,
      url: buildPlayStoreSearchUrl(keyword),
      snippet: `${visibilitySummary} ${competitorSummary}`.trim(),
      site: "play.google.com",
      reviewStatus: "read",
      dwellSeconds: 2,
      qualityScore: 0.9,
      qualitySignals: ["play store benchmark summary", "direct app audit"],
      contentType: "review",
      page: {
        title: `Play Store benchmark for "${keyword}"`,
        url: buildPlayStoreSearchUrl(keyword),
        description: visibilitySummary,
        h1: `Benchmark keyword: ${keyword}`,
        headings: ["Search visibility", "Top competitors"],
        paragraphs: uniqueStrings(
          [
            visibilitySummary,
            competitorSummary,
            `This benchmark was derived from Play Store search results for the market keyword "${keyword}".`,
            competitorResults
              .slice(0, 5)
              .map((entry, index) => `Rank #${index + 1}: ${entry.title}. ${entry.snippet}`)
              .join(" ")
          ].filter((value) => value.length >= 30),
          6
        ),
        capturedAt: new Date().toISOString()
      }
    };

    researchResults.push({
      query: `Play Store benchmark: ${keyword}`,
      searchedAt: new Date().toISOString(),
      results: [benchmarkSummary, ...competitorResults]
    });
  }

  return researchResults;
}

export function buildDirectSourceResearchQueries(input: {
  instruction: string;
  directResearch: AgentResearchResult[];
  maxQueries: number;
}): string[] {
  const urls = extractInstructionUrls(input.instruction);
  const queries: string[] = [];
  const hasDirectAppUrl = urls.some((url) => Boolean(parseDirectAppId(url)));
  const targetLimit =
    hasDirectAppUrl && instructionHasAsoAuditIntent(input.instruction)
      ? Math.max(input.maxQueries, 11)
      : hasDirectAppUrl
        ? Math.max(input.maxQueries, 6)
        : input.maxQueries;

  for (const url of urls) {
    const result = findDirectSourceResultForUrl(input.directResearch, url);
    const directAppId = parseDirectAppId(url);

    if (directAppId) {
      queries.push(
        ...buildDirectAppQueries({
          instruction: input.instruction,
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

  return uniqueStrings(queries, targetLimit);
}
