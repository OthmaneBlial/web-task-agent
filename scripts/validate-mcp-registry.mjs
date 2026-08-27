import assert from "node:assert/strict";
import fs from "node:fs";

const expectedSchema = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const server = JSON.parse(fs.readFileSync("server.json", "utf8"));

assert.equal(server.$schema, expectedSchema, "server.json must pin the reviewed official MCP schema");
assert.equal(packageJson.mcpName, server.name, "package.json mcpName must match server.json name");
assert.match(server.name, /^io\.github\.othmaneblial\/[a-z0-9-]+$/);
assert.equal(server.version, packageJson.version, "MCP metadata and npm package versions must match");
assert.equal(server.packages.length, 1, "the registry entry must expose exactly one package");

const publishedPackage = server.packages[0];
assert.equal(publishedPackage.registryType, "npm");
assert.equal(publishedPackage.identifier, packageJson.name);
assert.equal(publishedPackage.version, packageJson.version);
assert.deepEqual(publishedPackage.transport, { type: "stdio" });
assert.deepEqual(publishedPackage.packageArguments, [
  { type: "positional", value: "mcp" },
  { type: "positional", value: "serve" }
]);
assert.equal("environmentVariables" in publishedPackage, false, "the public entry must not require secrets or environment setup");
assert.equal("remotes" in server, false, "the local-only server must not advertise remote transports");
assert.ok(packageJson.files.includes("server.json"), "server.json must ship in the npm tarball");
assert.equal(packageJson.bin[packageJson.name], "dist/entrypoint.js", "the package identifier must resolve to the lightweight entrypoint that handles mcp serve");

console.log("MCP registry metadata is internally consistent, local-only, and version-aligned.");
