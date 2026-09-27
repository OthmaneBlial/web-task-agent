import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("idle queue worker wakes and exits promptly on SIGTERM", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-worker-stop-"));
  const databasePath = path.join(root, "queue.sqlite");
  const workerModule = path.resolve("dist", "tasks", "queue-worker.js");
  const script = [
    `const { QueueWorkerTask } = require(${JSON.stringify(workerModule)});`,
    `new QueueWorkerTask({ databasePath: ${JSON.stringify(databasePath)}, once: false, pollIntervalSeconds: 3600, queueLeaseMinutes: 1 })`,
    `.run().then(() => console.log("worker-exited"), (error) => { console.error(error); process.exitCode = 1; });`
  ].join("\n");
  const child = spawn(process.execPath, ["-e", script], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let signalSent = false;

  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`worker did not exit after SIGTERM: ${stdout}`));
      }, 1_500);
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (!signalSent && stdout.includes("is idle; polling again soon")) {
          signalSent = true;
          child.kill("SIGTERM");
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    });

    assert.equal(signalSent, true, stdout);
    assert.equal(result.signal, null, stderr);
    assert.equal(result.code, 0, stderr);
    assert.match(stdout, /worker-exited/);
  } finally {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGKILL");
      });
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
