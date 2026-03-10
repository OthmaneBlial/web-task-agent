import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import CDP = require("chrome-remote-interface");

import type {
  CDPClient,
  LocatedElement,
  NetworkIdleOptions,
  PageTarget,
  WaitForSelectorOptions
} from "../types";

export const DEBUG_PORT = Number(process.env.CHROME_PORT ?? "9222");

const STATE_DIR = path.join(os.homedir(), ".cache", "web-task-agent");
const STATE_PATH = path.join(STATE_DIR, "state.json");

interface BrowserState {
  recentTargetIds: string[];
}

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readState(): BrowserState {
  ensureStateDir();
  if (!fs.existsSync(STATE_PATH)) {
    return { recentTargetIds: [] };
  }

  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as BrowserState;
    if (!Array.isArray(parsed.recentTargetIds)) {
      return { recentTargetIds: [] };
    }
    return {
      recentTargetIds: parsed.recentTargetIds.map(String)
    };
  } catch {
    return { recentTargetIds: [] };
  }
}

function writeState(nextState: BrowserState): void {
  ensureStateDir();
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ recentTargetIds: nextState.recentTargetIds.slice(0, 60) }, null, 2),
    "utf8"
  );
}

function normalizeTarget(raw: Record<string, unknown>): PageTarget {
  return {
    id: String(raw.id ?? raw.targetId ?? ""),
    title: String(raw.title ?? ""),
    type: String(raw.type ?? ""),
    url: String(raw.url ?? ""),
    webSocketDebuggerUrl:
      typeof raw.webSocketDebuggerUrl === "string" ? raw.webSocketDebuggerUrl : undefined
  };
}

function isPageTarget(raw: Record<string, unknown>): boolean {
  const target = normalizeTarget(raw);
  if (target.type !== "page") {
    return false;
  }

  return !(
    target.url.startsWith("devtools://") ||
    target.url.startsWith("chrome-extension://") ||
    target.url.startsWith("chrome://")
  );
}

function orderTargetsByState(targets: PageTarget[]): PageTarget[] {
  const state = readState();

  return [...targets].sort((left, right) => {
    const leftIndex = state.recentTargetIds.indexOf(left.id);
    const rightIndex = state.recentTargetIds.indexOf(right.id);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return leftRank - rightRank;
  });
}

export function touchTarget(targetId: string): void {
  if (!targetId) {
    return;
  }

  const state = readState();
  state.recentTargetIds = [targetId, ...state.recentTargetIds.filter((id) => id !== targetId)];
  writeState(state);
}

export function forgetTarget(targetId: string): void {
  if (!targetId) {
    return;
  }

  const state = readState();
  state.recentTargetIds = state.recentTargetIds.filter((id) => id !== targetId);
  writeState(state);
}

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

export async function ensureDebuggerReady(): Promise<void> {
  try {
    await CDP.Version({ port: DEBUG_PORT });
  } catch {
    throw new Error(
      `chrome debugger not reachable on 127.0.0.1:${DEBUG_PORT}. run ./scripts/start-chrome.sh first`
    );
  }
}

async function listAllPageTargets(): Promise<PageTarget[]> {
  await ensureDebuggerReady();
  const rawTargets = (await CDP.List({ port: DEBUG_PORT })) as unknown as Array<Record<string, unknown>>;
  return rawTargets.filter(isPageTarget).map(normalizeTarget);
}

export async function listPageTargets(): Promise<PageTarget[]> {
  return orderTargetsByState(await listAllPageTargets());
}

export async function findTargetById(targetId: string): Promise<PageTarget | undefined> {
  const targets = await listAllPageTargets();
  return targets.find((target) => target.id === targetId);
}

export async function resolvePageTarget(index: number): Promise<PageTarget> {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("tab index must be a non-negative integer");
  }

  const targets = await listPageTargets();
  const target = targets[index];
  if (!target) {
    throw new Error(`tab index ${index} not found. currently available tabs: ${targets.length}`);
  }

  touchTarget(target.id);
  return target;
}

export async function openNewTab(url: string): Promise<PageTarget> {
  await ensureDebuggerReady();
  const created = normalizeTarget(
    (await CDP.New({ port: DEBUG_PORT, url })) as unknown as Record<string, unknown>
  );
  if (created.id) {
    touchTarget(created.id);
  }

  return (created.id ? await findTargetById(created.id) : undefined) ?? created;
}

export async function closeTarget(target: PageTarget): Promise<void> {
  if (!target.id) {
    throw new Error("cannot close a target without an id");
  }

  await ensureDebuggerReady();
  await CDP.Close({ id: target.id, port: DEBUG_PORT });
  forgetTarget(target.id);
}

async function enableCoreDomains(client: CDPClient): Promise<void> {
  await client.Page.enable();
  await client.Runtime.enable();
  await client.DOM.enable();
  await client.Network.enable();
}

export async function connectToTarget(target: PageTarget): Promise<CDPClient> {
  if (!target.webSocketDebuggerUrl) {
    const refreshed = await findTargetById(target.id);
    if (!refreshed?.webSocketDebuggerUrl) {
      throw new Error("unable to attach to target because the websocket debugger URL is missing");
    }
    target = refreshed;
  }

  const client = (await CDP({
    target: target.webSocketDebuggerUrl,
    port: DEBUG_PORT
  })) as CDPClient;

  await enableCoreDomains(client);
  touchTarget(target.id);
  return client;
}

export async function bringPageToFront(client: CDPClient): Promise<void> {
  await client.Page.enable();
  if (typeof client.Page.bringToFront === "function") {
    await client.Page.bringToFront();
  }
}

export async function captureScreenshot(client: CDPClient, outPath: string): Promise<string> {
  const image = await client.Page.captureScreenshot({ format: "png" });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(String(image.data), "base64"));
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
  handler: (...args: any[]) => void
): () => void {
  if (typeof client.on === "function" && typeof client.off === "function") {
    client.on(eventName, handler);
    return () => client.off(eventName, handler);
  }

  return () => undefined;
}

export async function waitForNetworkIdle(
  client: CDPClient,
  options?: NetworkIdleOptions
): Promise<void> {
  const idleTimeMs = options?.idleTimeMs ?? 1_000;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const maxInflightRequests = options?.maxInflightRequests ?? 0;
  const inFlight = new Set<string>();
  let lastActivityAt = Date.now();

  await client.Network.enable();

  const markActivity = (): void => {
    lastActivityAt = Date.now();
  };

  const onRequest = (params: { requestId?: string }): void => {
    if (params.requestId) {
      inFlight.add(params.requestId);
    }
    markActivity();
  };

  const onComplete = (params: { requestId?: string }): void => {
    if (params.requestId) {
      inFlight.delete(params.requestId);
    }
    markActivity();
  };

  const detachRequest = attachClientEvent(client, "Network.requestWillBeSent", onRequest);
  const detachFinished = attachClientEvent(client, "Network.loadingFinished", onComplete);
  const detachFailed = attachClientEvent(client, "Network.loadingFailed", onComplete);

  try {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idleForMs = Date.now() - lastActivityAt;
      if (inFlight.size <= maxInflightRequests && idleForMs >= idleTimeMs) {
        return;
      }
      await sleep(100, 0.04);
    }

    throw new Error(
      `timed out waiting for network idle after ${timeoutMs}ms (inFlight=${inFlight.size})`
    );
  } finally {
    detachRequest();
    detachFinished();
    detachFailed();
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
      const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
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
        const candidate = [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.textContent,
          element.getAttribute("data-testid"),
          element.getAttribute("href")
        ].find((value) => Boolean(value));
        return (candidate || "").replace(/\\s+/g, " ").trim();
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
          selected = Array.from(document.querySelectorAll(selector)).filter(visible);
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

      const pool = Array.from(document.querySelectorAll(selector))
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
