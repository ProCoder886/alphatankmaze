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
  {
    name: "CRIMSON WASTE", sub: "Scorched badlands — red dusk",
    floor: "#4a2a24", detail: "#5a352c", seam: "rgba(255,120,80,0.05)",
    steel: { base: "#6b4038", light: "#8e5a4c", dark: "#3f251f", rivet: "#2c1a16" },
    brick: { base: "#93503a", dark: "#6d3a2a", line: "#552d21" },
    stone: { base: "#7d5a4a", dark: "#5b4036", line: "#43302a" },
    ambient: 0.34, lightTint: "rgba(26,8,4,", weather: "dust", accent: "#ff7a45",
  },
  {
    name: "TIDAL DOCKS", sub: "Flooded harbour — storm front",
    floor: "#1d3038", detail: "#254049", seam: "rgba(120,220,255,0.05)",
    steel: { base: "#37525e", light: "#527585", dark: "#22343c", rivet: "#182530" },
    brick: { base: "#5f6f66", dark: "#45524b", line: "#33403a" },
    stone: { base: "#4a6470", dark: "#33474f", line: "#26363d" },
    ambient: 0.58, lightTint: "rgba(4,14,24,", weather: "rain", accent: "#7ef0ff",
  },
  {
    name: "NEON BAZAAR", sub: "Night market — signage glow",
    floor: "#2a1c2e", detail: "#36233c", seam: "rgba(255,120,220,0.05)",
    steel: { base: "#4d3550", light: "#6f4f74", dark: "#312134", rivet: "#241826" },
    brick: { base: "#8c4270", dark: "#682f53", line: "#4d2340" },
    stone: { base: "#6d4a63", dark: "#4d3346", line: "#392636" },
    ambient: 0.62, lightTint: "rgba(16,2,18,", weather: "rain", accent: "#ff7ad9",
  },
  {
    name: "SALT FLATS", sub: "Mineral basin — high noon",
    floor: "#cbc3a8", detail: "#bcb296", seam: "rgba(110,95,60,0.10)",
    steel: { base: "#7d7660", light: "#a29a80", dark: "#575142", rivet: "#403b30" },
    brick: { base: "#ad7c52", dark: "#85603e", line: "#6a4c31" },
    stone: { base: "#a09a84", dark: "#7c7767", line: "#5d5a4e" },
    ambient: 0.0, lightTint: "rgba(24,20,10,", weather: "dust", accent: "#ffd05c",
  },
  {
    name: "CRYO VAULT", sub: "Deep storage — sub-zero",
    floor: "#1e2a33", detail: "#26343f", seam: "rgba(140,240,255,0.06)",
    steel: { base: "#3a4c5a", light: "#586d7e", dark: "#253239", rivet: "#1a242b" },
    brick: { base: "#4f6a74", dark: "#3a4e56", line: "#2b3b42" },
    stone: { base: "#5f7d88", dark: "#425760", line: "#2f4048" },
    ambient: 0.55, lightTint: "rgba(4,12,20,", weather: "snow", accent: "#8ffff6",
  },
  {
    name: "EMBER FOUNDRY", sub: "Molten works — furnace light",
    floor: "#33221c", detail: "#3f2a22", seam: "rgba(255,150,60,0.06)",
    steel: { base: "#54382c", light: "#77513e", dark: "#33211a", rivet: "#241611" },
    brick: { base: "#8a4526", dark: "#66321b", line: "#4c2514" },
    stone: { base: "#6e4a35", dark: "#4f3526", line: "#3a271c" },
    ambient: 0.46, lightTint: "rgba(24,8,2,", weather: "ash", accent: "#ff9a3c",
  },
  {
    name: "ROSE SECTOR", sub: "Blossom quarter — pink dusk",
    floor: "#3a2230", detail: "#472a3b", seam: "rgba(255,160,210,0.06)",
    steel: { base: "#6b3f57", light: "#96607c", dark: "#402433", rivet: "#301a26" },
    brick: { base: "#b05378", dark: "#853c5a", line: "#632c43" },
    stone: { base: "#8f6076", dark: "#684456", line: "#4a303e" },
    ambient: 0.44, lightTint: "rgba(26,6,18,", weather: "leaves", accent: "#ff8fc4",
  },
  {
    name: "SOLAR REFINERY", sub: "Orange works — heat haze",
    floor: "#3d2a17", detail: "#4c351d", seam: "rgba(255,180,80,0.07)",
    steel: { base: "#7a5324", light: "#a5743a", dark: "#4a3115", rivet: "#35220f" },
    brick: { base: "#c07028", dark: "#94531c", line: "#6d3d14" },
    stone: { base: "#96703f", dark: "#6d512c", line: "#4d3920" },
    ambient: 0.2, lightTint: "rgba(30,14,2,", weather: "ash", accent: "#ffa028",
  },
  {
    name: "VERDANT DEEP", sub: "Dark canopy — deep green",
    floor: "#16261a", detail: "#1e3323", seam: "rgba(120,255,170,0.05)",
    steel: { base: "#2c4a33", light: "#446b4c", dark: "#1a2e1f", rivet: "#122016" },
    brick: { base: "#3f6b45", dark: "#2d4e32", line: "#1f3724" },
    stone: { base: "#496b52", dark: "#334c3a", line: "#223527" },
    ambient: 0.66, lightTint: "rgba(2,14,6,", weather: "leaves", accent: "#5cffa0",
  },
  {
    name: "NULL VOID", sub: "Blackout facility — no lights",
    floor: "#0e1013", detail: "#15181c", seam: "rgba(255,255,255,0.035)",
    steel: { base: "#22262b", light: "#3a4048", dark: "#131619", rivet: "#0c0e11" },
    brick: { base: "#2e3238", dark: "#1f2227", line: "#14171a" },
    stone: { base: "#33383f", dark: "#23272c", line: "#15181c" },
    ambient: 0.76, lightTint: "rgba(0,0,0,", weather: "ash", accent: "#e8f4ff",
  },
];
/* Themes may omit the newer tile palettes; derive them from the existing
   ones so every theme renders stone and tower tiles consistently. */
for (const t of THEMES) {
  if (!t.stone) t.stone = { base: "#6b6f75", dark: "#4b4f55", line: "#35383d" };
  if (!t.tower) t.tower = { base: t.steel.light, light: "#e9f4f8", dark: t.steel.dark, glow: t.accent };
}

/* ================================================================
   ARENA SHAPES
   The maze is carved inside a mask so a sector can be a rectangle,
   diamond, circle, triangle, pentagon, hexagon, octagon or cross.
   Coordinates are normalised to [-1,1] on both axes, so each shape
   stretches to fill the map rather than leaving dead margins.
   ================================================================ */
const SHAPES = [
  { id: "rect",     name: "GRID",      test: () => true },
  { id: "diamond",  name: "DIAMOND",   test: (u, v) => Math.abs(u) + Math.abs(v) <= 1.04 },
  { id: "circle",   name: "ROTUNDA",   test: (u, v) => u * u + v * v <= 1.0 },
  { id: "triangle", name: "WEDGE",     test: (u, v) => v <= 0.92 && (v + 1) >= Math.abs(u) * 1.9 },
  { id: "pentagon", name: "PENTAGON",  test: (u, v) => polyTest(u, v, 5, -Math.PI / 2) },
  { id: "hexagon",  name: "HEXAGON",   test: (u, v) => polyTest(u, v, 6, 0) },
  { id: "octagon",  name: "OCTAGON",   test: (u, v) => polyTest(u, v, 8, Math.PI / 8) },
  { id: "cross",    name: "CROSSROAD", test: (u, v) => Math.abs(u) <= 0.42 || Math.abs(v) <= 0.42 },
];
/* Inside-test for a regular n-gon of circumradius 1 centred on the origin. */
function polyTest(u, v, n, rot){
  const apo = Math.cos(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * TAU;
    if (u * Math.cos(a) + v * Math.sin(a) > apo) return false;
  }
  return true;
}
function shapeById(id){ return SHAPES.find(s => s.id === id) || SHAPES[0]; }

/* Picks a fresh deployment zone for the "Random" setting.
   Deliberately uses Math.random rather than the level-seeded generator RNG:
   that RNG is a pure function of the level number, so it returned the same
   zone for a given sector on every single run. Also avoids repeating the
   previous zone back to back. */
let _lastZone = -1;
function rollRandomZone(){
  if (THEMES.length < 2) return 0;
  let i = (Math.random() * THEMES.length) | 0;
  if (i === _lastZone) i = (i + 1 + ((Math.random() * (THEMES.length - 1)) | 0)) % THEMES.length;
  _lastZone = i;
  return i;
}
/* Random arena shapes follow the zone when no shape is pinned. */
let _lastShape = -1;
function rollRandomShape(){
  let i = (Math.random() * SHAPES.length) | 0;
  if (i === _lastShape) i = (i + 1) % SHAPES.length;
  _lastShape = i;
  return i;
}

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
    if (v === 3) this.hp[this.idx(c, r)] = CFG.STONE_HP;
    this.dirty = true;
  }
  /* destructible = brick or reinforced stone */
  breakable(c, r){ const v = this.get(c, r); return v === 2 || v === 3; }
  maxHp(c, r){ return this.get(c, r) === 3 ? CFG.STONE_HP : CFG.BRICK_HP; }
  solidAt(c, r){ return this.get(c, r) > 0; }
  solidAtXY(x, y){ return this.solidAt(Math.floor(x / CFG.TILE), Math.floor(y / CFG.TILE)); }
  cellOf(x, y){ return { c: Math.floor(x / CFG.TILE), r: Math.floor(y / CFG.TILE) }; }
  center(c, r){ return { x: c * CFG.TILE + CFG.TILE / 2, y: r * CFG.TILE + CFG.TILE / 2 }; }
  /* returns 0 = no effect, 1 = damaged, 2 = destroyed */
  damageTile(c, r, d){
    if (!this.breakable(c, r)) return 0;
    const i = this.idx(c, r);
    this.hp[i] = Math.max(0, this.hp[i] - d);
    this.dirty = true;
    if (this.hp[i] <= 0) { this.t[i] = 0; return 2; }
    return 1;
  }
  destroyBrick(c, r){
    if (!this.breakable(c, r)) return false;
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
    /* Ambient occlusion: a short gradient bleeding out of every wall
       onto the floor beside it. The drop shadow above gives the walls
       height; this gives the floor a corner to sit in, and together
       they are what stop the maze reading as flat coloured squares. */
    const AO = 10;
    for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
      if (this.solidAt(cc, r)) continue;
      const x = cc * T, y = r * T;
      const edge = (sc, sr, gx0, gy0, gx1, gy1, rx, ry, rw, rh) => {
        if (!this.solidAt(sc, sr)) return;
        const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, "rgba(0,0,0,0.20)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(rx, ry, rw, rh);
      };
      edge(cc, r - 1, x, y, x, y + AO, x, y, T, AO);
      edge(cc, r + 1, x, y + T, x, y + T - AO, x, y + T - AO, T, AO);
      edge(cc - 1, r, x, y, x + AO, y, x, y, AO, T);
      edge(cc + 1, r, x + T, y, x + T - AO, y, x + T - AO, y, AO, T);
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
      } else if (v === 4) {
        // tower: tall reinforced pillar, indestructible, blocks sight
        c.fillStyle = theme.tower.dark;
        c.fillRect(x, y, T, T);
        c.fillStyle = theme.tower.base;
        c.fillRect(x + 3, y + 3, T - 6, T - 6);
        c.fillStyle = theme.tower.light;
        c.fillRect(x + 3, y + 3, T - 6, 3);
        c.strokeStyle = theme.tower.dark;
        c.lineWidth = 2;
        c.strokeRect(x + 7.5, y + 7.5, T - 15, T - 15);
        // crenellations
        c.fillStyle = theme.tower.dark;
        for (let k = 0; k < 3; k++) c.fillRect(x + 6 + k * 14, y + 1, 8, 4);
        // beacon
        c.fillStyle = theme.tower.glow;
        c.globalAlpha = 0.85;
        c.beginPath(); c.arc(x + T / 2, y + T / 2, 4, 0, TAU); c.fill();
        c.globalAlpha = 1;
      } else if (v === 3) {
        // stone: heavy irregular blockwork, tougher than brick
        c.fillStyle = theme.stone.base;
        c.fillRect(x, y, T, T);
        c.fillStyle = theme.stone.dark;
        c.fillRect(x, y + T - 4, T, 4); c.fillRect(x + T - 4, y, 4, T);
        c.strokeStyle = theme.stone.line;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, y + T / 2); c.lineTo(x + T, y + T / 2);
        const off3 = ((cc + r) % 2) * (T / 3);
        c.moveTo(x + T / 3 + off3, y); c.lineTo(x + T / 3 + off3, y + T / 2);
        c.moveTo(x + T * 0.6 - off3, y + T / 2); c.lineTo(x + T * 0.6 - off3, y + T);
        c.stroke();
        // chipped highlights
        c.fillStyle = "rgba(255,255,255,0.05)";
        c.fillRect(x + 5, y + 4, T - 10, 3);
        const hp3 = this.hp[this.idx(cc, r)];
        if (hp3 < CFG.STONE_HP) {
          c.strokeStyle = "rgba(0,0,0,0.5)";
          c.lineWidth = 1.8;
          c.beginPath();
          const n3 = Math.min(5, CFG.STONE_HP - hp3);
          let px3 = x + T / 2, py3 = y + T / 2;
          for (let i = 0; i < n3; i++) {
            const nx = x + 5 + (((cc * 29 + r * 19 + i * 41) % 100) / 100) * (T - 10);
            const ny = y + 5 + (((cc * 11 + r * 37 + i * 23) % 100) / 100) * (T - 10);
            c.moveTo(px3, py3); c.lineTo(nx, ny);
            px3 = nx; py3 = ny;
          }
          c.stroke();
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

/* ---- pre-rendered themed floor ----
   Rendered once per sector at a quality-dependent scale: arenas are now
   twice as large in each dimension, so a full-resolution canvas would be a
   real memory cost on weak devices. Lower tiers render smaller and upscale. */
function buildFloor(map, theme, rng){
  const T = CFG.TILE;
  const WW = map.cols * T, HH = map.rows * T;
  /* Hard ceiling on the backing store. A 51x31 arena at scale 1.0 is
     2448x1488 = 3.6M px, about 14.6MB, allocated fresh every sector and
     sitting alongside the decal and light buffers — the single largest
     memory event in the game and the likeliest cause of the mobile
     crash rate. 1.6M px caps it near 6.4MB with no visible loss: this
     layer is soft texture under the tiles, not readable detail. */
  const MAX_PX = 1.6e6;
  let fs = QT.floorScale || 1;
  if (WW * HH * fs * fs > MAX_PX) fs = Math.sqrt(MAX_PX / (WW * HH));
  const made = SAFETY.canvas(WW * fs, HH * fs);
  if (!made) return null;              // caller falls back to a flat wash
  const cv = made.cv, c = made.cx;
  c.setTransform(fs, 0, 0, fs, 0, 0);
  const det = QT.detail || 1;

  // base wash with a soft gradient for depth
  const bg = c.createLinearGradient(0, 0, 0, HH);
  bg.addColorStop(0, theme.detail);
  bg.addColorStop(0.5, theme.floor);
  bg.addColorStop(1, theme.detail);
  c.fillStyle = bg;
  c.fillRect(0, 0, WW, HH);

  // seams
  c.strokeStyle = theme.seam;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= map.cols; x++) { c.moveTo(x * T + 0.5, 0); c.lineTo(x * T + 0.5, HH); }
  for (let y = 0; y <= map.rows; y++) { c.moveTo(0, y * T + 0.5); c.lineTo(WW, y * T + 0.5); }
  c.stroke();

  // large tonal blotches
  const n = map.cols * map.rows * 0.3 * det;
  for (let i = 0; i < n; i++) {
    const x = rng() * WW, y = rng() * HH;
    const r = 6 + rng() * 34;
    c.fillStyle = rng() < 0.5 ? theme.detail : "rgba(0,0,0,0.06)";
    c.globalAlpha = 0.12 + rng() * 0.2;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;

  // fine grain speckle — reads as concrete/sand texture up close
  const grains = Math.round(map.cols * map.rows * 2.0 * det);
  for (let i = 0; i < grains; i++) {
    const x = rng() * WW, y = rng() * HH;
    c.fillStyle = rng() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    c.fillRect(x, y, 1 + (rng() < 0.2 ? 1 : 0), 1);
  }

  // hazard chevrons / manholes
  for (let i = 0; i < map.cols * 0.5; i++) {
    const x = rng() * WW, y = rng() * HH;
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

  // painted lane markings and bay outlines
  for (let i = 0; i < map.cols * 0.3 * det; i++) {
    const x = Math.round(rng() * map.cols) * T, y = Math.round(rng() * map.rows) * T;
    c.strokeStyle = "rgba(255,255,255,0.05)";
    c.lineWidth = 3;
    if (rng() < 0.5) c.strokeRect(x + 6, y + 6, T * (1 + ((rng() * 2) | 0)) - 12, T - 12);
    else { c.beginPath(); c.moveTo(x, y + T / 2); c.lineTo(x + T * 2, y + T / 2); c.stroke(); }
  }

  // wet reflections: soft light streaks, richer tiers only
  if (QT.reflect) {
    c.globalCompositeOperation = "lighter";
    const tint = theme.ambient > 0.4 ? "150,200,235" : "255,235,190";
    for (let i = 0; i < map.cols * 0.9 * det; i++) {
      const x = rng() * WW, y = rng() * HH;
      const w = 10 + rng() * 26, h = 40 + rng() * 150;
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(" + tint + ",0.05)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
    }
    c.globalCompositeOperation = "source-over";
  }

  // vignette so the arena edges fall away
  const vg = c.createRadialGradient(WW / 2, HH / 2, Math.min(WW, HH) * 0.3,
                                    WW / 2, HH / 2, Math.max(WW, HH) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.30)");
  c.fillStyle = vg;
  c.fillRect(0, 0, WW, HH);
  return cv;
}

/* ================================================================
   ARENA CONNECTIVITY
   ----------------------------------------------------------------
   The maze is carved inside the arena shape and brick and stone are
   then scattered through it, which routinely seals whole pockets of
   floor off behind destructible walls. Such a pocket is reachable in
   the sense that you could shoot your way in, but no tank can DRIVE
   there — and the wave spawner used to drop hostiles straight into
   them, where they stayed for the rest of the sector, jammed against a
   wall they never break, never reaching the fight.

   So the arena is repaired here rather than merely inspected: every
   pocket gets a breach corridor cut through the destructible walls
   between it and the main arena, two tiles wide so a squad drives in
   abreast instead of queueing single file. Only a pocket walled in by
   steel or watchtowers — which the passes above cannot produce — is
   sealed off as a last resort.
   ================================================================ */
/* The cells a tank can drive to from (c,r) right now: open floor only,
   no shooting through anything. "Could you blast a way in" is a
   different question, and answering that one instead is what stranded
   the hostiles in the first place. */
function drivableFrom(map, c, r){
  const fl = _floodFrom(map, c, r, false);
  const out = new Uint8Array(map.cols * map.rows);
  for (let i = 0; i < out.length; i++) if (fl.dist[i] >= 0) out[i] = 1;
  return out;
}
/* Breadth-first over everything a shell can open — floor plus brick and
   stone — keeping the parent of each cell, so a route back to the start
   can be walked without searching again. */
function breachTree(map, sc, sr){
  const cols = map.cols, rows = map.rows;
  const parent = new Int32Array(cols * rows).fill(-2);   // -2 unvisited, -1 root
  const q = [sr * cols + sc];
  parent[q[0]] = -1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % cols, r = (i / cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 1 || nr < 1 || nc >= cols - 1 || nr >= rows - 1) continue;
      const ni = nr * cols + nc;
      if (parent[ni] !== -2) continue;
      const v = map.get(nc, nr);
      if (v !== 0 && v !== 2 && v !== 3) continue;        // steel and towers stay
      parent[ni] = i;
      q.push(ni);
    }
  }
  return parent;
}
/* Opens the cell and one destructible neighbour, so a cut corridor is
   two tiles wide and tanks are never funnelled into single file. The
   outer steel ring, steel walls and watchtowers are never touched. */
function widenCell(map, c, r){
  if (map.breakable(c, r)) map.set(c, r, 0);
  for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const cc = c + dc, rr = r + dr;
    if (cc < 1 || rr < 1 || cc >= map.cols - 1 || rr >= map.rows - 1) continue;
    if (map.breakable(cc, rr)) { map.set(cc, rr, 0); return; }
  }
}
/* Walks the breach tree back from `i` to the start, opening the route. */
function breachRoute(map, parent, i){
  const cols = map.cols;
  let n = i, guard = 0;
  if (parent[n] === -2) return false;                    // walled in by steel
  while (n >= 0 && guard++ < 8192) {
    widenCell(map, n % cols, (n / cols) | 0);
    n = parent[n];
  }
  return true;
}
/* Every floor cell that cannot be driven to, grouped into pockets. */
function orphanPockets(map, reach){
  const cols = map.cols, rows = map.rows;
  const mark = new Uint8Array(cols * rows);
  const out = [];
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    const i = r * cols + c;
    if (map.get(c, r) !== 0 || reach[i] || mark[i]) continue;
    const cells = [], q = [i];
    mark[i] = 1;
    for (let h = 0; h < q.length; h++) {
      const j = q[h];
      cells.push(j);
      const jc = j % cols, jr = (j / cols) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = jc + dc, nr = jr + dr;
        if (nc < 1 || nr < 1 || nc >= cols - 1 || nr >= rows - 1) continue;
        const ni = nr * cols + nc;
        if (mark[ni] || map.get(nc, nr) !== 0) continue;
        mark[ni] = 1;
        q.push(ni);
      }
    }
    out.push({ i, cells });
  }
  return out;
}
/* Makes every floor cell in the arena drivable from (sc,sr). Returns
   what it had to do, which the generation self-check reads. */
function connectArena(map, sc, sr){
  const cols = map.cols;
  let breached = 0, sealed = 0;
  for (let pass = 0; pass < 6; pass++) {
    const pockets = orphanPockets(map, drivableFrom(map, sc, sr));
    if (!pockets.length) break;
    const parent = breachTree(map, sc, sr);
    for (const p of pockets) {
      if (breachRoute(map, parent, p.i)) { breached++; continue; }
      // no route even through destructible walls: nothing may live there
      for (const j of p.cells) map.set(j % cols, (j / cols) | 0, 1);
      sealed++;
    }
  }
  return { breached, sealed };
}

/* ---- braided maze generator ----
   Carves inside the sector's arena shape, braids dead ends into loops,
   opens rooms, seeds stone and tower tiles, then guarantees every
   remaining floor cell can be DRIVEN to from the player's spawn, so no
   hostile is ever deployed behind a wall it cannot pass. ---- */
function genLevel(level, opts){
  opts = opts || {};
  const baseSeed = opts.seed !== undefined ? opts.seed
    : (SETTINGS && SETTINGS.location === "random" ? (Math.random() * 0x7fffffff) | 0 : 0xC0FFEE);
  const rng = mulberry32(baseSeed ^ (level * 2654435761));
  // Arena size: half of the doubled layout, so the playfield stays tight
  // and readable in every mode.
  let cols = clamp(29 + level * 2, 29, 51);
  let rows = clamp(20 + Math.floor(level * 1.2), 20, 31);
  if (cols % 2 === 0) cols++;
  if (rows % 2 === 0) rows++;
  const map = new TileMap(cols, rows);
  map.t.fill(1);

  const shape = opts.shape ? shapeById(opts.shape)
    : (SETTINGS && SETTINGS.location === "random" ? SHAPES[rollRandomShape()]
                                                  : SHAPES[(level - 1) % SHAPES.length]);
  const inShape = (c, r) => {
    if (c <= 0 || r <= 0 || c >= cols - 1 || r >= rows - 1) return false;
    const u = (c / (cols - 1)) * 2 - 1;
    const v = (r / (rows - 1)) * 2 - 1;
    return shape.test(u, v);
  };
  // odd-lattice start cell that lies inside the shape
  let sc = 1, sr = 1, found = false;
  const midC = ((cols / 2) | 0) | 1, midR = ((rows / 2) | 0) | 1;
  outerStart: for (let ring = 0; ring < Math.max(cols, rows); ring++) {
    for (let dr = -ring; dr <= ring; dr += 2) for (let dc = -ring; dc <= ring; dc += 2) {
      const c = midC + dc, r = midR + dr;
      if (c > 0 && r > 0 && c < cols - 1 && r < rows - 1 && inShape(c, r)) {
        sc = c; sr = r; found = true; break outerStart;
      }
    }
  }
  if (!found) { sc = midC; sr = midR; }

  // recursive backtracker restricted to the shape
  const stack = [[sc, sr]];
  map.set(sc, sr, 0);
  const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const opts2 = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (inShape(nc, nr) && inShape(c + dc / 2, r + dr / 2) && map.get(nc, nr) === 1) opts2.push([dc, dr]);
    }
    if (!opts2.length) { stack.pop(); continue; }
    const [dc, dr] = opts2[(rng() * opts2.length) | 0];
    map.set(c + dc / 2, r + dr / 2, 0);
    map.set(c + dc, r + dr, 0);
    stack.push([c + dc, r + dr]);
  }
  // braid: open ~45% of dead ends so the AI has loops to flank through
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (map.get(c, r) !== 0) continue;
    const walls = [];
    if (map.get(c + 1, r) === 1 && inShape(c + 1, r)) walls.push([c + 1, r]);
    if (map.get(c - 1, r) === 1 && inShape(c - 1, r)) walls.push([c - 1, r]);
    if (map.get(c, r + 1) === 1 && inShape(c, r + 1)) walls.push([c, r + 1]);
    if (map.get(c, r - 1) === 1 && inShape(c, r - 1)) walls.push([c, r - 1]);
    if (walls.length === 3 && rng() < 0.45) {
      const w = walls[(rng() * walls.length) | 0];
      map.set(w[0], w[1], 0);
    }
  }
  // carve open arenas
  const roomN = 3 + Math.floor(level / 2);
  for (let i = 0; i < roomN; i++) {
    const rw = 3 + 2 * ((rng() * 2) | 0), rh = 3 + 2 * ((rng() * 2) | 0);
    const rc = 1 + 2 * ((rng() * ((cols - rw - 2) / 2)) | 0);
    const rr = 1 + 2 * ((rng() * ((rows - rh - 2) / 2)) | 0);
    let touches = false;
    for (let r = rr; r < Math.min(rows - 1, rr + rh) && !touches; r++)
      for (let c = rc; c < Math.min(cols - 1, rc + rw); c++)
        if (inShape(c, r) && map.get(c, r) === 0) { touches = true; break; }
    if (!touches) continue;                 // never carve an island room
    for (let r = rr; r < Math.min(rows - 1, rr + rh); r++)
      for (let c = rc; c < Math.min(cols - 1, rc + rw); c++)
        if (inShape(c, r)) map.set(c, r, 0);
  }
  // convert interior walls to destructible brick, with tougher stone
  // appearing more often on later sectors
  const brickChance = clamp(0.42 + level * 0.015, 0.42, 0.6);
  const stoneShare = clamp(0.12 + level * 0.03, 0.12, 0.45);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (map.get(c, r) !== 1 || !inShape(c, r)) continue;
    const nearFloor = map.get(c + 1, r) === 0 || map.get(c - 1, r) === 0 ||
                      map.get(c, r + 1) === 0 || map.get(c, r - 1) === 0;
    if (nearFloor && rng() < brickChance) map.set(c, r, rng() < stoneShare ? 3 : 2);
  }
  // watchtowers: indestructible pillars dropped into open ground for cover.
  // Only placed where they leave the surrounding cells walkable.
  const towerN = Math.min(10, 2 + level);
  let tTries = 0;
  for (let i = 0; i < towerN && tTries < 200; ) {
    tTries++;
    const c = 2 + ((rng() * (cols - 4)) | 0), r = 2 + ((rng() * (rows - 4)) | 0);
    if (map.get(c, r) !== 0 || !inShape(c, r)) continue;
    let open = 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.get(c + dc, r + dr) === 0) open++;
    if (open < 3) continue;                 // never plug a corridor
    map.set(c, r, 4);
    i++;
  }

  /* Connectivity pass — see connectArena(). Every floor cell left in the
     arena is drivable from the maze's own start cell, so a hostile can
     never be deployed somewhere it cannot drive out of. */
  connectArena(map, sc, sr);

  // player spawn: first surviving (therefore reachable) floor cell
  let playerCell = [sc, sr];
  outer: for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++)
    if (map.get(c, r) === 0) { playerCell = [c, r]; break outer; }
  const ps = map.center(playerCell[0], playerCell[1]);
  // clear a small safe pocket around spawn
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const cc = playerCell[0] + dc, rr = playerCell[1] + dr;
    if (cc > 0 && rr > 0 && cc < cols - 1 && rr < rows - 1 && map.breakable(cc, rr)) map.set(cc, rr, 0);
  }

  // barrels: floor cells away from spawn
  const barrels = [];
  const want = 9 + level * 2;
  let tries = 0;
  while (barrels.length < want && tries++ < 1200) {
    const c = 1 + ((rng() * (cols - 2)) | 0), r = 1 + ((rng() * (rows - 2)) | 0);
    if (map.get(c, r) !== 0) continue;
    const p = map.center(c, r);
    if (dist2(p.x, p.y, ps.x, ps.y) < (CFG.TILE * 6) ** 2) continue;
    if (barrels.some(b => Math.abs(b.c - c) + Math.abs(b.r - r) < 3)) continue;
    barrels.push({ c, r });
  }
  /* Enemy emplacements — spread out with a minimum spacing so the arena
     never feels crowded, and kept clear of the player's spawn. */
  const emplacements = [];
  const EMP_MIN = CFG.TILE * 7;
  const empWant = Math.min(12, 3 + Math.floor(level * 0.9));
  let eTries = 0;
  while (emplacements.length < empWant && eTries++ < 900) {
    const c = 2 + ((rng() * (cols - 4)) | 0), r = 2 + ((rng() * (rows - 4)) | 0);
    if (map.get(c, r) !== 0) continue;
    const p2 = map.center(c, r);
    if (dist2(p2.x, p2.y, ps.x, ps.y) < (CFG.TILE * 9) ** 2) continue;
    if (emplacements.some(e => dist2(e.x, e.y, p2.x, p2.y) < EMP_MIN * EMP_MIN)) continue;
    if (barrels.some(b => Math.abs(b.c - c) + Math.abs(b.r - r) < 3)) continue;
    const kind = rng() < 0.5 ? "nest" : (rng() < 0.5 ? "tower" : "bunker");
    emplacements.push({ kind, x: p2.x, y: p2.y });
  }

  let theme;
  if (opts.theme !== undefined && opts.theme !== null) theme = THEMES[opts.theme % THEMES.length];
  else if (SETTINGS && SETTINGS.location === "random") theme = THEMES[rollRandomZone()];
  else if (SETTINGS && SETTINGS.location !== undefined && SETTINGS.location !== "rotate")
    theme = THEMES[(+SETTINGS.location || 0) % THEMES.length];
  else theme = THEMES[(level - 1) % THEMES.length];
  return { map, theme, shape, floorCv: buildFloor(map, theme, rng), playerSpawn: ps, barrels, emplacements, rng };
}

/* ================================================================
   TEAM DEPLOYMENT — headquarters and squad staging on an ordinary arena
   The team modes deliberately reuse the maps, maze shapes and locations
   every other mode generates; all they need from the generator is two
   well-separated ends of the same arena and a clear yard at each.
   ================================================================ */
/* Breadth-first flood, returning the distance field and the last cell
   reached. `breach` matches the generator's own notion of reachability:
   destructible walls are passable because a tank simply shoots through
   them. Without it the flood walks open floor only, which is what an
   "can a tank drive there right now" test needs. */
function _floodFrom(map, sc, sr, breach){
  const cols = map.cols, rows = map.rows;
  const dist = new Int32Array(cols * rows).fill(-1);
  const q = [sr * cols + sc];
  dist[sr * cols + sc] = 0;
  let last = sr * cols + sc;
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    last = i;
    const c = i % cols, r = (i / cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 1 || nr < 1 || nc >= cols - 1 || nr >= rows - 1) continue;
      const ni = nr * cols + nc;
      if (dist[ni] >= 0) continue;
      const v = map.get(nc, nr);
      if (v !== 0 && !(breach && (v === 2 || v === 3))) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return { dist, last, cols };
}
/* Clears the destructible walls along the shortest breach route between
   two cells, turning it into a two-tile-wide corridor a squad can simply
   drive down. Used to give the two headquarters a route between them
   that is a road rather than a wall to shoot through. */
function openCorridor(map, a, b){
  const path = findPath(map, a.c, a.r, b.c, b.r, { breach: true });
  if (!path) return false;
  for (const n of path) widenCell(map, n.c, n.r);
  return true;
}
/* The two open cells that are physically farthest apart, both reachable
   from each other.

   Note this is deliberately NOT the graph diameter. A maze's diameter
   endpoints are far apart measured along corridors but are routinely
   only a few tiles apart on the floor — two headquarters placed that way
   end up almost touching. Straight-line separation is what actually
   matters for staging two squads, so that is what gets maximised, with
   the flood only used to keep both ends mutually reachable. */
function farthestOpenPair(map, wantGap){
  const cols = map.cols, rows = map.rows;
  let start = -1;
  outer: for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++)
    if (map.get(c, r) === 0) { start = r * cols + c; break outer; }
  if (start < 0) return null;
  // breach reachability, matching the connectivity the generator guarantees
  const fl = _floodFrom(map, start % cols, (start / cols) | 0, true);
  /* Candidates: reachable cells, preferring ones with breathing room so a
     headquarters is never wedged into a dead-end nook. In a tight maze
     roomy cells can all sit in one pocket, which would put both bases on
     top of each other — so the unrestricted set is measured too and wins
     whenever it separates the two ends materially better. */
  const roomy = [], any = [];
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (fl.dist[r * cols + c] < 0) continue;
    any.push({ c, r });
    let open = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
      if (map.get(c + dc, r + dr) === 0) open++;
    if (open >= 7) roomy.push({ c, r });
  }
  if (any.length < 2) return null;
  /* With no target gap this returns the widest pair. With one, it returns
     the pair closest to that separation: two headquarters at opposite
     corners of a large maze are unreachable in practice — squads die
     crossing the contested middle and neither objective is ever touched —
     so the team modes ask for a deliberate, tractable distance instead of
     the maximum the arena allows. */
  const widest = (cand) => {
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
      const dc = cand[i].c - cand[j].c, dr = cand[i].r - cand[j].r;
      const d = dc * dc + dr * dr;
      const score = wantGap ? -Math.abs(Math.sqrt(d) - wantGap) : d;
      if (score > bestScore) { bestScore = score; best = [cand[i], cand[j]]; }
    }
    if (!best) return null;
    const dc = best[0].c - best[1].c, dr = best[0].r - best[1].r;
    return { a: best[0], b: best[1], gap: Math.hypot(dc, dr) };
  };
  /* widest() is O(n^2), and `any` routinely holds around a thousand
     cells — half a million distance tests, run twice, synchronously, at
     level start. On a phone that is a multi-hundred-millisecond freeze
     the browser can score as a hang. A stratified sample of 160 cells
     picks the same pair to within a tile for 2% of the work. */
  const cap = (arr, n) => {
    if (arr.length <= n) return arr;
    const out = [], step = arr.length / n;
    for (let i = 0; i < n; i++) out.push(arr[(i * step) | 0]);
    return out;
  };
  const wide = widest(cap(any, 160));
  const nice = roomy.length >= 2 ? widest(cap(roomy, 160)) : null;
  const better = wantGap
    ? (nice && Math.abs(nice.gap - wantGap) <= Math.abs(wide.gap - wantGap) + 3)
    : (nice && nice.gap >= wide.gap * 0.8);
  const outcome = better ? nice : wide;
  outcome.span = fl.dist[outcome.b.r * cols + outcome.b.c];
  return outcome;
}
/* Clears a yard for a headquarters. Everything inside the radius goes
   except the arena's outer steel ring, which must stay sealed. */
function carveYard(map, c, r, rad){
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    if (dc * dc + dr * dr > rad * rad) continue;
    const cc = c + dc, rr = r + dr;
    if (cc < 1 || rr < 1 || cc >= map.cols - 1 || rr >= map.rows - 1) continue;
    if (map.get(cc, rr) !== 0) map.set(cc, rr, 0);
  }
}
/* Open floor cells within `rad` of a point, nearest first — squad
   staging positions around a headquarters. */
function openCellsNear(map, c, r, rad, skip){
  const out = [];
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const d2 = dc * dc + dr * dr;
    if (d2 > rad * rad || d2 < (skip || 0) ** 2) continue;
    const cc = c + dc, rr = r + dr;
    if (cc < 1 || rr < 1 || cc >= map.cols - 1 || rr >= map.rows - 1) continue;
    if (map.get(cc, rr) !== 0) continue;
    out.push({ c: cc, r: rr, d2 });
  }
  out.sort((p, q) => p.d2 - q.d2);
  return out;
}

/* ---- A* pathfinding (4-dir, optional brick-breach costing) ---- */
function findPath(map, sc, sr, tc, tr, opts){
  opts = opts || {};
  const cols = map.cols, rows = map.rows;
  const passCost = (c, r) => {
    const v = map.get(c, r);
    if (v === 0) return 1;
    if (v === 2 && opts.breach) return 6;
    if (v === 3 && opts.breach) return 12;
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
