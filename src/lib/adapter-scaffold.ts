import fs from "node:fs";
import path from "node:path";

import { ensureDir } from "./cache";

function adapterSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("adapter id must contain a letter or number");
  return slug;
}

export interface AdapterScaffoldPaths {
  outputDir: string;
  adapterPath: string;
  fixturePath: string;
  readmePath: string;
}

export function createAdapterScaffold(input: {
  id: string;
  engine: string;
  engineVersion: string;
  outputDir: string;
  force?: boolean;
}): AdapterScaffoldPaths {
  const id = adapterSlug(input.id);
  const engine = input.engine.trim();
  const engineVersion = input.engineVersion.trim();
  if (!engine || !engineVersion) throw new Error("engine and engineVersion are required");
  const outputDir = path.resolve(input.outputDir);
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0 && !input.force) {
    throw new Error(`refusing to overwrite non-empty adapter directory: ${outputDir}`);
  }
  ensureDir(outputDir);
  const adapterPath = path.join(outputDir, "adapter.mjs");
  const fixturePath = path.join(outputDir, "fixture.raw.json");
  const readmePath = path.join(outputDir, "README.md");
  const adapterSource = `import fs from "node:fs";
import { pathToFileURL } from "node:url";

const required = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(\`${"${label}"} is required\`);
  return value.trim();
};

export function adapt(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("raw result must be an object");
  if (!Array.isArray(raw.sources) || !Array.isArray(raw.claims)) throw new Error("raw sources and claims are required arrays");
  return {
    adapterContractVersion: "1.0.0",
    producer: {
      adapterId: ${JSON.stringify(id)},
      adapterVersion: "0.1.0",
      engine: ${JSON.stringify(engine)},
      engineVersion: ${JSON.stringify(engineVersion)},
      runId: typeof raw.runId === "string" && raw.runId.trim() ? raw.runId.trim() : null,
      exportedAt: required(raw.exportedAt, "exportedAt"),
      fixture: raw.fixture === true
    },
    decision: {
      title: required(raw.title, "title"),
      summary: required(raw.summary, "summary"),
      nextValidation: required(raw.nextValidation, "nextValidation"),
      origin: { kind: "imported", note: null }
    },
    sources: raw.sources.map((source, index) => ({
      id: required(source.id, \`sources[\${index}].id\`),
      title: required(source.title, \`sources[\${index}].title\`),
      url: required(source.url, \`sources[\${index}].url\`),
      publisher: required(source.publisher, \`sources[\${index}].publisher\`),
      role: required(source.role, \`sources[\${index}].role\`),
      collectedAt: source.collectedAt ?? null,
      excerpt: required(source.excerpt, \`sources[\${index}].excerpt\`),
      origin: { kind: "captured", note: null }
    })),
    claims: raw.claims.map((claim, index) => ({
      id: required(claim.id, \`claims[\${index}].id\`),
      text: required(claim.text, \`claims[\${index}].text\`),
      status: claim.status,
      ...(claim.limitation ? { limitation: required(claim.limitation, \`claims[\${index}].limitation\`) } : {}),
      origin: { kind: "imported", note: null },
      evidence: Array.isArray(claim.evidence) ? claim.evidence.map((evidence, evidenceIndex) => ({
        id: required(evidence.id, \`claims[\${index}].evidence[\${evidenceIndex}].id\`),
        sourceId: required(evidence.sourceId, \`claims[\${index}].evidence[\${evidenceIndex}].sourceId\`),
        excerpt: required(evidence.excerpt, \`claims[\${index}].evidence[\${evidenceIndex}].excerpt\`),
        relation: evidence.relation,
        origin: { kind: "captured", note: null }
      })) : []
    })),
    contradictions: Array.isArray(raw.contradictions) ? raw.contradictions : [],
    limitations: Array.isArray(raw.limitations) ? raw.limitations : [],
    policyVersion: typeof raw.policyVersion === "string" ? raw.policyVersion : null,
    model: typeof raw.model === "string" ? raw.model : null
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("usage: node adapter.mjs <raw-result.json>");
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  process.stdout.write(\`${"${JSON.stringify(adapt(raw), null, 2)}"}\\n\`);
}
`;
  const fixture = {
    runId: "replace-with-engine-run-id",
    exportedAt: "2026-01-01T00:00:00.000Z",
    fixture: true,
    title: "Adapter contract fixture",
    summary: "Replace this synthetic input with a redistributable provider result.",
    nextValidation: "Run the shared adapter validator and inspect every origin label.",
    sources: [{
      id: "source-1",
      title: "Synthetic source",
      url: "https://example.com/source",
      publisher: "Example",
      role: "adapter contract fixture",
      collectedAt: "2026-01-01T00:00:00.000Z",
      excerpt: "Synthetic evidence for contract testing."
    }],
    claims: [{
      id: "claim-1",
      text: "The adapter emits explicit provenance labels.",
      status: "supported",
      evidence: [{ id: "evidence-1", sourceId: "source-1", excerpt: "Synthetic evidence for contract testing.", relation: "supports" }]
    }],
    contradictions: [],
    limitations: ["This generated fixture is synthetic and proves only adapter-contract wiring."],
    policyVersion: null,
    model: null
  };
  const readme = `# ${id} adapter scaffold

1. Implement only explicit mappings in \`adapter.mjs\`; never fill provider gaps silently.
2. Label copied bytes as \`captured\`, mapped semantics as \`imported\`, derivations as \`inferred\`, and human assertions as \`operator-attested\`.
3. Give every inferred or operator-attested value a note.
4. Never accept cookies, sessions, credentials, authenticated URLs, provider prompts, executable instructions, or tool calls.
5. Validate output with \`web-task-agent receipt adapter validate output.json\`, then import it and verify the resulting receipt.

The generated raw fixture is synthetic. Replace it only with redistributable evidence and document the engine version, command, limitations, and consent boundary.
`;
  fs.writeFileSync(adapterPath, adapterSource, "utf8");
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  fs.writeFileSync(readmePath, readme, "utf8");
  return { outputDir, adapterPath, fixturePath, readmePath };
}
