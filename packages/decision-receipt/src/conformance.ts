import type { ReceiptBundle, ReceiptValidationIssue } from "./types";
import { verifyReceiptBundle } from "./verify";

export interface DecisionReceiptConformanceCase {
  id: string;
  description: string;
  mutation: string;
  expectedValid: boolean;
  expectedCode: string | null;
}

export interface DecisionReceiptConformanceCaseResult {
  id: string;
  passed: boolean;
  expectedValid: boolean;
  actualValid: boolean;
  expectedCode: string | null;
  issueCodes: string[];
  issues: ReceiptValidationIssue[];
}

export interface DecisionReceiptConformanceResult {
  passed: boolean;
  cases: DecisionReceiptConformanceCaseResult[];
}

export async function runDecisionReceiptConformance(
  cases: DecisionReceiptConformanceCase[],
  bundleFor: (testCase: DecisionReceiptConformanceCase) => ReceiptBundle | Promise<ReceiptBundle>
): Promise<DecisionReceiptConformanceResult> {
  const results: DecisionReceiptConformanceCaseResult[] = [];
  for (const testCase of cases) {
    const verification = await verifyReceiptBundle(await bundleFor(testCase));
    const issueCodes = verification.issues.map((item) => item.code);
    results.push({
      id: testCase.id,
      passed: verification.valid === testCase.expectedValid && (!testCase.expectedCode || issueCodes.includes(testCase.expectedCode)),
      expectedValid: testCase.expectedValid,
      actualValid: verification.valid,
      expectedCode: testCase.expectedCode,
      issueCodes,
      issues: verification.issues
    });
  }
  return { passed: results.every((item) => item.passed), cases: results };
}
