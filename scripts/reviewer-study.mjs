#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = process.cwd();
const studyRoot = path.join(root, "studies", "reviewer-value");
const schema = JSON.parse(fs.readFileSync(path.join(studyRoot, "response.schema.json"), "utf8"));
const assignments = JSON.parse(fs.readFileSync(path.join(studyRoot, "assignments.json"), "utf8"));
const answerKey = JSON.parse(fs.readFileSync(path.join(studyRoot, "answer-key.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);
const taskIds = assignments.taskOrder;

const forbiddenIdentityKey = /^(address|email|fullName|githubHandle|ipAddress|name|phone|username)$/i;
const privateFieldKey = /^(apiKey|authorization|cookie|credential|password|privateKey|prompt|session|token)$/i;
const credentialLikeText = [
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-ant-(?:api\d+-)?[A-Za-z0-9_-]{20,}\b/,
  /https:\/\/[^/\s:@]+:[^@\s]+@/i
];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function inspectPrivacy(value, currentPath = "", errors = []) {
  if (typeof value === "string") {
    if (credentialLikeText.some((pattern) => pattern.test(value))) errors.push(`${currentPath || "/"}: credential-like text is forbidden`);
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPrivacy(item, `${currentPath}/${index}`, errors));
    return errors;
  }
  if (!value || typeof value !== "object") return errors;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${currentPath}/${key}`;
    if (forbiddenIdentityKey.test(key)) errors.push(`${childPath}: direct identity fields are forbidden`);
    if (privateFieldKey.test(key)) errors.push(`${childPath}: credential, session, prompt, or private fields are forbidden`);
    inspectPrivacy(child, childPath, errors);
  }
  return errors;
}

function validateResponse(value, filePath) {
  const errors = [];
  if (!validateSchema(value)) errors.push(...(validateSchema.errors ?? []).map((error) => `${error.instancePath || "/"}: ${error.message}`));
  errors.push(...inspectPrivacy(value));
  if (errors.length > 0) return { valid: false, errors };

  const expected = assignments.groups[value.orderGroup];
  for (let index = 0; index < expected.length; index += 1) {
    const actualTrial = value.trials[index];
    const expectedTrial = expected[index];
    if (actualTrial.caseId !== expectedTrial.caseId || actualTrial.condition !== expectedTrial.condition) {
      errors.push(`/trials/${index}: expected ${expectedTrial.caseId}/${expectedTrial.condition} for group ${value.orderGroup}`);
    }
    const started = Date.parse(actualTrial.startedAt);
    const finished = Date.parse(actualTrial.finishedAt);
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) {
      errors.push(`/trials/${index}: finishedAt must be later than startedAt`);
    }
    if (!actualTrial.abandoned && Object.values(actualTrial.answers).some((answer) => typeof answer !== "string" || !answer.trim())) {
      errors.push(`/trials/${index}/answers: completed trials require four non-empty answers`);
    }
  }
  if (new Set(value.trials.map((trial) => trial.caseId)).size !== 2) errors.push("/trials: each case must appear exactly once");
  if (value.consent.publishAnonymizedRow && !value.consent.anonymizedMeasures) {
    errors.push("/consent: publishing an anonymized row requires anonymizedMeasures consent");
  }
  if (value.consent.identityAttribution) {
    errors.push("/consent/identityAttribution: identity attribution must be recorded separately; this response cannot contain identity data");
  }
  return { valid: errors.length === 0, errors, filePath };
}

function normalizeAnswer(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replaceAll("\\", "/") : "";
}

function scoreTrial(trial) {
  if (trial.abandoned) return { completed: false, elapsedSeconds: null, confidence: null, tasks: {} };
  const expected = answerKey.cases[trial.caseId];
  const expectedAnswers = {
    supportingEvidenceId: expected.supportingEvidenceId,
    contradictedClaimId: expected.contradictedClaimId,
    staleSourceId: expected.staleSourceId,
    tamperResult: expected.tamperResult[trial.condition]
  };
  return {
    completed: true,
    elapsedSeconds: (Date.parse(trial.finishedAt) - Date.parse(trial.startedAt)) / 1000,
    confidence: trial.confidence,
    tasks: Object.fromEntries(taskIds.map((taskId) => [taskId, normalizeAnswer(trial.answers[taskId]) === normalizeAnswer(expectedAnswers[taskId])]))
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function emptyCondition() {
  return {
    assignedTrials: 0,
    completedTrials: 0,
    abandonedTrials: 0,
    correctTasks: 0,
    attemptedTasks: 0,
    elapsedSeconds: [],
    confidence: [],
    tasks: Object.fromEntries(taskIds.map((taskId) => [taskId, { correct: 0, attempted: 0 }]))
  };
}

function aggregateResponses(directory, includeFixtures) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
  const responses = files.map((filePath) => {
    const value = readJson(filePath);
    const validation = validateResponse(value, filePath);
    if (!validation.valid) throw new Error(`${filePath}: response validation failed:\n- ${validation.errors.join("\n- ")}`);
    return value;
  });

  const exclusions = { fixture: 0, noAnonymizedMeasuresConsent: 0 };
  const included = responses.filter((response) => {
    if (response.fixture && !includeFixtures) {
      exclusions.fixture += 1;
      return false;
    }
    if (!response.consent.anonymizedMeasures) {
      exclusions.noAnonymizedMeasuresConsent += 1;
      return false;
    }
    return true;
  });
  const conditions = { "markdown-only": emptyCondition(), receipt: emptyCondition() };
  for (const response of included) {
    for (const trial of response.trials) {
      const condition = conditions[trial.condition];
      const score = scoreTrial(trial);
      condition.assignedTrials += 1;
      if (!score.completed) {
        condition.abandonedTrials += 1;
        continue;
      }
      condition.completedTrials += 1;
      condition.elapsedSeconds.push(score.elapsedSeconds);
      condition.confidence.push(score.confidence);
      for (const taskId of taskIds) {
        condition.attemptedTasks += 1;
        condition.tasks[taskId].attempted += 1;
        if (score.tasks[taskId]) {
          condition.correctTasks += 1;
          condition.tasks[taskId].correct += 1;
        }
      }
    }
  }

  const summarizedConditions = Object.fromEntries(Object.entries(conditions).map(([id, value]) => [id, {
    assignedTrials: value.assignedTrials,
    completedTrials: value.completedTrials,
    abandonedTrials: value.abandonedTrials,
    taskAccuracy: { numerator: value.correctTasks, denominator: value.attemptedTasks },
    medianElapsedSeconds: median(value.elapsedSeconds),
    medianConfidence: median(value.confidence),
    tasks: value.tasks
  }]));
  return {
    studyVersion: "1.0.0",
    corpus: {
      responseFiles: files.length,
      includedParticipants: included.length,
      excluded: exclusions,
      fixturesIncludedByExplicitFlag: includeFixtures
    },
    conditions: summarizedConditions,
    limitations: [
      "Descriptive denominators only; this command performs no significance test and makes no superiority claim.",
      "Timing is participant-recorded and can include interruptions unless the facilitator documents them as friction.",
      "Synthetic tasks measure review mechanics, not factual research accuracy or production adoption."
    ]
  };
}

function markdownSummary(result) {
  const lines = [
    "# Reviewer-value study aggregate",
    "",
    `Included participants: ${result.corpus.includedParticipants}/${result.corpus.responseFiles}`,
    `Excluded fixtures: ${result.corpus.excluded.fixture}`,
    `Excluded without anonymized-measures consent: ${result.corpus.excluded.noAnonymizedMeasuresConsent}`,
    "",
    "| Condition | Completed / assigned | Correct tasks | Median seconds | Median confidence |",
    "| --- | ---: | ---: | ---: | ---: |"
  ];
  for (const [condition, value] of Object.entries(result.conditions)) {
    lines.push(`| ${condition} | ${value.completedTrials}/${value.assignedTrials} | ${value.taskAccuracy.numerator}/${value.taskAccuracy.denominator} | ${value.medianElapsedSeconds ?? "n/a"} | ${value.medianConfidence ?? "n/a"} |`);
  }
  lines.push("", "## Limits", "", ...result.limitations.map((item) => `- ${item}`), "");
  return lines.join("\n");
}

function usage() {
  return [
    "Usage:",
    "  node scripts/reviewer-study.mjs validate <response.json>",
    "  node scripts/reviewer-study.mjs aggregate <response-directory> [--format json|markdown] [--include-fixtures]"
  ].join("\n");
}

const [command, targetArg, ...flags] = process.argv.slice(2);
if (!command || !targetArg) throw new Error(usage());
const target = path.resolve(targetArg);
if (command === "validate") {
  const value = readJson(target);
  const validation = validateResponse(value, target);
  if (!validation.valid) throw new Error(`response validation failed:\n- ${validation.errors.join("\n- ")}`);
  process.stdout.write(`${JSON.stringify({ valid: true, fixture: value.fixture, participantId: value.participantId, trials: value.trials.length }, null, 2)}\n`);
} else if (command === "aggregate") {
  const formatFlag = flags.find((flag) => flag.startsWith("--format="));
  const format = formatFlag ? formatFlag.slice("--format=".length) : "json";
  if (!fs.statSync(target).isDirectory()) throw new Error(`aggregate target is not a directory: ${target}`);
  if (!new Set(["json", "markdown"]).has(format)) throw new Error("--format must be json or markdown");
  const result = aggregateResponses(target, flags.includes("--include-fixtures"));
  process.stdout.write(format === "markdown" ? markdownSummary(result) : `${JSON.stringify(result, null, 2)}\n`);
} else {
  throw new Error(usage());
}
