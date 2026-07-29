"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/config.js
   SECTION 1-2 — Config, quality tiers, math utilities, seeded RNG, persistent save / settings / lifetime stats.
   ================================================================ */
/* ================================================================
   SECTION 1 — CONFIG, QUALITY, MATH
   ================================================================ */
const TAU = Math.PI * 2;

const CFG = {
  TILE: 48,            // world tile size (px)
  STEP: 1 / 60,        // fixed physics timestep
  MAX_SUBSTEPS: 4,
  BRICK_HP: 3,
  STONE_HP: 7,        // reinforced stone blocks
  PLAYER_HP: 100,
  BOMB_FUSE: 1.1,
  BOMB_RADIUS: 112,
  BOMB_DMG: 62,
  COMBO_WINDOW: 4.0,
  COMBO_MAX: 6,
  SIGHT_RANGE: 540,
  HEAR_MEMORY: 4.0,
  MINE_CAP: 14,
  /* Team modes: how many tanks a side may field, and how long a side
     that still holds its headquarters waits before reinforcing. */
  SQUAD_MIN: 2,
  SQUAD_MAX: 5,
  SQUAD_RESPAWN: 10,
  /* How close a hostile tank must be before an assault unit breaks off
     from the headquarters it is besieging to defend itself. */
  ASSAULT_THREAT: 300,
  /* Tiles between the two staging ends. Base Assault is tighter because
     a squad has to survive the crossing to reach the objective at all. */
  BASE_GAP: 15,
  TEAM_GAP: 20,
  VERSION: "1.0",
};

const QUALITY = {
  /* floorScale keeps the pre-rendered floor canvas affordable on weaker
     devices now that arenas are twice as large in each dimension. */
  ultra:{ parts: 2000, lightScale: 1.0,  weather: 1.4, shellLights: 40, dpr: 2.0, floorScale: 1.0,  detail: 1.6, reflect: true },
  high: { parts: 1000, lightScale: 1.0,  weather: 1.0, shellLights: 26, dpr: 2.0, floorScale: 1.0,  detail: 1.0, reflect: true },
  med:  { parts: 520,  lightScale: 0.6,  weather: 0.6, shellLights: 12, dpr: 1.5, floorScale: 0.7,  detail: 0.6, reflect: false },
  low:  { parts: 240,  lightScale: 0.45, weather: 0.3, shellLights: 4,  dpr: 1.0, floorScale: 0.5,  detail: 0.35, reflect: false },
};
const QUALITY_TIERS = ["ultra", "high", "med", "low"];
let QT = QUALITY.ultra;  // resolved quality tier
let autoTier = 0;        // index into QUALITY_TIERS (when quality === 'auto')

/* ---- math helpers ---- */
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t){ return a + (b - a) * t; }
function rand(a, b){ return a + Math.random() * (b - a); }
function randInt(a, b){ return Math.floor(rand(a, b + 1)); }
function pick(arr){ return arr[(Math.random() * arr.length) | 0]; }
function chance(p){ return Math.random() < p; }
function dist(ax, ay, bx, by){ return Math.hypot(bx - ax, by - ay); }
function dist2(ax, ay, bx, by){ const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function wrapAng(a){
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function angDiff(a, b){ return wrapAng(b - a); }
function angMove(cur, tgt, maxStep){
  const d = wrapAng(tgt - cur);
  if (Math.abs(d) <= maxStep) return tgt;
  return cur + Math.sign(d) * maxStep;
}
function easeOutCubic(t){ t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t){
  t = clamp(t, 0, 1);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function expLerp(cur, tgt, rate, dt){ return cur + (tgt - cur) * (1 - Math.exp(-rate * dt)); }
function fmt(n){
  n = Math.round(n);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function padTime(sec){
  sec = Math.max(0, sec | 0);
  const m = (sec / 60) | 0, s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}
/* deterministic RNG for level generation */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================
   SECTION 2 — SAVE / SETTINGS
   ================================================================ */
const SAVE = {
  key: "atmb_save_v1",
  data: null,
  defaults(){
    return {
      v: 2,
      settings: { sfx: 0.8, music: 0.55, shake: 1, quality: "ultra", crt: false, fps: false, difficulty: "master", location: "random", teamSize: 3 },
      scores: [],
      /* salvage = the non-ad currency players can spend on the same
         bonuses the rewarded ads grant (SDK requires an alternative).
         bestPct = highest completion % already reported to CrazyGames. */
      stats: { kills: 0, deaths: 0, shots: 0, hits: 0, bombs: 0, levels: 0, bricks: 0, playTime: 0, best: 0, games: 0, salvage: 0, bestPct: 0 },
    };
  },
  load(){
    try {
      // CG.storage = CrazyGames data module (cross-device) with a
      // localStorage fallback and automatic migration of old saves.
      const raw = CG.storage.getItem(this.key);
      const d = this.defaults();
      if (raw) {
        const p = JSON.parse(raw);
        d.settings = Object.assign(d.settings, p.settings || {});
        d.stats = Object.assign(d.stats, p.stats || {});
        d.scores = Array.isArray(p.scores) ? p.scores : [];
        d.lastMode = p.lastMode;
        /* v2 raised the baseline difficulty and made Master the default.
           Saves written before that carried the old default, so they are
           moved onto the new one once; anything the player had actually
           chosen for themselves is left alone. */
        if ((p.v | 0) < 2 && (!p.settings || p.settings.difficulty === "adaptive"))
          d.settings.difficulty = "master";
      }
      this.data = d;
    } catch (e) { this.data = this.defaults(); }
  },
  persist(){
    try { CG.storage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
  },
  addScore(score, level){
    this.data.scores.push({ s: score, l: level, d: Date.now() });
    this.data.scores.sort((a, b) => b.s - a.s);
    this.data.scores = this.data.scores.slice(0, 10);
    let isRecord = false;
    if (score > this.data.stats.best) { this.data.stats.best = score; isRecord = score > 0; }
    this.persist();
    return isRecord;
  },
  wipe(){ this.data = this.defaults(); this.persist(); },
};
let SETTINGS = null; // alias to SAVE.data.settings, assigned at boot
