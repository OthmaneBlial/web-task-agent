import assert from "node:assert/strict";
import test from "node:test";

import { assessStorageHealth } from "../lib/storage-validation";

test("storage health helper highlights freelist pressure and empty stores", () => {
  const healthy = assessStorageHealth({
    databasePath: "/tmp/db.sqlite",
    schemaVersion: 2,
    jobs: 2,
    steps: 8,
    artifacts: 4,
    events: 12,
    pages: 120,
    freelistPages: 8,
    vacuumed: false
  });

  const unhealthy = assessStorageHealth({
    databasePath: "/tmp/db.sqlite",
    schemaVersion: 3,
    jobs: 0,
    steps: 0,
    artifacts: 0,
    events: 0,
    pages: 80,
    freelistPages: 24,
    vacuumed: false
  });

  assert.equal(healthy.healthy, true);
  assert.deepEqual(healthy.warnings, []);
  assert.equal(unhealthy.healthy, false);
  assert.ok(unhealthy.warnings.some((warning) => warning.includes("schema version")));
  assert.ok(unhealthy.warnings.some((warning) => warning.includes("Freelist pages")));
  assert.ok(unhealthy.warnings.some((warning) => warning.includes("No stored jobs")));
});
