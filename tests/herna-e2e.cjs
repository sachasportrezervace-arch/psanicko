// E2E: Psaníčko inside a Herna room (HERNA-PROTOKOL.md v1). Two browsers, each with the game in an iframe of a stand-in
// parent page that records postMessage. Mantledb is mocked in memory unless REAL=1 (then the live store is used).
// Local: node tests/herna-e2e.cjs   Live: BASE=https://sachasportrezervace-arch.github.io/psanicko/ REAL=1 node tests/herna-e2e.cjs
const path = require("path"), fs = require("fs"), http = require("http");
const { chromium, webkit, devices } = require(path.join(process.env.APPDATA, "npm/node_modules/playwright"));
const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); s.end(b); });
});
let BASE;
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };
const PARENT = src => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#111}iframe{display:block;border:0;width:100%;height:calc(100% - 48px);margin-top:48px}</style>
<script>window.msgs=[];addEventListener("message",e=>{if(e.data&&e.data.herna===1)window.msgs.push(e.data)})</script>
<iframe src="${src}"></iframe>`;

async function marks(f) {
  return f.evaluate(() => [...document.querySelectorAll("#board > g[stroke]")].filter(g => !g.classList.contains("ghost")).map(g => {
    const n = g.querySelector("path").getAttribute("d").match(/-?[\d.]+/g).map(Number);
    return { p: g.getAttribute("stroke").includes("red") ? "x" : "o", i: Math.floor(n[1]) * 15 + Math.floor(n[0]) };
  }));
}
async function tapCell(page, f, i) {
  const box = await f.locator("#board").boundingBox();
  await page.mouse.click(box.x + ((i % 15) + .65) / 15.3 * box.width, box.y + (Math.floor(i / 15) + .65) / 15.3 * box.height);
  await f.locator("#confirmBtn:enabled").click();
}
const gameFrame = page => page.frames().find(fr => fr !== page.mainFrame());

// × builds a row, ○ scatters on row 0 so it never gets five
async function playOut(players, row) {
  const plan = { x: [3, 4, 5, 6, 7].map(c => row * 15 + c), o: [0, 2, 4, 6, 8, 10, 12].map(c => c) };
  for (let k = 0; k < 14; k++) {
    let mover = null;
    for (let t = 0; t < 80 && !mover; t++) {
      for (const P of players) if (await P.f.locator("#composer").isVisible()) mover = P;
      if (!mover) { if (await players[0].f.locator("#endBox").isVisible()) return; await players[0].page.waitForTimeout(150); }
    }
    if (!mover) throw new Error("nobody is on turn");
    const n = (await marks(mover.f)).length;
    await tapCell(mover.page, mover.f, plan[mover.side].shift());
    await mover.f.waitForFunction(n => document.querySelectorAll("#board > g[stroke]:not(.ghost)").length > n, n);
    if (await mover.f.locator("#endBox").isVisible()) break;
  }
}

async function run(typeA, optsA, typeB, optsB, label) {
  const r = "pt" + Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  const db = {}, requests = [];
  const mk = async (type, opts) => {
    const browser = await type.launch();
    const ctx = await browser.newContext(opts);
    await ctx.route(BASE + "__herna.html*", route => route.fulfill({ status: 200, contentType: "text/html", body: PARENT(new URL(route.request().url()).searchParams.get("src")) }));
    if (!process.env.REAL) await ctx.route("https://mantledb.sh/**", async route => {
      const key = route.request().url();
      requests.push(route.request().method());
      if (route.request().method() === "POST") { db[key] = route.request().postData(); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
      if (!db[key]) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ status: 200, contentType: "application/json", body: db[key] });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    return { browser, page, errors };
  };
  const hash = (seat, zaklada) => `#herna=1&m=test000000&r=${r}&seat=${seat}&names=${encodeURIComponent("Mark")},${encodeURIComponent("Radka Ž")}&zaklada=${zaklada}`;
  const A = await mk(typeA, optsA), B = await mk(typeB, optsB);
  // the invited player opens first and has to wait for the document
  await B.page.goto(BASE + "__herna.html?src=" + encodeURIComponent(BASE + hash(1, 0)));
  B.f = gameFrame(B.page); B.side = "o";
  await B.f.locator("#info").waitFor();
  check(`${label} invited waits`, (await B.f.locator("#infoTitle").textContent()).startsWith("Čeká se"));
  await A.page.goto(BASE + "__herna.html?src=" + encodeURIComponent(BASE + hash(0, 1)));
  A.f = gameFrame(A.page); A.side = "x";
  for (const P of [A, B]) await P.f.locator("#game").waitFor({ timeout: 15000 });
  check(`${label} both sit without a challenge`, !(await A.f.locator("#intro").isVisible()) && !(await B.f.locator("#intro").isVisible()) && !(await A.f.locator("#setup").isVisible()));
  const chips = await A.f.locator("#players").innerText();
  check(`${label} names from Herna`, chips.includes("Mark") && chips.includes("Radka Ž"), chips.replace(/\s+/g, " "));
  for (const [P, who] of [[A, "A"], [B, "B"]]) {
    const hidden = await P.f.evaluate(() => ["newGameBtn", "copyTopBtn", "waitCopy", "fsBtn", "soloBtn", "share"].filter(id => { const e = document.getElementById(id); return e && e.checkVisibility(); }));
    check(`${label} ${who} hides links out`, hidden.length === 0, hidden.join(","));
  }
  for (const [P, who] of [[A, "A"], [B, "B"]]) {
    const cut = await P.f.evaluate(() => [...document.querySelectorAll("#players .chip b")].filter(b => b.scrollWidth > b.clientWidth).map(b => b.textContent));
    check(`${label} ${who} names not truncated`, cut.length === 0, cut.join(","));
  }
  await playOut([A, B], 7);
  for (const P of [A, B]) await P.f.locator("#endBox").waitFor({ timeout: 10000 });
  check(`${label} game 1 ends on both`, true);
  const sec = await B.f.locator("#endSecondary").textContent();
  check(`${label} end has Odveta and Jiná hra`, sec === "Jiná hra" && /odvet/i.test(await B.f.locator("#endPrimary").textContent()), sec);
  // rematch, × wins again
  await A.f.locator("#endPrimary").click();
  for (const P of [A, B]) await P.f.locator("#playTop").waitFor({ timeout: 10000 });
  await playOut([A, B], 11);
  for (const P of [A, B]) await P.f.locator("#endBox").waitFor({ timeout: 10000 });
  await B.f.locator("#endSecondary").click();
  await A.page.waitForTimeout(300);
  for (const [P, who] of [[A, "A"], [B, "B"]]) {
    const msgs = await P.page.evaluate(() => window.msgs);
    const res = msgs.filter(m => m.typ === "vysledek");
    const stav = msgs.filter(m => m.typ === "stav").map(m => m.faze).join(">");
    check(`${label} ${who} pripraveno first`, msgs[0] && msgs[0].typ === "pripraveno");
    check(`${label} ${who} two results, seat 0 wins`, res.length === 2 && res.every(m => m.vitez === 0) && res[0].partie === r + ":1" && res[1].partie === r + ":2", JSON.stringify(res));
    check(`${label} ${who} stav ceka>hraje>konec>hraje>konec`, /ceka>hraje>konec>hraje>konec$/.test(stav), stav);
    P.msgs = msgs;
  }
  check(`${label} Jiná hra sends jina-hra`, B.msgs.some(m => m.typ === "jina-hra") && !A.msgs.some(m => m.typ === "jina-hra"));
  check(`${label} no page errors`, !A.errors.length && !B.errors.length, A.errors.concat(B.errors).join(" | "));
  await A.browser.close(); await B.browser.close();
}

(async () => {
  if (process.env.BASE) BASE = process.env.BASE;
  else for (const port of [8811, 8831, 8841]) {
    const ok = await new Promise(res => { server.once("error", () => res(false)); server.listen(port, "127.0.0.1", () => res(true)); });
    if (ok) { BASE = `http://127.0.0.1:${port}/`; break; }
  }
  if (process.env.BASE) for (let k = 0; k < 40; k++) {
    const t = await (await fetch(BASE + "?v=" + Date.now(), { cache: "no-store" })).text();
    if (t.includes('name="herna-protokol"')) break;
    console.log("waiting for Pages…"); await new Promise(r => setTimeout(r, 8000));
  }
  console.log("serving " + BASE + (process.env.REAL ? " (live mantledb)" : " (mantledb mocked)"));
  try {
    await run(chromium, { viewport: { width: 1440, height: 900 } }, webkit, { ...devices["iPhone 13"] }, "chromium+webkit");
  } catch (e) { check("run crashed: " + e.message.split("\n")[0], false); }
  server.close();
  console.log(`herna ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
