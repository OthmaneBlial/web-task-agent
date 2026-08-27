#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const workflowPath = path.join(root, ".github", "workflows", "publish-npm.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const corePackage = JSON.parse(
  fs.readFileSync(path.join(root, "packages", "decision-receipt", "package.json"), "utf8")
);
const server = JSON.parse(fs.readFileSync(path.join(root, "server.json"), "utf8"));
const checks = [];

function check(id, condition, detail) {
  if (!condition) throw new Error(`npm publication preflight failed [${id}]: ${detail}`);
  checks.push({ id, passed: true });
}

function matches(pattern) {
  return pattern.test(workflow);
}

const packagePlans = [
  {
    id: "cli",
    manifestPath: "package.json",
    name: rootPackage.name,
    version: rootPackage.version,
    tag: `v${rootPackage.version}`,
    publishConfig: rootPackage.publishConfig,
    repository: rootPackage.repository?.url
  },
  {
    id: "core",
    manifestPath: "packages/decision-receipt/package.json",
    name: corePackage.name,
    version: corePackage.version,
    tag: `decision-receipt-v${corePackage.version}`,
    publishConfig: corePackage.publishConfig,
    repository: corePackage.repository?.url
  }
];

for (const packagePlan of packagePlans) {
  check(`${packagePlan.id}-name`, typeof packagePlan.name === "string" && packagePlan.name.length > 0, "package name is missing");
  check(`${packagePlan.id}-version`, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packagePlan.version), "version is not tag-safe semver");
  check(`${packagePlan.id}-public`, packagePlan.publishConfig?.access === "public", "publishConfig.access must be public");
  check(
    `${packagePlan.id}-registry`,
    packagePlan.publishConfig?.registry === "https://registry.npmjs.org",
    "publishConfig.registry must be the public npm registry"
  );
  check(
    `${packagePlan.id}-repository`,
    packagePlan.repository === "git+https://github.com/OthmaneBlial/web-task-agent.git",
    "repository identity must be case-exact"
  );
}

check("tag-cli", matches(/- ["']v\*\.\*\.\*["']/), "root package tag trigger is missing");
check("tag-core", matches(/- ["']decision-receipt-v\*\.\*\.\*["']/), "core package tag trigger is missing");
check("github-hosted", matches(/runs-on:\s*ubuntu-latest/), "Trusted Publishing must use a GitHub-hosted runner");
check("node-24", matches(/node-version:\s*24/), "the workflow must use the supported Node 24 runtime");
check("registry-url", matches(/registry-url:\s*https:\/\/registry\.npmjs\.org/), "setup-node must target the public npm registry");
check("oidc", matches(/permissions:\s*\n\s+contents:\s*read\s*\n\s+id-token:\s*write/), "id-token: write is required");
check("npm-cli", matches(/npm install --global npm@11/), "the runner must select npm 11");
check("npm-minimum", matches(/major < 11 \|\| \(major === 11 && minor < 5\)/), "npm 11.5.1+ guard is missing");
check("tokenless", !/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.[A-Za-z0-9_]*NPM/i.test(workflow), "long-lived npm credentials are forbidden");
check("public-publish", matches(/run:\s*npm publish --access public/), "public npm publish command is missing");
check(
  "tag-only-publish",
  matches(/name:\s*Publish through the configured npm trusted publisher\s*\n\s*if:\s*github\.event_name == 'push'/),
  "manual rehearsals must not publish"
);
check("tag-version-cli", workflow.includes('test "$RELEASE_TAG" = "v$(node -p "require(\'./package.json\').version")"'), "CLI tag/version equality is missing");
check(
  "tag-version-core",
  workflow.includes('test "$RELEASE_TAG" = "decision-receipt-v$(node -p "require(\'./packages/decision-receipt/package.json\').version")"'),
  "core tag/version equality is missing"
);

const registryWaitIndex = workflow.indexOf("Wait for the CLI version to become public on npm");
const mcpPublishIndex = workflow.indexOf("Publish official MCP registry metadata with GitHub OIDC");
check("registry-before-mcp", registryWaitIndex > 0 && mcpPublishIndex > registryWaitIndex, "MCP publication must wait for the public npm version");
check("mcp-oidc", workflow.includes('"$MCP_PUBLISHER_PATH" login github-oidc'), "MCP publication must use GitHub OIDC");

const rootServerPackage = server.packages?.find((item) => item.registryType === "npm");
check("mcp-package", rootServerPackage?.identifier === rootPackage.name, "server.json must reference the root npm package");
check("mcp-version", rootServerPackage?.version === rootPackage.version && server.version === rootPackage.version, "MCP metadata and root package versions must match");

async function probeRegistry(packagePlan) {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packagePlan.name)}/${encodeURIComponent(packagePlan.version)}`;
  try {
    const response = await fetch(registryUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404) return { state: "missing", httpStatus: 404 };
    if (!response.ok) return { state: "unavailable", httpStatus: response.status };
    const metadata = await response.json();
    return {
      state: metadata.name === packagePlan.name && metadata.version === packagePlan.version ? "public" : "mismatch",
      httpStatus: response.status
    };
  } catch {
    return { state: "unavailable", httpStatus: null };
  }
}

let registry = null;
if (args.has("--live") || args.has("--require-public")) {
  registry = Object.fromEntries(
    await Promise.all(packagePlans.map(async (packagePlan) => [packagePlan.name, await probeRegistry(packagePlan)]))
  );
}

const report = {
  schemaVersion: 1,
  status: "configuration-valid",
  workflow: ".github/workflows/publish-npm.yml",
  staticChecks: checks.length,
  packages: packagePlans.map(({ publishConfig, repository, ...packagePlan }) => packagePlan),
  registry,
  ownerGate: {
    status: "external-owner-action-required",
    boundary: "Each package must already exist on npm before Trusted Publishing can be configured.",
    sequence: [
      "Publish one reviewed bootstrap version manually with public access.",
      "Configure the exact GitHub trusted publisher for each package.",
      "Bump to a never-published version before creating the first OIDC tag."
    ]
  }
};

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`npm publication preflight: ${report.status} (${report.staticChecks} checks)`);
  for (const packagePlan of report.packages) {
    const liveState = report.registry ? `; registry=${report.registry[packagePlan.name].state}` : "";
    console.log(`- ${packagePlan.name}@${packagePlan.version} -> ${packagePlan.tag}${liveState}`);
  }
  console.log(`Owner gate: ${report.ownerGate.boundary}`);
  for (const [index, step] of report.ownerGate.sequence.entries()) console.log(`${index + 1}. ${step}`);
}

if (args.has("--require-public")) {
  const missing = packagePlans.filter((packagePlan) => registry?.[packagePlan.name]?.state !== "public");
  if (missing.length > 0) {
    console.error(`Public registry gate failed for: ${missing.map((packagePlan) => `${packagePlan.name}@${packagePlan.version}`).join(", ")}`);
    process.exitCode = 1;
  }
}
