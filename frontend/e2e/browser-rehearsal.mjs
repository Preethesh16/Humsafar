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
if (paymentProof) {
  assert.match(receipt.text, /Prava sandbox credential request refused — no checkout/i);
  assert.ok(!receipt.text.includes("Fixture-only run"), "a real sandbox refusal must not be relabelled as fixture-only");
}
assert.ok(!receipt.options.some((url) => /api[_-]?key|duffel_test_|sk_test_/i.test(url)), "provider secrets reached a browser resource URL");

await clickText("button", "Use my location");
await waitFor(() => evaluate("document.body.innerText.includes('Refresh my location')"), 10_000, "browser geolocation");
await clickText("button", "Virtual ride to stop 1");
await waitFor(() => evaluate("document.querySelector('.quest-xp')?.textContent.includes('120 XP')"), 10_000, "virtual route progress");

const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

assert.deepEqual(browserErrors, [], `Browser errors: ${browserErrors.join(" | ")}`);
console.log(JSON.stringify({
  status: "passed",
  finalPath: "/receipt",
  heading: receipt.heading,
  quest: receipt.quest,
  location: "verified with CDP geolocation override",
  progress: "120 XP",
  paymentProof,
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
