import type { BoundingBox, CDPClient, LocatedElement } from "../types";

import { clickPoint, evaluateInBrowser, locateElement, sleep } from "./cdp";

export interface HumanScrollOptions {
  distancePx?: number;
  direction?: "down" | "up";
  tickCount?: number;
}

export interface HumanClickOptions {
  modifiers?: number;
  holdMs?: number;
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function getViewportSize(
  client: CDPClient
): Promise<{ width: number; height: number; scrollY: number }> {
  return evaluateInBrowser<{ width: number; height: number; scrollY: number }>(
    client,
    "() => ({ width: window.innerWidth, height: window.innerHeight, scrollY: window.scrollY })"
  );
}

export async function moveMouseTo(
  client: CDPClient,
  x: number,
  y: number,
  options?: { fromX?: number; fromY?: number; steps?: number }
): Promise<void> {
  const steps = options?.steps ?? Math.floor(randomBetween(8, 16));
  const viewport = await getViewportSize(client);
  const startX = options?.fromX ?? randomBetween(viewport.width * 0.2, viewport.width * 0.8);
  const startY = options?.fromY ?? randomBetween(viewport.height * 0.2, viewport.height * 0.8);

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const eased = progress * progress * (3 - 2 * progress);
    const currentX = startX + (x - startX) * eased;
    const currentY = startY + (y - startY) * eased;
    await client.Input.dispatchMouseEvent({
      type: "mouseMoved",
      x: currentX,
      y: currentY,
      button: "none"
    });
    await sleep(12, 0.35);
  }
}

function randomPointInsideBox(box: BoundingBox): { x: number; y: number } {
  const horizontalPadding = Math.min(14, Math.max(4, box.width * 0.18));
  const verticalPadding = Math.min(12, Math.max(4, box.height * 0.18));
  return {
    x: clamp(randomBetween(box.x + horizontalPadding, box.x + box.width - horizontalPadding), box.x, box.x + box.width),
    y: clamp(
      randomBetween(box.y + verticalPadding, box.y + box.height - verticalPadding),
      box.y,
      box.y + box.height
    )
  };
}

export async function scrollElementIntoView(client: CDPClient, query: string): Promise<boolean> {
  const found = await evaluateInBrowser<boolean>(
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
          raw.includes(">") ||
          raw.includes("[rel=");
      };
      const labelOf = (element) =>
        [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.textContent,
          element.getAttribute("data-testid")
        ]
          .find((value) => Boolean(value))
          ?.replace(/\\s+/g, " ")
          .trim() || "";

      let element = null;
      if (isSelector(query)) {
        const selector = query.startsWith("css=") ? query.slice(4) : query;
        element = document.querySelector(selector);
      } else {
        const wanted = normalize(query);
        const selector =
          'a,button,[role="button"],[role="link"],summary,input[type="button"],input[type="submit"],label,div[tabindex],span[tabindex]';
        element =
          Array.from(document.querySelectorAll(selector)).find((candidate) => normalize(labelOf(candidate)) === wanted) ||
          Array.from(document.querySelectorAll(selector)).find((candidate) =>
            normalize(labelOf(candidate)).includes(wanted)
          ) ||
          null;
      }

      if (!element) {
        return false;
      }

      element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant"
      });
      return true;
    }`,
    [query]
  );

  if (found) {
    await sleep(220, 0.2);
  }

  return found;
}

async function bringElementIntoViewport(
  client: CDPClient,
  query: string,
  maxAttempts: number = 6
): Promise<LocatedElement> {
  let lastLocated = await locateElement(client, query);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (lastLocated.status === "ok" && lastLocated.bbox) {
      const viewport = await getViewportSize(client);
      const aboveViewport = lastLocated.bbox.centerY < 40;
      const belowViewport = lastLocated.bbox.centerY > viewport.height - 40;
      const horizontallyOffscreen =
        lastLocated.bbox.centerX < 0 || lastLocated.bbox.centerX > viewport.width;

      if (!aboveViewport && !belowViewport && !horizontallyOffscreen) {
        return lastLocated;
      }

      await humanScroll(client, {
        direction: aboveViewport ? "up" : "down",
        distancePx: viewport.height * randomBetween(0.45, 0.8),
        tickCount: Math.round(randomBetween(4, 8))
      });
      lastLocated = await locateElement(client, query);
      continue;
    }

    await humanScroll(client, {
      distancePx: randomBetween(700, 1_300),
      tickCount: Math.round(randomBetween(5, 9))
    });
    lastLocated = await locateElement(client, query);
  }

  const fallbackScrolled = await scrollElementIntoView(client, query);
  if (fallbackScrolled) {
    lastLocated = await locateElement(client, query);
  }

  return lastLocated;
}

export async function humanClick(
  client: CDPClient,
  target: string | LocatedElement,
  options?: HumanClickOptions
): Promise<LocatedElement> {
  let located = typeof target === "string" ? await locateElement(client, target) : target;
  if (located.status !== "ok" || !located.bbox) {
    throw new Error(
      located.status === "ambiguous"
        ? `query "${located.query}" matched ${located.count} elements`
        : located.reason ?? `could not locate ${typeof target === "string" ? target : target.query}`
    );
  }

  located = await bringElementIntoViewport(client, located.query);
  if (located.status !== "ok" || !located.bbox) {
    throw new Error(located.reason ?? `failed to re-locate ${located.query} after scrolling`);
  }

  const point = randomPointInsideBox(located.bbox);
  const approachX = point.x + randomBetween(-18, 18);
  const approachY = point.y + randomBetween(-12, 12);
  await moveMouseTo(client, approachX, approachY, {
    steps: Math.round(randomBetween(7, 14))
  });
  await sleep(randomBetween(40, 90), 0.2);
  await moveMouseTo(client, point.x, point.y, {
    fromX: approachX,
    fromY: approachY,
    steps: Math.round(randomBetween(3, 6))
  });
  await sleep(randomBetween(80, 160), 0.25);
  await clickPoint(client, point.x, point.y, {
    modifiers: options?.modifiers ?? 0,
    holdMs: Math.round(options?.holdMs ?? randomBetween(45, 110))
  });
  await sleep(randomBetween(120, 220), 0.28);
  return located;
}

export async function humanScroll(
  client: CDPClient,
  options?: HumanScrollOptions
): Promise<void> {
  const viewport = await getViewportSize(client);
  const direction = options?.direction ?? "down";
  const distancePx = Math.max(240, options?.distancePx ?? randomBetween(900, 1_900));
  const tickCount = Math.max(4, options?.tickCount ?? Math.round(randomBetween(7, 14)));
  const perTick = distancePx / tickCount;
  const pointerX = randomBetween(viewport.width * 0.35, viewport.width * 0.7);
  const pointerY = randomBetween(viewport.height * 0.35, viewport.height * 0.75);
  const signedDelta = direction === "down" ? perTick : -perTick;

  await moveMouseTo(client, pointerX, pointerY, {
    fromX: viewport.width * 0.5,
    fromY: viewport.height * 0.5,
    steps: Math.round(randomBetween(5, 9))
  });

  for (let index = 0; index < tickCount; index += 1) {
    const deltaY = signedDelta * randomBetween(0.82, 1.18);
    await client.Input.dispatchMouseEvent({
      type: "mouseWheel",
      x: pointerX + randomBetween(-6, 6),
      y: pointerY + randomBetween(-4, 4),
      deltaX: randomBetween(-2, 2),
      deltaY
    });
    await sleep(randomBetween(60, 120), 0.22);
    if (Math.random() < 0.18) {
      await sleep(randomBetween(140, 260), 0.18);
    }
    if (index > 1 && index < tickCount - 2 && Math.random() < 0.14) {
      await client.Input.dispatchMouseEvent({
        type: "mouseWheel",
        x: pointerX + randomBetween(-5, 5),
        y: pointerY + randomBetween(-4, 4),
        deltaX: randomBetween(-1.5, 1.5),
        deltaY: -deltaY * randomBetween(0.12, 0.24)
      });
      await sleep(randomBetween(45, 95), 0.18);
    }
  }

  await sleep(180, 0.25);
}
