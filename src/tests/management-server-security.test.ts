import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createManagementServer } from "../server/management-server";

function listen(server: http.Server): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to bind management server"));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          })
      });
    });
  });
}

test("management server sends browser hardening headers and rejects cross-origin posts", async () => {
  const server = createManagementServer();
  const bound = await listen(server);

  try {
    const rootResponse = await fetch(`http://127.0.0.1:${bound.port}/`);
    assert.equal(rootResponse.status, 200);
    assert.equal(rootResponse.headers.get("content-security-policy"), "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    assert.equal(rootResponse.headers.get("x-frame-options"), "DENY");
    assert.equal(rootResponse.headers.get("referrer-policy"), "no-referrer");
    assert.equal(rootResponse.headers.get("x-content-type-options"), "nosniff");

    const forbiddenResponse = await fetch(`http://127.0.0.1:${bound.port}/api/health`, {
      method: "POST",
      headers: {
        Origin: "http://evil.example"
      }
    });
    assert.equal(forbiddenResponse.status, 403);
    assert.equal(forbiddenResponse.headers.get("content-type"), "application/json; charset=utf-8");

    const payload = (await forbiddenResponse.json()) as {
      ok: boolean;
      error: string;
      message: string;
    };
    assert.deepEqual(payload, {
      ok: false,
      error: "forbidden_origin",
      message: "Cross-origin control requests are not allowed"
    });
  } finally {
    await bound.close();
  }
});
