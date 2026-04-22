import { randomUUID } from "node:crypto";

import {
  claimNextQueuedJob,
  completeQueuedJob,
  failQueuedJob,
  heartbeatQueuedJob,
  recoverStaleQueuedJobs,
  settleControlledQueuedJob
} from "../lib/job-queue";
import type { AgentRunOptions } from "../types";
import { BaseTask } from "./BaseTask";
import { AgentRunnerTask } from "./agent-runner";

interface QueueWorkerOptions {
  databasePath?: string;
  once: boolean;
  pollIntervalSeconds: number;
  queueLeaseMinutes: number;
}

interface QueueWorkerResult {
  workerId: string;
  recoveredJobs: number;
  processedJobs: number;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class QueueWorkerTask extends BaseTask<QueueWorkerOptions, QueueWorkerResult> {
  async run(): Promise<QueueWorkerResult> {
    const workerId = `worker-${randomUUID().slice(0, 8)}`;
    const queueLeaseTtlSeconds = Math.max(60, Math.round(this.options.queueLeaseMinutes * 60));
    let recoveredJobs = 0;
    let processedJobs = 0;
    let stopRequested = false;

    const requestStop = (signal: string) => {
      if (!stopRequested) {
        stopRequested = true;
        this.log(`worker ${workerId} received ${signal}; finishing the current iteration before exit`);
      }
    };

    const handleSigint = () => requestStop("SIGINT");
    const handleSigterm = () => requestStop("SIGTERM");

    process.once("SIGINT", handleSigint);
    process.once("SIGTERM", handleSigterm);

    try {
      while (true) {
        recoveredJobs += recoverStaleQueuedJobs({
          databasePath: this.options.databasePath
        });

        const queuedJob = claimNextQueuedJob({
          databasePath: this.options.databasePath,
          workerId,
          leaseTtlSeconds: queueLeaseTtlSeconds
        });

        if (!queuedJob) {
          if (this.options.once || stopRequested) {
            break;
          }

          this.log(`worker ${workerId} is idle; polling again soon`);
          await sleepMs(Math.max(1, this.options.pollIntervalSeconds) * 1000);
          continue;
        }

        this.log(`worker ${workerId} claimed ${queuedJob.queueId}: ${queuedJob.label}`);
        let heartbeatTimer: NodeJS.Timeout | null = null;

        try {
          heartbeatTimer = setInterval(() => {
            heartbeatQueuedJob({
              databasePath: this.options.databasePath,
              queueId: queuedJob.queueId,
              workerId,
              leaseTtlSeconds: queueLeaseTtlSeconds
            });
          }, Math.max(15, Math.round(queueLeaseTtlSeconds / 4)) * 1000);
          heartbeatTimer.unref?.();

          if (queuedJob.payload.taskType !== "agent") {
            throw new Error(`unsupported queued task type: ${queuedJob.payload.taskType}`);
          }

          const result = await new AgentRunnerTask(
            {
              ...(queuedJob.payload.options as AgentRunOptions),
              queuedJobId: queuedJob.queueId
            }
          ).run();
          if (result.status === "paused" || result.status === "cancelled") {
            settleControlledQueuedJob({
              databasePath: this.options.databasePath,
              queueId: queuedJob.queueId,
              workerId,
              status: result.status,
              result
            });
          } else {
            completeQueuedJob({
              databasePath: this.options.databasePath,
              queueId: queuedJob.queueId,
              workerId,
              result
            });
          }
          processedJobs += 1;
          this.log(`worker ${workerId} finished ${queuedJob.queueId} with status ${result.status}`);
        } catch (error) {
          const message = error instanceof Error ? error.stack ?? error.message : String(error);
          failQueuedJob({
            databasePath: this.options.databasePath,
            queueId: queuedJob.queueId,
            workerId,
            errorMessage: message,
            retryDelaySeconds: Math.min(3600, Math.max(60, queuedJob.attempts * 300))
          });
          this.log(`worker ${workerId} failed ${queuedJob.queueId}: ${message}`);
        } finally {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
          }
        }

        if (this.options.once || stopRequested) {
          break;
        }
      }

      return {
        workerId,
        recoveredJobs,
        processedJobs
      };
    } finally {
      process.removeListener("SIGINT", handleSigint);
      process.removeListener("SIGTERM", handleSigterm);
    }
  }
}
