import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { listQueuedJobs } from "../lib/job-queue";
import {
  getStoredJobDetail,
  listRecoverableJobs,
  listStoredJobs
} from "../lib/job-store";

interface ManagementServerOptions {
  databasePath?: string;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, {
    error: "not_found"
  });
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Web Task Agent Dashboard</title>
  <style>
    :root {
      --bg: #f5f0e8;
      --panel: #fffaf2;
      --ink: #1f1f1a;
      --muted: #6e675d;
      --accent: #0f766e;
      --line: #d9d0c1;
      --warning: #92400e;
      --danger: #991b1b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.08), transparent 28%),
        linear-gradient(180deg, #f7f1e8 0%, #efe6d8 100%);
    }
    .shell {
      max-width: 1360px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 18px;
      margin-bottom: 18px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 20px 40px rgba(49, 36, 12, 0.08);
    }
    h1, h2, h3 {
      margin: 0 0 10px;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .stat {
      padding: 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.65);
    }
    .stat strong {
      display: block;
      font-size: 1.5rem;
      margin-bottom: 4px;
    }
    .layout {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.94rem;
    }
    th, td {
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
    }
    th {
      color: var(--muted);
      font-weight: 600;
    }
    button.rowlink {
      font: inherit;
      background: none;
      border: 0;
      padding: 0;
      color: var(--accent);
      text-align: left;
      cursor: pointer;
    }
    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.8);
      font-size: 0.8rem;
    }
    .danger { color: var(--danger); }
    .warning { color: var(--warning); }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      padding: 14px;
      border-radius: 14px;
      background: #f7f2e8;
      border: 1px solid var(--line);
      font-size: 0.85rem;
      overflow: auto;
      max-height: 560px;
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .muted {
      color: var(--muted);
      font-size: 0.88rem;
    }
    @media (max-width: 980px) {
      .hero, .layout, .stats {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel">
        <h1>Web Task Agent</h1>
        <p>Local operations dashboard for jobs, queue state, stale recoveries, artifacts, and evidence-backed outputs.</p>
        <div class="stats" id="stats"></div>
      </div>
      <div class="panel">
        <div class="section-title">
          <h2>Recoverable Runs</h2>
          <span class="muted" id="refresh-status">refreshing...</span>
        </div>
        <div id="recoverable"></div>
      </div>
    </section>

    <section class="layout">
      <div class="panel">
        <div class="section-title">
          <h2>Jobs</h2>
          <span class="muted">click a job for details</span>
        </div>
        <div id="jobs"></div>
      </div>
      <div class="panel">
        <div class="section-title">
          <h2>Queue</h2>
          <span class="muted">scheduler state</span>
        </div>
        <div id="queue"></div>
      </div>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <div class="section-title">
        <h2>Job Detail</h2>
        <span class="muted" id="detail-label">select a job</span>
      </div>
      <pre id="job-detail">No job selected.</pre>
    </section>
  </div>

  <script>
    const state = {
      selectedJobId: null
    };

    function statusPill(text) {
      return '<span class="pill">' + text + '</span>';
    }

    function renderStats(jobs, queue, recoverable) {
      const running = jobs.filter((job) => job.status === 'running').length;
      const waiting = jobs.filter((job) => job.status === 'waiting_review').length;
      const queued = queue.filter((job) => job.status === 'queued').length;
      document.getElementById('stats').innerHTML = [
        ['Jobs', jobs.length],
        ['Running', running],
        ['Waiting Review', waiting],
        ['Queued', queued]
      ].map(([label, value]) =>
        '<div class="stat"><strong>' + value + '</strong><span>' + label + '</span></div>'
      ).join('');

      document.getElementById('recoverable').innerHTML = recoverable.length === 0
        ? '<p>No stale recoverable jobs.</p>'
        : '<table><thead><tr><th>Job</th><th>Status</th><th>Lease Expired</th></tr></thead><tbody>' +
          recoverable.map((job) =>
            '<tr><td>' + job.jobId + '</td><td>' + statusPill(job.status) + '</td><td>' + (job.leaseExpiresAt || '-') + '</td></tr>'
          ).join('') +
          '</tbody></table>';
    }

    function renderJobs(jobs) {
      document.getElementById('jobs').innerHTML = jobs.length === 0
        ? '<p>No jobs found.</p>'
        : '<table><thead><tr><th>Job</th><th>Status</th><th>Workflow</th><th>Updated</th></tr></thead><tbody>' +
          jobs.map((job) =>
            '<tr><td><button class="rowlink" data-job-id="' + job.jobId + '">' + job.title + '</button><div class="muted">' + job.jobId + '</div></td><td>' + statusPill(job.status) + '</td><td>' + (job.workflowName || '-') + '</td><td>' + job.updatedAt + '</td></tr>'
          ).join('') +
          '</tbody></table>';

      document.querySelectorAll('[data-job-id]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedJobId = button.getAttribute('data-job-id');
          loadJobDetail();
        });
      });
    }

    function renderQueue(queue) {
      document.getElementById('queue').innerHTML = queue.length === 0
        ? '<p>No queued jobs.</p>'
        : '<table><thead><tr><th>Queue ID</th><th>Status</th><th>Attempts</th><th>Label</th></tr></thead><tbody>' +
          queue.map((item) =>
            '<tr><td>' + item.queueId + '</td><td>' + statusPill(item.status) + '</td><td>' + item.attempts + '/' + item.maxAttempts + '</td><td>' + item.label + '</td></tr>'
          ).join('') +
          '</tbody></table>';
    }

    async function loadJobDetail() {
      if (!state.selectedJobId) {
        return;
      }
      const response = await fetch('/api/jobs/' + encodeURIComponent(state.selectedJobId));
      if (!response.ok) {
        document.getElementById('job-detail').textContent = 'Failed to load job detail.';
        return;
      }
      const detail = await response.json();
      document.getElementById('detail-label').textContent = detail.job.title + ' (' + detail.job.status + ')';
      document.getElementById('job-detail').textContent = JSON.stringify(detail, null, 2);
    }

    async function refresh() {
      const [jobs, queue, recoverable] = await Promise.all([
        fetch('/api/jobs').then((res) => res.json()),
        fetch('/api/queue').then((res) => res.json()),
        fetch('/api/recoverable').then((res) => res.json())
      ]);

      renderStats(jobs, queue, recoverable);
      renderJobs(jobs);
      renderQueue(queue);
      document.getElementById('refresh-status').textContent = 'refreshed ' + new Date().toLocaleTimeString();
      if (state.selectedJobId) {
        loadJobDetail();
      }
    }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}

export function createManagementServer(options?: ManagementServerOptions): http.Server {
  return http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? "GET";
    const parsedUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (method !== "GET") {
      sendJson(res, 405, {
        error: "method_not_allowed"
      });
      return;
    }

    if (parsedUrl.pathname === "/") {
      sendHtml(res, dashboardHtml());
      return;
    }

    if (parsedUrl.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true
      });
      return;
    }

    if (parsedUrl.pathname === "/api/jobs") {
      sendJson(res, 200, listStoredJobs({
        databasePath: options?.databasePath
      }));
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/jobs/")) {
      const jobId = decodeURIComponent(parsedUrl.pathname.replace("/api/jobs/", ""));
      const detail = getStoredJobDetail({
        databasePath: options?.databasePath,
        jobId
      });
      if (!detail) {
        notFound(res);
        return;
      }
      sendJson(res, 200, detail);
      return;
    }

    if (parsedUrl.pathname === "/api/queue") {
      sendJson(res, 200, listQueuedJobs({
        databasePath: options?.databasePath
      }));
      return;
    }

    if (parsedUrl.pathname === "/api/recoverable") {
      sendJson(res, 200, listRecoverableJobs({
        databasePath: options?.databasePath
      }));
      return;
    }

    notFound(res);
  });
}
