import { build } from "esbuild";
import path from "node:path";

const root = process.cwd();
await build({
  entryPoints: [path.join(root, "web-verifier", "src", "index.ts")],
  outfile: path.join(root, "docs", "assets", "decision-receipt-verifier.js"),
  bundle: true,
  format: "iife",
  globalName: "DecisionReceiptVerifier",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  sourcemap: false,
  banner: { js: "/* Decision Receipt local verifier: bundled from the dependency-free protocol core and fflate. */" }
});

console.log("Built local Decision Receipt browser verifier.");
