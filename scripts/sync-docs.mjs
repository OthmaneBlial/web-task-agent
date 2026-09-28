import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "docs");
const targetRoot = path.join(root, "site");
const checkOnly = process.argv.includes("--check");
const repositorySnapshots = [
  { source: path.join(root, "README.md"), target: path.join(sourceRoot, "content", "repo-readme.md") },
  { source: path.join(root, "ROADMAP.md"), target: path.join(sourceRoot, "content", "repo-roadmap.md") }
];

function walk(rootPath) {
  const files = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Canonical docs directory is missing: ${sourceRoot}`);
}

const differences = [];

for (const snapshot of repositorySnapshots) {
  const sourceContent = fs.readFileSync(snapshot.source);
  const targetContent = fs.existsSync(snapshot.target) ? fs.readFileSync(snapshot.target) : null;
  if (targetContent && sourceContent.equals(targetContent)) {
    continue;
  }

  differences.push(path.relative(root, snapshot.target));
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(snapshot.target), { recursive: true });
    fs.copyFileSync(snapshot.source, snapshot.target);
  }
}

const sourceFiles = walk(sourceRoot);

for (const sourcePath of sourceFiles) {
  const relativePath = path.relative(sourceRoot, sourcePath);
  const targetPath = path.join(targetRoot, relativePath);
  const sourceContent = fs.readFileSync(sourcePath);
  const targetContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;

  if (targetContent && sourceContent.equals(targetContent)) {
    continue;
  }

  differences.push(relativePath);
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

if (checkOnly && differences.length > 0) {
  throw new Error(
    `site/ documentation copies differ from docs/. Run npm run generate:docs. Drifted files:\n${differences
      .sort()
      .map((filePath) => `- ${filePath}`)
      .join("\n")}`
  );
}

console.log(
  differences.length === 0
    ? "Documentation copies are up to date; site-only files were preserved."
    : `Synchronized ${differences.length} documentation file(s) from docs/ to site/; site-only files were preserved.`
);
