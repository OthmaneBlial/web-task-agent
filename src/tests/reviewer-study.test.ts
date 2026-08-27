import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyReceiptDirectory } from "../lib/receipt";

const root = process.cwd();
const studyRoot = path.join(root, "studies", "reviewer-value");
const studyScript = path.join(root, "scripts", "reviewer-study.mjs");

test("reviewer study receipts verify and controlled tampering names the exact evidence path", () => {
  const cases = [
    { id: "case-a", tamperedPath: "evidence/cache-policy.md" },
    { id: "case-b", tamperedPath: "evidence/update-policy.md" }
  ];

  for (const studyCase of cases) {
    const materialRoot = path.join(studyRoot, "materials", studyCase.id);
    const valid = verifyReceiptDirectory(path.join(materialRoot, "receipt"));
    assert.equal(valid.valid, true, valid.errors.join("; "));
    assert.equal(valid.receipt?.provenance.fixture, true);

    const tampered = verifyReceiptDirectory(path.join(materialRoot, "tampered-receipt"));
    assert.equal(tampered.valid, false);
    assert.ok(
      tampered.errors.some((error) => error.includes(`integrity hash mismatch: ${studyCase.tamperedPath}`)),
      tampered.errors.join("; ")
    );
  }
});

test("reviewer study response validation and aggregation preserve denominators and fixture exclusions", () => {
  const examplePath = path.join(studyRoot, "fixtures", "example-response.json");
  const validation = JSON.parse(execFileSync(process.execPath, [studyScript, "validate", examplePath], {
    cwd: root,
    encoding: "utf8"
  })) as { valid: boolean; fixture: boolean; trials: number };
  assert.deepEqual(validation, { valid: true, fixture: true, participantId: "p-00000000", trials: 2 });

  const fixtureOnly = JSON.parse(execFileSync(process.execPath, [studyScript, "aggregate", path.dirname(examplePath)], {
    cwd: root,
    encoding: "utf8"
  })) as { corpus: { includedParticipants: number; excluded: { fixture: number } } };
  assert.equal(fixtureOnly.corpus.includedParticipants, 0);
  assert.equal(fixtureOnly.corpus.excluded.fixture, 1);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-reviewer-study-"));
  try {
    const response = JSON.parse(fs.readFileSync(examplePath, "utf8")) as {
      fixture: boolean;
      participantId: string;
    };
    response.fixture = false;
    response.participantId = "p-1234abcd";
    fs.writeFileSync(path.join(tempDir, "response.json"), `${JSON.stringify(response, null, 2)}\n`, "utf8");

    const result = JSON.parse(execFileSync(process.execPath, [studyScript, "aggregate", tempDir], {
      cwd: root,
      encoding: "utf8"
    })) as {
      corpus: { includedParticipants: number };
      conditions: Record<string, {
        assignedTrials: number;
        completedTrials: number;
        taskAccuracy: { numerator: number; denominator: number };
        medianElapsedSeconds: number;
      }>;
      limitations: string[];
    };
    assert.equal(result.corpus.includedParticipants, 1);
    assert.deepEqual(result.conditions["markdown-only"]?.taskAccuracy, { numerator: 4, denominator: 4 });
    assert.deepEqual(result.conditions.receipt?.taskAccuracy, { numerator: 4, denominator: 4 });
    assert.equal(result.conditions["markdown-only"]?.medianElapsedSeconds, 240);
    assert.equal(result.conditions.receipt?.medianElapsedSeconds, 180);
    assert.ok(result.limitations.some((item) => item.includes("no superiority claim")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("reviewer study rejects assignment drift and documents the honest zero baseline", () => {
  const examplePath = path.join(studyRoot, "fixtures", "example-response.json");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-reviewer-study-invalid-"));
  try {
    const response = JSON.parse(fs.readFileSync(examplePath, "utf8")) as {
      trials: Array<{ condition: string }>;
    };
    response.trials[0]!.condition = "receipt";
    const responsePath = path.join(tempDir, "invalid.json");
    fs.writeFileSync(responsePath, `${JSON.stringify(response, null, 2)}\n`, "utf8");
    const rejected = spawnSync(process.execPath, [studyScript, "validate", responsePath], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /expected case-a\/markdown-only for group AB/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const readme = fs.readFileSync(path.join(studyRoot, "README.md"), "utf8");
  assert.match(readme, /contains no telemetry/);
  assert.match(readme, /no superiority claim/);
  assert.match(readme, /Current real participant count: \*\*0\*\*/);
});
