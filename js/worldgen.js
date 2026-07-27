"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/worldgen.js
   SECTION 7 — World generation: themes, tilemap (DDA raycast, destructible bricks), braided maze generator, floor pre-render, A* pathfinding.
   ================================================================ */
/* ================================================================
   SECTION 7 — WORLD GENERATION
   Themes, tilemap (DDA raycast, destructible bricks), braided
   maze generator, floor pre-render, A* pathfinding.
   ================================================================ */
const THEMES = [
  {
    name: "NEO CITY", sub: "Rain sector — night ops",
    floor: "#22262e", detail: "#2b303a", seam: "rgba(255,255,255,0.028)",
    steel: { base: "#3c4450", light: "#59657a", dark: "#232830", rivet: "#1b1f26" },
    brick: { base: "#7a4a3a", dark: "#5b352a", line: "#472a20" },
    ambient: 0.6, lightTint: "rgba(6,10,24,", weather: "rain", accent: "#46e0d8",
  },
  {
    name: "DUST OUTPOST", sub: "Desert perimeter — day ops",
    floor: "#b99f6d", detail: "#a88f5f", seam: "rgba(90,70,40,0.10)",
    steel: { base: "#6e6250", light: "#94866f", dark: "#4b4234", rivet: "#3a342a" },
    brick: { base: "#a06844", dark: "#7c4e32", line: "#65402a" },
    ambient: 0.0, lightTint: "rgba(20,16,8,", weather: "dust", accent: "#ffb03a",
  },
  {
    name: "ARCTIC GRID", sub: "Frozen depot — overcast",
    floor: "#c7d3d9", detail: "#b6c4cc", seam: "rgba(70,100,120,0.10)",
    steel: { base: "#5d6b78", light: "#84939f", dark: "#3d4854", rivet: "#2e3844" },
    brick: { base: "#8a6350", dark: "#69493b", line: "#553a2f" },
    ambient: 0.22, lightTint: "rgba(8,14,26,", weather: "snow", accent: "#8ffff6",
  },
  {
    name: "JUNGLE RUINS", sub: "Overgrown temple — dusk",
    floor: "#39462f", detail: "#425238", seam: "rgba(0,0,0,0.10)",
    steel: { base: "#4d5a48", light: "#6d7c66", dark: "#333d30", rivet: "#252d23" },
    brick: { base: "#7d6a4e", dark: "#5e4f3a", line: "#4b3f2e" },
    ambient: 0.38, lightTint: "rgba(4,12,8,", weather: "leaves", accent: "#7be27a",
  },
  {
    name: "FOUNDRY ZONE", sub: "Industrial core — ashfall",
    floor: "#2b2c2e", detail: "#343537", seam: "rgba(255,140,60,0.03)",
    steel: { base: "#45464a", light: "#67686e", dark: "#2c2d30", rivet: "#1f2022" },
    brick: { base: "#6e4a3e", dark: "#523630", line: "#402a25" },
    ambient: 0.5, lightTint: "rgba(16,8,4,", weather: "ash", accent: "#ff7a45",
  },
  {
    name: "VIOLET DISTRICT", sub: "Luxury quarter — midnight",
    floor: "#241f30", detail: "#2d2740", seam: "rgba(200,140,255,0.04)",
    steel: { base: "#453e5c", light: "#665d85", dark: "#2c2740", rivet: "#201c30" },
    brick: { base: "#7a4457", dark: "#5c3241", line: "#482734" },
    ambient: 0.64, lightTint: "rgba(10,4,22,", weather: "rain", accent: "#c98aff",
  },
];

class TileMap {
  constructor(cols, rows){
    this.cols = cols; this.rows = rows;
    this.t = new Uint8Array(cols * rows);   // 0 floor, 1 steel, 2 brick
    this.hp = new Uint8Array(cols * rows);  // brick hitpoints
    this.dirty = true;                      // minimap rebuild flag
  }
  idx(c, r){ return r * this.cols + c; }
  get(c, r){
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 1;
    return this.t[this.idx(c, r)];
  }
  set(c, r, v){
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    this.t[this.idx(c, r)] = v;
    if (v === 2) this.hp[this.idx(c, r)] = CFG.BRICK_HP;
    this.dirty = true;
  }
  solidAt(c, r){ return this.get(c, r) > 0; }
  solidAtXY(x, y){ return this.solidAt(Math.floor(x / CFG.TILE), Math.floor(y / CFG.TILE)); }
  cellOf(x, y){ return { c: Math.floor(x / CFG.TILE), r: Math.floor(y / CFG.TILE) }; }
  center(c, r){ return { x: c * CFG.TILE + CFG.TILE / 2, y: r * CFG.TILE + CFG.TILE / 2 }; }
  /* returns 0 = no effect, 1 = damaged, 2 = destroyed */
  damageTile(c, r, d){
    if (this.get(c, r) !== 2) return 0;
    const i = this.idx(c, r);
    this.hp[i] = Math.max(0, this.hp[i] - d);
    this.dirty = true;
    if (this.hp[i] <= 0) { this.t[i] = 0; return 2; }
    return 1;
  }
  destroyBrick(c, r){
    if (this.get(c, r) !== 2) return false;
    this.t[this.idx(c, r)] = 0;
    this.dirty = true;
    return true;
  }
  /* DDA raycast in world coords */
  raycast(x0, y0, x1, y1){
    const T = CFG.TILE;
    let dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return { hit: false, x: x1, y: y1, d: 0 };
    dx /= d; dy /= d;
    let c = Math.floor(x0 / T), r = Math.floor(y0 / T);
    if (this.solidAt(c, r)) return { hit: true, x: x0, y: y0, c, r, d: 0 };
    const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const tDY = dy !== 0 ? Math.abs(T / dy) : Infinity;
    let tMX = dx !== 0 ? ((stepC > 0 ? (c + 1) * T : c * T) - x0) / dx : Infinity;
    let tMY = dy !== 0 ? ((stepR > 0 ? (r + 1) * T : r * T) - y0) / dy : Infinity;
    let t = 0;
    for (let guard = 0; guard < 512; guard++) {
      if (tMX < tMY) { t = tMX; tMX += tDX; c += stepC; }
      else { t = tMY; tMY += tDY; r += stepR; }
      if (t > d) break;
      if (this.solidAt(c, r)) return { hit: true, x: x0 + dx * t, y: y0 + dy * t, c, r, d: t };
    }
    return { hit: false, x: x1, y: y1, d };
  }
  draw(c, theme, rect){
    const T = CFG.TILE;
    const c0 = Math.max(0, Math.floor(rect.x0 / T)), c1 = Math.min(this.cols - 1, Math.floor(rect.x1 / T));
    const r0 = Math.max(0, Math.floor(rect.y0 / T)), r1 = Math.min(this.rows - 1, Math.floor(rect.y1 / T));
    // drop shadow pass (depth)
    c.fillStyle = "rgba(0,0,0,0.32)";
    for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
      if (!this.solidAt(cc, r)) continue;
      c.fillRect(cc * T + 5, r * T + 7, T, T);
    }
    // tile pass
    for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
      const v = this.get(cc, r);
      if (v === 0) continue;
      const x = cc * T, y = r * T;
      if (v === 1) {
        // steel: beveled plate + rivets
        c.fillStyle = theme.steel.base;
        c.fillRect(x, y, T, T);
        c.fillStyle = theme.steel.light;
        c.fillRect(x, y, T, 4); c.fillRect(x, y, 4, T);
        c.fillStyle = theme.steel.dark;
        c.fillRect(x, y + T - 4, T, 4); c.fillRect(x + T - 4, y, 4, T);
        c.fillStyle = theme.steel.rivet;
        const rp = 8;
        c.fillRect(x + rp - 1, y + rp - 1, 3, 3);
        c.fillRect(x + T - rp - 2, y + rp - 1, 3, 3);
        c.fillRect(x + rp - 1, y + T - rp - 2, 3, 3);
        c.fillRect(x + T - rp - 2, y + T - rp - 2, 3, 3);
        if (((cc * 7 + r * 13) % 5) === 0) { // panel variation
          c.fillStyle = "rgba(0,0,0,0.10)";
          c.fillRect(x + 6, y + 6, T - 12, T - 12);
        }
      } else {
        // brick with mortar courses
        c.fillStyle = theme.brick.base;
        c.fillRect(x, y, T, T);
        c.fillStyle = theme.brick.dark;
        c.fillRect(x, y + T - 3, T, 3); c.fillRect(x + T - 3, y, 3, T);
        c.strokeStyle = theme.brick.line;
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 1; i < 3; i++) { c.moveTo(x, y + (T / 3) * i); c.lineTo(x + T, y + (T / 3) * i); }
        const off = ((cc + r) % 2) * (T / 4);
        c.moveTo(x + T / 2 + off, y);            c.lineTo(x + T / 2 + off, y + T / 3);
        c.moveTo(x + T / 4 + off, y + T / 3);    c.lineTo(x + T / 4 + off, y + (T / 3) * 2);
        c.moveTo(x + T / 2 + off, y + (T / 3) * 2); c.lineTo(x + T / 2 + off, y + T);
        c.stroke();
        // damage cracks
        const hp = this.hp[this.idx(cc, r)];
        if (hp < CFG.BRICK_HP) {
          c.strokeStyle = "rgba(0,0,0,0.55)";
          c.lineWidth = 1.6;
          c.beginPath();
          const n = (CFG.BRICK_HP - hp) * 2;
          let px = x + T / 2, py = y + T / 2;
          for (let i = 0; i < n; i++) {
            const nx = x + 6 + (((cc * 31 + r * 17 + i * 53) % 100) / 100) * (T - 12);
            const ny = y + 6 + (((cc * 13 + r * 47 + i * 29) % 100) / 100) * (T - 12);
            c.moveTo(px, py); c.lineTo(nx, ny);
            px = nx; py = ny;
          }
          c.stroke();
        }
      }
    }
  }
}

/* ---- pre-rendered themed floor (stains, seams, detail) ---- */
function buildFloor(map, theme, rng){
  const T = CFG.TILE;
  const cv = document.createElement("canvas");
  cv.width = map.cols * T; cv.height = map.rows * T;
  const c = cv.getContext("2d");
  c.fillStyle = theme.floor;
  c.fillRect(0, 0, cv.width, cv.height);
  // seams
  c.strokeStyle = theme.seam;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= map.cols; x++) { c.moveTo(x * T + 0.5, 0); c.lineTo(x * T + 0.5, cv.height); }
  for (let y = 0; y <= map.rows; y++) { c.moveTo(0, y * T + 0.5); c.lineTo(cv.width, y * T + 0.5); }
  c.stroke();
  // detail splotches
  const n = map.cols * map.rows * 0.35;
  for (let i = 0; i < n; i++) {
    const x = rng() * cv.width, y = rng() * cv.height;
    const r = 6 + rng() * 26;
    c.fillStyle = rng() < 0.5 ? theme.detail : "rgba(0,0,0,0.06)";
    c.globalAlpha = 0.14 + rng() * 0.2;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  // scattered hazard chevrons / manholes for character
  for (let i = 0; i < map.cols * 0.6; i++) {
    const x = rng() * cv.width, y = rng() * cv.height;
    if (rng() < 0.5) {
      c.strokeStyle = "rgba(0,0,0,0.12)";
      c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 9, 0, TAU); c.stroke();
      c.beginPath(); c.arc(x, y, 4, 0, TAU); c.stroke();
    } else {
      c.fillStyle = "rgba(0,0,0,0.09)";
      c.save(); c.translate(x, y); c.rotate(rng() * TAU);
      for (let k = -1; k <= 1; k++) c.fillRect(k * 10 - 3, -8, 6, 16);
      c.restore();
    }
  }
  return cv;
}

/* ---- braided maze generator ---- */
function genLevel(level){
  const rng = mulberry32(0xC0FFEE ^ (level * 2654435761));
  let cols = clamp(29 + level * 2, 29, 51);
  let rows = clamp(19 + Math.floor(level * 1.2), 19, 31);
  if (cols % 2 === 0) cols++;
  if (rows % 2 === 0) rows++;
  const map = new TileMap(cols, rows);
  map.t.fill(1);
  // recursive backtracker on odd lattice
  const stack = [[1, 1]];
  map.set(1, 1, 0);
  const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const opts = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc > 0 && nr > 0 && nc < cols - 1 && nr < rows - 1 && map.get(nc, nr) === 1) opts.push([dc, dr]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [dc, dr] = opts[(rng() * opts.length) | 0];
    map.set(c + dc / 2, r + dr / 2, 0);
    map.set(c + dc, r + dr, 0);
    stack.push([c + dc, r + dr]);
  }
  // braid: open ~45% of dead ends so AI has loops to flank through
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (map.get(c, r) !== 0) continue;
    const walls = [];
    if (map.get(c + 1, r) === 1 && c + 1 < cols - 1) walls.push([c + 1, r]);
    if (map.get(c - 1, r) === 1 && c - 1 > 0) walls.push([c - 1, r]);
    if (map.get(c, r + 1) === 1 && r + 1 < rows - 1) walls.push([c, r + 1]);
    if (map.get(c, r - 1) === 1 && r - 1 > 0) walls.push([c, r - 1]);
    if (walls.length === 3 && rng() < 0.45) {
      const w = walls[(rng() * walls.length) | 0];
      map.set(w[0], w[1], 0);
    }
  }
  // carve open arenas
  const roomN = 2 + Math.floor(level / 2);
  for (let i = 0; i < roomN; i++) {
    const rw = 3 + 2 * ((rng() * 2) | 0), rh = 3 + 2 * ((rng() * 2) | 0);
    const rc = 1 + 2 * ((rng() * ((cols - rw - 2) / 2)) | 0);
    const rr = 1 + 2 * ((rng() * ((rows - rh - 2) / 2)) | 0);
    for (let r = rr; r < Math.min(rows - 1, rr + rh); r++)
      for (let c = rc; c < Math.min(cols - 1, rc + rw); c++)
        map.set(c, r, 0);
  }
  // convert interior walls to destructible brick
  const brickChance = clamp(0.42 + level * 0.015, 0.42, 0.6);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (map.get(c, r) !== 1) continue;
    const nearFloor = map.get(c + 1, r) === 0 || map.get(c - 1, r) === 0 || map.get(c, r + 1) === 0 || map.get(c, r - 1) === 0;
    if (nearFloor && rng() < brickChance) map.set(c, r, 2);
  }
  // player spawn: near top-left open cell
  let playerCell = [1, 1];
  outer: for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++)
    if (map.get(c, r) === 0) { playerCell = [c, r]; break outer; }
  const ps = map.center(playerCell[0], playerCell[1]);
  // clear a small safe pocket around spawn
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const cc = playerCell[0] + dc, rr = playerCell[1] + dr;
    if (cc > 0 && rr > 0 && cc < cols - 1 && rr < rows - 1 && map.get(cc, rr) === 2) map.set(cc, rr, 0);
  }
  // barrels: floor cells away from spawn
  const barrels = [];
  const want = 7 + level;
  let tries = 0;
  while (barrels.length < want && tries++ < 500) {
    const c = 1 + ((rng() * (cols - 2)) | 0), r = 1 + ((rng() * (rows - 2)) | 0);
    if (map.get(c, r) !== 0) continue;
    const p = map.center(c, r);
    if (dist2(p.x, p.y, ps.x, ps.y) < (CFG.TILE * 6) ** 2) continue;
    if (barrels.some(b => Math.abs(b.c - c) + Math.abs(b.r - r) < 3)) continue;
    barrels.push({ c, r });
  }
  const theme = THEMES[(level - 1) % THEMES.length];
  return { map, theme, floorCv: buildFloor(map, theme, rng), playerSpawn: ps, barrels, rng };
}

/* ---- A* pathfinding (4-dir, optional brick-breach costing) ---- */
function findPath(map, sc, sr, tc, tr, opts){
  opts = opts || {};
  const cols = map.cols, rows = map.rows;
  const passCost = (c, r) => {
    const v = map.get(c, r);
    if (v === 0) return 1;
    if (v === 2 && opts.breach) return 6;
    return 0;
  };
  if (!passCost(tc, tr)) {
    let found = false;
    const off = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [oc, or] of off) {
      if (passCost(tc + oc, tr + or)) { tc += oc; tr += or; found = true; break; }
    }
    if (!found) return null;
  }
  if (!passCost(sc, sr)) return null;
  const size = cols * rows;
  const g = new Float32Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = [];
  const si = sr * cols + sc;
  g[si] = 0;
  const h = (c, r) => Math.abs(c - tc) + Math.abs(r - tr);
  open.push({ i: si, c: sc, r: sr, f: h(sc, sr) });
  let iter = 0;
  while (open.length && iter++ < 4000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const n = open.splice(bi, 1)[0];
    if (closed[n.i]) continue;
    closed[n.i] = 1;
    if (n.c === tc && n.r === tr) {
      const path = [];
      let i = n.i;
      while (i !== -1) {
        const pc = i % cols, pr = (i / cols) | 0;
        path.push({ c: pc, r: pr, x: pc * CFG.TILE + CFG.TILE / 2, y: pr * CFG.TILE + CFG.TILE / 2 });
        i = parent[i];
      }
      path.reverse();
      return path;
    }
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dc, dr] of DIRS) {
      const nc = n.c + dc, nr = n.r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const cost = passCost(nc, nr);
      if (!cost) continue;
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const ng = g[n.i] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        parent[ni] = n.i;
        open.push({ i: ni, c: nc, r: nr, f: ng + h(nc, nr) });
      }
    }
  }
  return null;
}
