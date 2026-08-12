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
  /* Field repairs granted at the start of every run, spent before the
     run is allowed to end. The only way past death used to be a
     rewarded ad or 150 salvage, and a first-session player has neither —
     so one mistake ended the session at the four-minute mark. */
  FREE_CONTINUES: 2,
  /* Dead time between waves. Long prep beats read as padding, and a
     bored player closes the tab rather than waiting one out. */
  PREP_FIRST: 1.6,
  PREP_WAVE: 2.2,
  VERSION: "2.0",
};

const QUALITY = {
  /* floorScale keeps the pre-rendered floor canvas affordable on weaker
     devices now that arenas are twice as large in each dimension. It is
     also capped absolutely in buildFloor(), because a scale of 1.0 on a
     51x31 arena is a 14.6MB allocation every single sector — which is
     what the 2.67% load-crash and 1.24% gameplay-crash rates were made
     of on phones. High no longer asks a mid-range device for a
     desktop-sized buffer. */
  ultra:{ parts: 2000, lightScale: 1.0,  weather: 1.4, shellLights: 40, dpr: 2.0,  floorScale: 1.0,  detail: 1.6, reflect: true },
  high: { parts: 900,  lightScale: 0.85, weather: 1.0, shellLights: 26, dpr: 1.75, floorScale: 0.8,  detail: 1.0, reflect: true },
  med:  { parts: 480,  lightScale: 0.6,  weather: 0.6, shellLights: 12, dpr: 1.5,  floorScale: 0.6,  detail: 0.6, reflect: false },
  low:  { parts: 240,  lightScale: 0.45, weather: 0.3, shellLights: 4,  dpr: 1.0,  floorScale: 0.45, detail: 0.35, reflect: false },
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
      v: 3,
      /* Set once the first-run briefing has been seen or skipped. It
         lives in the save rather than in localStorage, so it follows the
         player's CrazyGames account to every device they play on. */
      onboarded: false,
      /* The CrazyGames account this service record was explicitly linked
         to through the platform's account-link modal — null until the
         player answers "yes". The save already syncs to the account via
         the data module regardless; this records the player's stated
         consent, and the menu badge reads it to offer (or stop offering)
         the link action. */
      linkedId: null,
      /* Adaptive is the default. Master asks a stranger to fight tanks
         with +42% hull, +42% spawn budget, a 47% faster rate of fire,
         34% tighter aim and 24% fewer supply drops than Soldier — a
         veteran tier handed to someone who has never driven the tank,
         and the reason the median session ran four minutes. Adaptive
         starts near Soldier and climbs to Master on its own, for the
         players who earn it. */
      settings: { sfx: 0.8, music: 0.55, shake: 1, quality: "ultra", crt: false, fps: false, difficulty: "adaptive", location: "random", teamSize: 3 },
      scores: [],
      /* salvage = the non-ad currency players can spend on the same
         bonuses the rewarded ads grant (SDK requires an alternative).
         bestPct = highest completion % already reported to CrazyGames. */
      stats: { kills: 0, deaths: 0, shots: 0, hits: 0, bombs: 0, levels: 0, bricks: 0, playTime: 0, best: 0, games: 0, salvage: 0, bestPct: 0 },
      /* Everything that survives a run: operator level, unlocks, the
         daily operation and its streak, today's contracts and the
         sector checkpoint. Shape is owned by META.defaults(); this is
         only the storage slot inside the synced save document. */
      meta: null,
    };
  },
  load(){
    try {
      /* CG.storage = the CrazyGames data module: the single store for
         every player, guest or signed in, synced across their devices.
         It falls back to localStorage only where there is no SDK at all
         (a self-hosted copy of this repository). */
      const raw = CG.storage.getItem(this.key);
      const d = this.defaults();
      if (raw) {
        const p = JSON.parse(raw);
        d.settings = Object.assign(d.settings, p.settings || {});
        d.stats = Object.assign(d.stats, p.stats || {});
        d.scores = Array.isArray(p.scores) ? p.scores : [];
        d.lastMode = p.lastMode;
        d.onboarded = !!p.onboarded;
        d.linkedId = typeof p.linkedId === "string" && p.linkedId ? p.linkedId : null;
        d.meta = p.meta && typeof p.meta === "object" ? p.meta : null;
        /* v3 reverses the v2 migration. v2 moved every unconfigured save
           onto Master, which is a tier for players who ask for it; anyone
           who never opened the difficulty select goes back to adaptive.
           A tier the player chose themselves is still theirs. */
        if ((p.v | 0) < 3 && (!p.settings || p.settings.difficulty === "master"))
          d.settings.difficulty = "adaptive";
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
  /* Wipe Data (Record tab): the full, player-initiated reset. It runs
     the whole data-module surface in order — the save record itself is
     removed, every remaining stored key is cleared, and then a fresh
     baseline is written back so the next launch starts clean instead of
     resurrecting anything from a stale copy. */
  wipe(){
    try {
      CG.storage.removeItem(this.key);   // drop the save record
      CG.storage.clear();                // sweep every remaining game key
    } catch (e) { /* storage unavailable — the reset below still applies */ }
    this.data = this.defaults();
    this.persist();
  },
};
let SETTINGS = null; // alias to SAVE.data.settings, assigned at boot
