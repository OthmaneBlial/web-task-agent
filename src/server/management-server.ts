import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { requestAgentJobControl, resumeAgentJob, rerunAgentJob } from "../lib/job-operations";
import { controlQueuedJob, getQueuedJob, listQueuedJobs } from "../lib/job-queue";
import {
  getStoredJobDetail,
  listJobRunEvents,
  listRecoverableJobs,
  listStoredJobs
} from "../lib/job-store";
import type { JobControlAction, QueueControlAction } from "../types";

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

function sendSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive"
  });
}

function sendSseEvent(res: ServerResponse, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, {
    error: "not_found"
  });
}

function methodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, {
    error: "method_not_allowed"
  });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Web Task Agent Control Room</title>
  <style>
    :root {
      --bg: #efe4d2;
      --panel: rgba(255, 249, 239, 0.92);
      --panel-strong: #fffaf3;
      --ink: #171412;
      --muted: #6f665d;
      --line: rgba(86, 65, 34, 0.16);
      --accent: #0f766e;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --warning: #b45309;
      --danger: #b91c1c;
      --shadow: 0 28px 60px rgba(54, 39, 18, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top right, rgba(15,118,110,0.15), transparent 28%),
        radial-gradient(circle at left center, rgba(180,83,9,0.10), transparent 24%),
        linear-gradient(180deg, #f5ebdd 0%, var(--bg) 100%);
    }
    .shell {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero, .layout, .detail-grid {
      display: grid;
      gap: 18px;
    }
    .hero {
      grid-template-columns: 1.35fr 0.95fr;
      margin-bottom: 18px;
    }
    .layout {
      grid-template-columns: 1.15fr 0.85fr;
      margin-bottom: 18px;
    }
    .detail-grid {
      grid-template-columns: 0.95fr 1.05fr;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .panel > p {
      margin-top: 8px;
    }
    .hero-copy h1 {
      margin: 0 0 10px;
      font-size: clamp(2rem, 3vw, 3.4rem);
      line-height: 0.95;
      letter-spacing: -0.04em;
      text-transform: uppercase;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(23, 20, 18, 0.05);
      color: var(--muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 14px;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    h2, h3 {
      margin: 0;
      line-height: 1.05;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .stat {
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.58);
      border-radius: 18px;
      padding: 14px;
    }
    .stat strong {
      display: block;
      font-size: 1.7rem;
      margin-bottom: 4px;
    }
    .section-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }
    .muted {
      color: var(--muted);
      font-size: 0.88rem;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.78);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }
    .table-wrap {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: auto;
      background: rgba(255,255,255,0.45);
    }
    .btn {
      appearance: none;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--ink);
      border-radius: 999px;
      padding: 9px 14px;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .btn:hover { transform: translateY(-1px); border-color: rgba(15,118,110,0.35); }
    .btn:disabled { cursor: not-allowed; opacity: 0.45; transform: none; }
    .btn-accent { background: var(--accent); color: #fff; border-color: transparent; }
    .btn-danger { color: var(--danger); }
    .btn-warning { color: var(--warning); }
    .grid-cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .mini-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px;
      background: rgba(255,255,255,0.55);
    }
    .mini-card strong {
      display: block;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      min-width: 840px;
      border-collapse: collapse;
      font-size: 0.94rem;
    }
    th, td {
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      background: rgba(255, 250, 243, 0.96);
      position: sticky;
      top: 0;
      z-index: 1;
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
    .action-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .action-stack .btn {
      padding: 6px 10px;
      font-size: 0.82rem;
    }
    .log-panel {
      background: #171412;
      color: #f8eddc;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.06);
      min-height: 420px;
      max-height: 640px;
      overflow: auto;
      padding: 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .log-line {
      display: grid;
      grid-template-columns: 112px 112px 1fr;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-family: "Courier New", monospace;
      font-size: 0.82rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .log-line:last-child { border-bottom: 0; }
    .log-time { color: #d6b88d; }
    .log-type { color: #86efac; text-transform: uppercase; }
    .code {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      padding: 14px;
      border-radius: 14px;
      background: rgba(255,255,255,0.6);
      border: 1px solid var(--line);
      font-size: 0.84rem;
      max-height: 360px;
      overflow: auto;
    }
    .flash {
      min-height: 22px;
      color: var(--muted);
      margin-top: 10px;
    }
    .danger { color: var(--danger); }
    .warning { color: var(--warning); }
    @media (max-width: 1100px) {
      .hero, .layout, .detail-grid, .stats, .grid-cards {
        grid-template-columns: 1fr;
      }
      table {
        min-width: 760px;
      }
      .log-line {
        grid-template-columns: 1fr;
        gap: 4px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">Operator Control Room</div>
        <h1>Web Task Agent</h1>
        <p>Operate long-running research jobs with queue controls, graceful pause and cancel, resumable execution, and live event logs from the stored evidence workflow.</p>
        <div class="stats" id="stats"></div>
      </div>
      <div class="panel">
        <div class="section-title">
          <h2>Recoverable Runs</h2>
          <span class="muted" id="refresh-status">refreshing...</span>
        </div>
        <p>Shows jobs with stale leases or other recoverable state so you can resume work quickly.</p>
        <div id="recoverable"></div>
      </div>
    </section>

    <section class="layout">
      <div class="panel">
        <div class="section-title">
          <h2>Jobs</h2>
          <span class="muted">select a job to inspect and control it</span>
        </div>
        <div id="jobs"></div>
      </div>
      <div class="panel">
        <div class="section-title">
          <h2>Queue</h2>
          <span class="muted">worker-facing execution backlog</span>
        </div>
        <div id="queue"></div>
      </div>
    </section>

    <section class="detail-grid">
      <div class="panel">
        <div class="section-title">
          <h2>Selected Job</h2>
          <span class="muted" id="detail-label">select a job</span>
        </div>
        <div id="job-summary"><p>No job selected.</p></div>
        <div class="toolbar" id="job-controls"></div>
        <div class="flash" id="flash"></div>
        <div id="job-artifacts"></div>
        <div style="margin-top: 16px;">
          <h3 style="margin-bottom: 10px;">Raw Detail</h3>
          <pre class="code" id="job-detail">No job selected.</pre>
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <h2>Live Logs</h2>
          <span class="muted" id="log-status">waiting for selection</span>
        </div>
        <div class="log-panel" id="job-logs"></div>
      </div>
    </section>
  </div>

  <script>
    const state = {
      selectedJobId: null,
      jobs: [],
      queue: [],
      recoverable: [],
      detail: null,
      logs: [],
      seenLogIds: new Set(),
      eventSource: null
    };

    function pill(text) {
      return '<span class="pill">' + text + '</span>';
    }

    function escapeHtml(text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function flash(message, tone) {
      const node = document.getElementById('flash');
      node.className = 'flash' + (tone ? ' ' + tone : '');
      node.textContent = message || '';
    }

    function appendLogs(entries) {
      for (const entry of entries) {
        if (!entry || state.seenLogIds.has(entry.id)) {
          continue;
        }
        state.seenLogIds.add(entry.id);
        state.logs.push(entry);
      }
      state.logs = state.logs.slice(-250);
      const recentIds = new Set(state.logs.map((entry) => entry.id));
      state.seenLogIds = recentIds;
      renderLogs();
    }

    function renderStats() {
      const running = state.jobs.filter((job) => job.status === 'running').length;
      const paused = state.jobs.filter((job) => job.status === 'paused').length;
      const waitingReview = state.jobs.filter((job) => job.status === 'waiting_review').length;
      const queued = state.queue.filter((job) => job.status === 'queued').length;
      document.getElementById('stats').innerHTML = [
        ['Jobs', state.jobs.length],
        ['Running', running],
        ['Paused', paused],
        ['Review', waitingReview],
        ['Queued', queued]
      ].map(([label, value]) =>
        '<div class="stat"><strong>' + value + '</strong><span>' + label + '</span></div>'
      ).join('');

      document.getElementById('recoverable').innerHTML = state.recoverable.length === 0
        ? '<p>No stale recoverable jobs.</p>'
        : '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Lease</th></tr></thead><tbody>' +
          state.recoverable.map((job) =>
            '<tr><td>' + escapeHtml(job.title) + '<div class="muted">' + escapeHtml(job.jobId) + '</div></td><td>' + pill(job.status) + '</td><td>' + escapeHtml(job.leaseExpiresAt || '-') + '</td></tr>'
          ).join('') +
          '</tbody></table></div>';
    }

    function queueActionButtons(item) {
      const actions = [];
      if (item.status === 'queued') {
        actions.push(['pause', 'Pause', 'btn-warning']);
        actions.push(['cancel', 'Cancel', 'btn-danger']);
      }
      if (item.status === 'paused') {
        actions.push(['resume', 'Resume', 'btn-accent']);
        actions.push(['cancel', 'Cancel', 'btn-danger']);
      }
      if (item.status === 'running') {
        actions.push(['pause', 'Pause', 'btn-warning']);
        actions.push(['cancel', 'Cancel', 'btn-danger']);
      }
      if (item.status === 'failed' || item.status === 'cancelled') {
        actions.push(['retry', 'Retry', 'btn-accent']);
      }
      return '<div class="action-stack">' + actions.map(([action, label, cls]) =>
        '<button class="btn ' + cls + '" data-queue-action="' + action + '" data-queue-id="' + item.queueId + '">' + label + '</button>'
      ).join('') + '</div>';
    }

    function renderJobs() {
      document.getElementById('jobs').innerHTML = state.jobs.length === 0
        ? '<p>No jobs found.</p>'
        : '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Workflow</th><th>Control</th><th>Updated</th></tr></thead><tbody>' +
          state.jobs.map((job) =>
            '<tr><td><button class="rowlink" data-job-id="' + escapeHtml(job.jobId) + '">' + escapeHtml(job.title) + '</button><div class="muted">' + escapeHtml(job.jobId) + '</div></td><td>' + pill(job.status) + '</td><td>' + escapeHtml(job.workflowName || '-') + '</td><td>' + (job.controlAction ? pill(job.controlAction + ' requested') : '-') + '</td><td>' + escapeHtml(job.updatedAt) + '</td></tr>'
          ).join('') +
          '</tbody></table></div>';

      document.querySelectorAll('[data-job-id]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedJobId = button.getAttribute('data-job-id');
          loadJobDetail();
        });
      });
    }

    function renderQueue() {
      document.getElementById('queue').innerHTML = state.queue.length === 0
        ? '<p>No queued jobs.</p>'
        : '<div class="table-wrap"><table><thead><tr><th>Queue ID</th><th>Status</th><th>Attempts</th><th>Linked Job</th><th>Label</th><th>Actions</th></tr></thead><tbody>' +
          state.queue.map((item) =>
            '<tr><td>' + escapeHtml(item.queueId) + '</td><td>' + pill(item.status) + (item.controlAction ? '<div class="muted">' + escapeHtml(item.controlAction) + ' requested</div>' : '') + '</td><td>' + item.attempts + '/' + item.maxAttempts + '</td><td>' + escapeHtml(item.jobId || '-') + '</td><td>' + escapeHtml(item.label) + '</td><td>' + queueActionButtons(item) + '</td></tr>'
          ).join('') +
          '</tbody></table></div>';

      document.querySelectorAll('[data-queue-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const queueId = button.getAttribute('data-queue-id');
          const action = button.getAttribute('data-queue-action');
          if (!queueId || !action) {
            return;
          }
          await postJson('/api/queue/' + encodeURIComponent(queueId) + '/control', { action });
          await refresh();
          if (state.selectedJobId) {
            await loadJobDetail();
          }
        });
      });
    }

    function jobActionButtons(job) {
      if (!job) {
        return '';
      }
      const actions = [];
      if (job.status === 'planning' || job.status === 'running') {
        actions.push(['pause', 'Pause', 'btn-warning']);
        actions.push(['cancel', 'Cancel', 'btn-danger']);
      }
      if (job.status === 'paused') {
        actions.push(['resume', 'Resume', 'btn-accent']);
        actions.push(['cancel', 'Cancel', 'btn-danger']);
      }
      if (job.status === 'waiting_review') {
        actions.push(['cancel', 'Cancel', 'btn-danger']);
      }
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        actions.push(['rerun', 'Rerun', 'btn-accent']);
      }
      return actions.map(([action, label, cls]) =>
        '<button class="btn ' + cls + '" data-job-action="' + action + '">' + label + '</button>'
      ).join('');
    }

    function linkedQueueForJob(jobId) {
      return state.queue
        .filter((item) => item.jobId === jobId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] || null;
    }

    function renderJobSummary() {
      if (!state.detail) {
        document.getElementById('job-summary').innerHTML = '<p>No job selected.</p>';
        document.getElementById('job-controls').innerHTML = '';
        document.getElementById('job-artifacts').innerHTML = '';
        document.getElementById('job-detail').textContent = 'No job selected.';
        return;
      }

      const job = state.detail.job;
      const steps = Array.isArray(state.detail.steps) ? state.detail.steps : [];
      const artifacts = Array.isArray(state.detail.artifacts) ? state.detail.artifacts : [];
      const events = Array.isArray(state.detail.events) ? state.detail.events : [];
      const graph = state.detail.evidenceGraph;
      const linkedQueue = linkedQueueForJob(job.jobId);
      const graphState = graph.danglingEdges > 0 || graph.orphanNodes > 0 ? 'warning' : '';
      const artifactRows = artifacts.length === 0
        ? '<p>No tracked artifacts yet.</p>'
        : '<div class="table-wrap"><table><thead><tr><th>Artifact</th><th>Type</th><th>Path</th><th>Size</th><th>Updated</th></tr></thead><tbody>' +
          artifacts.map((artifact) =>
            '<tr><td>' + escapeHtml(artifact.artifactKey) + '</td><td>' + escapeHtml(artifact.artifactType) + '</td><td>' + escapeHtml(artifact.path) + '</td><td>' + escapeHtml(String(artifact.metadata?.sizeBytes ?? '-')) + '</td><td>' + escapeHtml(artifact.updatedAt) + '</td></tr>'
          ).join('') +
          '</tbody></table></div>';

      document.getElementById('detail-label').textContent = job.title + ' (' + job.status + ')';
      document.getElementById('job-summary').innerHTML = [
        '<div class="grid-cards">',
        '<div class="mini-card"><strong>Job</strong><div>' + escapeHtml(job.jobId) + '</div></div>',
        '<div class="mini-card"><strong>Status</strong><div>' + pill(job.status) + (job.controlAction ? ' ' + pill(job.controlAction + ' requested') : '') + '</div></div>',
        '<div class="mini-card"><strong>Workflow</strong><div>' + escapeHtml(job.workflowName || '-') + '</div></div>',
        '<div class="mini-card"><strong>Queue Link</strong><div>' + escapeHtml(linkedQueue ? linkedQueue.queueId : '-') + '</div></div>',
        '<div class="mini-card"><strong>Steps</strong><div>' + steps.length + ' tracked</div></div>',
        '<div class="mini-card"><strong>Artifacts</strong><div>' + artifacts.length + ' tracked</div></div>',
        '<div class="mini-card"><strong>Events</strong><div>' + events.length + ' recent</div></div>',
        '<div class="mini-card"><strong>Evidence Graph</strong><div>' + graph.nodes + ' nodes / ' + graph.edges + ' edges' + (graphState ? '<div class="muted ' + graphState + '">' + graph.danglingEdges + ' dangling, ' + graph.orphanNodes + ' orphan</div>' : '') + '</div></div>',
        '<div class="mini-card"><strong>Cache</strong><div>' + escapeHtml(job.cachePath || '-') + '</div></div>',
        '<div class="mini-card"><strong>Report</strong><div>' + escapeHtml(job.reportPath || '-') + '</div></div>',
        '</div>'
      ].join('');
      document.getElementById('job-controls').innerHTML = jobActionButtons(job);
      document.getElementById('job-artifacts').innerHTML = [
        '<div class="section-title" style="margin-top: 16px;">',
        '<h3>Artifacts</h3>',
        '<span class="muted">tracked outputs and file metadata</span>',
        '</div>',
        artifactRows
      ].join('');
      document.getElementById('job-detail').textContent = JSON.stringify(state.detail, null, 2);

      document.querySelectorAll('[data-job-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const action = button.getAttribute('data-job-action');
          if (!action || !state.selectedJobId) {
            return;
          }
          await postJson('/api/jobs/' + encodeURIComponent(state.selectedJobId) + '/control', { action });
          await refresh();
          await loadJobDetail();
        });
      });
    }

    function renderLogs() {
      const node = document.getElementById('job-logs');
      if (state.logs.length === 0) {
        node.innerHTML = '<div class="muted">No events yet.</div>';
        return;
      }
      node.innerHTML = state.logs.map((entry) =>
        '<div class="log-line"><span class="log-time">' + escapeHtml(new Date(entry.createdAt).toLocaleTimeString()) + '</span><span class="log-type">' + escapeHtml(entry.eventType) + '</span><span>' + escapeHtml(entry.message) + '</span></div>'
      ).join('');
      node.scrollTop = node.scrollHeight;
    }

    async function postJson(url, body) {
      flash('working...', '');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body || {})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        flash(payload.error || 'request failed', 'danger');
        return payload;
      }
      flash(payload.message || 'action applied', '');
      return payload;
    }

    function closeEventStream() {
      if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
      }
    }

    function openLogStream(jobId) {
      closeEventStream();
      document.getElementById('log-status').textContent = 'streaming live events';
      state.eventSource = new EventSource('/api/jobs/' + encodeURIComponent(jobId) + '/events/stream');
      state.eventSource.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse(event.data);
          appendLogs([payload]);
        } catch {
          // Ignore malformed stream events.
        }
      });
      state.eventSource.addEventListener('snapshot', (event) => {
        try {
          const payload = JSON.parse(event.data);
          appendLogs(Array.isArray(payload.events) ? payload.events : []);
        } catch {
          // Ignore malformed stream snapshots.
        }
      });
      state.eventSource.onerror = () => {
        document.getElementById('log-status').textContent = 'stream reconnecting...';
      };
    }

    async function loadJobDetail() {
      if (!state.selectedJobId) {
        return;
      }
      const response = await fetch('/api/jobs/' + encodeURIComponent(state.selectedJobId));
      if (!response.ok) {
        flash('failed to load job detail', 'danger');
        return;
      }
      state.detail = await response.json();
      state.logs = [];
      state.seenLogIds = new Set();
      appendLogs(state.detail.events || []);
      renderJobSummary();
      openLogStream(state.selectedJobId);
    }

    async function refresh() {
      const loadJson = async (url, fallback, label) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || payload.error || ('request failed for ' + label));
          }
          return await response.json();
        } catch (error) {
          flash(label + ' refresh failed: ' + (error instanceof Error ? error.message : String(error)), 'warning');
          return fallback;
        }
      };

      const [jobs, queue, recoverable] = await Promise.all([
        loadJson('/api/jobs', state.jobs, 'jobs'),
        loadJson('/api/queue', state.queue, 'queue'),
        loadJson('/api/recoverable', state.recoverable, 'recoverable runs')
      ]);
      state.jobs = Array.isArray(jobs) ? jobs : state.jobs;
      state.queue = Array.isArray(queue) ? queue : state.queue;
      state.recoverable = Array.isArray(recoverable) ? recoverable : state.recoverable;
      renderStats();
      renderJobs();
      renderQueue();
      document.getElementById('refresh-status').textContent = 'refreshed ' + new Date().toLocaleTimeString();
      if (state.selectedJobId) {
        const stillExists = state.jobs.some((job) => job.jobId === state.selectedJobId);
        if (stillExists) {
          await loadJobDetail();
        }
      }
    }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}

export function createManagementServer(options?: ManagementServerOptions): http.Server {
  return http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const method = req.method ?? "GET";
      const parsedUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (method === "GET" && parsedUrl.pathname === "/") {
        sendHtml(res, dashboardHtml());
        return;
      }

      if (method === "GET" && parsedUrl.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true
        });
        return;
      }

      if (method === "GET" && parsedUrl.pathname === "/api/jobs") {
        sendJson(res, 200, listStoredJobs({
          databasePath: options?.databasePath
        }));
        return;
      }

      if (method === "GET" && parsedUrl.pathname.startsWith("/api/jobs/") && parsedUrl.pathname.endsWith("/events/stream")) {
        const jobId = decodeURIComponent(
          parsedUrl.pathname.replace("/api/jobs/", "").replace("/events/stream", "")
        );
        sendSseHeaders(res);
        const initial = listJobRunEvents({
          databasePath: options?.databasePath,
          jobId,
          limit: 200
        });
        let cursor = initial.at(-1)?.createdAt ?? null;
        sendSseEvent(res, "snapshot", {
          events: initial
        });

        const timer = setInterval(() => {
          const events = listJobRunEvents({
            databasePath: options?.databasePath,
            jobId,
            afterCreatedAt: cursor,
            limit: 200
          });
          if (events.length > 0) {
            cursor = events.at(-1)?.createdAt ?? cursor;
            for (const event of events) {
              sendSseEvent(res, "log", event);
            }
          }
        }, 1500);

        req.on("close", () => {
          clearInterval(timer);
          res.end();
        });
        return;
      }

      if (method === "GET" && parsedUrl.pathname.startsWith("/api/jobs/") && parsedUrl.pathname.endsWith("/events")) {
        const jobId = decodeURIComponent(
          parsedUrl.pathname.replace("/api/jobs/", "").replace("/events", "")
        );
        sendJson(res, 200, listJobRunEvents({
          databasePath: options?.databasePath,
          jobId,
          afterCreatedAt: parsedUrl.searchParams.get("after"),
          limit: parsedUrl.searchParams.get("limit")
            ? Number(parsedUrl.searchParams.get("limit"))
            : undefined
        }));
        return;
      }

      if (method === "GET" && parsedUrl.pathname.startsWith("/api/jobs/")) {
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

      if (method === "POST" && parsedUrl.pathname.startsWith("/api/jobs/") && parsedUrl.pathname.endsWith("/control")) {
        const jobId = decodeURIComponent(
          parsedUrl.pathname.replace("/api/jobs/", "").replace("/control", "")
        );
        const body = await readJsonBody(req);
        const action = body.action;

        if (action === "pause" || action === "cancel") {
          const job = requestAgentJobControl({
            databasePath: options?.databasePath,
            jobId,
            action: action as JobControlAction
          });
          if (!job) {
            notFound(res);
            return;
          }
          sendJson(res, 200, {
            ok: true,
            message: `${action} requested`,
            job
          });
          return;
        }

        if (action === "resume") {
          const resumed = resumeAgentJob({
            databasePath: options?.databasePath,
            jobId
          });
          sendJson(res, 200, {
            ok: true,
            message: resumed.resumedExistingQueue ? "paused queue resumed" : "resume job enqueued",
            ...resumed
          });
          return;
        }

        if (action === "rerun") {
          const rerun = rerunAgentJob({
            databasePath: options?.databasePath,
            jobId
          });
          sendJson(res, 200, {
            ok: true,
            message: "rerun enqueued",
            ...rerun
          });
          return;
        }

        sendJson(res, 400, {
          error: "invalid_job_control_action"
        });
        return;
      }

      if (method === "GET" && parsedUrl.pathname === "/api/queue") {
        sendJson(res, 200, listQueuedJobs({
          databasePath: options?.databasePath
        }));
        return;
      }

      if (method === "POST" && parsedUrl.pathname.startsWith("/api/queue/") && parsedUrl.pathname.endsWith("/control")) {
        const queueId = decodeURIComponent(
          parsedUrl.pathname.replace("/api/queue/", "").replace("/control", "")
        );
        const before = getQueuedJob({
          databasePath: options?.databasePath,
          queueId
        });
        if (!before) {
          notFound(res);
          return;
        }

        const body = await readJsonBody(req);
        const action = body.action as QueueControlAction;
        const queue = controlQueuedJob({
          databasePath: options?.databasePath,
          queueId,
          action
        });

        if ((action === "pause" || action === "cancel") && before.status === "running" && before.jobId) {
          requestAgentJobControl({
            databasePath: options?.databasePath,
            jobId: before.jobId,
            action
          });
        }

        sendJson(res, 200, {
          ok: true,
          message: `${action} applied to queue item`,
          queue
        });
        return;
      }

      if (method === "GET" && parsedUrl.pathname === "/api/recoverable") {
        sendJson(res, 200, listRecoverableJobs({
          databasePath: options?.databasePath
        }));
        return;
      }

      if (method !== "GET" && method !== "POST") {
        methodNotAllowed(res);
        return;
      }

      notFound(res);
    } catch (error) {
      sendJson(res, 500, {
        error: "server_error",
        message: error instanceof Error ? error.stack ?? error.message : String(error)
      });
    }
  });
}
