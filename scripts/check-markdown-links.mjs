import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const markdownFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(path.join(directory, entry.name));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(path.join(directory, entry.name));
    }
  }
}

function pathExists(linkPath) {
  if (fs.existsSync(linkPath)) {
    return true;
  }
  return fs.existsSync(`${linkPath}.md`) || fs.existsSync(path.join(linkPath, "README.md"));
}

walk(root);

const errors = [];
for (const markdownPath of markdownFiles) {
  // These pages are repository snapshots rendered by the static docs app.
  // Their links intentionally preserve repository-root semantics, so checking
  // them relative to docs/content would report false positives.
  if (/(?:docs|site)\/content\/(?:repo-readme|repo-roadmap|example-[a-z-]+)\.md$/.test(markdownPath)) {
    continue;
  }
  const content = fs.readFileSync(markdownPath, "utf8");
  const links = content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);

  for (const match of links) {
    const rawTarget = match[1] ?? "";
    const target = rawTarget.replace(/^<|>$/g, "");
    if (!target || target.startsWith("#") || /^(?:https?:|mailto:|tel:|data:)/i.test(target)) {
      continue;
    }

    const pathname = target.split(/[?#]/, 1)[0];
    if (!pathname || pathname.startsWith("/")) {
      continue;
    }
    const resolved = path.resolve(path.dirname(markdownPath), pathname);
    if (!pathExists(resolved)) {
      errors.push(`${path.relative(root, markdownPath)} -> ${rawTarget}`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Broken local Markdown link(s):\n${errors.sort().map((error) => `- ${error}`).join("\n")}`);
}

console.log(`Validated local Markdown links in ${markdownFiles.length} file(s).`);
