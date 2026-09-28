import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";

import { locateElement } from "../lib/cdp";
import { humanClick } from "../lib/humanizer";

function createOversizedDomClient() {
  const matches = {
    length: 5_001,
    [Symbol.iterator]() {
      throw new Error("oversized DOM matches should not be iterated");
    }
  };
  let evaluations = 0;
  const client = {
    Runtime: {
      enable: async () => undefined,
      evaluate: async ({ expression }: { expression: string }) => {
        evaluations += 1;
        return {
          result: {
            value: await vm.runInNewContext(expression, {
              document: { querySelectorAll: () => matches }
            })
          }
        };
      }
    }
  };
  return { client, evaluationCount: () => evaluations };
}

test("element lookup refuses oversized DOM scans before iterating matches", async () => {
  const { client } = createOversizedDomClient();

  for (const query of ["css=.target", "Install"]) {
    const result = await locateElement(client, query);
    assert.equal(result.status, "ambiguous");
    assert.equal(result.query, query);
    assert.equal(result.count, 5_001);
    assert.equal(result.matches?.length, 0);
  }
});

test("click reports ambiguous matches without scrolling the page", async () => {
  const { client, evaluationCount } = createOversizedDomClient();

  await assert.rejects(humanClick(client, "css=.target"), /matched 5001 elements/);
  assert.equal(evaluationCount(), 1);
});
