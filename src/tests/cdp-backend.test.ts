import assert from "node:assert/strict";
import test from "node:test";

import { classifyCdpBackend } from "../lib/cdp";

test("CDP backend classification makes the local browser choice explicit", () => {
  assert.equal(classifyCdpBackend("Lightpanda/0.1"), "lightpanda");
  assert.equal(classifyCdpBackend("Chrome/140.0.0.0"), "chrome");
  assert.equal(classifyCdpBackend("Chromium/140.0.0.0"), "chrome");
  assert.equal(classifyCdpBackend("Custom CDP Browser"), "unknown");
  assert.equal(classifyCdpBackend(null), "unavailable");
});
