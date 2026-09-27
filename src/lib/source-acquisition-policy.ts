import { lookup } from "node:dns/promises";

import { evaluateSourceUrlPolicy, isPublicInternetAddress } from "./source-policy";

export interface RobotsFetchResponse {
  ok: boolean;
  status: number;
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

export interface SourceAcquisitionPolicyOptions {
  userAgent?: string;
  minDomainDelayMs?: number;
  maxRequestsPerDomain?: number | null;
  reviewDomains?: readonly string[];
  fetchRobots?: (url: string, init: RequestInit) => Promise<RobotsFetchResponse>;
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

function configuredDelay(): number {
  const parsed = Number(process.env.WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS ?? "1200");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(60_000, Math.round(parsed))) : 1200;
}

function configuredDomainRequestLimit(): number | null {
  const raw = process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS;
  if (raw === undefined || raw.trim() === "") return 12;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 12;
  const rounded = Math.round(parsed);
  return rounded <= 0 ? null : Math.min(100, rounded);
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

function defaultFetchRobots(url: string, init: RequestInit): Promise<RobotsFetchResponse> {
  return fetch(url, init);
}

async function defaultResolveHostname(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return lookup(hostname, { all: true, verbatim: true });
}

function normalizeAgent(value: string): string {
  return value.trim().toLowerCase().split(/[\s/]/, 1)[0] ?? "web-task-agent";
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
  const specificGroups = groups.filter((group) => group.agents.includes(agent));
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
  private readonly fetchRobots: (url: string, init: RequestInit) => Promise<RobotsFetchResponse>;
  private readonly resolveHostname: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly robotsByOrigin = new Map<string, Promise<{ text: string | null; unavailable: boolean }>>();
  private readonly nextRequestAt = new Map<string, number>();
  private readonly requestsByDomain = new Map<string, number>();

  constructor(options: SourceAcquisitionPolicyOptions = {}) {
    this.userAgent = options.userAgent?.trim() || process.env.WEB_TASK_AGENT_USER_AGENT?.trim() || "web-task-agent (+https://github.com/OthmaneBlial/web-task-agent)";
    this.minDomainDelayMs = options.minDomainDelayMs ?? configuredDelay();
    this.maxRequestsPerDomain = options.maxRequestsPerDomain === undefined
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

  private getRobots(origin: string): Promise<{ text: string | null; unavailable: boolean }> {
    const cached = this.robotsByOrigin.get(origin);
    if (cached) return cached;

    const robotsRequest = (async () => {
      try {
        const response = await this.fetchRobots(`${origin}/robots.txt`, {
          headers: { "user-agent": this.userAgent, accept: "text/plain,*/*;q=0.1" },
          redirect: "manual",
          signal: AbortSignal.timeout(5_000)
        });
        if (!response.ok) return { text: null, unavailable: true };
        return { text: await response.text(), unavailable: false };
      } catch {
        return { text: null, unavailable: true };
      }
    })();
    this.robotsByOrigin.set(origin, robotsRequest);
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

  private async evaluateResolvedHostname(hostname: string): Promise<SourceAcquisitionDecision | null> {
    try {
      const addresses = await this.resolveHostname(hostname);
      if (addresses.length === 0) {
        return {
          action: "deny",
          reason: "source acquisition denied hostname with no DNS answers; review the URL before trying again",
          signals: ["hostname_resolution_empty", "human_review_required"],
          waitedMs: 0,
          domainRequestCount: null,
          domainRequestLimit: this.maxRequestsPerDomain
        };
      }

      if (addresses.some(({ address }) => !isPublicInternetAddress(address))) {
        return {
          action: "deny",
          reason: "source acquisition denied hostname that resolves to a private or reserved network address",
          signals: ["resolved_private_network", "human_review_required"],
          waitedMs: 0,
          domainRequestCount: null,
          domainRequestLimit: this.maxRequestsPerDomain
        };
      }
    } catch {
      return {
        action: "deny",
        reason: "source acquisition could not resolve hostname safely; review the URL or retry when DNS is available",
        signals: ["hostname_resolution_failed", "human_review_required"],
        waitedMs: 0,
        domainRequestCount: null,
        domainRequestLimit: this.maxRequestsPerDomain
      };
    }

    return null;
  }

  async checkNetworkTarget(
    rawUrl: string,
    options?: { ignoreConfiguredAllowlist?: boolean }
  ): Promise<SourceAcquisitionDecision> {
    const sourceDecision = evaluateSourceUrlPolicy(rawUrl, options);
    if (sourceDecision.action === "deny") {
      return { ...sourceDecision, waitedMs: 0, domainRequestCount: null, domainRequestLimit: this.maxRequestsPerDomain };
    }

    const parsed = new URL(rawUrl);
    const hostname = normalizeDomain(parsed.hostname);
    const resolvedHostnameDecision = await this.evaluateResolvedHostname(parsed.hostname);
    if (resolvedHostnameDecision) {
      return resolvedHostnameDecision;
    }
    if (this.reviewDomains.some((domain) => isDomainMatch(hostname, domain))) {
      return {
        action: "deny",
        reason: "acquisition policy requires human review for this configured sensitive domain before browser navigation",
        signals: ["human_review_required", "review_domain"],
        waitedMs: 0,
        domainRequestCount: this.requestsByDomain.get(hostname) ?? 0,
        domainRequestLimit: this.maxRequestsPerDomain
      };
    }

    return {
      action: "allow",
      reason: "source acquisition allowed a public network target",
      signals: ["public_http_url"],
      waitedMs: 0,
      domainRequestCount: this.requestsByDomain.get(hostname) ?? 0,
      domainRequestLimit: this.maxRequestsPerDomain
    };
  }

  async prepare(rawUrl: string): Promise<SourceAcquisitionDecision> {
    const targetDecision = await this.checkNetworkTarget(rawUrl);
    if (targetDecision.action === "deny") {
      return targetDecision;
    }

    const parsed = new URL(rawUrl);
    const hostname = normalizeDomain(parsed.hostname);

    const robots = await this.getRobots(parsed.origin);
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
