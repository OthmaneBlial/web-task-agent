import { evaluateSourceUrlPolicy } from "./source-policy";

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
}

export interface SourceAcquisitionPolicyOptions {
  userAgent?: string;
  minDomainDelayMs?: number;
  fetchRobots?: (url: string, init: RequestInit) => Promise<RobotsFetchResponse>;
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultFetchRobots(url: string, init: RequestInit): Promise<RobotsFetchResponse> {
  return fetch(url, init);
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
      current = null;
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
    .filter((rule) => rule.value.length > 0 && input.pathname.startsWith(rule.value));

  if (rules.length === 0) {
    return { allowed: true, reason: "robots.txt permits this path" };
  }
  rules.sort((left, right) => right.value.length - left.value.length || (left.kind === "allow" ? -1 : 1));
  const matched = rules[0]!;
  return matched.kind === "allow"
    ? { allowed: true, reason: `robots.txt explicitly allows ${matched.value}` }
    : { allowed: false, reason: `robots.txt disallows ${matched.value}` };
}

export class SourceAcquisitionPolicy {
  readonly userAgent: string;
  readonly minDomainDelayMs: number;
  private readonly fetchRobots: (url: string, init: RequestInit) => Promise<RobotsFetchResponse>;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly robotsByOrigin = new Map<string, string | null>();
  private readonly nextRequestAt = new Map<string, number>();

  constructor(options: SourceAcquisitionPolicyOptions = {}) {
    this.userAgent = options.userAgent?.trim() || process.env.WEB_TASK_AGENT_USER_AGENT?.trim() || "web-task-agent/0.2";
    this.minDomainDelayMs = options.minDomainDelayMs ?? configuredDelay();
    this.fetchRobots = options.fetchRobots ?? defaultFetchRobots;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private async getRobots(origin: string): Promise<{ text: string | null; unavailable: boolean }> {
    if (this.robotsByOrigin.has(origin)) {
      const cached = this.robotsByOrigin.get(origin) ?? null;
      return { text: cached, unavailable: cached === null };
    }
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const response = await this.fetchRobots(robotsUrl, {
        headers: { "user-agent": this.userAgent, accept: "text/plain,*/*;q=0.1" },
        redirect: "manual",
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) {
        this.robotsByOrigin.set(origin, null);
        return { text: null, unavailable: true };
      }
      const text = await response.text();
      this.robotsByOrigin.set(origin, text);
      return { text, unavailable: false };
    } catch {
      this.robotsByOrigin.set(origin, null);
      return { text: null, unavailable: true };
    }
  }

  private async waitForDomainSlot(hostname: string): Promise<number> {
    const scheduledAt = this.nextRequestAt.get(hostname) ?? 0;
    const waitedMs = Math.max(0, scheduledAt - this.now());
    if (waitedMs > 0) {
      await this.sleep(waitedMs);
    }
    this.nextRequestAt.set(hostname, this.now() + this.minDomainDelayMs);
    return waitedMs;
  }

  async prepare(rawUrl: string): Promise<SourceAcquisitionDecision> {
    const sourceDecision = evaluateSourceUrlPolicy(rawUrl);
    if (sourceDecision.action === "deny") {
      return { ...sourceDecision, waitedMs: 0 };
    }

    const parsed = new URL(rawUrl);
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
          waitedMs: 0
        };
      }
    }

    const waitedMs = await this.waitForDomainSlot(parsed.hostname.toLowerCase());
    return {
      action: "allow",
      reason: robots.unavailable
        ? "source policy allowed public URL; robots.txt unavailable, proceeding with rate limit"
        : "source policy and robots.txt allow this URL",
      signals: ["public_http_url", robots.unavailable ? "robots_unavailable" : "robots_allowed", ...(waitedMs > 0 ? ["domain_rate_limited"] : [])],
      waitedMs
    };
  }
}
