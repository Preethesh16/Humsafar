/**
 * Dependency-free browser rehearsal over Chrome DevTools Protocol.
 *
 * Start Chromium/Brave with --remote-debugging-port=9222, then run this file.
 * It drives the real Vite app, backend, OpenAI agent run, choice gate,
 * approval gate, receipt and trip quest. No provider secret enters the page.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const devtools = process.env.HUMSAFAR_CDP_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.HUMSAFAR_APP_URL ?? "http://127.0.0.1:5173/?source=live";
const screenshotPath = process.env.HUMSAFAR_E2E_SCREENSHOT ?? "/tmp/humsafar-e2e-final.png";
const intakeScreenshotPath = process.env.HUMSAFAR_E2E_INTAKE_SCREENSHOT ?? "/tmp/humsafar-e2e-intake.png";
const ridingScreenshotPath = process.env.HUMSAFAR_E2E_RIDING_SCREENSHOT ?? "/tmp/humsafar-e2e-riding.png";
const midQuestScreenshotPath = process.env.HUMSAFAR_E2E_MID_QUEST_SCREENSHOT ?? "/tmp/humsafar-e2e-mid-quest.png";
const mobileIntakeScreenshotPath = process.env.HUMSAFAR_E2E_MOBILE_INTAKE_SCREENSHOT ?? "/tmp/humsafar-e2e-mobile-intake.png";
const mobileReceiptScreenshotPath = process.env.HUMSAFAR_E2E_MOBILE_RECEIPT_SCREENSHOT ?? "/tmp/humsafar-e2e-mobile-receipt.png";
const paymentProof = process.env.HUMSAFAR_E2E_PAYMENT === "true";

const pages = await fetch(`${devtools}/json/list`).then((response) => response.json());
const page = pages.find((row) => row.type === "page");
assert.ok(page?.webSocketDebuggerUrl, "No debuggable Brave/Chromium page found");

const cdp = await connect(page.webSocketDebuggerUrl);
const browserErrors = [];
cdp.on("Runtime.exceptionThrown", (event) => browserErrors.push(event.exceptionDetails?.text ?? "browser exception"));
cdp.on("Runtime.consoleAPICalled", (event) => {
  if (event.type === "error") browserErrors.push(event.args?.map((arg) => arg.value ?? arg.description).join(" "));
});

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");
await cdp.send("Emulation.setGeolocationOverride", { latitude: 15.4989, longitude: 73.8278, accuracy: 25 });
await cdp.send("Browser.grantPermissions", { origin: "http://127.0.0.1:5173", permissions: ["geolocation"] });
await cdp.send("Page.navigate", { url: appUrl });
await waitFor(() => evaluate("document.readyState === 'complete' && document.querySelector('h1')?.textContent.includes('disappear')"));
await evaluate("Object.keys(sessionStorage).filter((key) => key.startsWith('humsafar.quest:')).forEach((key) => sessionStorage.removeItem(key)); true");
await capture(intakeScreenshotPath);
const intakeMascot = await evaluate(`(() => {
  const box = document.querySelector('.intake-stage .mascot-guide img').getBoundingClientRect();
  return { width: box.width, height: box.height };
})()`);
assert.ok(intakeMascot.width >= 180 && intakeMascot.height >= 250, "Milo must be a full-size intake companion, not an avatar button");
await mobileCapture(mobileIntakeScreenshotPath);

await setInput('input[aria-label="Trip destination"]', "Goa");
await clickText("button", "Continue");
await setInput('input[aria-label="Leaving from"]', "Bengaluru");
await clickText("button", "Continue");

// Journey, flexible dates and solo party keep their recommended defaults.
await clickText("button", "Continue");
await clickText("button", "Continue");
await clickText("button", "Continue");

// The ordinary rehearsal keeps all specialists. The payment-proof rehearsal
// isolates Journey so the one active Duffel mandate cannot be confused with
// fixture merchants that were never authorised.
if (paymentProof) {
  await clickText("button", "Stay");
  await clickText("button", "Food");
  await clickText("button", "Things to do");
}
await clickText("button", "Continue");
await setInput('input[aria-label="Custom total budget in rupees"]', "30000");
await clickText("button", "Continue");
await clickText("button", "Eat really well");
await clickText("button", "Continue");
await clickText("button", "Heritage & worship");
await clickText("button", "Continue");

await waitFor(() => evaluate("Boolean(document.querySelector('.itinerary-plan'))"), 45_000, "mapped itinerary preview");
await clickText("button", "Start planning agents");
await waitFor(() => evaluate("location.pathname === '/choose'"), 60_000, "agent choices");

// New specialist choice requests can arrive while this page is open. Always
// click one currently enabled option; the server validates its offered ID.
await waitFor(async () => {
  const pathname = await evaluate("location.pathname");
  if (pathname === "/approve") return true;
  if (pathname !== "/choose") return false;
  await evaluate("document.querySelector('.option-card:not(:disabled)')?.click(); true");
  return false;
}, 90_000, "all offered choices");

await waitFor(() => evaluate("Boolean([...document.querySelectorAll('button')].find((node) => node.textContent.includes('Approve this plan')))"), 20_000, "approval button");
await clickText("button", "Approve this plan");
await waitFor(async () => {
  const pathname = await evaluate("location.pathname");
  if (pathname === "/receipt") return true;
  // A failed credential/checkout can legitimately trigger a replacement
  // choice and a fresh approval. Rehearse that recovery instead of assuming
  // the first approval is always the last interaction.
  if (pathname === "/choose") {
    await evaluate("document.querySelector('.option-card:not(:disabled)')?.click(); true");
  }
  if (pathname === "/approve") {
    await evaluate("[...document.querySelectorAll('button:not(:disabled)')].find((node) => node.textContent.includes('Approve this plan'))?.click(); true");
  }
  return false;
}, 150_000, "final receipt including any recovery approval");

const receipt = await evaluate(`({
  heading: document.querySelector('.outcome h2')?.textContent,
  quest: document.querySelector('.trip-quest h2')?.textContent,
  mascot: document.querySelector('.mascot-guide img')?.getAttribute('alt'),
  text: document.body.innerText,
  options: performance.getEntriesByType('resource').map((row) => row.name)
})`);
assert.match(receipt.heading, /plan is ready|processing finished/i);
assert.match(receipt.quest, /next station/i);
assert.match(receipt.mascot, /cat travel concierge/i);
assert.match(receipt.text, /fixture|sandbox|payment evidence/i, "receipt must state provenance");
assert.match(
  receipt.text,
  /Approve Prava on your phone[\s\S]*Set up on phone/i,
  "receipt must offer the explicit phone handoff without starting it automatically",
);
if (paymentProof) {
  assert.match(receipt.text, /Prava sandbox credential request refused — no checkout/i);
  assert.ok(!receipt.text.includes("Fixture-only run"), "a real sandbox refusal must not be relabelled as fixture-only");
}
assert.ok(!receipt.options.some((url) => /api[_-]?key|duffel_test_|sk_test_/i.test(url)), "provider secrets reached a browser resource URL");

await clickText("button", "Use my location");
await waitFor(() => evaluate("document.body.innerText.includes('Refresh my location')"), 10_000, "browser geolocation");
await evaluate("document.querySelector('.quest-drive')?.click(); true");
await new Promise((resolve) => setTimeout(resolve, 850));
const rideAnimation = await evaluate(`({
  vehicle: getComputedStyle(document.querySelector('.quest-vehicle.moving')).animationName,
  paint: getComputedStyle(document.querySelector('.quest-painted-segment.painting')).animationName,
  boardWidth: document.querySelector('.quest-map--3d').getBoundingClientRect().width
})`);
assert.match(rideAnimation.vehicle, /quest-drive/, "the transport runner must animate along the active segment");
assert.match(rideAnimation.paint, /quest-paint/, "the route must paint behind the runner");
assert.ok(rideAnimation.boardWidth >= 450, "desktop trip game must be a large board, not a map thumbnail");
await capture(ridingScreenshotPath);
await waitFor(() => evaluate("document.querySelector('.quest-xp')?.textContent.includes('120 XP')"), 10_000, "virtual route progress");

// Reproduce the formerly broken mid-quest state. Live place discovery can
// return fewer stations on a given day, so advance to five or the last station
// available rather than making this visual regression depend on provider row
// count. The board must remain a clean day-sized level either way.
const questTotal = await evaluate("Number(document.querySelector('.quest-xp')?.textContent.match(/\\/(\\d+) stops/)?.[1] ?? 1)");
const activeLevelStops = await evaluate("Number(document.querySelector('.quest-map--3d')?.dataset.levelStops ?? 1)");
const targetProgress = Math.min(5, activeLevelStops);
for (let progress = 2; progress <= targetProgress; progress += 1) {
  const xp = progress * 120;
  await waitFor(() => evaluate("Boolean(document.querySelector('.quest-drive:not(:disabled)'))"), 10_000, `ride button before ${xp} XP`);
  await evaluate("document.querySelector('.quest-drive')?.click(); true");
  await waitFor(() => evaluate(`document.querySelector('.quest-xp')?.textContent.includes('${xp} XP')`), 10_000, `${xp} XP route progress`);
}
const midQuest = await evaluate(`(() => {
  const board = document.querySelector('.quest-map--3d');
  const positions = [...document.querySelectorAll('.quest-stop circle:not(.quest-stop-shadow)')]
    .map((node) => [node.getAttribute('cx'), node.getAttribute('cy')].join(','));
  return {
    day: Number(board.dataset.levelDay),
    levelStops: Number(board.dataset.levelStops),
    renderedStops: positions.length,
    uniqueStops: new Set(positions).size,
    minimumGap: positions.reduce((minimum, position, index) => {
      const [x, y] = position.split(',').map(Number);
      return Math.min(minimum, ...positions.slice(0, index).map((other) => {
        const [otherX, otherY] = other.split(',').map(Number);
        return Math.hypot(x - otherX, y - otherY);
      }));
    }, Infinity),
    total: document.querySelector('.quest-xp')?.textContent,
  };
})()`);
assert.equal(midQuest.renderedStops, midQuest.levelStops, "the board must render only the active day's stations");
assert.equal(midQuest.uniqueStops, midQuest.renderedStops, "active-day station markers must not stack into blobs");
assert.ok(midQuest.minimumGap >= 8, `active-day station markers are only ${midQuest.minimumGap} board units apart`);
assert.match(midQuest.total, new RegExp(`${targetProgress}\\/${questTotal} stops`), "the regression capture must reach its target progress");
await capture(midQuestScreenshotPath);

await capture(screenshotPath);
await mobileCapture(mobileReceiptScreenshotPath);

assert.deepEqual(browserErrors, [], `Browser errors: ${browserErrors.join(" | ")}`);
console.log(JSON.stringify({
  status: "passed",
  finalPath: "/receipt",
  heading: receipt.heading,
  quest: receipt.quest,
  location: "verified with CDP geolocation override",
  progress: "120 XP",
  paymentProof,
  intakeScreenshot: intakeScreenshotPath,
  mobileIntakeScreenshot: mobileIntakeScreenshotPath,
  ridingScreenshot: ridingScreenshotPath,
  midQuestScreenshot: midQuestScreenshotPath,
  mobileReceiptScreenshot: mobileReceiptScreenshotPath,
  screenshot: screenshotPath,
}));
cdp.close();

async function setInput(selector, value) {
  await waitFor(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`));
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value;
  })()`);
}

async function clickText(selector, text) {
  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.textContent.includes(${JSON.stringify(text)})))`), 20_000, text);
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.textContent.includes(${JSON.stringify(text)})).click(); true`);
}

async function capture(path) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function mobileCapture(path) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const layout = await evaluate(`(() => {
    const mascot = document.querySelector('.mascot-guide img')?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, mascotWidth: mascot?.width ?? 0, mascotHeight: mascot?.height ?? 0 };
  })()`);
  assert.ok(layout.overflow <= 1, `mobile layout overflows horizontally by ${layout.overflow}px`);
  assert.ok(layout.mascotWidth >= 120 && layout.mascotHeight >= 150, "Milo must remain prominent on mobile");
  await capture(path);
  await cdp.send("Emulation.clearDeviceMetricsOverride");
}

async function waitFor(check, timeout = 20_000, label = "condition") {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(new Error(message.error.message));
      else entry?.resolve(message.result ?? {});
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
  });
  return {
    send(method, params = {}) {
      const requestId = ++id;
      socket.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
    close() { socket.close(); },
  };
}
