import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import CDP = require("chrome-remote-interface");

import { writeBufferAtomic } from "./cache";
import { redactSensitiveText } from "./redaction";
import { SourceAcquisitionPolicy } from "./source-acquisition-policy";
import type { SourceAcquisitionDecision } from "./source-acquisition-policy";
import type {
  CDPClient,
  LocatedElement,
  NetworkIdleOptions,
  WaitForSelectorOptions
} from "../types";

export const DEBUG_PORT = Number(process.env.CDP_PORT ?? process.env.CHROME_PORT ?? "9222");
const execFileAsync = promisify(execFile);
const LIGHTPANDA_START_SCRIPT = path.resolve(process.cwd(), "scripts", "start-lightpanda.sh");

type CdpEventListener = (...args: unknown[]) => void;

type CdpEventEmitter = {
  on(event: string, listener: CdpEventListener): unknown;
  once(event: string, listener: CdpEventListener): unknown;
  removeListener(event: string, listener: CdpEventListener): unknown;
  off?: (event: string, listener: CdpEventListener) => unknown;
};

type SessionCommandSender = (
  method: string,
  params: object | undefined,
  sessionId: string
) => Promise<unknown>;

type NetworkActivity = {
  inFlight: Set<string>;
  lastActivityAt: number;
};

const networkActivityByClient = new WeakMap<CDPClient, NetworkActivity>();

function sendSessionCommand(
  client: CDP.Client,
  method: string,
  params: object | undefined,
  sessionId: string
): Promise<unknown> {
  // CRI types `send` with generated command names; this session proxy receives a dynamic name.
  const send = client.send as unknown as SessionCommandSender;
  return send.call(client, method, params, sessionId);
}

export type CdpBackendKind = "lightpanda" | "chrome" | "unknown" | "unavailable";

export interface CdpBackendStatus {
  endpoint: string;
  port: number;
  backend: CdpBackendKind;
  browser: string | null;
  protocolVersion: string | null;
  reachable: boolean;
  message: string;
}

type LightpandaCommandAction = "start" | "restart";
type LightpandaCommandRunner = (action: LightpandaCommandAction) => Promise<void>;

export interface CreatePageSessionOptions {
  userAgent?: string;
  requestTargetPolicy?: (url: string) => Promise<SourceAcquisitionDecision>;
  onMainFrameBlocked?: (decision: SourceAcquisitionDecision) => void;
}

export interface RequestPolicyGuard {
  mainFrameDenial: () => SourceAcquisitionDecision | null;
  blockedMainFrame: Promise<SourceAcquisitionDecision>;
}

let lightpandaCommandRunner: LightpandaCommandRunner = async (action) => {
  if (!fs.existsSync(LIGHTPANDA_START_SCRIPT)) {
    throw new Error(`missing Lightpanda start script: ${LIGHTPANDA_START_SCRIPT}`);
  }

  await execFileAsync(LIGHTPANDA_START_SCRIPT, [action], {
    env: process.env,
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024
  });
};
let activeLightpandaCommand: Promise<void> | null = null;

function randomInt(min: number, max: number): number {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export async function sleep(ms: number, jitterRatio: number = 0.18): Promise<void> {
  const spread = Math.max(0, Math.round(ms * jitterRatio));
  const actualMs = spread === 0 ? ms : randomInt(Math.max(0, ms - spread), ms + spread);
  await new Promise((resolve) => setTimeout(resolve, actualMs));
}

function logLightpandaSupervisor(message: string): void {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${redactSensitiveText(message)}`);
}

export function classifyCdpBackend(browser: string | null | undefined): CdpBackendKind {
  const normalized = String(browser ?? "").toLowerCase();
  if (normalized.includes("lightpanda")) return "lightpanda";
  if (normalized.includes("chrome") || normalized.includes("chromium")) return "chrome";
  return normalized ? "unknown" : "unavailable";
}

/**
 * Inspect the configured local CDP endpoint without starting, restarting, or
 * attaching to a browser. This is deliberately safe to run before a live job.
 */
export async function inspectCdpBackend(timeoutMs: number = 1_500): Promise<CdpBackendStatus> {
  const endpoint = `http://127.0.0.1:${DEBUG_PORT}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${endpoint}/json/version`, {
      signal: controller.signal,
      redirect: "error"
    });
    if (!response.ok) {
      return {
        endpoint,
        port: DEBUG_PORT,
        backend: "unavailable",
        browser: null,
        protocolVersion: null,
        reachable: false,
        message: `CDP endpoint returned HTTP ${response.status}`
      };
    }

    const payload = (await response.json()) as { Browser?: unknown; "Protocol-Version"?: unknown };
    const browser = typeof payload.Browser === "string" ? payload.Browser : null;
    const protocolVersion =
      typeof payload["Protocol-Version"] === "string" ? payload["Protocol-Version"] : null;
    const backend = classifyCdpBackend(browser);
    return {
      endpoint,
      port: DEBUG_PORT,
      backend,
      browser,
      protocolVersion,
      reachable: true,
      message:
        backend === "lightpanda"
          ? "Lightpanda CDP endpoint is reachable."
          : backend === "chrome"
            ? "Chrome/Chromium CDP endpoint is reachable."
            : "A reachable CDP endpoint reported an unrecognized browser name."
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      endpoint,
      port: DEBUG_PORT,
      backend: "unavailable",
      browser: null,
      protocolVersion: null,
      reachable: false,
      message: `CDP endpoint is not reachable: ${reason}`
    };
  } finally {
    clearTimeout(timer);
  }
}

async function isDebuggerReachable(timeoutMs: number = 1_500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, {
      signal: controller.signal,
      redirect: "error"
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runLightpandaCommand(action: LightpandaCommandAction, reason?: string): Promise<void> {
  if (!activeLightpandaCommand) {
    activeLightpandaCommand = (async () => {
      if (reason) {
        logLightpandaSupervisor(
          `${action === "restart" ? "restarting" : "starting"} Lightpanda automatically: ${reason}`
        );
      } else {
        logLightpandaSupervisor(
          `${action === "restart" ? "restarting" : "starting"} Lightpanda automatically`
        );
      }
      await lightpandaCommandRunner(action);
    })().finally(() => {
      activeLightpandaCommand = null;
    });
  }

  await activeLightpandaCommand;
}

export function configureLightpandaCommandRunnerForTests(
  runner: LightpandaCommandRunner | null
): void {
  lightpandaCommandRunner =
    runner ??
    (async (action) => {
      if (!fs.existsSync(LIGHTPANDA_START_SCRIPT)) {
        throw new Error(`missing Lightpanda start script: ${LIGHTPANDA_START_SCRIPT}`);
      }

      await execFileAsync(LIGHTPANDA_START_SCRIPT, [action], {
        env: process.env,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024
      });
    });
  activeLightpandaCommand = null;
}

export function isRecoverableCdpError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return [
    /websocket connection closed/i,
    /websocket is not open/i,
    /cdp server not reachable/i,
    /failed to get json\/version/i,
    /fetch failed/i,
    /target closed/i,
    /session closed/i,
    /inspector\.detached/i,
    /socket hang up/i,
    /econnrefused/i,
    /econnreset/i,
    /err_connection_refused/i
  ].some((pattern) => pattern.test(message));
}

export async function withLightpandaRecovery<T>(input: {
  label: string;
  task: () => Promise<T>;
  maxAttempts?: number;
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
}): Promise<T> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await input.task();
    } catch (error) {
      attempt += 1;
      const canRetry = attempt < maxAttempts && isRecoverableCdpError(error);
      if (!canRetry) {
        throw error;
      }

      await input.onRetry?.(attempt, error);
      await ensureDebuggerReady({
        forceRestart: true,
        reason: `${input.label} failed with a recoverable CDP error`
      });
    }
  }

  throw new Error(`Lightpanda recovery exhausted for ${input.label}`);
}

/**
 * Verify the Lightpanda CDP server is reachable.
 */
export async function ensureDebuggerReady(options?: {
  forceRestart?: boolean;
  reason?: string;
}): Promise<void> {
  if (!options?.forceRestart) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await isDebuggerReachable()) {
        return;
      }
      if (attempt < 2) {
        await sleep(500, 0.05);
      }
    }
  }

  await runLightpandaCommand(options?.forceRestart ? "restart" : "start", options?.reason);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isDebuggerReachable()) {
      return;
    }
    await sleep(250, 0.05);
  }

  throw new Error(
    `lightpanda CDP server not reachable on 127.0.0.1:${DEBUG_PORT} after automatic ${
      options?.forceRestart ? "restart" : "start"
    }`
  );
}

async function enableCoreDomains(client: CDPClient): Promise<void> {
  await client.Page.enable();
  await client.Runtime.enable();
  await client.DOM.enable();
  await client.Network.enable();
}

export async function installRequestPolicy(
  client: CDPClient,
  checkTarget: (url: string) => Promise<SourceAcquisitionDecision>,
  onMainFrameBlocked?: (decision: SourceAcquisitionDecision) => void
): Promise<RequestPolicyGuard> {
  let mainFrameId: string | undefined;
  let denial: SourceAcquisitionDecision | null = null;
  let resolveBlockedMainFrame!: (decision: SourceAcquisitionDecision) => void;
  const blockedMainFrame = new Promise<SourceAcquisitionDecision>((resolve) => {
    resolveBlockedMainFrame = resolve;
  });

  client.on("Fetch.requestPaused", async (event: {
    requestId: string;
    request: { url: string };
    frameId: string;
    resourceType: string;
  }) => {
    const mainDocument = event.resourceType === "Document" &&
      (mainFrameId === undefined || event.frameId === mainFrameId);
    if (mainDocument && mainFrameId === undefined) mainFrameId = event.frameId;

    let decision: SourceAcquisitionDecision;
    try {
      decision = await checkTarget(event.request.url);
    } catch {
      decision = {
        action: "deny",
        reason: "source acquisition could not validate browser request target",
        signals: ["request_target_validation_failed", "human_review_required"],
        waitedMs: 0
      };
    }

    try {
      if (decision.action === "deny") {
        if (mainDocument && !denial) {
          denial = decision;
          resolveBlockedMainFrame(decision);
          try {
            onMainFrameBlocked?.(decision);
          } catch {
            // A reporting callback must not leave the browser request paused.
          }
        }
        await client.Fetch.failRequest({ requestId: event.requestId, errorReason: "BlockedByClient" });
      } else {
        await client.Fetch.continueRequest({ requestId: event.requestId });
      }
    } catch {
      try {
        await client.Fetch.failRequest({ requestId: event.requestId, errorReason: "BlockedByClient" });
      } catch {
        // The browser may close the session while a request is being denied.
      }
    }
  });

  await client.Fetch.enable({
    patterns: [{ urlPattern: "*", requestStage: "Request" }]
  });

  return { mainFrameDenial: () => denial, blockedMainFrame };
}

export async function closePageSessionResources(
  client: CDP.Client,
  targetId: string | undefined,
  browserContextId: string | undefined,
  stopTrackingNetworkActivity: () => void
): Promise<void> {
  try {
    stopTrackingNetworkActivity();
  } catch {
    // Continue closing browser resources if listener cleanup fails.
  }
  if (targetId) {
    try {
      await client.Target.closeTarget({ targetId });
    } catch {
      // Continue disposing the context if the target already closed.
    }
  }
  if (browserContextId) {
    try {
      await client.Target.disposeBrowserContext({ browserContextId });
    } catch {
      // The browser may already have disposed the context.
    }
  }
  try {
    await client.close();
  } catch {
    // Ignore errors when closing an already-disconnected browser.
  }
}

/**
 * Create a new CDP session by connecting directly to the Lightpanda WebSocket.
 * Each call creates an independent page context.
 */
export async function createPageSession(url?: string, options?: CreatePageSessionOptions): Promise<CDPClient> {
  await ensureDebuggerReady();

  const versionResp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, {
    redirect: "error"
  });
  if (!versionResp.ok) {
    throw new Error(`failed to get json/version from lightpanda (HTTP ${versionResp.status})`);
  }
  const versionInfo: unknown = await versionResp.json();
  if (
    !versionInfo ||
    typeof versionInfo !== "object" ||
    Array.isArray(versionInfo) ||
    typeof (versionInfo as Record<string, unknown>).webSocketDebuggerUrl !== "string"
  ) {
    throw new Error("CDP endpoint returned an invalid WebSocket debugger URL");
  }
  const webSocketDebuggerUrl = new URL(
    (versionInfo as Record<string, string>).webSocketDebuggerUrl
  );
  if (
    webSocketDebuggerUrl.protocol !== "ws:" ||
    !["127.0.0.1", "[::1]"].includes(webSocketDebuggerUrl.hostname) ||
    Number(webSocketDebuggerUrl.port || "80") !== DEBUG_PORT ||
    webSocketDebuggerUrl.username !== "" ||
    webSocketDebuggerUrl.password !== ""
  ) {
    throw new Error("refusing non-local CDP WebSocket URL");
  }

  // Connect to the root browser WebSocket
  const rootClient = await CDP({
    target: webSocketDebuggerUrl.toString(),
    local: true
  });

  let browserContextId: string | undefined;
  let targetId: string | undefined;
  let stopTrackingNetworkActivity: () => void = () => undefined;
  let closePromise: Promise<void> | undefined;
  const closeSession = (): Promise<void> => closePromise ??= closePageSessionResources(
    rootClient,
    targetId,
    browserContextId,
    () => stopTrackingNetworkActivity()
  );

  let proxyClient: CDPClient;
  try {
    // Create a new independent browser context and target.
    const context = await rootClient.Target.createBrowserContext();
    browserContextId = context.browserContextId;
    const target = await rootClient.Target.createTarget({
      url: "about:blank",
      browserContextId: context.browserContextId
    });
    targetId = target.targetId;

    // Attach to the new target using a flat session.
    const { sessionId } = await rootClient.Target.attachToTarget({
      targetId: target.targetId,
      flatten: true
    });

    // Create a Proxy over the root client that automatically injects the sessionId
    // into all domain commands, making it look like a regular per-target CDPClient.
    proxyClient = new Proxy(rootClient, {
      get(targetClient, prop) {
        if (prop === 'close') return closeSession;
        if (prop === 'send') {
          return (method: string, params?: object) => sendSessionCommand(targetClient, method, params, sessionId);
        }

        // If accessing a Domain like 'Page', return a wrapped object
        if (typeof prop === "string") {
          const domain: unknown = Reflect.get(targetClient, prop);
          if (typeof domain === 'object' && domain !== null) {
            return new Proxy(domain, {
              get(domainTarget, domainProp) {
                const domainMember: unknown = Reflect.get(domainTarget, domainProp);
                if (typeof domainMember === 'function' && typeof domainProp === "string") {
                  // Intercept the domain method call (e.g., Page.navigate)
                  return (params?: object) => sendSessionCommand(targetClient, `${prop}.${domainProp}`, params, sessionId);
                }
                return domainMember;
              }
            });
          }
        }
        // Flat-session events include the session ID in their event name.
        if (prop === 'on') {
          const eventTarget = targetClient as CDP.Client & CdpEventEmitter;
          return (event: string, listener: CdpEventListener) => eventTarget.on(`${event}.${sessionId}`, listener);
        }
        if (prop === 'once') {
          const eventTarget = targetClient as CDP.Client & CdpEventEmitter;
          return (event: string, listener: CdpEventListener) => eventTarget.once(`${event}.${sessionId}`, listener);
        }
        if (prop === 'removeListener' || prop === 'off') {
          const eventTarget = targetClient as CDP.Client & CdpEventEmitter;
          return (event: string, listener: CdpEventListener) =>
            eventTarget.removeListener(`${event}.${sessionId}`, listener);
        }

        return Reflect.get(targetClient, prop);
      }
    }) as CDPClient;
  } catch (error) {
    await closeSession();
    throw error;
  }

  try {
    await enableCoreDomains(proxyClient);
    stopTrackingNetworkActivity = trackNetworkActivity(proxyClient);

    if (options?.userAgent) {
      await proxyClient.Network.setUserAgentOverride({ userAgent: options.userAgent });
    }

    const acquisitionPolicy = options?.requestTargetPolicy ? null : new SourceAcquisitionPolicy();
    await installRequestPolicy(
      proxyClient,
      options?.requestTargetPolicy ?? ((targetUrl) =>
        acquisitionPolicy!.checkNetworkTarget(targetUrl, { ignoreConfiguredAllowlist: true })),
      options?.onMainFrameBlocked
    );

    if (url) {
      await proxyClient.Page.navigate({ url });
      await waitForLoadEvent(proxyClient, 20_000);
    }

    return proxyClient;
  } catch (error) {
    await closeSession();
    throw error;
  }
}

/**
 * Disconnect a CDP session.
 */
export async function closePageSession(client: CDPClient): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore errors when closing (already disconnected, etc.)
  }
}

export async function captureScreenshot(client: CDPClient, outPath: string): Promise<string> {
  const image = await client.Page.captureScreenshot({ format: "png" });
  writeBufferAtomic(outPath, Buffer.from(String(image.data), "base64"));
  return outPath;
}

export async function clickPoint(
  client: CDPClient,
  x: number,
  y: number,
  options?: {
    button?: "left" | "middle" | "right" | "back" | "forward";
    modifiers?: number;
    holdMs?: number;
  }
): Promise<void> {
  const button = options?.button ?? "left";
  const modifiers = options?.modifiers ?? 0;
  await client.Input.dispatchMouseEvent({
    type: "mousePressed",
    x,
    y,
    button,
    modifiers,
    clickCount: 1
  });
  if ((options?.holdMs ?? 0) > 0) {
    await sleep(options?.holdMs ?? 0, 0.1);
  }
  await client.Input.dispatchMouseEvent({
    type: "mouseReleased",
    x,
    y,
    button,
    modifiers,
    clickCount: 1
  });
}

export async function typeWithKeyEvents(
  client: CDPClient,
  text: string,
  delayMs: number = 35
): Promise<void> {
  for (const char of Array.from(text)) {
    if (char === "\n") {
      await client.Input.dispatchKeyEvent({
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13
      });
      await client.Input.dispatchKeyEvent({
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13
      });
    } else if (char === "\t") {
      await client.Input.dispatchKeyEvent({
        type: "keyDown",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9
      });
      await client.Input.dispatchKeyEvent({
        type: "keyUp",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9
      });
    } else {
      await client.Input.dispatchKeyEvent({
        type: "char",
        text: char
      });
    }
    await sleep(delayMs, 0.22);
  }
}

function buildEvaluationExpression(expression: string, args: readonly unknown[]): string {
  const serializedArgs = JSON.stringify(args ?? []);

  return `
    (async () => {
      const __args = ${serializedArgs};
      const __serialize = (input) => {
        const replacer = (() => {
          const seen = new WeakSet();
          return (_key, value) => {
            if (typeof value === "bigint") {
              return Number(value);
            }
            if (typeof value === "undefined") {
              return null;
            }
            if (typeof value === "function") {
              return "[Function]";
            }
            if (typeof Element !== "undefined" && value instanceof Element) {
              const rect = value.getBoundingClientRect();
              return {
                tagName: value.tagName,
                id: value.id || null,
                className: value.className || null,
                text: (value.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160),
                href: typeof value.href === "string" ? value.href : null,
                bbox: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                }
              };
            }
            if (typeof Node !== "undefined" && value instanceof Node) {
              return {
                nodeName: value.nodeName
              };
            }
            if (value && typeof value === "object") {
              if (seen.has(value)) {
                return "[Circular]";
              }
              seen.add(value);
            }
            return value;
          };
        })();

        const json = JSON.stringify(input, replacer);
        return typeof json === "undefined" ? null : JSON.parse(json);
      };

      try {
        const __fn = (${expression});
        const __result =
          typeof __fn === "function" ? await __fn(...__args) : await __fn;
        return {
          ok: true,
          value: __serialize(__result)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? \`\${error.name}: \${error.message}\` : String(error),
          stack: error instanceof Error ? error.stack || null : null
        };
      }
    })()
  `;
}

export async function evaluateInBrowser<T>(
  client: CDPClient,
  expression: string,
  args: readonly unknown[] = []
): Promise<T> {
  await client.Runtime.enable();
  const payloadExpression = buildEvaluationExpression(expression, args);
  const response = await client.Runtime.evaluate({
    expression: payloadExpression,
    returnByValue: true,
    awaitPromise: true
  });

  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "browser evaluation failed");
  }

  const payload = response.result?.value as
    | { ok: true; value: T }
    | { ok: false; error?: string; stack?: string | null }
    | undefined;

  if (!payload) {
    throw new Error("browser evaluation returned an empty payload");
  }

  if (!payload.ok) {
    const details = payload.stack ? `\n${payload.stack}` : "";
    throw new Error(`${payload.error ?? "browser evaluation failed"}${details}`);
  }

  return payload.value;
}

export async function getCurrentUrl(client: CDPClient): Promise<string> {
  return evaluateInBrowser<string>(client, "() => window.location.href");
}

export async function navigateTo(
  client: CDPClient,
  url: string,
  options?: {
    timeoutMs?: number;
    waitForIdle?: boolean;
    idleTimeMs?: number;
    maxInflightRequests?: number;
    ignoreIdleTimeout?: boolean;
  }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  await client.Page.navigate({ url });
  await waitForLoadEvent(client, timeoutMs);
  if (options?.waitForIdle ?? true) {
    try {
      await waitForNetworkIdle(client, {
        timeoutMs,
        idleTimeMs: options?.idleTimeMs ?? 1_000,
        maxInflightRequests: options?.maxInflightRequests ?? 0
      });
    } catch (error) {
      if (!options?.ignoreIdleTimeout) {
        throw error;
      }
    }
  }
}

export async function waitForLoadEvent(client: CDPClient, timeoutMs: number = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const readyState = await evaluateInBrowser<string>(client, "() => document.readyState");
    if (readyState === "interactive" || readyState === "complete") {
      return;
    }
    await sleep(200, 0.05);
  }

  throw new Error(`timed out waiting for document readiness after ${timeoutMs}ms`);
}

export async function waitForSelector(
  client: CDPClient,
  selector: string,
  options?: WaitForSelectorOptions
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const pollMs = options?.pollMs ?? 250;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const found = await evaluateInBrowser<boolean>(
      client,
      `(selector) => {
        let element;
        try {
          element = document.querySelector(selector);
        } catch (error) {
          throw new Error(String(error));
        }

        if (!element) {
          return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }`,
      [selector]
    );

    if (found) {
      return;
    }

    await sleep(pollMs, 0.08);
  }

  throw new Error(`timed out waiting for selector "${selector}" after ${timeoutMs}ms`);
}

export async function waitForAnySelector(
  client: CDPClient,
  selectors: string[],
  options?: WaitForSelectorOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const pollMs = options?.pollMs ?? 250;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const matchedSelector = await evaluateInBrowser<string | null>(
      client,
      `(inputSelectors) => {
        for (const selector of inputSelectors) {
          let element;
          try {
            element = document.querySelector(selector);
          } catch (error) {
            throw new Error(String(error));
          }

          if (!element) {
            continue;
          }

          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0;

          if (visible) {
            return selector;
          }
        }
        return null;
      }`,
      [selectors]
    );

    if (matchedSelector) {
      return matchedSelector;
    }

    await sleep(pollMs, 0.08);
  }

  throw new Error(
    `timed out waiting for any selector after ${timeoutMs}ms: ${selectors.join(" | ")}`
  );
}

function attachClientEvent(
  client: CDPClient,
  eventName: string,
  handler: CdpEventListener
): () => void {
  const eventClient = client as CDPClient & CdpEventEmitter;
  if (typeof eventClient.on === "function" && typeof eventClient.off === "function") {
    eventClient.on(eventName, handler);
    return () => eventClient.off?.(eventName, handler);
  }

  return () => undefined;
}

function readRequestId(params: unknown): string | undefined {
  if (!params || typeof params !== "object" || !("requestId" in params)) return undefined;
  return typeof params.requestId === "string" ? params.requestId : undefined;
}

export function trackNetworkActivity(client: CDPClient): () => void {
  if (networkActivityByClient.has(client)) return () => undefined;

  const activity: NetworkActivity = { inFlight: new Set(), lastActivityAt: Date.now() };
  const markActivity = (): void => {
    activity.lastActivityAt = Date.now();
  };
  const onRequest: CdpEventListener = (...args) => {
    const requestId = readRequestId(args[0]);
    if (requestId) activity.inFlight.add(requestId);
    markActivity();
  };
  const onComplete: CdpEventListener = (...args) => {
    const requestId = readRequestId(args[0]);
    if (requestId) activity.inFlight.delete(requestId);
    markActivity();
  };

  const detachRequest = attachClientEvent(client, "Network.requestWillBeSent", onRequest);
  const detachFinished = attachClientEvent(client, "Network.loadingFinished", onComplete);
  const detachFailed = attachClientEvent(client, "Network.loadingFailed", onComplete);
  networkActivityByClient.set(client, activity);

  return () => {
    detachRequest();
    detachFinished();
    detachFailed();
    networkActivityByClient.delete(client);
  };
}

export async function waitForNetworkIdle(
  client: CDPClient,
  options?: NetworkIdleOptions
): Promise<void> {
  const idleTimeMs = options?.idleTimeMs ?? 1_000;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const maxInflightRequests = options?.maxInflightRequests ?? 0;
  const hasSessionTracking = networkActivityByClient.has(client);
  const stopTemporaryTracking = hasSessionTracking ? undefined : trackNetworkActivity(client);
  const activity = networkActivityByClient.get(client)!;

  try {
    if (!hasSessionTracking) await client.Network.enable();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idleForMs = Date.now() - activity.lastActivityAt;
      if (activity.inFlight.size <= maxInflightRequests && idleForMs >= idleTimeMs) {
        return;
      }
      await sleep(100, 0.04);
    }

    throw new Error(
      `timed out waiting for network idle after ${timeoutMs}ms (inFlight=${activity.inFlight.size})`
    );
  } finally {
    stopTemporaryTracking?.();
  }
}

export async function waitForLocationChange(
  client: CDPClient,
  previousUrl: string,
  timeoutMs: number = 20_000
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const currentUrl = await getCurrentUrl(client);
    if (currentUrl !== previousUrl) {
      return currentUrl;
    }
    await sleep(200, 0.07);
  }

  throw new Error(`timed out waiting for the location to change from ${previousUrl}`);
}

export async function locateElement(client: CDPClient, query: string): Promise<LocatedElement> {
  return evaluateInBrowser<LocatedElement>(
    client,
    `(rawQuery) => {
      const query = String(rawQuery || "").trim();
      // ponytail: cap DOM scans at 5,000 candidates and labels at 500 characters/200 text nodes; raise if real pages need more.
      const MAX_DOM_CANDIDATES = 5000;
      const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
      const readText = (element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let value = "";
        let nodesRead = 0;
        for (let node = walker.nextNode(); node && value.length < 500 && nodesRead < 200; node = walker.nextNode()) {
          nodesRead += 1;
          value += (node.nodeValue || "").slice(0, 500 - value.length);
        }
        return value;
      };
      const tooManyCandidates = (count) => ({
        status: "ambiguous",
        query,
        count,
        matches: []
      });
      const isSelector = (value) => {
        const raw = value.startsWith("css=") ? value.slice(4) : value;
        return raw.startsWith("#") ||
          raw.startsWith(".") ||
          raw.startsWith("[") ||
          raw.startsWith("a[") ||
          raw.startsWith("button") ||
          raw.startsWith("div") ||
          raw.startsWith("main") ||
          raw.startsWith("nav") ||
          raw.startsWith("section") ||
          raw.includes(">") ||
          raw.includes("[rel=") ||
          raw.includes("[data-");
      };
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const disabled = (element) =>
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true";
      const labelOf = (element) => {
        const candidate =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          readText(element) ||
          element.getAttribute("data-testid") ||
          element.getAttribute("href") ||
          "";
        return candidate.slice(0, 500).replace(/\\s+/g, " ").trim();
      };
      const build = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          status: "ok",
          query,
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          label: labelOf(element),
          href: typeof element.href === "string" ? element.href : null,
          disabled: disabled(element),
          bbox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2
          }
        };
      };

      if (!query) {
        return {
          status: "not_found",
          query,
          reason: "query is empty"
        };
      }

      if (isSelector(query)) {
        const selector = query.startsWith("css=") ? query.slice(4) : query;
        let selected;
        try {
          const matches = document.querySelectorAll(selector);
          if (matches.length > MAX_DOM_CANDIDATES) {
            return tooManyCandidates(matches.length);
          }
          selected = Array.from(matches).filter(visible);
        } catch (error) {
          return {
            status: "invalid_selector",
            query,
            reason: String(error)
          };
        }

        if (selected.length === 1) {
          return build(selected[0]);
        }

        if (selected.length > 1) {
          return {
            status: "ambiguous",
            query,
            count: selected.length,
            matches: selected.slice(0, 6).map(labelOf)
          };
        }

        return {
          status: "not_found",
          query,
          reason: "selector matched no visible elements"
        };
      }

      const selector =
        'a,button,[role="button"],[role="link"],summary,input[type="button"],input[type="submit"],label,div[tabindex],span[tabindex]';

      const candidates = document.querySelectorAll(selector);
      if (candidates.length > MAX_DOM_CANDIDATES) {
        return tooManyCandidates(candidates.length);
      }
      const pool = Array.from(candidates)
        .filter(visible)
        .map((element) => ({
          element,
          label: labelOf(element)
        }))
        .filter((item) => item.label.length > 0);

      const wanted = normalize(query);
      const exactMatches = pool.filter((item) => normalize(item.label) === wanted);
      if (exactMatches.length === 1) {
        return build(exactMatches[0].element);
      }
      if (exactMatches.length > 1) {
        return {
          status: "ambiguous",
          query,
          count: exactMatches.length,
          matches: exactMatches.slice(0, 6).map((item) => item.label)
        };
      }

      const partialMatches = pool.filter((item) => normalize(item.label).includes(wanted));
      if (partialMatches.length === 1) {
        return build(partialMatches[0].element);
      }
      if (partialMatches.length > 1) {
        return {
          status: "ambiguous",
          query,
          count: partialMatches.length,
          matches: partialMatches.slice(0, 6).map((item) => item.label)
        };
      }

      return {
        status: "not_found",
        query,
        reason: "no matching visible element found"
      };
    }`,
    [query]
  );
}
