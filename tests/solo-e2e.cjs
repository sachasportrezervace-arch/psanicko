// E2E: solo mode in Chromium desktop 1440×900 and WebKit iPhone 13, plus the live two-player flow with mantledb mocked.
const path = require("path"), fs = require("fs"), http = require("http");
const { chromium, webkit, devices } = require(path.join(process.env.APPDATA, "npm/node_modules/playwright"));
const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(require("os").tmpdir(), "psanicko-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); s.end(b); });
});
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };

async function marks(page) {
  return page.evaluate(() => [...document.querySelectorAll("#board > g[stroke]")].filter(g => !g.classList.contains("ghost")).map(g => {
    const n = g.querySelector("path").getAttribute("d").match(/-?[\d.]+/g).map(Number);
    return { p: g.getAttribute("stroke").includes("red") ? "x" : "o", i: Math.floor(n[1]) * 15 + Math.floor(n[0]) };
  }));
}
async function tapCell(page, i, dbl) {
  const box = await page.locator("#board").boundingBox();
  const x = box.x + ((i % 15) + .65) / 15.3 * box.width, y = box.y + (Math.floor(i / 15) + .65) / 15.3 * box.height;
  if (dbl) { await page.mouse.dblclick(x, y); return; }
  await page.mouse.click(x, y);
  await page.locator("#confirmBtn:enabled").click();
}
const visible = (page, sel) => page.locator(sel).isVisible();

async function soloGame(page, label, dbl) {
  for (let turn = 0; turn < 120; turn++) {
    if (await visible(page, "#endBox")) break;
    if (await visible(page, "#composer")) {
      const m = await marks(page), taken = new Set(m.map(x => x.i));
      // a human-ish player: mostly next to own stones, sometimes anywhere
      const own = m.filter(x => x.p === "x").map(x => x.i), free = [];
      for (let i = 0; i < 225; i++) if (!taken.has(i)) free.push(i);
      const near = free.filter(i => own.some(j => Math.abs(i % 15 - j % 15) <= 1 && Math.abs(Math.floor(i / 15) - Math.floor(j / 15)) <= 1));
      const pool = near.length && Math.random() < .7 ? near : free.filter(i => i % 15 > 1 && i % 15 < 13 && i > 30 && i < 195);
      const cell = pool[Math.floor(Math.random() * pool.length)];
      await tapCell(page, cell, dbl && turn % 3 === 0);
      await page.waitForFunction(n => document.querySelectorAll("#board > g[stroke]:not(.ghost)").length > n || !document.getElementById("endBox").hidden, m.length, { timeout: 3000 });
    } else {
      // the bot is on turn: it must answer within ~1.1 s
      const n = (await marks(page)).length, t0 = Date.now();
      await page.waitForFunction(n => document.querySelectorAll("#board > g[stroke]:not(.ghost)").length > n, n, { timeout: 4000 });
      const dt = Date.now() - t0;
      if (dt > 2500) check(`${label} bot answered slowly`, false, dt + " ms");
    }
  }
  const m = await marks(page);
  return { m, endL1: await page.locator("#endL1").textContent() };
}

async function soloRun(browserType, ctxOpts, label, dbl) {
  const browser = await browserType.launch();
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const sync = [];
  const errors = [];
  page.on("request", r => { if (/mantledb/.test(r.url())) sync.push(r.url()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE);
  check(`${label} setup shows Zkusit sám`, await visible(page, "#soloBtn") && (await page.locator("#soloBtn").innerText()).includes("Zkusit sám"));
  await page.screenshot({ path: path.join(SHOTS, label + "-setup.png"), fullPage: true });
  await page.locator("#soloBtn").click();
  await page.locator("#game").waitFor();
  check(`${label} #solo in address`, new URL(page.url()).hash === "#solo");
  check(`${label} top shows trénink`, (await page.locator("#topMeta").textContent()) === "trénink");
  check(`${label} rules say Trénink`, (await page.locator("#rules").textContent()).startsWith("Trénink"));
  const games = [];
  for (let k = 0; k < 3; k++) {
    if (k === 0) await page.screenshot({ path: path.join(SHOTS, label + "-play.png") });
    const g = await soloGame(page, label, dbl);
    games.push(g);
    const ended = await visible(page, "#endBox");
    check(`${label} game ${k + 1} finished (${g.m.length} moves, ${g.endL1})`, ended);
    check(`${label} game ${k + 1} end buttons`, (await page.locator("#endPrimary").textContent()) === "Znovu" && (await page.locator("#endSecondary").textContent()) === "Vyzvat soupeře");
    check(`${label} game ${k + 1} not in series`, (await page.locator("#tSer").textContent()) === "nepočítá se do série");
    if (k === 0) await page.screenshot({ path: path.join(SHOTS, label + "-end.png"), fullPage: true });
    const humanLost = g.endL1.includes("Bot");
    await page.locator("#endPrimary").click();
    await page.locator("#playTop").waitFor();
    if (humanLost) {
      const m = await marks(page);
      check(`${label} after a loss you start`, m.length === 0 && await visible(page, "#composer"));
    }
  }
  check(`${label} 3 games differ`, new Set(games.map(g => g.m.map(x => x.i).sort().join())).size === 3);
  await page.locator("#endSecondary").count();
  // leave to the real challenge
  const g = await soloGame(page, label, dbl);
  await page.locator("#endSecondary").click();
  await page.locator("#setup").waitFor();
  check(`${label} Vyzvat soupeře opens setup`, new URL(page.url()).hash === "" && await visible(page, "#setupSubmit"));
  // direct address
  await page.goto(BASE + "#solo");
  await page.locator("#playTop").waitFor();
  check(`${label} direct #solo opens the game`, await visible(page, "#board"));
  check(`${label} no sync request`, sync.length === 0, sync.join(" "));
  check(`${label} no page errors`, errors.length === 0, errors.join(" | "));
  const sx = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${label} no horizontal scroll`, sx <= 0, String(sx));
  await browser.close();
}

// the live two-player game, mantledb mocked in memory
async function liveRun(browserType, ctxOpts, label) {
  const db = {};
  const browser = await browserType.launch();
  const mk = async () => {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.route("https://mantledb.sh/**", async route => {
      const key = route.request().url();
      if (route.request().method() === "POST") { db[key] = route.request().postData(); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
      if (!db[key]) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ status: 200, contentType: "application/json", body: db[key] });
    });
    return ctx.newPage();
  };
  const a = await mk(), b = await mk();
  await a.goto(BASE);
  await a.fill("#nameX", "Ana"); await a.fill("#nameO", "Bob");
  await a.selectOption("#starter", "x");
  await a.click("#setupSubmit");
  await a.locator("#share").waitFor();
  const hash = new URL(a.url()).hash;
  check(`${label} live: room created`, /^#r\.[0-9a-z]{12}$/.test(hash), hash);
  await a.click("#backBtn");
  await a.locator("#composer").waitFor();
  check(`${label} live: no Trénink`, (await a.locator("#topMeta").textContent()).includes("o kafe") && (await a.locator("#rules").textContent()).startsWith("Deska"));
  check(`${label} live: note field shown`, await visible(a, "#noteField"));
  await tapCell(a, 112);
  await a.locator("#waitBox").waitFor();
  check(`${label} live: copy link shown while waiting`, await visible(a, "#waitCopy"));
  await b.goto(BASE + hash);
  await b.locator("#acceptBtn").click();
  await b.locator("#composer").waitFor();
  check(`${label} live: guest sees the first move`, (await marks(b)).length === 1);
  await tapCell(b, 113);
  await a.waitForFunction(() => document.querySelectorAll("#board > g[stroke]:not(.ghost)").length === 2, null, { timeout: 8000 });
  check(`${label} live: host sees the reply`, (await marks(a)).length === 2 && await visible(a, "#composer"));
  await browser.close();
}

(async () => {
  if (process.env.BASE) { global.BASE = process.env.BASE; for (let k = 0; k < 40; k++) { const t = await (await fetch(BASE + "?v=" + Date.now(), { cache: "no-store" })).text(); if (t.includes("soloBtn")) break; console.log("waiting for Pages…"); await new Promise(r => setTimeout(r, 8000)); } }
  else for (const port of [8811, 8831, 8841]) {
    const ok = await new Promise(res => { server.once("error", () => res(false)); server.listen(port, "127.0.0.1", () => res(true)); });
    if (ok) { global.BASE = `http://127.0.0.1:${port}/`; break; }
  }
  console.log("serving " + BASE);
  try {
    await soloRun(chromium, { viewport: { width: 1440, height: 900 } }, "chromium", true);
    await soloRun(webkit, { ...devices["iPhone 13"] }, "webkit-iphone13", false);
    await liveRun(chromium, { viewport: { width: 1440, height: 900 } }, "chromium");
    await liveRun(webkit, { ...devices["iPhone 13"] }, "webkit-iphone13");
  } catch (e) { check("run crashed: " + e.message.split("\n")[0], false); }
  server.close();
  console.log(`e2e ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
