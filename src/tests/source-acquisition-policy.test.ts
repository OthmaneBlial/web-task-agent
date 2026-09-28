import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import test from "node:test";

import { evaluateRobotsText, SourceAcquisitionPolicy, type RobotsFetchResponse } from "../lib/source-acquisition-policy";

const resolvePublicHostname = async () => [{ address: "93.184.216.34", family: 4 }];

function robotsResponse(text: string, status = 200): RobotsFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new Response(text).body,
    text: async () => text
  };
}

test("robots policy honors the most specific matching rule and user agent group", () => {
  const robotsText = [
    "User-agent: *",
    "Disallow: /private",
    "Allow: /private/public",
    "",
    "User-agent: web-task-agent",
    "Disallow: /restricted"
  ].join("\n");

  assert.equal(
    evaluateRobotsText({ robotsText, userAgent: "web-task-agent/0.2", pathname: "/restricted/report" }).allowed,
    false
  );
  assert.equal(
    evaluateRobotsText({ robotsText, userAgent: "other-bot", pathname: "/private/public/guide" }).allowed,
    true
  );
  assert.equal(
    evaluateRobotsText({ robotsText, userAgent: "other-bot", pathname: "/private/notes" }).allowed,
    false
  );
});

test("robots matching combines case-insensitive product-token substring groups", () => {
  const robotsText = [
    "User-agent: WEB-TASK",
    "Disallow: /short",
    "User-agent: agent",
    "Disallow: /suffix",
    "User-agent: *",
    "Allow: /"
  ].join("\n");

  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent/0.2", pathname: "/short/report" }).allowed, false);
  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent/0.2", pathname: "/suffix/report" }).allowed, false);
  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent/0.2", pathname: "/public/report" }).allowed, true);
});

test("robots blank lines do not end a group before its access rules", () => {
  const robotsText = [
    "User-agent: *",
    "",
    "Disallow: /private",
    "",
    "Allow: /private/public"
  ].join("\n");

  assert.equal(
    evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/private/draft" }).allowed,
    false
  );
  assert.equal(
    evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/private/public/report" }).allowed,
    true
  );
});

test("robots matching supports wildcard, end-anchor, and encoded paths", () => {
  const robotsText = [
    "User-agent: *",
    "Disallow: /*.pdf$",
    "Disallow: /foo/bar",
    "Disallow: /café",
    "Allow: /public/*.pdf$"
  ].join("\n");

  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/reports/q1.pdf" }).allowed, false);
  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/reports/q1.pdf/notes" }).allowed, true);
  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/foo/%62ar" }).allowed, false);
  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/caf%C3%A9/guide" }).allowed, false);
  assert.equal(evaluateRobotsText({ robotsText, userAgent: "web-task-agent", pathname: "/public/q1.pdf" }).allowed, true);
});

test("source acquisition caches robots decisions and paces repeated domains", async () => {
  let now = 1_000;
  let robotsCalls = 0;
  const waits: number[] = [];
  const policy = new SourceAcquisitionPolicy({
    userAgent: "web-task-agent/0.2",
    minDomainDelayMs: 500,
    now: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n");
    },
    resolveHostname: resolvePublicHostname
  });

  const first = await policy.prepare("https://docs.example.com/one");
  const second = await policy.prepare("https://docs.example.com/two");

  assert.equal(first.action, "allow");
  assert.equal(second.action, "allow");
  assert.equal(robotsCalls, 1);
  assert.deepEqual(waits, [500]);
  assert.ok(second.signals.includes("domain_rate_limited"));
});

test("invalid numeric options retain configured source acquisition bounds", async () => {
  const previousDelay = process.env.WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS;
  const previousLimit = process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS;
  process.env.WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS = "37";
  process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS = "2";

  try {
    const waits: number[] = [];
    const policy = new SourceAcquisitionPolicy({
      minDomainDelayMs: Number.NaN,
      maxRequestsPerDomain: Number.NaN,
      now: () => 1_000,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
      resolveHostname: resolvePublicHostname,
      fetchRobots: async () => robotsResponse("User-agent: *\nAllow: /\n")
    });

    const first = await policy.prepare("https://docs.example.com/one");
    const second = await policy.prepare("https://docs.example.com/two");
    const exhausted = await policy.prepare("https://docs.example.com/three");

    assert.equal(first.action, "allow");
    assert.equal(second.action, "allow");
    assert.equal(second.waitedMs, 37);
    assert.deepEqual(waits, [37]);
    assert.equal(exhausted.action, "deny");
    assert.equal(exhausted.domainRequestCount, 2);
  } finally {
    if (previousDelay === undefined) delete process.env.WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS;
    else process.env.WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS = previousDelay;
    if (previousLimit === undefined) delete process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS;
    else process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS = previousLimit;
  }
});

test("positive fractional domain request limits keep a one-request cap", async () => {
  const previousLimit = process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS;
  process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS = "0.4";

  try {
    const policy = new SourceAcquisitionPolicy({
      minDomainDelayMs: 0,
      resolveHostname: resolvePublicHostname,
      fetchRobots: async () => robotsResponse("User-agent: *\nAllow: /\n")
    });

    const first = await policy.prepare("https://docs.example.com/one");
    const second = await policy.prepare("https://docs.example.com/two");

    assert.equal(first.action, "allow");
    assert.equal(first.domainRequestLimit, 1);
    assert.equal(second.action, "deny");
    assert.equal(second.domainRequestLimit, 1);
  } finally {
    if (previousLimit === undefined) delete process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS;
    else process.env.WEB_TASK_AGENT_DOMAIN_MAX_REQUESTS = previousLimit;
  }
});

test("positive fractional constructor limits keep a one-request cap", async () => {
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    maxRequestsPerDomain: 0.4,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => robotsResponse("User-agent: *\nAllow: /\n")
  });

  const first = await policy.prepare("https://docs.example.com/one");
  const second = await policy.prepare("https://docs.example.com/two");

  assert.equal(first.action, "allow");
  assert.equal(first.domainRequestLimit, 1);
  assert.equal(second.action, "deny");
  assert.equal(second.domainRequestLimit, 1);
});

test("source acquisition refreshes cached robots rules after 24 hours", async () => {
  let now = 1_000;
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    now: () => now,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n");
    }
  });

  await policy.prepare("https://docs.example.com/one");
  now += 24 * 60 * 60 * 1_000;
  await policy.prepare("https://docs.example.com/two");

  assert.equal(robotsCalls, 2);
});

test("denied robots fetches retry after a short cooldown", async () => {
  let now = 1_000;
  let robotsCalls = 0;
  let status = 503;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    now: () => now,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n", status);
    }
  });

  assert.equal((await policy.prepare("https://docs.example.com/one")).action, "deny");
  assert.equal((await policy.prepare("https://docs.example.com/two")).action, "deny");
  assert.equal(robotsCalls, 1);
  now += 60 * 1_000;
  status = 200;
  assert.equal((await policy.prepare("https://docs.example.com/three")).action, "allow");
  assert.equal(robotsCalls, 2);
});

test("concurrent source acquisition coalesces robots requests and reserves paced domain slots", async () => {
  let robotsCalls = 0;
  const robotsResolvers: Array<(response: RobotsFetchResponse) => void> = [];
  const waits: number[] = [];
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 500,
    now: () => 1_000,
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    fetchRobots: async () => {
      robotsCalls += 1;
      return new Promise<RobotsFetchResponse>((resolve) => robotsResolvers.push(resolve));
    },
    resolveHostname: resolvePublicHostname
  });

  const pending = ["one", "two", "three"].map((path) =>
    policy.prepare(`https://docs.example.com/${path}`)
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const resolveRobots of robotsResolvers) {
    resolveRobots(robotsResponse("User-agent: *\nAllow: /\n"));
  }
  const decisions = await Promise.all(pending);

  assert.equal(robotsCalls, 1);
  assert.deepEqual(waits.sort((left, right) => left - right), [500, 1_000]);
  assert.deepEqual(decisions.map(({ waitedMs }) => waitedMs).sort((left, right) => left - right), [0, 500, 1_000]);
  assert.ok(decisions.every(({ action }) => action === "allow"));
});

test("source acquisition denies known robots exclusions and records unavailable robots", async () => {
  const denyPolicy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    fetchRobots: async () => robotsResponse("User-agent: *\nDisallow: /private\n"),
    resolveHostname: resolvePublicHostname
  });
  const unavailablePolicy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    fetchRobots: async () => ({ ok: false, status: 404, text: async () => "" }),
    resolveHostname: resolvePublicHostname
  });

  assert.equal((await denyPolicy.prepare("https://docs.example.com/private/audit")).action, "deny");
  assert.ok((await unavailablePolicy.prepare("https://docs.example.com/guide")).signals.includes("robots_unavailable"));
});

test("source acquisition follows safe robots redirects and applies rules to the original origin", async () => {
  const requestedUrls: string[] = [];
  let redirectBodyCanceled = false;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async (url, init) => {
      requestedUrls.push(url);
      assert.equal(init.redirect, "manual");
      if (url === "https://docs.example.com/robots.txt") {
        return {
          ok: false,
          status: 302,
          headers: { get: () => "https://policy.example.net/robots.txt" },
          body: new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array([1])); },
            cancel() { redirectBodyCanceled = true; }
          }),
          text: async () => ""
        };
      }
      return robotsResponse("User-agent: *\nDisallow: /private\n");
    }
  });

  const decision = await policy.prepare("https://docs.example.com/private/report");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("robots_disallow"));
  assert.equal(redirectBodyCanceled, true);
  assert.deepEqual(requestedUrls, [
    "https://docs.example.com/robots.txt",
    "https://policy.example.net/robots.txt"
  ]);
});

test("robots redirect targets are rechecked before redirected fetches", async () => {
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => {
      robotsCalls += 1;
      return {
        ok: false,
        status: 302,
        headers: { get: () => "http://127.0.0.1/robots.txt" },
        text: async () => ""
      };
    }
  });

  const decision = await policy.prepare("https://docs.example.com/guide");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("robots_redirect_target_denied"));
  assert.ok(decision.signals.includes("private_network"));
  assert.equal(robotsCalls, 1);
});

test("robots redirect chains stop after five follow-ups", async () => {
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async (url) => {
      robotsCalls += 1;
      return { ok: false, status: 302, headers: { get: () => url }, text: async () => "" };
    }
  });

  const decision = await policy.prepare("https://docs.example.com/guide");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("robots_redirect_limit"));
  assert.equal(robotsCalls, 6);
});

test("robots server errors, access denial, and network failures deny source acquisition", async () => {
  const failedResponses = [
    { ok: false, status: 503, signal: "robots_unreachable" },
    { ok: false, status: 403, signal: "robots_access_denied" },
    { ok: false, status: 429, signal: "robots_rate_limited" }
  ];
  for (const { ok, status, signal } of failedResponses) {
    let bodyCanceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1])); },
      cancel() { bodyCanceled = true; }
    });
    const policy = new SourceAcquisitionPolicy({
      minDomainDelayMs: 0,
      resolveHostname: resolvePublicHostname,
      fetchRobots: async () => ({ ok, status, body, text: async () => "" })
    });
    const decision = await policy.prepare("https://docs.example.com/guide");
    assert.equal(decision.action, "deny", String(status));
    assert.ok(decision.signals.includes(signal), String(status));
    assert.equal(bodyCanceled, true, String(status));
  }

  const offlinePolicy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => { throw new Error("network unavailable"); }
  });
  const offlineDecision = await offlinePolicy.prepare("https://docs.example.com/guide");
  assert.equal(offlineDecision.action, "deny");
  assert.ok(offlineDecision.signals.includes("robots_unreachable"));
});

test("robots response parsing stops at 512 KiB and cancels the remaining body", async () => {
  const bytes = Buffer.alloc(512 * 1024 + 1, 0x20);
  bytes.write("User-agent: *\nDisallow: /private\n", 0, "utf8");
  let canceled = false;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) { controller.enqueue(bytes); },
        cancel() { canceled = true; }
      }),
      text: async () => { throw new Error("stream body should be used"); }
    })
  });

  const decision = await policy.prepare("https://docs.example.com/private/report");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("robots_disallow"));
  assert.equal(canceled, true);
});

test("robots response without a stream fails closed without buffering text", async () => {
  let textRead = false;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: resolvePublicHostname,
    fetchRobots: async () => ({
      ok: true,
      status: 200,
      text: async () => {
        textRead = true;
        return "User-agent: *\nAllow: /\n";
      }
    })
  });

  const decision = await policy.prepare("https://docs.example.com/guide");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("robots_unreachable"));
  assert.equal(textRead, false);
});

test("source acquisition enforces a per-domain budget and leaves sensitive domains for human review", async () => {
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    maxRequestsPerDomain: 2,
    reviewDomains: ["sensitive.example.com"],
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n");
    },
    resolveHostname: resolvePublicHostname
  });

  const first = await policy.prepare("https://docs.example.com/one");
  const second = await policy.prepare("https://docs.example.com/two");
  const exhausted = await policy.prepare("https://docs.example.com/three");
  const sensitive = await policy.prepare("https://sensitive.example.com/brief");
  const sensitiveWithRootDot = await policy.prepare("https://sensitive.example.com./brief");

  assert.equal(first.action, "allow");
  assert.equal(second.domainRequestCount, 2);
  assert.ok(second.signals.includes("domain_request_budget_low"));
  assert.equal(exhausted.action, "deny");
  assert.match(exhausted.reason, /domain request budget of 2 reached/i);
  assert.ok(exhausted.signals.includes("human_review_required"));
  assert.equal(sensitive.action, "deny");
  assert.ok(sensitive.signals.includes("review_domain"));
  assert.equal(sensitiveWithRootDot.action, "deny");
  assert.ok(sensitiveWithRootDot.signals.includes("review_domain"));
  assert.equal(robotsCalls, 1);
});

test("source acquisition denies DNS answers that point at private networks before robots or browser access", async () => {
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: async () => [{ address: "10.0.0.7", family: 4 }],
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n");
    }
  });

  const decision = await policy.prepare("https://public-looking.example/research");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("resolved_private_network"));
  assert.ok(decision.signals.includes("human_review_required"));
  assert.equal(robotsCalls, 0);
});

test("network target checks reject private redirect destinations without robots fetches or delays", async () => {
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 60_000,
    resolveHostname: async () => [{ address: "10.0.0.7", family: 4 }],
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n");
    }
  });

  const decision = await policy.checkNetworkTarget("https://redirect.example.com/private");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("resolved_private_network"));
  assert.equal(decision.waitedMs, 0);
  assert.equal(robotsCalls, 0);
});

test("source acquisition resolves the exact requested hostname before browser navigation", async () => {
  let resolvedHostname = "";
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: async (hostname) => {
      resolvedHostname = hostname;
      return hostname === "www.public-looking.example"
        ? [{ address: "10.0.0.7", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }];
    },
    fetchRobots: async () => {
      robotsCalls += 1;
      return robotsResponse("User-agent: *\nAllow: /\n");
    }
  });

  const decision = await policy.prepare("https://www.public-looking.example/research");

  assert.equal(resolvedHostname, "www.public-looking.example");
  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("resolved_private_network"));
  assert.equal(robotsCalls, 0);
});

test("default robots fetch connects to the validated IP and keeps the source hostname", async (context) => {
  const validatedAddresses = [
    { address: "93.184.216.34", family: 4 },
    { address: "151.101.1.69", family: 4 }
  ];
  let hostnameResolutions = 0;
  let requestedUrl: URL | undefined;
  let requestOptions: RequestOptions | undefined;
  let responseEncoding: string | undefined;
  context.mock.method(require("node:https"), "request", ((input: string | URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    requestedUrl = input instanceof URL ? input : new URL(input);
    requestOptions = options;
    const request = new EventEmitter() as unknown as ClientRequest;
    request.end = (() => {
      const responseStream = new PassThrough();
      Object.defineProperties(responseStream, {
        statusCode: { value: 200 },
        headers: { value: { "content-type": "text/plain", ...(responseEncoding ? { "content-encoding": responseEncoding } : {}) } }
      });
      callback(responseStream as unknown as IncomingMessage);
      responseStream.end("User-agent: *\nAllow: /\n");
      return request;
    }) as ClientRequest["end"];
    return request;
  }) as unknown as typeof import("node:https")["request"]);

  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: async () => {
      const address = validatedAddresses[Math.min(hostnameResolutions, validatedAddresses.length - 1)]!;
      hostnameResolutions += 1;
      return [address];
    }
  });
  const decision = await policy.prepare("https://docs.example.com/guide");

  assert.equal(decision.action, "allow");
  assert.equal(hostnameResolutions, 2);
  assert.equal(requestedUrl?.hostname, "docs.example.com");
  assert.equal(requestOptions?.agent, false);
  assert.equal(new Headers(requestOptions?.headers as HeadersInit).get("accept-encoding"), "identity");
  assert.ok(requestOptions?.lookup);
  const connectedAddress = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    const lookup = requestOptions!.lookup as unknown as (
      hostname: string,
      options: { family: number; all?: false },
      callback: (error: NodeJS.ErrnoException | null, address: string, family?: number) => void
    ) => void;
    lookup("docs.example.com", { family: 0, all: false }, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family: family ?? 0 });
    });
  });
  assert.deepEqual(connectedAddress, validatedAddresses[1]);

  responseEncoding = "gzip";
  const encodedDecision = await new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: async () => [validatedAddresses[1]!]
  }).prepare("https://docs.example.com/guide");
  assert.equal(encodedDecision.action, "deny");
  assert.ok(encodedDecision.signals.includes("robots_unreachable"));
});

test("source acquisition fails closed when hostname resolution is unavailable", async () => {
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: async () => {
      throw new Error("DNS unavailable");
    }
  });

  const decision = await policy.prepare("https://docs.example.com/research");

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("hostname_resolution_failed"));
});

test("source acquisition denies hostname lookups that exceed their deadline", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    resolveHostname: () => new Promise(() => {})
  });

  const pending = policy.checkNetworkTarget("https://docs.example.com/research");
  context.mock.timers.tick(5_000);
  const decision = await pending;

  assert.equal(decision.action, "deny");
  assert.ok(decision.signals.includes("hostname_resolution_failed"));
});
