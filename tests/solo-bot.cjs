// Unit test of the solo bot: the functions are cut out of index.html and run in node.
const fs = require("fs");
const html = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "../index.html"), "utf8");
const cut = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a); if (a < 0 || b < 0) throw new Error("cut " + from); return html.slice(a, b); };
const src = cut("const WEIGHT", "\n  // ---------- boot");
const N = 15;
const other = p => p === "x" ? "o" : "x";
const playerAt = (s, k) => k % 2 === 0 ? s.s : other(s.s);
const turnOf = s => playerAt(s, s.m.length);
function grid(s) { const g = new Array(N * N).fill(null); s.m.forEach((i, k) => g[i] = playerAt(s, k)); return g; }
const botPick = new Function("N", "other", "playerAt", "turnOf", "grid", src + "\nreturn botPick;")(N, other, playerAt, turnOf, grid);
function winnerOf(g, i) {
  const p = g[i], r0 = Math.floor(i / N), c0 = i % N;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const sg of [1, -1]) { let r = r0 + dr * sg, c = c0 + dc * sg; while (r >= 0 && r < N && c >= 0 && c < N && g[r * N + c] === p) { n++; r += dr * sg; c += dc * sg; } }
    if (n >= 5) return p;
  }
  return null;
}
// build a state from cell lists: xs are human (×), os bot (○), bot to move
function state(xs, os) {
  const m = [];
  for (let k = 0; k < Math.max(xs.length, os.length); k++) { if (k < xs.length) m.push(xs[k]); if (k < os.length) m.push(os[k]); }
  if (xs.length !== os.length + 1) throw new Error("x must have one more");
  return { s: "x", m };
}
const at = (r, c) => r * N + c;
let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name); };

// open four of ×: row 7, cols 4..7, bot must take 3 or 8
let p = botPick(state([at(7, 4), at(7, 5), at(7, 6), at(7, 7)], [at(0, 0), at(0, 14), at(14, 0)]));
check("blocks open four", [at(7, 3), at(7, 8)].includes(p.i) && p.blocked);
// closed four: col 2 rows 3..6, ○ already at row 2
p = botPick(state([at(3, 2), at(4, 2), at(5, 2), at(6, 2)], [at(2, 2), at(10, 10), at(12, 12)]));
check("blocks closed four", p.i === at(7, 2));
// broken four XX_XX on a diagonal
p = botPick(state([at(1, 1), at(2, 2), at(4, 4), at(5, 5)], [at(10, 0), at(12, 3), at(14, 6)]));
check("blocks broken four", p.i === at(3, 3));
// own four beats blocking
p = botPick({ s: "x", m: [at(7, 4), at(9, 4), at(7, 5), at(9, 5), at(7, 6), at(9, 6), at(0, 0), at(9, 7), at(14, 14)] });
check("wins instead of blocking", [at(9, 3), at(9, 8)].includes(p.i) && !p.blocked);
// open three of ×: bot answers at an end
p = botPick(state([at(7, 5), at(7, 6), at(7, 7)], [at(0, 0), at(14, 14)]));
check("answers open three", [at(7, 4), at(7, 8), at(7, 3), at(7, 9)].includes(p.i));

// bot vs random: bot should win nearly always; bot vs bot games must differ
function play(pickX) {
  const s = { s: Math.random() < .5 ? "x" : "o", m: [] };
  for (;;) {
    const turn = turnOf(s), g = grid(s);
    const i = turn === "o" ? botPick(s).i : pickX(s, g);
    if (g[i]) throw new Error("bot played a taken cell");
    s.m.push(i); g[i] = turn;
    if (winnerOf(g, i)) return { w: turn, m: s.m };
    if (s.m.length >= N * N) return { w: null, m: s.m };
  }
}
const randomPick = (s, g) => { const e = []; g.forEach((v, i) => !v && e.push(i)); return e[Math.floor(Math.random() * e.length)]; };
let botWins = 0;
for (let k = 0; k < 30; k++) if (play(randomPick).w === "o") botWins++;
check(`bot beats random 30/30 (${botWins})`, botWins === 30);
const games = [0, 1, 2].map(() => play((s, g) => botPick(s).i).m.join(","));
check("3 bot-vs-bot games differ", new Set(games).size === 3);
console.log(`unit ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
