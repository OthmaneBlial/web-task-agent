import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { Readable } from "node:stream";

import { evaluateSourceUrlPolicy, isPublicInternetAddress } from "./source-policy";

export interface RobotsFetchResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export interface SourceAcquisitionDecision {
  action: "allow" | "deny";
  reason: string;
  signals: string[];
  waitedMs: number;
  domainRequestCount?: number | null;
  domainRequestLimit?: number | null;
}

interface RobotsResult {
  text: string | null;
  unavailable: boolean;
  denial?: SourceAcquisitionDecision;
}

interface RobotsCacheEntry {
  promise: Promise<RobotsResult>;
  expiresAt: number;
}

type ResolvedHostnameAddress = { address: string; family: number };

export interface SourceAcquisitionPolicyOptions {
  userAgent?: string;
  minDomainDelayMs?: number;
  maxRequestsPerDomain?: number | null;
  reviewDomains?: readonly string[];
  fetchRobots?: (url: string, init: RequestInit, addresses: readonly ResolvedHostnameAddress[]) => Promise<RobotsFetchResponse>;
  resolveHostname?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface RobotsRule {
  kind: "allow" | "disallow";
  value: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

const MAX_ROBOTS_BYTES = 512 * 1024;
const HOSTNAME_LOOKUP_TIMEOUT_MS = 5_000;
const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const ROBOTS_DENIAL_RETRY_MS = 60 * 1_000;

async function readRobotsText(response: RobotsFetchResponse): Promise<string> {
  if (!response.body) {
    return Buffer.from(await response.text(), "utf8").subarray(0, MAX_ROBOTS_BYTES).toString("utf8");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (bytesRead < MAX_ROBOTS_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, MAX_ROBOTS_BYTES - bytesRead);
      bytesRead += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
      if (chunk.byteLength < value.byteLength || bytesRead === MAX_ROBOTS_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return text + decoder.decode();
}

function configuredDelay(): number {
  const parsed = Number(process.env.WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS ?? "1200");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(60_000, Math.round(parsed))) : 1200;
}

function configuredDomainRequestLimit(): number | null {
  const raw = process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS;
  if (raw === undefined || raw.trim() === "") return 12;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 12;
  return parsed <= 0 ? null : Math.max(1, Math.min(100, Math.round(parsed)));
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+/, "").replace(/\.$/, "").replace(/^www\./, "");
}

function configuredDomains(value: string | undefined): string[] {
  return (value ?? ",").split(",").map(normalizeDomain).filter(Boolean);
}

function isDomainMatch(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultFetchRobots(
  url: string,
  init: RequestInit,
  addresses: readonly ResolvedHostnameAddress[]
): Promise<RobotsFetchResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (addresses.length === 0) {
      reject(new Error("robots.txt target has no validated DNS addresses"));
      return;
    }

    const pinnedLookup: NonNullable<http.RequestOptions["lookup"]> = (_hostname, options, callback) => {
      const candidates = options.family
        ? addresses.filter((candidate) => candidate.family === options.family)
        : addresses;
      if (candidates.length === 0) {
        const error = Object.assign(new Error("no validated DNS address matches the requested family"), { code: "ENOTFOUND" });
        callback(error, "");
        return;
      }
      if (options.all) {
        callback(null, candidates.map(({ address, family }) => ({ address, family })));
        return;
      }
      callback(null, candidates[0]!.address, candidates[0]!.family);
    };
    const transport = parsed.protocol === "https:" ? https : parsed.protocol === "http:" ? http : null;
    if (!transport) {
      reject(new Error("robots.txt target must use HTTP or HTTPS"));
      return;
    }

    const request = transport.request(parsed, {
      method: "GET",
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        "accept-encoding": "identity"
      },
      signal: init.signal ?? undefined,
      agent: false,
      lookup: pinnedLookup
    }, (response) => {
      const status = response.statusCode ?? 502;
      const encoding = response.headers["content-encoding"];
      const unsupportedEncoding = encoding !== undefined &&
        (Array.isArray(encoding) ? encoding.join(",") : encoding).trim().toLowerCase() !== "identity";
      const headers = {
        get(name: string): string | null {
          const value = response.headers[name.toLowerCase()];
          return Array.isArray(value) ? value.join(", ") : value ?? null;
        }
      };
      resolve({
        ok: status >= 200 && status < 300,
        status,
        headers,
        body: unsupportedEncoding || status === 204 || status === 205 || status === 304
          ? null
          : Readable.toWeb(response) as ReadableStream<Uint8Array>,
        text: async () => {
          if (unsupportedEncoding) throw new Error("robots.txt used an unsupported content encoding");
          const chunks: Buffer[] = [];
          for await (const chunk of response) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          return Buffer.concat(chunks).toString("utf8");
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function defaultResolveHostname(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return lookup(hostname, { all: true, verbatim: true });
}

function normalizeAgent(value: string): string {
  return value.trim().toLowerCase();
}

function parseRobots(content: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      continue;
    }
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) {
      continue;
    }
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ kind: key, value });
    }
  }

  return groups;
}

function normalizeRobotsPath(value: string, pattern: boolean): string {
  return value.replace(/%[0-9a-f]{2}|[^\x00-\x7f]|\*|\$/giu, (character) => {
    if (character.startsWith("%")) {
      const hex = character.slice(1).toUpperCase();
      const decoded = String.fromCharCode(Number.parseInt(hex, 16));
      return /^[A-Za-z0-9._~-]$/.test(decoded) ? decoded : `%${hex}`;
    }
    if (character === "*" || character === "$") {
      return pattern ? character : `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
    }
    return encodeURIComponent(character).replace(/%[0-9a-f]{2}/gi, (encoded) => encoded.toUpperCase());
  });
}

function robotsPatternMatches(rulePath: string, requestPath: string): boolean {
  const pattern = normalizeRobotsPath(rulePath, true);
  const path = normalizeRobotsPath(requestPath, false);
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const segments = body.split("*").filter(Boolean);
  const startsWithWildcard = body.startsWith("*");
  const endsWithWildcard = body.endsWith("*");
  let cursor = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const first = index === 0 && !startsWithWildcard;
    const last = index === segments.length - 1;
    if (last && endAnchored && !endsWithWildcard) {
      const offset = path.length - segment.length;
      if (offset < cursor || !path.endsWith(segment) || (first && offset !== 0)) return false;
      continue;
    }

    const offset = first
      ? path.startsWith(segment) ? 0 : -1
      : path.indexOf(segment, cursor);
    if (offset < cursor) return false;
    cursor = offset + segment.length;
  }

  return true;
}

function robotsPatternSpecificity(rulePath: string): number {
  const pattern = normalizeRobotsPath(rulePath, true);
  const body = pattern.endsWith("$") ? pattern.slice(0, -1) : pattern;
  return Buffer.byteLength(body.replace(/\*/g, ""));
}

export function evaluateRobotsText(input: {
  robotsText: string;
  userAgent: string;
  pathname: string;
}): { allowed: boolean; reason: string } {
  const agent = normalizeAgent(input.userAgent);
  const groups = parseRobots(input.robotsText);
  const specificGroups = groups.filter((group) =>
    group.agents.some((candidate) => candidate !== "*" && candidate.length > 0 && agent.includes(candidate))
  );
  const matchingGroups = specificGroups.length > 0
    ? specificGroups
    : groups.filter((group) => group.agents.includes("*"));
  const rules = matchingGroups.flatMap((group) => group.rules)
    .filter((rule) => rule.value.length > 0 && robotsPatternMatches(rule.value, input.pathname));

  if (rules.length === 0) {
    return { allowed: true, reason: "robots.txt permits this path" };
  }
  rules.sort((left, right) => robotsPatternSpecificity(right.value) - robotsPatternSpecificity(left.value) || (left.kind === "allow" ? -1 : 1));
  const matched = rules[0]!;
  return matched.kind === "allow"
    ? { allowed: true, reason: `robots.txt explicitly allows ${matched.value}` }
    : { allowed: false, reason: `robots.txt disallows ${matched.value}` };
}

export class SourceAcquisitionPolicy {
  readonly userAgent: string;
  readonly minDomainDelayMs: number;
  readonly maxRequestsPerDomain: number | null;
  readonly reviewDomains: readonly string[];
  private readonly fetchRobots: (url: string, init: RequestInit, addresses: readonly ResolvedHostnameAddress[]) => Promise<RobotsFetchResponse>;
  private readonly resolveHostname: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly robotsByOrigin = new Map<string, RobotsCacheEntry>();
  private readonly nextRequestAt = new Map<string, number>();
  private readonly requestsByDomain = new Map<string, number>();

  constructor(options: SourceAcquisitionPolicyOptions = {}) {
    this.userAgent = options.userAgent?.trim() || process.env.WEB_TASK_AGENT_USER_AGENT?.trim() || "web-task-agent (+https://github.com/OthmaneBlial/web-task-agent)";
    this.minDomainDelayMs = options.minDomainDelayMs === undefined || !Number.isFinite(options.minDomainDelayMs)
      ? configuredDelay()
      : Math.max(0, Math.min(60_000, Math.round(options.minDomainDelayMs)));
    this.maxRequestsPerDomain = options.maxRequestsPerDomain === undefined ||
      (options.maxRequestsPerDomain !== null && !Number.isFinite(options.maxRequestsPerDomain))
      ? configuredDomainRequestLimit()
      : options.maxRequestsPerDomain === null || options.maxRequestsPerDomain <= 0
        ? null
        : Math.min(100, Math.round(options.maxRequestsPerDomain));
    this.reviewDomains = [
      ...(options.reviewDomains ?? []),
      ...configuredDomains(process.env.WEB_TASK_AGENT_REVIEW_DOMAINS)
    ].map(normalizeDomain).filter(Boolean);
    this.fetchRobots = options.fetchRobots ?? defaultFetchRobots;
    this.resolveHostname = options.resolveHostname ?? defaultResolveHostname;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private getRobots(origin: string): Promise<RobotsResult> {
    const cached = this.robotsByOrigin.get(origin);
    if (cached && cached.expiresAt > this.now()) return cached.promise;
    if (cached) this.robotsByOrigin.delete(origin);

    const robotsRequest = (async () => {
      const deny = (reason: string, signals: string[]): RobotsResult => ({
        text: null,
        unavailable: true,
        denial: {
          action: "deny",
          reason,
          signals,
          waitedMs: 0,
          domainRequestCount: null,
          domainRequestLimit: this.maxRequestsPerDomain
        }
      });
      const signal = AbortSignal.timeout(5_000);
      let robotsUrl = `${origin}/robots.txt`;

      for (let redirects = 0; redirects <= 5; redirects += 1) {
        const target = await this.inspectNetworkTarget(robotsUrl);
        const targetDecision = target.decision;
        if (targetDecision.action === "deny") {
          return deny(
            `source acquisition denied robots.txt target: ${targetDecision.reason}`,
            ["robots_redirect_target_denied", ...targetDecision.signals]
          );
        }

        let response: RobotsFetchResponse;
        try {
          response = await this.fetchRobots(robotsUrl, {
            headers: { "user-agent": this.userAgent, accept: "text/plain,*/*;q=0.1" },
            redirect: "manual",
            signal
          }, target.addresses ?? []);
        } catch {
          return deny("source acquisition denied source because robots.txt is unreachable", ["robots_unreachable", "human_review_required"]);
        }

        if (response.status >= 300 && response.status < 400) {
          if (redirects === 5) {
            return deny("source acquisition denied source because robots.txt exceeded five redirects", ["robots_redirect_limit", "human_review_required"]);
          }
          const location = response.headers?.get("location")?.trim();
          if (!location) {
            return deny("source acquisition denied source because robots.txt redirect omitted Location", ["robots_redirect_invalid", "human_review_required"]);
          }
          try {
            robotsUrl = new URL(location, robotsUrl).toString();
          } catch {
            return deny("source acquisition denied source because robots.txt redirect URL is malformed", ["robots_redirect_invalid", "human_review_required"]);
          }
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          return deny("source acquisition denied source because robots.txt access was refused", ["robots_access_denied", "human_review_required"]);
        }
        if (response.status === 429) {
          return deny("source acquisition denied source because robots.txt was rate limited", ["robots_rate_limited", "human_review_required"]);
        }
        if (response.status >= 400 && response.status < 500) {
          return { text: null, unavailable: true };
        }
        if (response.status >= 200 && response.status < 300 && response.ok) {
          try {
            return { text: await readRobotsText(response), unavailable: false };
          } catch {
            return deny("source acquisition denied source because robots.txt could not be read", ["robots_unreachable", "human_review_required"]);
          }
        }
        return deny(`source acquisition denied source because robots.txt returned HTTP ${response.status}`, ["robots_unreachable", "human_review_required"]);
      }

      return deny("source acquisition denied source because robots.txt redirect limit was reached", ["robots_redirect_limit", "human_review_required"]);
    })();
    const cacheEntry = { promise: robotsRequest, expiresAt: Number.POSITIVE_INFINITY };
    this.robotsByOrigin.set(origin, cacheEntry);
    void robotsRequest.then((result) => {
      if (this.robotsByOrigin.get(origin) === cacheEntry) {
        cacheEntry.expiresAt = this.now() + (result.denial ? ROBOTS_DENIAL_RETRY_MS : ROBOTS_CACHE_TTL_MS);
      }
    }).catch(() => {
      if (this.robotsByOrigin.get(origin) === cacheEntry) this.robotsByOrigin.delete(origin);
    });
    return robotsRequest;
  }

  private async waitForDomainSlot(hostname: string): Promise<number> {
    const now = this.now();
    const scheduledAt = Math.max(now, this.nextRequestAt.get(hostname) ?? now);
    const waitedMs = scheduledAt - now;
    this.nextRequestAt.set(hostname, scheduledAt + this.minDomainDelayMs);
    if (waitedMs > 0) {
      await this.sleep(waitedMs);
    }
    return waitedMs;
  }

  private reserveDomainRequest(hostname: string): { allowed: boolean; count: number; limit: number | null } {
    const current = this.requestsByDomain.get(hostname) ?? 0;
    if (this.maxRequestsPerDomain !== null && current >= this.maxRequestsPerDomain) {
      return { allowed: false, count: current, limit: this.maxRequestsPerDomain };
    }
    const count = current + 1;
    this.requestsByDomain.set(hostname, count);
    return { allowed: true, count, limit: this.maxRequestsPerDomain };
  }

  private async resolvePublicHostname(hostname: string): Promise<{
    addresses: ResolvedHostnameAddress[];
  } | {
    decision: SourceAcquisitionDecision;
  }> {
    try {
      let timeout: NodeJS.Timeout | undefined;
      const addresses = await Promise.race([
        this.resolveHostname(hostname),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("hostname resolution timed out")),
            HOSTNAME_LOOKUP_TIMEOUT_MS
          );
        })
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      if (addresses.length === 0) {
        return {
          decision: {
            action: "deny",
            reason: "source acquisition denied hostname with no DNS answers; review the URL before trying again",
            signals: ["hostname_resolution_empty", "human_review_required"],
            waitedMs: 0,
            domainRequestCount: null,
            domainRequestLimit: this.maxRequestsPerDomain
          }
        };
      }

      if (addresses.some(({ address }) => !isPublicInternetAddress(address))) {
        return {
          decision: {
            action: "deny",
            reason: "source acquisition denied hostname that resolves to a private or reserved network address",
            signals: ["resolved_private_network", "human_review_required"],
            waitedMs: 0,
            domainRequestCount: null,
            domainRequestLimit: this.maxRequestsPerDomain
          }
        };
      }
      return { addresses };
    } catch {
      return {
        decision: {
          action: "deny",
          reason: "source acquisition could not resolve hostname safely; review the URL or retry when DNS is available",
          signals: ["hostname_resolution_failed", "human_review_required"],
          waitedMs: 0,
          domainRequestCount: null,
          domainRequestLimit: this.maxRequestsPerDomain
        }
      };
    }
  }

  private async inspectNetworkTarget(
    rawUrl: string,
    options?: { ignoreConfiguredAllowlist?: boolean }
  ): Promise<{ decision: SourceAcquisitionDecision; addresses: readonly ResolvedHostnameAddress[] | null }> {
    const sourceDecision = evaluateSourceUrlPolicy(rawUrl, options);
    if (sourceDecision.action === "deny") {
      return {
        decision: { ...sourceDecision, waitedMs: 0, domainRequestCount: null, domainRequestLimit: this.maxRequestsPerDomain },
        addresses: null
      };
    }

    const parsed = new URL(rawUrl);
    const hostname = normalizeDomain(parsed.hostname);
    const resolvedHostname = await this.resolvePublicHostname(parsed.hostname);
    if ("decision" in resolvedHostname) {
      return { decision: resolvedHostname.decision, addresses: null };
    }
    if (this.reviewDomains.some((domain) => isDomainMatch(hostname, domain))) {
      return {
        decision: {
          action: "deny",
          reason: "acquisition policy requires human review for this configured sensitive domain before browser navigation",
          signals: ["human_review_required", "review_domain"],
          waitedMs: 0,
          domainRequestCount: this.requestsByDomain.get(hostname) ?? 0,
          domainRequestLimit: this.maxRequestsPerDomain
        },
        addresses: null
      };
    }

    return {
      decision: {
        action: "allow",
        reason: "source acquisition allowed a public network target",
        signals: ["public_http_url"],
        waitedMs: 0,
        domainRequestCount: this.requestsByDomain.get(hostname) ?? 0,
        domainRequestLimit: this.maxRequestsPerDomain
      },
      addresses: resolvedHostname.addresses
    };
  }

  async checkNetworkTarget(
    rawUrl: string,
    options?: { ignoreConfiguredAllowlist?: boolean }
  ): Promise<SourceAcquisitionDecision> {
    return (await this.inspectNetworkTarget(rawUrl, options)).decision;
  }

  async prepare(rawUrl: string): Promise<SourceAcquisitionDecision> {
    const targetDecision = await this.checkNetworkTarget(rawUrl);
    if (targetDecision.action === "deny") {
      return targetDecision;
    }

    const parsed = new URL(rawUrl);
    const hostname = normalizeDomain(parsed.hostname);

    const robots = await this.getRobots(parsed.origin);
    if (robots.denial) {
      return {
        ...robots.denial,
        domainRequestCount: this.requestsByDomain.get(hostname) ?? 0,
        domainRequestLimit: this.maxRequestsPerDomain
      };
    }
    if (robots.text !== null) {
      const robotsDecision = evaluateRobotsText({
        robotsText: robots.text,
        userAgent: this.userAgent,
        pathname: `${parsed.pathname}${parsed.search}`
      });
      if (!robotsDecision.allowed) {
        return {
          action: "deny",
          reason: `acquisition policy denied source: ${robotsDecision.reason}`,
          signals: ["robots_disallow"],
          waitedMs: 0,
          domainRequestCount: this.requestsByDomain.get(hostname) ?? 0,
          domainRequestLimit: this.maxRequestsPerDomain
        };
      }
    }

    const reservation = this.reserveDomainRequest(hostname);
    if (!reservation.allowed) {
      return {
        action: "deny",
        reason: `acquisition policy denied source: domain request budget of ${reservation.limit} reached; review the evidence already collected or raise WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS deliberately`,
        signals: ["domain_request_budget_exhausted", "human_review_required"],
        waitedMs: 0,
        domainRequestCount: reservation.count,
        domainRequestLimit: reservation.limit
      };
    }

    const waitedMs = await this.waitForDomainSlot(hostname);
    const budgetSignal = reservation.limit !== null && reservation.limit - reservation.count <= 2
      ? ["domain_request_budget_low"]
      : [];
    return {
      action: "allow",
      reason: robots.unavailable
        ? `source policy allowed public URL; robots.txt unavailable, proceeding with rate limit and domain request ${reservation.count}${reservation.limit === null ? "" : `/${reservation.limit}`}`
        : `source policy and robots.txt allow this URL; domain request ${reservation.count}${reservation.limit === null ? "" : `/${reservation.limit}`}`,
      signals: ["public_http_url", robots.unavailable ? "robots_unavailable" : "robots_allowed", ...(waitedMs > 0 ? ["domain_rate_limited"] : []), ...budgetSignal],
      waitedMs,
      domainRequestCount: reservation.count,
      domainRequestLimit: reservation.limit
    };
  }
}
