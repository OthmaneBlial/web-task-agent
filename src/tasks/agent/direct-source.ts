import type { AgentResearchResult, AgentSearchResult } from "../../types";

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

function quoteTerm(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").replace(/"/g, "").trim();
  return normalized ? `"${normalized}"` : null;
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
    cleanAppTitle(input.result?.page?.h1) ||
    cleanAppTitle(input.result?.page?.title) ||
    cleanAppTitle(input.result?.title) ||
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
      cleanAppTitle(result?.page?.h1) ||
      cleanAppTitle(result?.page?.title) ||
      cleanAppTitle(result?.title);
    if (title) {
      queries.push(...buildGenericSourceQueries(title, input.maxQueries));
    }
  }

  return uniqueStrings(queries, input.maxQueries);
}
