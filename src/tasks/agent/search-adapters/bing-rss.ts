import type { AgentSearchResult } from "../../../types";
import { cancelResponseBody, readBoundedResponseText } from "../../../lib/read-bounded-response-text";
import { BING_RSS_SEARCH_PROVIDER, nowIso } from "../shared";
import type { AgentSearchAdapter, AgentSearchStageResult } from "../search-adapter";

type FetchLike = typeof fetch;

const MAX_BING_RSS_BYTES = 2 * 1024 * 1024;

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlTag(block: string, tagName: string): string {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXmlText(match[1] ?? "") : "";
}

function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function parseBingRssResults(xml: string, maxResults: number): AgentSearchResult[] {
  const feed = xml.match(/<rss\b[^>]*>([\s\S]*?)<\/rss\s*>/i)?.[1];
  if (feed === undefined || !/<channel\b[^>]*>[\s\S]*<\/channel\s*>/i.test(feed)) {
    throw new Error("bing rss response did not contain a complete RSS feed");
  }

  const results: AgentSearchResult[] = [];
  const seenUrls = new Set<string>();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (const item of items) {
    const url = extractXmlTag(item, "link");
    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    results.push({
      title: extractXmlTag(item, "title") || url,
      url,
      snippet: extractXmlTag(item, "description"),
      site: hostnameOf(url)
    });

    if (results.length >= Math.max(1, maxResults)) {
      break;
    }
  }

  return results;
}

export class BingRssSearchAdapter implements AgentSearchAdapter {
  readonly id = BING_RSS_SEARCH_PROVIDER;
  readonly label = "Bing RSS";

  constructor(
    private readonly log: (message: string) => void,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  buildSearchUrl(query: string): string {
    return `https://www.bing.com/search?format=rss&setlang=en-US&cc=US&mkt=en-US&ensearch=1&q=${encodeURIComponent(query)}`;
  }

  async search(query: string, maxResultsPerQuery: number): Promise<AgentSearchStageResult> {
    const searchUrl = this.buildSearchUrl(query);
    this.log(`searching via Bing RSS for "${query}"`);

    const response = await this.fetchImpl(searchUrl, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      await cancelResponseBody(response.body);
      throw new Error(`bing rss search failed with status ${response.status}`);
    }

    const xml = await readBoundedResponseText(response, MAX_BING_RSS_BYTES, "bing rss");
    const results = parseBingRssResults(xml, maxResultsPerQuery);

    return {
      query,
      searchedAt: nowIso(),
      searchUrl,
      searchProvider: this.id,
      pagesVisited: 1,
      exhausted: true,
      results
    };
  }
}

export function createBingRssSearchAdapter(
  log: (message: string) => void,
  fetchImpl?: FetchLike
): AgentSearchAdapter {
  return new BingRssSearchAdapter(log, fetchImpl);
}
