// Celtic Knot Maker -- paint breaks on a grid, the knotwork weaves itself.
//
// Celtic knotwork starts as a plait: bands running diagonally across a
// grid, crossing at the middle of every cell side, alternately over and
// under. A "break" at a crossing cuts the two bands and joins their ends
// the other way, so they turn back instead of crossing. Line up breaks into
// walls and the plait becomes a knot. (George Bain described this method
// in 1951; the same mirror curves make the kolams of South India.)
//
// Coordinates are doubled so everything is an integer: grid corners and
// cell centers at (even, even) and (odd, odd), crossings where X + Y is odd.
// A band always alternates over and under, even through breaks, because the
// crossings themselves alternate in a checkerboard.

const CROSS = 0, H = 1, V = 2; // a crossing, or a break that is horizontal / vertical
const U = 40; // pixels per half cell

const LOOKS = {
  kells: {
    name: "Kells",
    bg: "#efe3c6",
    edge: "#2a1d12",
    band: "#c8a13a",
    strands: ["#c8a13a", "#a3322a", "#2f6b4f", "#2c4f7c", "#7a4c8c", "#d17a2a", "#5d8a2e", "#8c3a5e"],
  },
  stone: {
    name: "Stone",
    bg: "#6f6a63",
    edge: "#2f2c28",
    band: "#cfc8bb",
    strands: ["#cfc8bb", "#b9a58a", "#a8b3b8", "#c9b79c", "#9fa892", "#d8cfc0", "#b0a2a8", "#c4b08f"],
  },
  ink: {
    name: "Ink",
    bg: "#fbf7ee",
    edge: "#1b1b1b",
    band: "#fbf7ee",
    strands: ["#fbf7ee", "#f2d7a6", "#cfe3d0", "#d6dff0", "#f0d0cc", "#e6dcf0", "#f5e9b8", "#d8eef0"],
  },
  night: {
    name: "Night",
    bg: "#141b26",
    edge: "#05080d",
    band: "#e8c46a",
    strands: ["#e8c46a", "#6fb7e0", "#e07a6f", "#8fd18a", "#c49be8", "#f0a35e", "#7fe0c8", "#e890b8"],
  },
  emerald: {
    name: "Emerald",
    bg: "#0f2a1f",
    edge: "#04120c",
    band: "#d9c48a",
    strands: ["#d9c48a", "#e9e4d4", "#9fd3b5", "#e3a37a", "#b7c8e8", "#f0d36b", "#c9a0d8", "#8fc7e0"],
  },
};
const STYLES = {
  ribbon: { name: "Ribbon" },
  double: { name: "Double" },
  outline: { name: "Outline" },
};
const SYMS = {
  four: { name: "Four-way" },
  lr: { name: "Left–right" },
  tb: { name: "Top–bottom" },
  none: { name: "None" },
};
const TOOLS = {
  draw: { name: "Draw breaks" },
  erase: { name: "Erase" },
};
const PRESETS = {
  plait: { name: "Plait" },
  frame: { name: "Frame" },
  cross: { name: "Cross" },
  window: { name: "Window" },
  rings: { name: "Rings" },
};

const opts = {
  cols: 8,
  rows: 6,
  look: "kells",
  style: "ribbon",
  sym: "four",
  tool: "draw",
  band: 60, // band width, % of the widest that still leaves gaps
  colors: true, // one color per strand
  grid: true,
  flip: false, // swap over and under
  density: 40,
  single: true,
};
let grid = null;
let st = null;
let loops = [];
let owner = null; // segment -> strand number
let drag = null;

const $e = (id) => document.getElementById(id);

// ---------------------------------------------------------------- random

function rng(s) {
  s = s % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- grid and bands

const makeGrid = () => ({ cw: opts.cols, ch: opts.rows, W: 2 * opts.cols, H: 2 * opts.rows });
const idx = (g, X, Y) => Y * (g.W + 1) + X;
const isInner = (g, X, Y) => (X + Y) % 2 === 1 && X > 0 && Y > 0 && X < g.W && Y < g.H;
function innerCrossings(g) {
  const out = [];
  for (let Y = 1; Y < g.H; Y++) for (let X = 1 + (Y % 2); X < g.W; X += 2) out.push([X, Y]);
  return out;
}
// on the border the bands always turn back
const stateAt = (g, s, X, Y) => (X === 0 || X === g.W ? V : Y === 0 || Y === g.H ? H : s[idx(g, X, Y)]);

// Follows each band from crossing to crossing until it comes back. Returns
// the strands (lists of [X, Y, state]) and, for each piece of band, the
// strand it belongs to.
function trace(g, s) {
  const KW = 2 * g.H + 1;
  const seen = new Uint16Array((2 * g.W + 1) * KW);
  const out = [];
  for (let j = 0; j < g.ch; j++)
    for (let i = 0; i < g.cw; i++) {
      const cx = 2 * i + 1, cy = 2 * j + 1;
      const starts = [[cx, cy - 1, 1, 1], [cx + 1, cy, -1, 1], [cx, cy + 1, -1, -1], [cx - 1, cy, 1, -1]];
      for (const [x0, y0, dx0, dy0] of starts) {
        if (seen[(2 * x0 + dx0) * KW + (2 * y0 + dy0)]) continue;
        const pts = [];
        let x = x0, y = y0, dx = dx0, dy = dy0;
        do {
          const nx = x + dx, ny = y + dy;
          seen[(x + nx) * KW + (y + ny)] = out.length + 1;
          const t = stateAt(g, s, nx, ny);
          if (t === H) dy = -dy;
          else if (t === V) dx = -dx;
          pts.push([nx, ny, t]);
          x = nx;
          y = ny;
        } while (!(x === x0 && y === y0 && dx === dx0 && dy === dy0));
        out.push(pts);
      }
    }
  return { loops: out, owner: (x2, y2) => seen[x2 * KW + y2] - 1 };
}
const countLoops = (g, s) => trace(g, s).loops.length;

// ---------------------------------------------------------------- symmetry

function mirrors(g) {
  const fx = (X, Y) => [g.W - X, Y];
  const fy = (X, Y) => [X, g.H - Y];
  const id = (X, Y) => [X, Y];
  return {
    none: [id],
    lr: [id, fx],
    tb: [id, fy],
    four: [id, fx, fy, (X, Y) => [g.W - X, g.H - Y]],
  }[opts.sym];
}
// mirrors keep a break horizontal or vertical, so the state just copies
function setSym(X, Y, v) {
  for (const t of mirrors(grid)) {
    const [x2, y2] = t(X, Y);
    st[idx(grid, x2, y2)] = v;
  }
}
function orbits(g) {
  const done = new Set(), out = [];
  for (const [X, Y] of innerCrossings(g)) {
    if (done.has(idx(g, X, Y))) continue;
    const orb = [];
    for (const t of mirrors(g)) {
      const k = idx(g, ...t(X, Y));
      if (!done.has(k)) done.add(k), orb.push(k);
    }
    out.push(orb);
  }
  return out;
}

// Joins strands until one is left: a break where two different strands
// cross always joins them, so keep any change that lowers the count.
function joinStrands(s, rand) {
  let cur = countLoops(grid, s);
  const keep = opts.sym;
  for (const sym of [keep, "none"]) {
    opts.sym = sym; // relax the symmetry for the last joins, if needed
    const orbs = orbits(grid);
    for (let pass = 0; pass < 4 && cur > 1; pass++)
      for (const orb of shuffle(orbs.slice(), rand)) {
        const was = s[orb[0]];
        for (const o of shuffle([CROSS, H, V].filter((o) => o !== was), rand)) {
          orb.forEach((k) => (s[k] = o));
          const n = countLoops(grid, s);
          if (n < cur) {
            cur = n;
            break;
          }
          orb.forEach((k) => (s[k] = was));
        }
        if (cur === 1) break;
      }
    if (cur === 1) break;
  }
  opts.sym = keep;
  return cur;
}

// ---------------------------------------------------------------- designs

const blank = () => new Uint8Array((grid.W + 1) * (grid.H + 1));
// a straight wall of breaks between two grid points
function wall(s, x1, y1, x2, y2) {
  if (y1 === y2) {
    for (let X = Math.min(x1, x2) + 1; X < Math.max(x1, x2); X += 2) if (isInner(grid, X, y1)) s[idx(grid, X, y1)] = H;
  } else {
    for (let Y = Math.min(y1, y2) + 1; Y < Math.max(y1, y2); Y += 2) if (isInner(grid, x1, Y)) s[idx(grid, x1, Y)] = V;
  }
}
function rect(s, a, b, c, d) {
  wall(s, a, b, c, b);
  wall(s, a, d, c, d);
  wall(s, a, b, a, d);
  wall(s, c, b, c, d);
}
function preset(name) {
  const s = blank();
  const { W, H: Hh, cw, ch } = grid;
  if (name === "frame" || name === "window") rect(s, 2, 2, W - 2, Hh - 2);
  if (name === "cross" || name === "window") {
    wall(s, 0, ch, W, ch);
    wall(s, cw, 0, cw, Hh);
  }
  if (name === "rings") for (let d = 2; 2 * d < Math.min(W, Hh); d += 2) rect(s, d, d, W - d, Hh - d);
  st = s;
  update();
}
// random walls, mirrored, then joined into one strand if asked
function randomKnot() {
  const rand = rng(Math.floor(Math.random() * 1e9) + 1);
  const s = blank();
  const g = grid;
  const n = Math.round(((opts.density / 100) * g.W * g.H) / 10);
  for (let w = 0; w < n; w++) {
    const horiz = rand() < 0.5;
    const len = 1 + Math.floor(rand() * 3);
    // start on a grid point (X + Y even), inside the panel
    let X = 1 + Math.floor(rand() * (g.W - 1)), Y = 1 + Math.floor(rand() * (g.H - 1));
    if ((X + Y) % 2) X += X < g.W - 1 ? 1 : -1;
    const [x2, y2] = horiz ? [Math.min(g.W, X + 2 * len), Y] : [X, Math.min(g.H, Y + 2 * len)];
    const tmp = blank();
    wall(tmp, X, Y, x2, y2);
    for (const [cx, cy] of innerCrossings(g))
      if (tmp[idx(g, cx, cy)])
        for (const t of mirrors(g)) {
          const [a, b] = t(cx, cy);
          s[idx(g, a, b)] = tmp[idx(g, cx, cy)];
        }
  }
  if (opts.single) joinStrands(s, rand);
  st = s;
  update();
}

// ---------------------------------------------------------------- drawing

const f1 = (v) => Math.round(v * 10) / 10;
const M = U * 1.1; // margin
const P = (X, Y) => [M + X * U, M + Y * U];

// a strand as an SVG path: straight through the crossings, rounding the
// corner where it turns back at a break
function loopPath(pts, k) {
  const n = pts.length;
  const mid = (i) => {
    const a = P(...pts[(i - 1 + n) % n]), b = P(...pts[i % n]);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  let m = mid(0);
  let d = `M${f1(m[0])} ${f1(m[1])}`;
  for (let i = 0; i < n; i++) {
    const q = P(pts[i][0], pts[i][1]), b = mid(i + 1);
    if (pts[i][2] === CROSS) d += `L${f1(b[0])} ${f1(b[1])}`;
    else
      d += `C${f1(m[0] + k * (q[0] - m[0]))} ${f1(m[1] + k * (q[1] - m[1]))} ${f1(b[0] + k * (q[0] - b[0]))} ${f1(b[1] + k * (q[1] - b[1]))} ${f1(b[0])} ${f1(b[1])}`;
    m = b;
  }
  return d + "Z";
}

function svgMarkup(forExport) {
  const g = grid, L = LOOKS[opts.look];
  const vw = g.W * U + 2 * M, vh = g.H * U + 2 * M;
  const w = U * (0.22 + (opts.band / 100) * 0.4);
  const ow = Math.max(1.5, U * 0.07);
  const k = 0.45;
  const multi = opts.colors && loops.length > 1;
  const color = (i) => (opts.style === "outline" ? L.bg : multi ? L.strands[i % L.strands.length] : L.band);
  // three strokes per band: the dark edge, the band, and a center line for "double"
  // (the over pieces pass a longer path for the band, so it covers the soft end of their edge)
  const strokes = (d, i, cap, d2 = d) =>
    `<path d="${d}" stroke="${L.edge}" stroke-width="${f1(w + 2 * ow)}"${cap}/>` +
    `<path d="${d2}" stroke="${color(i)}" stroke-width="${f1(w)}"${cap}/>` +
    (opts.style === "double" ? `<path d="${d2}" stroke="${L.edge}" stroke-width="${f1(ow * 0.8)}"${cap}/>` : "");

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}"${forExport ? "" : ' class="plain"'}>`;
  s += `<rect width="${vw}" height="${vh}" fill="${L.bg}"/>`;
  s += `<g fill="none" stroke-linejoin="round">`;
  loops.forEach((pts, i) => (s += strokes(loopPath(pts, k), i, "")));
  // the over/under: at each crossing, draw the band that goes over once more
  for (const [X, Y] of innerCrossings(g)) {
    if (st[idx(g, X, Y)] !== CROSS) continue;
    const back = (X % 2 === 0) !== opts.flip; // "\" goes over on vertical cell sides
    const [a, b] = back ? [P(X - 0.5, Y - 0.5), P(X + 0.5, Y + 0.5)] : [P(X - 0.5, Y + 0.5), P(X + 0.5, Y - 0.5)];
    const i = back ? owner(2 * X + 1, 2 * Y + 1) : owner(2 * X + 1, 2 * Y - 1);
    const ex = 1.5 / Math.SQRT2, sx = Math.sign(b[0] - a[0]) * ex, sy = Math.sign(b[1] - a[1]) * ex;
    s += strokes(
      `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`,
      i,
      ' stroke-linecap="butt"',
      `M${f1(a[0] - sx)} ${f1(a[1] - sy)}L${f1(b[0] + sx)} ${f1(b[1] + sy)}`,
    );
  }
  s += "</g>";
  if (!forExport && opts.grid) {
    s += `<g class="grid">`;
    for (let Y = 0; Y <= g.H; Y++)
      for (let X = Y % 2; X <= g.W; X += 2) s += `<circle cx="${P(X, Y)[0]}" cy="${P(X, Y)[1]}" r="2.2"/>`;
    s += `</g><g class="breaks">`;
    for (const [X, Y] of innerCrossings(g)) {
      const v = st[idx(g, X, Y)];
      if (v === CROSS) continue;
      const [a, b] = v === H ? [P(X - 1, Y), P(X + 1, Y)] : [P(X, Y - 1), P(X, Y + 1)];
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    }
    s += "</g>";
  }
  return s + "</svg>";
}

function render() {
  const t = trace(grid, st);
  loops = t.loops;
  owner = t.owner;
  $e("knot").innerHTML = svgMarkup(false);
  renderStats();
}
function renderStats() {
  let cross = 0, breaks = 0;
  for (const [X, Y] of innerCrossings(grid)) st[idx(grid, X, Y)] === CROSS ? cross++ : breaks++;
  const tile = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  $e("stats").innerHTML =
    tile("Grid", `${opts.cols} × ${opts.rows}`) +
    tile("Strands", loops.length === 1 ? "1 &#10003;" : loops.length) +
    tile("Crossings", cross) +
    tile("Breaks", breaks);
  $e("join").disabled = loops.length === 1;
  $e("strand-note").textContent =
    loops.length === 1
      ? "A single strand: one endless band weaves through the whole knot."
      : `${loops.length} strands woven together.`;
}

// ---------------------------------------------------------------- painting breaks

function gridPoint(e) {
  const svg = $e("knot").querySelector("svg");
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  return [(pt.x - M) / U, (pt.y - M) / U];
}
function nearestCrossing(fx, fy) {
  let best = null, bd = 0.8;
  for (let Y = Math.floor(fy) - 1; Y <= Math.ceil(fy) + 1; Y++)
    for (let X = Math.floor(fx) - 1; X <= Math.ceil(fx) + 1; X++) {
      if (!isInner(grid, X, Y)) continue;
      const d = Math.hypot(X - fx, Y - fy);
      if (d < bd) (bd = d), (best = [X, Y]);
    }
  return best;
}
function down(e) {
  const [fx, fy] = gridPoint(e);
  const c = nearestCrossing(fx, fy);
  if (!c) return;
  e.preventDefault();
  $e("knot").setPointerCapture(e.pointerId);
  drag = { c, fx, fy, axis: null };
  if (opts.tool === "erase") paint(c, CROSS);
}
function move(e) {
  if (!drag) return;
  const [fx, fy] = gridPoint(e);
  if (opts.tool === "erase") {
    const c = nearestCrossing(fx, fy);
    if (c) paint(c, CROSS);
    return;
  }
  if (!drag.axis) {
    if (Math.hypot(fx - drag.fx, fy - drag.fy) < 0.6) return;
    drag.axis = Math.abs(fx - drag.fx) >= Math.abs(fy - drag.fy) ? H : V;
  }
  // a straight wall along the row (or column) where the drag started
  const [X0, Y0] = drag.c;
  if (drag.axis === H) {
    let X1 = Math.round(fx);
    if ((X1 + Y0) % 2 === 0) X1 += fx > X1 ? 1 : -1;
    for (let X = Math.min(X0, X1); X <= Math.max(X0, X1); X += 2) if (isInner(grid, X, Y0)) setSym(X, Y0, H);
  } else {
    let Y1 = Math.round(fy);
    if ((X0 + Y1) % 2 === 0) Y1 += fy > Y1 ? 1 : -1;
    for (let Y = Math.min(Y0, Y1); Y <= Math.max(Y0, Y1); Y += 2) if (isInner(grid, X0, Y)) setSym(X0, Y, V);
  }
  render();
}
function up() {
  if (!drag) return;
  // a click without dragging turns a crossing into a break, then the other break, then back
  if (opts.tool === "draw" && !drag.axis) {
    const [X, Y] = drag.c;
    setSym(X, Y, (st[idx(grid, X, Y)] + 1) % 3);
  }
  drag = null;
  update();
}
function paint([X, Y], v) {
  if (st[idx(grid, X, Y)] === v) return;
  setSym(X, Y, v);
  render();
}

// ---------------------------------------------------------------- the knot in the address

const ABC = "abcdefghijklmnopqrstuvwxyz_"; // 3 crossings per letter
function encode() {
  const cs = innerCrossings(grid).map(([X, Y]) => st[idx(grid, X, Y)]);
  let out = "";
  for (let i = 0; i < cs.length; i += 3) out += ABC[(cs[i] || 0) * 9 + (cs[i + 1] || 0) * 3 + (cs[i + 2] || 0)];
  return out;
}
function decode(str) {
  const cs = innerCrossings(grid);
  if (str.length !== Math.ceil(cs.length / 3)) return null;
  const s = blank();
  for (let i = 0; i < cs.length; i++) {
    const v = ABC.indexOf(str[Math.floor(i / 3)]);
    if (v < 0) return null;
    s[idx(grid, ...cs[i])] = Math.floor(v / [9, 3, 1][i % 3]) % 3;
  }
  return s;
}
function writeUrl() {
  history.replaceState(null, "", `#cols=${opts.cols}&rows=${opts.rows}&k=${encode()}`);
}
function readUrl() {
  const q = new URLSearchParams(location.hash.slice(1));
  const c = parseInt(q.get("cols"), 10), r = parseInt(q.get("rows"), 10);
  if (!(c >= 2 && c <= 16 && r >= 2 && r <= 16 && q.get("k"))) return false;
  opts.cols = c;
  opts.rows = r;
  grid = makeGrid();
  st = decode(q.get("k"));
  return !!st;
}

// ---------------------------------------------------------------- controls

const LS = "celtic-knot-maker";
function saveSettings() {
  try {
    const { look, style, sym, band, colors, grid: gr, flip, density, single } = opts;
    localStorage.setItem(LS, JSON.stringify({ look, style, sym, band, colors, grid: gr, flip, density, single }));
  } catch (e) {}
}
function loadSettings() {
  try {
    Object.assign(opts, JSON.parse(localStorage.getItem(LS)) || {});
  } catch (e) {}
  if (!LOOKS[opts.look]) opts.look = "kells";
  if (!STYLES[opts.style]) opts.style = "ribbon";
  if (!SYMS[opts.sym]) opts.sym = "four";
}
function update() {
  render();
  writeUrl();
  saveSettings();
}

function chips(id, items, key, onPick) {
  const el = $e(id);
  el.innerHTML = Object.entries(items)
    .map(([k, v]) => `<button type="button" data-k="${k}"${key ? ` aria-pressed="${opts[key] === k}"` : ""}>${v.name}</button>`)
    .join("");
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (key) {
      opts[key] = b.dataset.k;
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    }
    onPick(b.dataset.k);
  };
}
function rangeCtl(id, key, fmt, onChange) {
  const el = $e(id);
  el.value = opts[key];
  const show = () => ($e(id + "-val").textContent = fmt(opts[key]));
  show();
  el.addEventListener("input", () => {
    opts[key] = +el.value;
    show();
    onChange();
  });
}
function checkCtl(id, key) {
  $e(id).checked = opts[key];
  $e(id).addEventListener("change", (e) => {
    opts[key] = e.target.checked;
    update();
  });
}
// resizing keeps the breaks that still fit, centered
function resize() {
  const old = grid, olds = st;
  grid = makeGrid();
  st = blank();
  // shift by whole cells (an even number of half cells) to keep the parity
  const dx = 2 * Math.trunc((grid.cw - old.cw) / 2), dy = 2 * Math.trunc((grid.ch - old.ch) / 2);
  for (const [X, Y] of innerCrossings(old)) {
    const x2 = X + dx, y2 = Y + dy;
    if (isInner(grid, x2, y2)) st[idx(grid, x2, y2)] = olds[idx(old, X, Y)];
  }
  update();
}

function download(name, href) {
  const a = document.createElement("a");
  a.download = name;
  a.href = href;
  a.click();
}
function saveSvg() {
  download("celtic-knot.svg", URL.createObjectURL(new Blob([svgMarkup(true)], { type: "image/svg+xml" })));
}
function savePng() {
  const img = new Image();
  const svg = svgMarkup(true);
  img.onload = () => {
    const c = document.createElement("canvas");
    const scale = 2000 / Math.max(img.width, img.height);
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    download("celtic-knot.png", c.toDataURL("image/png"));
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function initCeltic() {
  loadSettings();
  if (!readUrl()) {
    grid = makeGrid();
    st = blank();
    opts.single = opts.single !== false;
    randomKnot();
  }
  chips("tool-chips", TOOLS, "tool", () => {});
  chips("sym-chips", SYMS, "sym", saveSettings);
  chips("look-chips", LOOKS, "look", update);
  chips("style-chips", STYLES, "style", update);
  chips("preset-chips", PRESETS, null, preset);
  $e("cols").value = opts.cols;
  $e("rows").value = opts.rows;
  const showSize = () => {
    $e("cols-val").textContent = opts.cols;
    $e("rows-val").textContent = opts.rows;
  };
  showSize();
  ["cols", "rows"].forEach((id) =>
    $e(id).addEventListener("input", () => {
      opts[id] = +$e(id).value;
      showSize();
      resize();
    }),
  );
  rangeCtl("band", "band", (v) => `${v}%`, update);
  rangeCtl("density", "density", (v) => `${v}%`, () => {});
  checkCtl("o-colors", "colors");
  checkCtl("o-grid", "grid");
  checkCtl("o-flip", "flip");
  $e("o-single").checked = opts.single;
  $e("o-single").addEventListener("change", (e) => ((opts.single = e.target.checked), saveSettings()));
  $e("random").addEventListener("click", randomKnot);
  $e("join").addEventListener("click", () => {
    joinStrands(st, rng(Math.floor(Math.random() * 1e9) + 1));
    update();
  });
  $e("export-png").addEventListener("click", savePng);
  $e("export-svg").addEventListener("click", saveSvg);
  const k = $e("knot");
  k.addEventListener("pointerdown", down);
  k.addEventListener("pointermove", move);
  k.addEventListener("pointerup", up);
  k.addEventListener("pointercancel", up);
  update();
}
