import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRobotsText, SourceAcquisitionPolicy } from "../lib/source-acquisition-policy";

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
      return { ok: true, status: 200, text: async () => "User-agent: *\nAllow: /\n" };
    }
  });

  const first = await policy.prepare("https://docs.example.com/one");
  const second = await policy.prepare("https://docs.example.com/two");

  assert.equal(first.action, "allow");
  assert.equal(second.action, "allow");
  assert.equal(robotsCalls, 1);
  assert.deepEqual(waits, [500]);
  assert.ok(second.signals.includes("domain_rate_limited"));
});

test("source acquisition denies known robots exclusions and records unavailable robots", async () => {
  const denyPolicy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    fetchRobots: async () => ({ ok: true, status: 200, text: async () => "User-agent: *\nDisallow: /private\n" })
  });
  const unavailablePolicy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    fetchRobots: async () => ({ ok: false, status: 503, text: async () => "" })
  });

  assert.equal((await denyPolicy.prepare("https://docs.example.com/private/audit")).action, "deny");
  assert.ok((await unavailablePolicy.prepare("https://docs.example.com/guide")).signals.includes("robots_unavailable"));
});

test("source acquisition enforces a per-domain budget and leaves sensitive domains for human review", async () => {
  let robotsCalls = 0;
  const policy = new SourceAcquisitionPolicy({
    minDomainDelayMs: 0,
    maxRequestsPerDomain: 2,
    reviewDomains: ["sensitive.example.com"],
    fetchRobots: async () => {
      robotsCalls += 1;
      return { ok: true, status: 200, text: async () => "User-agent: *\nAllow: /\n" };
    }
  });

  const first = await policy.prepare("https://docs.example.com/one");
  const second = await policy.prepare("https://docs.example.com/two");
  const exhausted = await policy.prepare("https://docs.example.com/three");
  const sensitive = await policy.prepare("https://sensitive.example.com/brief");

  assert.equal(first.action, "allow");
  assert.equal(second.domainRequestCount, 2);
  assert.ok(second.signals.includes("domain_request_budget_low"));
  assert.equal(exhausted.action, "deny");
  assert.match(exhausted.reason, /domain request budget of 2 reached/i);
  assert.ok(exhausted.signals.includes("human_review_required"));
  assert.equal(sensitive.action, "deny");
  assert.ok(sensitive.signals.includes("review_domain"));
  assert.equal(robotsCalls, 1);
});
