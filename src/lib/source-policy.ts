import { BlockList, isIP, SocketAddress } from "node:net";

export interface SourcePolicyDecision {
  action: "allow" | "deny";
  reason: string;
  signals: string[];
}

export interface SourcePolicyOptions {
  blockedDomains?: readonly string[];
  allowedDomains?: readonly string[];
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+/, "").replace(/^www\./, "");
}

function isDomainMatch(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// IANA's IPv4 special-use prefixes, with its globally reachable 192.0.0.9 and
// 192.0.0.10 exceptions below.
const IPV4_NOT_GLOBALLY_REACHABLE = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  IPV4_NOT_GLOBALLY_REACHABLE.addSubnet(network, prefix, "ipv4");
}

const IPV4_GLOBALLY_REACHABLE_SPECIAL = new BlockList();
for (const address of ["192.0.0.9", "192.0.0.10"]) {
  IPV4_GLOBALLY_REACHABLE_SPECIAL.addAddress(address, "ipv4");
}

const IPV6_GLOBAL_UNICAST = new BlockList();
IPV6_GLOBAL_UNICAST.addSubnet("2000::", 3, "ipv6");

const IPV4_MAPPED_IPV6 = new BlockList();
IPV4_MAPPED_IPV6.addSubnet("::ffff:0:0", 96, "ipv6");

const IPV6_NOT_GLOBALLY_REACHABLE = new BlockList();
for (const [network, prefix] of [
  ["100::", 64],
  ["100:0:0:1::", 64],
  ["2001::", 23],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10]
] as const) {
  IPV6_NOT_GLOBALLY_REACHABLE.addSubnet(network, prefix, "ipv6");
}

const IPV6_GLOBALLY_REACHABLE_SPECIAL = new BlockList();
for (const [network, prefix] of [
  ["2001:1::1", 128],
  ["2001:1::2", 128],
  ["2001:1::3", 128],
  ["2001:3::", 32],
  ["2001:4:112::", 48],
  ["2001:20::", 28],
  ["2001:30::", 28]
] as const) {
  IPV6_GLOBALLY_REACHABLE_SPECIAL.addSubnet(network, prefix, "ipv6");
}

function normalizeIpAddress(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const values = parts.map(Number);
  if (values.some((part) => part < 0 || part > 255)) return false;
  return !IPV4_NOT_GLOBALLY_REACHABLE.check(address, "ipv4") ||
    IPV4_GLOBALLY_REACHABLE_SPECIAL.check(address, "ipv4");
}

function isPublicIpv6(address: string): boolean {
  if (IPV4_MAPPED_IPV6.check(address, "ipv6")) {
    const normalizedAddress = new SocketAddress({ address, family: "ipv6" }).address.toLowerCase();
    return normalizedAddress.startsWith("::ffff:") && isPublicIpv4(normalizedAddress.slice("::ffff:".length));
  }

  if (!IPV6_GLOBAL_UNICAST.check(address, "ipv6")) return false;
  if (
    IPV6_NOT_GLOBALLY_REACHABLE.check(address, "ipv6") &&
    !IPV6_GLOBALLY_REACHABLE_SPECIAL.check(address, "ipv6")
  ) {
    return false;
  }

  if (address === "::" || address === "::1") return false;

  const ipv4Tail = address.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) return isPublicIpv4(ipv4Tail);

  const mappedIpv4 = address.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedIpv4) {
    const high = Number.parseInt(mappedIpv4[1]!, 16);
    const low = Number.parseInt(mappedIpv4[2]!, 16);
    const embedded = [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join(".");
    return isPublicIpv4(embedded);
  }

  const firstSegment = Number.parseInt(address.split(":", 1)[0] ?? "", 16);
  if (!Number.isFinite(firstSegment)) return false;

  const isUniqueLocal = (firstSegment & 0xfe00) === 0xfc00;
  const isLinkLocal = (firstSegment & 0xffc0) === 0xfe80;
  if (isUniqueLocal || isLinkLocal) return false;

  return !(
    address.startsWith("2001:db8:") ||
    address.startsWith("2001:0db8:") ||
    address.startsWith("2001:0000:") ||
    address.startsWith("2002:") ||
    address.startsWith("64:ff9b:")
  );
}

/**
 * Returns whether an IP literal is safe to use as a public web destination.
 * DNS answers must pass the same check before a browser opens a source.
 */
export function isPublicInternetAddress(value: string): boolean {
  const address = normalizeIpAddress(value);
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function configuredDomains(value: string | undefined): string[] {
  return (value ?? "").split(",").map(normalizeDomain).filter(Boolean);
}

export function evaluateSourceUrlPolicy(rawUrl: string, options: SourcePolicyOptions = {}): SourcePolicyDecision {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { action: "deny", reason: "source policy denied malformed URL", signals: ["malformed_url"] };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { action: "deny", reason: "source policy only permits HTTP(S) URLs", signals: ["unsupported_protocol"] };
  if (parsed.username || parsed.password) return { action: "deny", reason: "source policy denied credential-bearing URL", signals: ["url_credentials"] };

  const hostname = normalizeDomain(parsed.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return { action: "deny", reason: "source policy denied local hostname", signals: ["local_hostname"] };
  if (isIP(normalizeIpAddress(hostname)) !== 0 && !isPublicInternetAddress(hostname)) {
    return { action: "deny", reason: "source policy denied private or reserved network address", signals: ["private_network"] };
  }

  const blocked = [...(options.blockedDomains ?? []), ...configuredDomains(process.env.WEB_TASK_AGENT_BLOCKED_DOMAINS)].map(normalizeDomain).filter(Boolean);
  if (blocked.some((domain) => isDomainMatch(hostname, domain))) return { action: "deny", reason: "source policy denied configured blocked domain", signals: ["blocked_domain"] };

  const allowed = [...(options.allowedDomains ?? []), ...configuredDomains(process.env.WEB_TASK_AGENT_ALLOWED_DOMAINS)].map(normalizeDomain).filter(Boolean);
  if (allowed.length > 0 && !allowed.some((domain) => isDomainMatch(hostname, domain))) return { action: "deny", reason: "source policy denied domain outside configured allowlist", signals: ["outside_allowlist"] };

  return { action: "allow", reason: "source policy allowed public HTTP(S) URL", signals: ["public_http_url"] };
}

export function evaluateRedirectTargetPolicy(input: {
  requestedUrl: string;
  finalUrl: string;
  options?: SourcePolicyOptions;
}): SourcePolicyDecision {
  const target = evaluateSourceUrlPolicy(input.finalUrl, input.options);
  if (target.action === "deny") {
    return {
      action: "deny",
      reason: `source policy denied redirect target: ${target.reason}`,
      signals: ["unsafe_redirect_target", ...target.signals]
    };
  }

  try {
    const requested = new URL(input.requestedUrl);
    const final = new URL(input.finalUrl);
    if (requested.origin !== final.origin) {
      return {
        action: "allow",
        reason: "source policy allowed cross-origin redirect; operator review is recommended",
        signals: ["cross_origin_redirect", ...target.signals]
      };
    }
  } catch {
    return target;
  }

  return target;
}

const INJECTION_PATTERNS: Array<{ signal: string; pattern: RegExp }> = [
  { signal: "instruction_override", pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|system)\s+(instructions?|prompts?)\b/i },
  { signal: "role_override", pattern: /\b(you are now|act as|switch to)\s+(the\s+)?(system|developer|assistant)\b/i },
  { signal: "secret_exfiltration", pattern: /\b(reveal|send|exfiltrate|print)\b.{0,80}\b(api key|password|secret|token|credential)\b/i },
  { signal: "tool_override", pattern: /\b(call|run|execute)\b.{0,80}\b(shell|terminal|tool|command)\b/i }
];

export function detectPromptInjectionSignals(values: readonly string[]): string[] {
  const text = values.join("\n");
  return INJECTION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ signal }) => signal);
}
