import fs from "node:fs";
import path from "node:path";

import { normalizeWorkflowProposalId } from "./scaffold";

type JsonObject = Record<string, unknown>;

export interface WorkflowProposalValidationResult {
  valid: boolean;
  definitionPath: string | null;
  errors: string[];
  warnings: string[];
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function nonPlaceholder(value: string): boolean {
  return !/^(describe|add|list|replace with)\b/i.test(value);
}

function validateStringList(
  value: unknown,
  label: string,
  minimum: number,
  errors: string[],
  options?: { placeholders?: boolean; unique?: boolean }
): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of at least ${minimum} non-empty strings`);
    return [];
  }
  const values = value.map(nonEmptyString).filter((item): item is string => Boolean(item));
  if (values.length < minimum) {
    errors.push(`${label} must contain at least ${minimum} non-empty string${minimum === 1 ? "" : "s"}`);
  }
  if (options?.unique && new Set(values.map((item) => item.toLowerCase())).size !== values.length) {
    errors.push(`${label} must not repeat the same value`);
  }
  if (options?.placeholders && values.some((item) => !nonPlaceholder(item))) {
    errors.push(`${label} still contains a scaffold placeholder`);
  }
  return values;
}

export function validateWorkflowProposalDefinition(
  definition: unknown,
  definitionPath: string | null = null
): WorkflowProposalValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const value = asObject(definition);
  if (!value) {
    return { valid: false, definitionPath, errors: ["workflow definition must be a JSON object"], warnings };
  }

  const id = nonEmptyString(value.id);
  if (!id) {
    errors.push("id must be a non-empty workflow id");
  } else {
    try {
      if (normalizeWorkflowProposalId(id) !== id) {
        errors.push("id must already be lowercase kebab-case");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const field of ["title", "category", "decision"] as const) {
    const text = nonEmptyString(value[field]);
    if (!text) {
      errors.push(`${field} must be a non-empty string`);
    } else if (field === "decision" && !nonPlaceholder(text)) {
      errors.push("decision still contains a scaffold placeholder");
    }
  }

  const sourcePolicy = asObject(value.sourcePolicy);
  if (!sourcePolicy) {
    errors.push("sourcePolicy must be an object with preferred and excluded source lists");
  } else {
    validateStringList(sourcePolicy.preferred, "sourcePolicy.preferred", 3, errors, { unique: true });
    validateStringList(sourcePolicy.excluded, "sourcePolicy.excluded", 1, errors, { unique: true });
  }

  validateStringList(value.deliverables, "deliverables", 3, errors, { unique: true });
  validateStringList(value.queries, "queries", 2, errors, { placeholders: true, unique: true });
  validateStringList(value.risks, "risks", 1, errors, { placeholders: true, unique: true });

  warnings.push("Schema validation cannot prove semantic distinction; a reviewer must compare the proposal with nearby catalog workflows.");
  warnings.push("A valid definition is still a proposal: add deterministic fixture coverage before registering it as executable.");
  return { valid: errors.length === 0, definitionPath, errors, warnings };
}

export function validateWorkflowProposalFile(inputPath: string): WorkflowProposalValidationResult {
  const definitionPath = path.resolve(inputPath);
  try {
    const raw = fs.readFileSync(definitionPath, "utf8");
    return validateWorkflowProposalDefinition(JSON.parse(raw), definitionPath);
  } catch (error) {
    return {
      valid: false,
      definitionPath,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: []
    };
  }
}

export function formatWorkflowProposalValidation(result: WorkflowProposalValidationResult): string[] {
  const lines = [
    `Workflow proposal validation: ${result.valid ? "PASS" : "FAIL"}`,
    `Definition: ${result.definitionPath ?? "(in-memory)"}`
  ];
  for (const error of result.errors) lines.push(`Error: ${error}`);
  for (const warning of result.warnings) lines.push(`Review: ${warning}`);
  return lines;
}
