import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const studyRoot = path.join(root, "studies", "reviewer-value");
const generatedAt = "2026-08-27T10:30:00.000Z";
const core = await import(path.join(root, "packages", "decision-receipt", "dist", "index.js"));

const cases = [
  {
    id: "case-a",
    title: "Release build-cache decision",
    question: "Should release CI adopt a shared build cache now?",
    summary: "Adopt only an architecture-scoped cache and keep the speed claim insufficient until measured.",
    nextValidation: "Measure 20 release builds per runner architecture and compare median duration plus cache-related failures.",
    sources: [
      {
        id: "cache-policy",
        title: "Synthetic build-cache policy",
        url: "https://example.com/studies/build-cache-policy",
        collectedAt: "2026-08-20T09:00:00.000Z",
        excerpt: "Cache keys include the dependency lockfile and runner architecture before a release artifact can be restored."
      },
      {
        id: "cache-incident",
        title: "Synthetic cache incident note",
        url: "https://example.com/studies/build-cache-incident",
        collectedAt: "2024-01-15T09:00:00.000Z",
        excerpt: "A stale cache restored incompatible native binaries after the runner architecture changed."
      }
    ],
    claims: [
      {
        id: "architecture-scoped-keys",
        text: "The documented key can scope cache restoration by lockfile and runner architecture.",
        status: "supported",
        evidence: [{ id: "evidence-cache-policy", sourceId: "cache-policy", relation: "supports" }]
      },
      {
        id: "cross-architecture-safety",
        text: "Cached native binaries are safe to restore across runner architectures.",
        status: "contradicted",
        evidence: [{ id: "evidence-cache-incident", sourceId: "cache-incident", relation: "contradicts" }]
      },
      {
        id: "thirty-percent-faster",
        text: "The cache will reduce median release duration by at least 30 percent.",
        status: "insufficient",
        limitation: "Neither synthetic source contains measured release-duration data.",
        evidence: [{ id: "evidence-cache-context", sourceId: "cache-policy", relation: "context" }]
      }
    ],
    contradictions: [{
      id: "contradiction-cache-architecture",
      topic: "cross-architecture native-cache safety",
      evidenceIds: ["evidence-cache-incident"],
      note: "The incident note directly contradicts cross-architecture restore safety."
    }],
    staleSourceId: "cache-incident",
    tamperedPath: "evidence/cache-policy.md",
    tamperedLine: "Tampered after export: architecture was removed from the cache key."
  },
  {
    id: "case-b",
    title: "Automated dependency-update decision",
    question: "Should the repository enable automatic dependency updates now?",
    summary: "Enable grouped patch updates, block automatic majors, and measure patch latency before claiming improvement.",
    nextValidation: "Run grouped patch-only updates for four weeks and record merge latency, rollback count, and maintainer time.",
    sources: [
      {
        id: "update-policy",
        title: "Synthetic dependency-update policy",
        url: "https://example.com/studies/dependency-update-policy",
        collectedAt: "2026-08-19T10:00:00.000Z",
        excerpt: "Patch updates can be grouped weekly while major versions remain blocked for manual compatibility review."
      },
      {
        id: "upgrade-incident",
        title: "Synthetic major-upgrade incident note",
        url: "https://example.com/studies/dependency-upgrade-incident",
        collectedAt: "2024-02-10T10:00:00.000Z",
        excerpt: "An automated major upgrade broke the plugin API and required a rollback before the next release."
      }
    ],
    claims: [
      {
        id: "grouped-patch-updates",
        text: "The policy can group patch updates while reserving majors for manual review.",
        status: "supported",
        evidence: [{ id: "evidence-update-policy", sourceId: "update-policy", relation: "supports" }]
      },
      {
        id: "automatic-majors-safe",
        text: "Major dependency updates are safe to merge automatically without compatibility review.",
        status: "contradicted",
        evidence: [{ id: "evidence-upgrade-incident", sourceId: "upgrade-incident", relation: "contradicts" }]
      },
      {
        id: "patch-latency-halved",
        text: "Automation will cut median patch-update latency in half.",
        status: "insufficient",
        limitation: "Neither synthetic source contains before-and-after merge-latency measurements.",
        evidence: [{ id: "evidence-update-context", sourceId: "update-policy", relation: "context" }]
      }
    ],
    contradictions: [{
      id: "contradiction-major-upgrade",
      topic: "automatic major-version safety",
      evidenceIds: ["evidence-upgrade-incident"],
      note: "The incident note directly contradicts unattended major-version safety."
    }],
    staleSourceId: "upgrade-incident",
    tamperedPath: "evidence/update-policy.md",
    tamperedLine: "Tampered after export: major versions may now merge automatically."
  }
];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function write(relativePath, content) {
  const target = path.join(studyRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function manifest(files) {
  return {
    schemaVersion: 1,
    specVersion: "1.0.0",
    type: "receipt-integrity-manifest",
    algorithm: "sha256",
    receiptPath: "receipt.json",
    generatedAt,
    files: Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([filePath, content]) => ({
      path: filePath,
      sha256: hash(content),
      bytes: Buffer.byteLength(content)
    }))
  };
}

function receiptFor(studyCase, snapshots) {
  const sourceById = new Map(studyCase.sources.map((source) => [source.id, source]));
  return {
    schemaVersion: 1,
    specVersion: "1.0.0",
    profile: "minimal",
    type: "decision-receipt",
    generatedAt,
    provenance: {
      kind: "captured",
      runId: `reviewer-study-${studyCase.id}`,
      cliVersion: null,
      workflowId: "reviewer-value-study-v1",
      policyVersion: "synthetic-public-fixture-v1",
      promptVersion: null,
      model: null,
      fixture: true
    },
    decision: { title: studyCase.question, summary: studyCase.summary },
    claims: studyCase.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: claim.status,
      evidence: claim.evidence.map((evidence) => ({
        ...evidence,
        excerpt: sourceById.get(evidence.sourceId).excerpt
      })),
      ...(claim.limitation ? { limitation: claim.limitation } : {})
    })),
    sources: studyCase.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: "Web Task Agent synthetic study fixture",
      role: "synthetic reviewer-value study evidence",
      collectedAt: source.collectedAt,
      captureType: "fixture-synthetic",
      snapshotPath: `evidence/${source.id}.md`,
      snapshotSha256: hash(snapshots[`evidence/${source.id}.md`])
    })),
    contradictions: studyCase.contradictions,
    nextValidation: studyCase.nextValidation,
    limitations: [
      "All sources and scenarios are synthetic study fixtures; they do not establish facts about a real CI or dependency workflow.",
      `Source ${studyCase.staleSourceId} is intentionally stale so freshness detection can be measured.`,
      "Integrity verification proves exported bytes and references, not source truth, decision quality, authorization, or freshness."
    ],
    integrity: {
      algorithm: "sha256",
      manifestPath: "integrity-manifest.json",
      note: "Integrity proves bytes, not truth."
    }
  };
}

function markdownReport(studyCase) {
  const claimRows = studyCase.claims.map((claim) => {
    const evidence = claim.evidence.map((item) => `${item.id} → ${item.sourceId} (${item.relation})`).join(", ");
    return `| ${claim.id} | ${claim.status} | ${evidence} | ${claim.limitation ?? "—"} |`;
  });
  const sourceBlocks = studyCase.sources.flatMap((source) => [
    `### ${source.id} — ${source.title}`,
    "",
    `- URL: ${source.url}`,
    `- Collected: ${source.collectedAt}`,
    `- Excerpt: “${source.excerpt}”`,
    ""
  ]);
  return [
    `# ${studyCase.title}`,
    "",
    `**Question:** ${studyCase.question}`,
    "",
    `**Decision:** ${studyCase.summary}`,
    "",
    "## Claims",
    "",
    "| Claim ID | Status | Evidence link | Limitation |",
    "| --- | --- | --- | --- |",
    ...claimRows,
    "",
    "## Sources",
    "",
    ...sourceBlocks,
    "## Strongest contradiction",
    "",
    studyCase.contradictions[0].note,
    "",
    "## Limitations",
    "",
    "- All sources and scenarios are synthetic study fixtures.",
    `- Source ${studyCase.staleSourceId} is intentionally stale.`,
    "- A Markdown report has no integrity manifest, so unchanged bytes cannot be established from this file alone.",
    "",
    "## Smallest next validation",
    "",
    studyCase.nextValidation,
    ""
  ].join("\n");
}

function bundleFiles(studyCase) {
  const snapshots = Object.fromEntries(studyCase.sources.map((source) => [
    `evidence/${source.id}.md`,
    `# ${source.title}\n\n${source.excerpt}\n`
  ]));
  const receipt = receiptFor(studyCase, snapshots);
  const validation = core.validateDecisionReceipt(receipt);
  if (!validation.valid) throw new Error(`${studyCase.id} receipt invalid: ${validation.errors.join("; ")}`);
  const receiptJson = json(receipt);
  const coveredFiles = { "receipt.json": receiptJson, ...snapshots };
  return {
    valid: { ...coveredFiles, "integrity-manifest.json": json(manifest(coveredFiles)) },
    tamperedPath: studyCase.tamperedPath,
    tamperedLine: studyCase.tamperedLine
  };
}

function asBundle(files) {
  return Object.fromEntries(Object.entries(files).map(([filePath, content]) => [filePath, Buffer.from(content)]));
}

for (const studyCase of cases) {
  const caseRoot = path.join(studyRoot, "materials", studyCase.id);
  fs.rmSync(caseRoot, { recursive: true, force: true });
  write(`materials/${studyCase.id}/report.md`, markdownReport(studyCase));
  const bundle = bundleFiles(studyCase);
  for (const [filePath, content] of Object.entries(bundle.valid)) {
    write(`materials/${studyCase.id}/receipt/${filePath}`, content);
    const tamperedContent = filePath === bundle.tamperedPath ? `${content}${bundle.tamperedLine}\n` : content;
    write(`materials/${studyCase.id}/tampered-receipt/${filePath}`, tamperedContent);
  }
  const validResult = await core.verifyReceiptBundle(asBundle(bundle.valid));
  if (!validResult.valid) throw new Error(`${studyCase.id} valid bundle failed: ${validResult.errors.join("; ")}`);
  const tampered = { ...bundle.valid, [bundle.tamperedPath]: `${bundle.valid[bundle.tamperedPath]}${bundle.tamperedLine}\n` };
  const tamperedResult = await core.verifyReceiptBundle(asBundle(tampered));
  if (tamperedResult.valid || !tamperedResult.issues.some((issue) => issue.code === "integrity_hash_mismatch" && issue.message.includes(bundle.tamperedPath))) {
    throw new Error(`${studyCase.id} controlled tamper was not identified at ${bundle.tamperedPath}`);
  }
}

const assignments = {
  studyVersion: "1.0.0",
  taskOrder: ["supportingEvidenceId", "contradictedClaimId", "staleSourceId", "tamperResult"],
  groups: {
    AB: [
      { caseId: "case-a", condition: "markdown-only" },
      { caseId: "case-b", condition: "receipt" }
    ],
    BA: [
      { caseId: "case-a", condition: "receipt" },
      { caseId: "case-b", condition: "markdown-only" }
    ]
  }
};

const answers = {
  studyVersion: "1.0.0",
  cases: Object.fromEntries(cases.map((studyCase) => {
    const supported = studyCase.claims.find((claim) => claim.status === "supported");
    const contradicted = studyCase.claims.find((claim) => claim.status === "contradicted");
    return [studyCase.id, {
      supportingEvidenceId: supported.evidence[0].id,
      contradictedClaimId: contradicted.id,
      staleSourceId: studyCase.staleSourceId,
      tamperResult: {
        "markdown-only": "not-determinable",
        receipt: studyCase.tamperedPath
      }
    }];
  }))
};

write("assignments.json", json(assignments));
write("answer-key.json", json(answers));
console.log(`Generated and verified ${cases.length} counterbalanced reviewer-study cases.`);
