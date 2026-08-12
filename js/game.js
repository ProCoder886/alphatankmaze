"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/game.js
   SECTION 10-12 — Adaptive AI Director, WORLD entity container + simulation step, minimap, game state machine, waves, scoring, combo, hints.
   ================================================================ */
/* ================================================================
   SECTION 10 — ADAPTIVE AI DIRECTOR ("AI game conditions")
   Tracks a live skill estimate from the player's performance and
   tunes enemy aim, speed, HP, spawn budgets and wave modifiers.
   ================================================================ */
/* Difficulty tiers. The skill value drives the shared 0..1 curves below;
   the multipliers on top are what let a tier push past what that curve
   alone can reach, which is how Master and Legendary get harder than
   Veteran rather than just pinning the curve at its old maximum.
     fire   — reload multiplier, so lower is a faster rate of fire
     aim    — spread multiplier, lower is more accurate
     react  — sniper lock and boss attack cadence, lower is quicker
     drops  — pickup rate, lower is stingier */
const DIFFS = {
  easy:      { skill: 0.18, fire: 1.10, speed: 0.96, hp: 0.92, aim: 1.15, react: 1.15, budget: 0.88, drops: 1.20 },
  normal:    { skill: 0.50, fire: 0.94, speed: 1.02, hp: 1.05, aim: 0.94, react: 1.00, budget: 1.06, drops: 1.00 },
  hard:      { skill: 0.85, fire: 0.82, speed: 1.08, hp: 1.20, aim: 0.82, react: 0.88, budget: 1.20, drops: 0.88 },
  master:    { skill: 1.00, fire: 0.68, speed: 1.16, hp: 1.42, aim: 0.66, react: 0.74, budget: 1.42, drops: 0.76 },
  legendary: { skill: 1.00, fire: 0.55, speed: 1.26, hp: 1.70, aim: 0.50, react: 0.60, budget: 1.70, drops: 0.64 },
};
const DIFF_ORDER = ["adaptive", "easy", "normal", "hard", "master", "legendary"];
const DIFF_NAMES = {
  adaptive: "Adaptive (AI Director)", easy: "Recruit", normal: "Soldier",
  hard: "Veteran", master: "Master", legendary: "Legendary",
};
const DIRECTOR = {
  skill: 0.45, // 0 (struggling) .. 1 (dominating)
  reset(){ this.skill = 0.45; },
  nudge(v){ this.skill = clamp(this.skill + v, 0, 1); },
  onPlayerKill(){ this.nudge(0.013); },
  onPlayerHit(dmg){ this.nudge(-dmg * 0.0009); },
  onPlayerDeath(){ this.nudge(-0.16); },
  onWaveClear(fast){ this.nudge(fast ? 0.03 : 0.008); },
  /* The adaptive setting has no tier of its own: it rides the live skill
     estimate and takes the neutral multipliers. */
  tier(){ return DIFFS[SETTINGS.difficulty] || null; },
  mul(k){ const t = this.tier(); return t ? t[k] : 1; },
  _fixed(){ const t = this.tier(); return t ? t.skill : null; },
  eff(){ const f = this._fixed(); return f === null ? this.skill : f; },
  /* A first-session operator is not a returning veteran, and the live
     skill estimate needs evidence before it is allowed to bite. The
     first six runs are scaled down on a curve that reaches 1.0 by the
     seventh — long enough to learn the controls, short enough that a
     player who sticks around never notices it was there. */
  graceMul(){
    const runs = SAVE.data.stats.games | 0;
    return runs >= 6 ? 1 : lerp(0.70, 1, runs / 6);
  },
  /* Every sector is meant to be harder than the one before it, on top of
     whatever the tier already asks for. */
  levelRamp(){ return 1 + (GAME.level - 1) * 0.05; },
  aimErrMul(){ return lerp(1.55, 0.42, this.eff()) * this.mul("aim") / this.levelRamp(); },
  leadMul(){ return lerp(0.55, 1.25, this.eff()) * Math.min(1.35, this.levelRamp()); },
  speedMul(){ return lerp(0.9, 1.16, this.eff()) * this.mul("speed") * Math.min(1.22, this.levelRamp()) * lerp(1, this.graceMul(), 0.6); },
  hpMul(){ return lerp(0.88, 1.25, this.eff()) * this.mul("hp") * this.graceMul(); },
  /* Rate of fire: hostile reload is scaled down by tier and by sector.
     Dividing by grace makes the early reload longer, not shorter. */
  reloadMul(){ return clamp(lerp(1.12, 0.86, this.eff()) * this.mul("fire") / this.levelRamp() / this.graceMul(), 0.32, 1.4); },
  lockMul(){ return lerp(1.35, 0.7, this.eff()) * this.mul("react"); },
  /* Boss attack cadence and enemy special-ability timers. */
  aggroMul(){ return clamp(lerp(1.2, 0.82, this.eff()) * this.mul("react"), 0.4, 1.3); },
  dropChance(){ return lerp(0.34, 0.17, this.eff()) * this.mul("drops"); },
  budget(level, wave){
    return Math.round((13 + level * 7 + wave * 4.6) * lerp(0.75, 1.3, this.eff()) * this.mul("budget") * this.graceMul());
  },
  compose(level, budget){
    const unlocked = ["grunt"];
    if (level >= 1) unlocked.push("hunter", "scout");
    if (level >= 2) unlocked.push("bomber");
    if (level >= 3) unlocked.push("sniper");
    if (level >= 4) unlocked.push("heavy", "stealth");
    if (level >= 2) unlocked.push("lighttank");
    if (level >= 4) unlocked.push("panzer");
    if (level >= 5) unlocked.push("artillery");
    if (level >= 6) unlocked.push("guardian", "support");
    if (level >= 7) unlocked.push("mbt");
    const out = [];
    let guard = 0;
    /* The concurrent cap grows with the sector rather than sitting flat.
       The higher tiers buy a lot of budget, and spending all of it at
       once in sector 1 is a wall rather than a difficulty curve — and it
       costs frames on a phone for no gain. Early sectors stay readable;
       later ones get genuinely crowded. */
    /* A phone runs the same tactical FSM, the same A* repaths and the
       same particle budget on a fraction of the GPU. Fewer but heavier
       tanks read as the same pressure and hold the frame rate — and a
       dropped frame rate is a short session, which is the metric this
       is really protecting. */
    const mob = CG.device === "mobile" || CG.device === "tablet" || INPUT.usingTouch;
    const cap = mob ? clamp(4 + level, 4, 9) : clamp(6 + level, 6, 14);
    while (budget > 0 && out.length < cap && guard++ < 60) {
      const affordable = unlocked.filter(t => ENEMY_TYPES[t].cost <= budget);
      if (!affordable.length) break;
      /* With the count capped, a bigger budget has to buy heavier units
         rather than go unspent — that is what makes a wave on Master feel
         different from the same seven tanks on Soldier. */
      const perSlot = budget / Math.max(1, cap - out.length);
      const heavy = affordable.filter(t => ENEMY_TYPES[t].cost >= perSlot * 0.65);
      const t = pick(heavy.length ? heavy : affordable);
      out.push(t);
      budget -= ENEMY_TYPES[t].cost;
    }
    if (!out.length) out.push("grunt");
    return out;
  },
  /* wave modifiers = dynamic AI game conditions */
  MODS: [
    { id: "swift",   label: "SWIFT PROTOCOL",  apply: { speed: 1.28 } },
    { id: "armored", label: "ARMORED COLUMN",  apply: { hp: 1.45, score: 1.3 } },
    { id: "elite",   label: "ELITE UNITS",     apply: { aim: 0.6, score: 1.5 } },
    { id: "blackout",label: "BLACKOUT",        apply: {}, ambient: 0.28 },
    { id: "bombrush",label: "BOMB RUSH",       apply: {}, force: ["bomber", "bomber", "bomber", "grunt", "grunt"] },
    { id: "swarm",   label: "SCOUT SWARM",     apply: { speed: 1.1 }, force: ["scout", "scout", "scout", "scout", "scout", "scout"] },
    { id: "siegeline",label: "SIEGE LINE",     apply: { hp: 1.2 }, force: ["artillery", "artillery", "guardian", "grunt"] },
    { id: "ghosts",  label: "GHOST PROTOCOL",  apply: { aim: 0.8 }, force: ["stealth", "stealth", "stealth", "hunter"] },
    { id: "armor",   label: "PANZER DIVISION", apply: { hp: 1.15 }, force: ["panzer", "panzer", "mbt", "support"] },
    { id: "recon",   label: "RECON SWEEP",     apply: { speed: 1.15 }, force: ["lighttank", "lighttank", "lighttank", "scout", "scout"] },
  ],
  rollModifier(level, wave){
    if (wave < 2 || level < 2) return null;
    if (!chance(0.45 + this.eff() * 0.3)) return null;
    return pick(this.MODS);
  },
};

/* ================================================================
   SECTION 11 — WORLD (entity container + simulation step)
   ================================================================ */
/* Separation push, applied per axis and refused where it would drive a
   tank into geometry. A crowded corridor generates a lot of these
   shoves, and an unchecked one can bury a tank in a wall it then has to
   crawl back out of — which reads as a hostile jammed in the scenery. */
function shoveTank(t, dx, dy){
  const map = WORLD.map;
  if (!map) { t.x += dx; t.y += dy; return; }
  if (!map.solidAtXY(t.x + dx, t.y)) t.x += dx;
  if (!map.solidAtXY(t.x, t.y + dy)) t.y += dy;
}
const WORLD = {
  map: null, theme: THEMES[0], floorCv: null,
  player: null,
  enemies: [], shells: [], mines: [], bombs: [], barrels: [], pickups: [],
  missiles: [], drones: [], strikes: [],   // superpower objects
  emplacements: [],                        // static enemy structures
  allies: [],                              // friendly AI squad (team modes)
  bases: [],                               // headquarters (Base Assault)
  weatherAcc: 0,

  reset(levelData){
    /* Free the outgoing sector's floor — up to 6MB — before the new one
       is on the heap rather than after, so the two never coexist. */
    SAFETY.release(this.floorCv);
    this.map = levelData.map;
    this.theme = levelData.theme;
    this.floorCv = levelData.floorCv;
    this.enemies = []; this.shells = []; this.mines = [];
    this.bombs = []; this.pickups = [];
    this.missiles = []; this.drones = []; this.strikes = [];
    this.allies = []; this.bases = [];
    this.barrels = levelData.barrels.map(makeBarrel);
    this.emplacements = (levelData.emplacements || []).map(e => makeEmplacement(e.kind, e.x, e.y));
    PARTS.pool.length = 0;
    LIGHTS.flashes.length = 0;
    NOISES.list.length = 0;
    TIMERS.length = 0;
    DECALS.init(this.map.cols * CFG.TILE, this.map.rows * CFG.TILE);
    this.player = new Player(levelData.playerSpawn.x, levelData.playerSpawn.y);
    CAM.tzoom = baseZoom();
    CAM.snap(this.player.x, this.player.y);
    MINI.dirty = true;
  },

  update(dt){
    NOISES.update(dt);
    LIGHTS.update(dt);
    if (this.player) this.player.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    for (const a of this.allies) a.update(dt, this);
    // tank vs tank soft-body separation (mass-weighted)
    const tanks = allTanks();
    for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) {
      const a = tanks[i], b = tanks[j];
      const rr = a.radius + b.radius;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      const tm = a.mass + b.mass;
      shoveTank(a, -nx * overlap * (b.mass / tm), -ny * overlap * (b.mass / tm));
      shoveTank(b, nx * overlap * (a.mass / tm), ny * overlap * (a.mass / tm));
    }
    for (let i = this.enemies.length - 1; i >= 0; i--)
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    for (let i = this.allies.length - 1; i >= 0; i--)
      if (!this.allies[i].alive) this.allies.splice(i, 1);
    updateBases(dt);
    updateShells(dt);
    updateBombs(dt);
    updateMines(dt);
    updateBarrels(dt);
    updatePickups(dt);
    updateEmplacements(dt);
    updateMissiles(dt);
    updateDrones(dt);
    updateStrikes(dt);
    POWERS.update(dt);
    updateTimers(dt);
    PARTS.update(dt);
    this.updateWeather(dt);
    if (this.player && this.player.alive) CAM.follow(this.player, dt, this.map);
    else { CAM.trauma = Math.max(0, CAM.trauma - dt); CAM.zoom = expLerp(CAM.zoom, CAM.tzoom, 3, dt); }
    // player lighting rig: body glow + headlight throw
    if (this.player && this.player.alive) {
      LIGHTS.add(this.player.x, this.player.y, 210, 0.95);
      LIGHTS.add(
        this.player.x + Math.cos(this.player.tAngle) * 120,
        this.player.y + Math.sin(this.player.tAngle) * 120,
        160, 0.7
      );
    }
    // adaptive soundtrack intensity
    let near = 0;
    let boss = false;
    for (const e of this.enemies) {
      if (e.boss) boss = true;
      if (this.player && dist2(e.x, e.y, this.player.x, this.player.y) < 420 * 420) near++;
    }
    AUDIO.setIntensity(clamp(0.22 + this.enemies.length * 0.045 + near * 0.11 + (boss ? 0.35 : 0), 0, 1));
  },

  updateWeather(dt){
    const w = this.theme.weather;
    if (!w) return;
    /* Combat always outranks atmosphere. Rain alone spawns up to 150
       particles a second, and on a phone that competes directly with
       the explosions the player actually needs to read. Once the pool
       is mostly full, weather simply stops until it drains. */
    if (PARTS.pool.length > QT.parts * 0.7) return;
    const rect = CAM.visible();
    const width = rect.x1 - rect.x0;
    const q = QT.weather;
    const add = (n, fn) => {
      this.weatherAcc += n * dt * q * (width / 900);
      while (this.weatherAcc >= 1) { this.weatherAcc -= 1; fn(); }
    };
    switch (w) {
      case "rain":
        add(150, () => PARTS.spawn({
          x: rand(rect.x0, rect.x1 + 200), y: rect.y0 - 20,
          vx: -150, vy: rand(780, 980),
          type: "rain", size: 1, life: 0.5, color: "#9db8d8", layer: 1, alpha: 0.8,
        }));
        break;
      case "snow":
        add(34, () => PARTS.spawn({
          x: rand(rect.x0, rect.x1), y: rect.y0 - 10,
          vx: rand(-16, 16), vy: rand(38, 82),
          type: "snow", size: rand(1.4, 2.8), life: 5, color: "#eef4f8", layer: 1,
        }));
        break;
      case "ash":
        add(20, () => PARTS.spawn({
          x: rand(rect.x0, rect.x1), y: rect.y0 - 10,
          vx: rand(-10, 24), vy: rand(20, 44),
          type: "ash", size: rand(1, 2.2), life: 5, color: "#b9b0a6", layer: 1,
        }));
        break;
      case "leaves":
        add(11, () => PARTS.spawn({
          x: rand(rect.x0, rect.x1), y: rect.y0 - 10,
          vx: rand(-24, 40), vy: rand(30, 64),
          type: "leaf", size: rand(2.5, 4.5), life: 5,
          color: pick(["#6f8f4e", "#8fa35a", "#a0844a", "#7a6a3e"]), layer: 1,
          rot: rand(0, TAU), vr: rand(-4, 4),
        }));
        break;
      case "dust":
        add(5, () => PARTS.spawn({
          x: rect.x0 - 20, y: rand(rect.y0, rect.y1),
          vx: rand(160, 300), vy: rand(-20, 20),
          type: "dust", size: rand(8, 20), life: rand(1.2, 2.4), color: "#cdb488", layer: 0,
        }));
        break;
    }
  },
};

/* ================================================================
   MINIMAP
   ================================================================ */
const MINI = {
  cv: null, cx: null, dirty: true, scale: 2,
  box: null,   // last drawn rect, so the HUD can stack under it
  rebuild(){
    const map = WORLD.map;
    if (!map) return;
    if (!this.cv) {
      const made = SAFETY.canvas(2, 2);
      if (!made) return;
      this.cv = made.cv; this.cx = made.cx;
    }
    this.cv.width = map.cols * this.scale;
    this.cv.height = map.rows * this.scale;
    const c = this.cx, s = this.scale;
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    for (let r = 0; r < map.rows; r++) for (let cc = 0; cc < map.cols; cc++) {
      const v = map.get(cc, r);
      if (v === 0) continue;
      c.fillStyle = v === 1 ? "rgba(140,165,185,0.62)"
        : v === 4 ? "rgba(235,245,250,0.85)"
        : v === 3 ? "rgba(150,160,170,0.6)" : "rgba(200,140,100,0.55)";
      c.fillRect(cc * s, r * s, s, s);
    }
    this.dirty = false;
  },
  draw(c){
    const map = WORLD.map;
    if (!map) return;
    if (map.dirty || this.dirty) { this.rebuild(); map.dirty = false; }
    if (!this.cv) return;                 // buffer refused: skip the minimap
    const mw = this.cv.width, mh = this.cv.height;
    // Top-right corner, sized so the WHOLE arena is always visible.
    const maxW = Math.min(210 * UIS, W * 0.26);
    const maxH = Math.min(150 * UIS, H * 0.22);
    const k = Math.min(maxW / mw, maxH / mh);
    const dw = mw * k, dh = mh * k;
    const x = W - dw - Math.round(16 * UIS) - SAFE.r;
    const y = Math.round(16 * UIS) + SAFE.t;
    this.box = { x: x - 7, y: y - 7, w: dw + 14, h: dh + 14 };
    c.fillStyle = "rgba(8,12,18,0.62)";
    c.strokeStyle = "rgba(120,160,180,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    if (c.roundRect) c.roundRect(x - 7, y - 7, dw + 14, dh + 14, 4); else c.rect(x - 7, y - 7, dw + 14, dh + 14);
    c.fill(); c.stroke();
    c.drawImage(this.cv, x, y, dw, dh);
    const dot = (wx, wy, col, r) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(x + (wx / (map.cols * CFG.TILE)) * dw, y + (wy / (map.rows * CFG.TILE)) * dh, r, 0, TAU);
      c.fill();
    };
    for (const b of WORLD.barrels) dot(b.x, b.y, "rgba(255,150,80,0.7)", 1.6);
    for (const e of WORLD.emplacements) dot(e.x, e.y, e.def.color, 2.6);
    for (const p of WORLD.pickups) dot(p.x, p.y, "#ffe27a", 2);
    // headquarters read as squares so they never look like a tank blip
    for (const b of WORLD.bases) {
      const bx = x + (b.x / (map.cols * CFG.TILE)) * dw;
      const by = y + (b.y / (map.rows * CFG.TILE)) * dh;
      c.fillStyle = b.alive ? b.def.lit : "rgba(90,80,70,0.7)";
      c.fillRect(bx - 4, by - 4, 8, 8);
      c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 1;
      c.strokeRect(bx - 4, by - 4, 8, 8);
    }
    for (const e of WORLD.enemies) dot(e.x, e.y, e.boss ? "#ff4d5e" : "#ff7a45", e.boss ? 4 : 2.4);
    for (const a of WORLD.allies) if (a.alive) dot(a.x, a.y, "#7ec8ff", 2.4);
    if (WORLD.player && WORLD.player.alive) dot(WORLD.player.x, WORLD.player.y, "#46e0d8", 3);
  },
};

/* ================================================================
   GAME MODES
   Each mode reshapes the same core loop: how sectors advance, whether
   bosses appear, whether there is a clock, and whether failure ends
   the run. Everything else (AI director, powers, rewards) is shared.
   ================================================================ */
const MODES = {
  campaign:   { id: "campaign",   name: "CAMPAIGN",     sub: "Sector by sector · bosses every third",
                bosses: true,  advance: true },
  survival:   { id: "survival",   name: "SURVIVAL",     sub: "One arena · endless waves",
                bosses: true,  advance: false, survival: true },
  timeattack: { id: "timeattack", name: "TIME ATTACK",  sub: "Highest score in three minutes",
                bosses: false, advance: true,  timeLimit: 180 },
  quick:      { id: "quick",      name: "QUICK BATTLE", sub: "A single three-wave skirmish",
                bosses: false, advance: false, single: true },
  freerun:    { id: "freerun",    name: "FREE RUN",     sub: "No hostiles · learn the arenas",
                bosses: false, advance: true,  noEnemies: true, noFail: true },
  endless:    { id: "endless",    name: "ENDLESS RUN",  sub: "Sectors forever · rising pressure",
                bosses: true,  advance: true,  endless: true },
  training:   { id: "training",   name: "TRAINING",     sub: "Safe practice with every power",
                bosses: false, advance: true,  invuln: true, allPowers: true, noFail: true },
  /* One seeded arena, the same maze worldwide, resetting every 24h. The
     generator is already a pure function of its seed, so this mode is
     ordinary campaign play on a shared layout — and the single
     strongest reason to open the tab again tomorrow. */
  daily:      { id: "daily",      name: "DAILY OPERATION", sub: "One seeded arena · the same for everyone",
                bosses: true,  advance: true,  daily: true },
  /* --- team modes: both sides field tanks on an ordinary arena --- */
  /* Both team modes advance: clearing the objective opens a Proceed
     button onto a freshly generated arena rather than ending the run. */
  team:       { id: "team",       name: "TEAM BATTLE",  sub: "Squad vs squad · last team standing",
                bosses: false, advance: true, teams: true, squad: true },
  basewar:    { id: "basewar",    name: "BASE ASSAULT", sub: "Destroy the hostile HQ · defend your own",
                bosses: false, advance: true, teams: true, squad: true,
                bases: true, respawn: true },
};
const MODE_ORDER = ["daily", "campaign", "survival", "timeattack", "quick",
                    "basewar", "team", "endless", "freerun", "training"];

/* ================================================================
   SECTION 12 — GAME STATE MACHINE, WAVES, SCORING, HINTS
   ================================================================ */
const GAME = {
  state: "menu",       // menu | playing | paused | over | levelend
  level: 1, wave: 0, wavesTotal: 3, bossLevel: false,
  score: 0,
  combo: { n: 0, t: 0, best: 0 },
  stats: null,
  banner: { text: "", sub: "", t: 99, dur: 0 },
  hintMsg: { text: "", t: 0 },
  shownHints: {},
  waveState: "idle",   // idle | prep | active | dead | done
  prepT: 0, spawnQueue: [], spawnT: 0, waveStartT: 0,
  modifier: null,
  timescale: 1, slowmoT: 0, freeze: 0,
  deathRealT: -1,
  touchHintT: 0,        // fades the on-screen thumb-zone guide at run start
  /* --- team modes --- */
  teamRoster: null,     // the tank classes both squads field this round
  homeCell: null, awayCell: null,
  teamStartAllies: 0, teamStartEnemies: 0,
  teamWinT: 0,          // short beat between the last kill and the results
  respawnT: null,
  settingsReturn: "scr-main",
  mode: "campaign",
  timeLeft: 0,          // Time Attack clock
  finished: false,      // run ended by completing it, not by dying
  barrelsLeft: 0,       // Free Run objective
  /* --- CrazyGames reward state --- */
  revivesUsed: 0,        // rewarded revive: once per run
  pendingLoadout: null,  // claimed supply drop, applied on next deploy
  pendingArmour: false,  // claimed armour refit, applied on next deploy
  bonusClaimed: false,   // clearance bonus already doubled this sector
  lastClearBonus: 0,     // the bonus a "double" reward can match

  def(){ return MODES[this.mode] || MODES.campaign; },
  resetStats(){
    this.stats = { shots: 0, hits: 0, kills: 0, bombs: 0, damageTaken: 0, pickups: 0, time: 0, bricks: 0, powers: 0 };
  },
  startRun(modeId, startLevel){
    if (modeId && MODES[modeId]) this.mode = modeId;
    /* Counted first, before any generation work that could throw. The
       player is committed at this point and the metric should say so —
       it used to fire after startLevel(), applyLoadout() and a dozen
       other calls, any one of which could cost the play. */
    CG.gameplayStart();
    const M = this.def();
    this.finished = false;
    this.timeLeft = M.timeLimit || 0;
    this.resetStats();
    this.score = 0;
    this.combo = { n: 0, t: 0, best: 0 };
    this.shownHints = {};
    this.timescale = 1; this.slowmoT = 0; this.freeze = 0;
    this.deathRealT = -1;
    this.teamWinT = 0;
    this.revivesUsed = 0;          // rewarded revive is once per run
    /* Free field repairs, spent before the run is allowed to end. A run
       that stops on the first mistake is a four-minute session; a run
       that stops when the player decides it does is a long one. */
    this.freeContinues = CFG.FREE_CONTINUES;
    /* Perks first: PERKS.reset() restores the base charge caps that
       DEEP MAGAZINE mutates, and POWERS.reset() reads them. */
    PERKS.reset();
    POWERS.reset(M.allPowers ? 9 : 0);
    this.killStreak = 0;
    this.pendingLoadout = this.pendingLoadout || null;
    DIRECTOR.reset();
    /* Redeploy resumes from the banked checkpoint rather than sector
       one: starting a fifteen-minute climb over from the beginning is
       the moment most players close the tab. */
    this.level = clamp(startLevel | 0 || 1, 1, 99);
    this.startLevel(this.level);
    if (M.invuln) WORLD.player.invuln = 1e9;
    this.applyLoadout();           // consume a claimed supply-drop reward
    this.state = "playing";
    showScreen(null);
    CG.clearAllBanners();
    INPUT.setPointerLock(true);
    AUDIO.resume();
    AUDIO.startEngine();
    AUDIO.startMusic("combat");     // menu score crossfades into the fight
    AUDIO.duckMusic(false);
    this.touchHintT = INPUT.usingTouch ? 6 : 0;
    this.hint("move", INPUT.usingTouch
      ? "LEFT THUMB DRIVE — RIGHT THUMB AIM & FIRE — TAP LEFT SIDE FOR BOMB"
      : "WASD DRIVE — MOUSE AIM — HOLD LMB FIRE — SPACE BOMB — P FOR MENU");
  },
  /* Arena generation for a sector, in one place so that every route
     that rebuilds the world — a new sector, a revive, a free continue —
     produces the arena the current mode actually calls for.

     The daily operation runs on a seed derived from the UTC date, so
     every player in the world fights the identical maze, arena shape and
     deployment zone for 24 hours; that is what makes a daily score worth
     comparing and the tab worth reopening. The shape and the zone have
     to be seeded explicitly: left to the generator they come from
     rollRandomShape() and rollRandomZone(), which deliberately use
     Math.random so ordinary runs never repeat. A seeded maze under a
     randomly chosen skin would not be the same arena. */
  genForLevel(level){
    if (!this.def().daily) return genLevel(level);
    const dseed = (META.dailySeed() + level * 7919) >>> 0;
    const drng = mulberry32(dseed ^ 0x9E3779B9);
    return genLevel(level, {
      seed: dseed,
      shape: SHAPES[(drng() * SHAPES.length) | 0].id,
      theme: (drng() * THEMES.length) | 0,
    });
  },
  startLevel(level){
    const data = this.genForLevel(level);
    WORLD.reset(data);
    this.wave = 0;
    const M = this.def();
    this.bossLevel = !!M.bosses && !M.survival && level % 3 === 0;
    this.wavesTotal = M.survival ? 9999
      : (M.single ? 3 : clamp(3 + Math.floor((level - 1) / 2), 3, 5));
    this.barrelsLeft = WORLD.barrels.length;
    this.obstaclesTotal = WORLD.emplacements.length;
    this.waveState = M.noEnemies ? "explore" : (M.teams ? "battle" : "prep");
    this.prepT = CFG.PREP_FIRST;
    this.modifier = null;
    this.teamWinT = 0;
    if (M.teams) this.deployTeams(M);
    this.showBanner((M.teams ? "" : this.def().survival ? "ARENA — " : "SECTOR " + level + " — ") + data.theme.name,
      data.shape.name + " · " + data.theme.sub, 2.6);
    // attach state to any player feedback sent from this sector
    CG.setContext({ mode: this.mode, sector: level, shape: data.shape.id, theme: data.theme.name, difficulty: SETTINGS.difficulty });
  },
  /* ================================================================
     TEAM DEPLOYMENT
     Both team modes run on the arenas, maze shapes and locations the
     rest of the game already generates. All they add is a staging pass:
     find the two ends of the arena, clear a yard at each, and put the
     player's squad at one end and the hostile squad at the other. Base
     Assault additionally drops a headquarters into each yard.
     ================================================================ */
  squadSize(){ return clamp(SETTINGS.teamSize | 0, CFG.SQUAD_MIN, CFG.SQUAD_MAX); },
  deployTeams(M){
    const map = WORLD.map;
    const n = this.squadSize();
    /* A deliberate separation, not the widest the arena offers. Far
       enough that the two sides start apart and the push means something,
       close enough that a squad — and the player — can actually reach the
       other end through a contested maze. */
    const pair = farthestOpenPair(map, M.bases ? CFG.BASE_GAP : CFG.TEAM_GAP);
    if (!pair) return;                     // degenerate arena: fall back to solo
    /* Whichever end is nearer the generated spawn becomes the player's,
       so the deployment still respects the arena the generator built. */
    const pl = WORLD.player;
    const A = map.center(pair.a.c, pair.a.r), B = map.center(pair.b.c, pair.b.r);
    const home = dist2(A.x, A.y, pl.x, pl.y) <= dist2(B.x, B.y, pl.x, pl.y) ? pair.a : pair.b;
    const away = home === pair.a ? pair.b : pair.a;
    const yard = M.bases ? 3 : 2;
    carveYard(map, home.c, home.r, yard);
    carveYard(map, away.c, away.r, yard);
    /* The generator only promises the arena is connected if you blast
       through brick. A squad has to be able to simply drive at the other
       side, so if there is no open route between the two yards, clear the
       destructible walls along the shortest one. */
    const strict = _floodFrom(map, home.c, home.r, false);
    if (strict.dist[away.r * map.cols + away.c] < 0) openCorridor(map, home, away);
    this.homeCell = home; this.awayCell = away;
    // headquarters sit at the centre of their yard
    if (M.bases) {
      const hp = map.center(home.c, home.r), ap = map.center(away.c, away.r);
      WORLD.bases = [makeBase("player", hp.x, hp.y), makeBase("enemy", ap.x, ap.y)];
      // nothing else may occupy a yard
      const clearRad = CFG.TILE * (yard + 1);
      WORLD.barrels = WORLD.barrels.filter(b =>
        dist2(b.x, b.y, hp.x, hp.y) > clearRad ** 2 && dist2(b.x, b.y, ap.x, ap.y) > clearRad ** 2);
      WORLD.emplacements = WORLD.emplacements.filter(e =>
        dist2(e.x, e.y, hp.x, hp.y) > clearRad ** 2 && dist2(e.x, e.y, ap.x, ap.y) > clearRad ** 2);
    }
    // the player deploys with their own squad
    const hs = this.stagingSpots(home, M.bases ? 3 : 1, n + 1);
    if (hs.length) { pl.x = hs[0].x; pl.y = hs[0].y; pl.vel.x = 0; pl.vel.y = 0; CAM.snap(pl.x, pl.y); }
    this.teamRoster = this.rollRoster(n);
    for (let i = 0; i < n; i++) {
      const s = hs[(i + 1) % Math.max(1, hs.length)] || { x: pl.x, y: pl.y };
      this.spawnAlly(this.teamRoster[i], s.x, s.y, i).role = this.roleFor(i, M);
    }
    const as = this.stagingSpots(away, M.bases ? 3 : 1, n);
    for (let i = 0; i < n; i++) {
      const s = as[i % Math.max(1, as.length)] || map.center(away.c, away.r);
      const e = new Enemy(this.teamRoster[i], s.x, s.y, this.level, {});
      e.spawnT = 0.6;
      e.role = this.roleFor(i, M);
      WORLD.enemies.push(e);
      fxSpawnPortal(s.x, s.y, e.style.accent);
    }
    this.teamStartAllies = WORLD.allies.length;
    this.teamStartEnemies = WORLD.enemies.length;
    if (M.bases) this.hint("hq", "EXPLOSIVES LEVEL A HEADQUARTERS — BOMBS, TIME BOMB AND THE ATOMIC STRIKE HIT HARDEST");
    else this.hint("squad", "YOUR SQUAD FIGHTS WITH YOU — WIPE OUT THE HOSTILE SQUAD TO WIN");
    this.respawnT = { player: CFG.SQUAD_RESPAWN, enemy: CFG.SQUAD_RESPAWN };
    this.obstaclesTotal = WORLD.emplacements.length;
    MINI.dirty = true;
  },
  /* Base Assault splits each squad between units that push the enemy
     headquarters and units that hold the line. Team Battle has no
     structures, so every tank is a guard. */
  roleFor(i, M){ return M.bases && i % 2 === 0 ? "assault" : "guard"; },
  /* Both squads draw from the same roster, so a team battle is a fair
     mirror rather than a lopsided matchup. */
  rollRoster(n){
    const pool = SQUAD_TYPES.filter(t => ENEMY_TYPES[t]);
    const out = [];
    for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
    // shuffle so squad composition is not identical every run
    for (let i = out.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  },
  /* Staging positions around a headquarters. A cell near the yard is not
     necessarily a cell connected to it — a pocket on the far side of a
     wall is metres away and still unreachable — so every spot has to be
     drivable from the yard itself, or the squad deploys into a box. */
  stagingSpots(cell, skip, want){
    const map = WORLD.map;
    const reach = drivableFrom(map, cell.c, cell.r);
    const cells = openCellsNear(map, cell.c, cell.r, skip + 4, skip);
    const out = [];
    for (const c of cells) {
      if (!reach[c.r * map.cols + c.c]) continue;
      const p = map.center(c.c, c.r);
      if (out.some(o => dist2(o.x, o.y, p.x, p.y) < (CFG.TILE * 1.4) ** 2)) continue;
      out.push(p);
      if (out.length >= want) break;
    }
    return out;
  },
  spawnAlly(type, x, y, slot){
    const a = new Ally(type, x, y, this.level, slot);
    WORLD.allies.push(a);
    fxSpawnPortal(x, y, a.style.accent);
    return a;
  },
  onAllyDead(a, src){
    fxText(a.x, a.y - 26, a.callsign + " DOWN", "#7ec8ff", 13);
    AUDIO.beep(180);
  },
  onBaseDown(b, src){
    const mine = b.team === "player";
    CAM.addShake(1.2);
    FX.doFlash(0.55, mine ? "255,120,80" : "150,255,170");
    this.slowmo(0.28, 1.3);
    for (let i = 0; i < 6; i++)
      setTimeoutSafe(() => explode(b.x + rand(-60, 60), b.y + rand(-60, 60),
        { radius: 110, dmg: 0, breakTiles: true }), i * 130);
    if (mine) {
      this.showBanner("ALLIED HQ DESTROYED", "Operation failed", 3);
      this.deathRealT = 2.2;               // routed through the normal loss path
    } else {
      this.showBanner("HOSTILE HQ DESTROYED", "Objective complete", 3);
      this.addScore(4000);
      this.addSalvage(250);
      CG.happytime();
      this.teamWinT = 2.2;
    }
  },
  /* Reinforcements: while a side still holds its headquarters it keeps
     feeding tanks back in, so Base Assault stays about the objective
     rather than becoming a one-off skirmish. */
  /* A damaged headquarters produces reinforcements more slowly, so the
     side that is winning the objective gains momentum and the round
     cannot settle into an endless stream of fresh defenders. */
  reinforceDelay(base){
    const pct = base ? clamp(base.hp / base.maxHp, 0, 1) : 1;
    return CFG.SQUAD_RESPAWN * (pct < 0.35 ? 2.2 : pct < 0.7 ? 1.4 : 1);
  },
  updateReinforcements(dt, M){
    if (!M.respawn) return;
    const n = this.squadSize();
    const R = this.respawnT || (this.respawnT = { player: CFG.SQUAD_RESPAWN, enemy: CFG.SQUAD_RESPAWN });
    const home = WORLD.bases.find(b => b.team === "player");
    const away = WORLD.bases.find(b => b.team === "enemy");
    if (home && home.alive && WORLD.allies.length < n) {
      R.player -= dt;
      if (R.player <= 0) {
        R.player = this.reinforceDelay(home);
        const s = this.stagingSpots(this.homeCell, 3, 4);
        const p = pick(s) || { x: home.x, y: home.y };
        const slot = WORLD.allies.length;
        this.spawnAlly(pick(this.teamRoster || SQUAD_TYPES), p.x, p.y, slot).role = this.roleFor(slot, M);
        fxText(p.x, p.y - 24, "REINFORCEMENT", "#7ec8ff", 12);
      }
    } else R.player = CFG.SQUAD_RESPAWN;
    if (away && away.alive && WORLD.enemies.length < n) {
      R.enemy -= dt;
      if (R.enemy <= 0) {
        R.enemy = this.reinforceDelay(away);
        const s = this.stagingSpots(this.awayCell, 3, 4);
        const p = pick(s) || { x: away.x, y: away.y };
        const e = new Enemy(pick(this.teamRoster || SQUAD_TYPES), p.x, p.y, this.level, {});
        e.spawnT = 0.6;
        e.role = this.roleFor(WORLD.enemies.length, M);
        WORLD.enemies.push(e);
        fxSpawnPortal(p.x, p.y, e.style.accent);
      }
    } else R.enemy = CFG.SQUAD_RESPAWN;
  },

  startWave(n){
    this.wave = n;
    this.waveStartT = this.stats.time;
    /* A first session meets no wave modifiers: "GHOST PROTOCOL" means
       nothing to someone who has not yet met a stealth tank. */
    this.modifier = COLDOPEN.on ? null : DIRECTOR.rollModifier(this.level, n);
    const M = this.def();
    const isBossWave = (this.bossLevel && n === this.wavesTotal) ||
                       (M.survival && M.bosses && n % 5 === 0);
    let comp;
    if (isBossWave) {
      comp = [bossTypeForLevel(this.level), "grunt", "grunt"];
      this.showBanner("⚠ " + (ENEMY_TYPES[bossTypeForLevel(this.level)].title || "BOSS") + " DETECTED", "Neutralize the boss", 3);
      AUDIO.bossAlert();
      AUDIO.setMusicMode("boss");   // darker mode, faster floor, tritone drone
      CAM.tzoom = baseZoom() * 0.88;   // boss waves pull back a little further
      this.hint("boss", "COMMAND UNIT — DODGE THE CHARGE, PUNISH THE SPIN-UP");
    } else {
      AUDIO.setMusicMode("combat");
      comp = COLDOPEN.composition(n)
        || ((this.modifier && this.modifier.force)
          ? this.modifier.force.slice()
          : DIRECTOR.compose(M.survival ? 1 + Math.floor(n / 2) : this.level, DIRECTOR.budget(this.level, n)));
      this.showBanner(M.survival ? "WAVE " + n : "WAVE " + n + " / " + this.wavesTotal,
        this.modifier ? "⚡ " + this.modifier.label : "", 2.2);
      AUDIO.waveFanfare();
    }
    const mods = this.modifier ? this.modifier.apply : {};
    this.spawnQueue = comp.map((type, i) => ({ type, delay: 0.4 + i * 0.5, mods }));
    this.waveState = "active";
  },
  /* Where a hostile may be deployed.
     ----------------------------------------------------------------
     Every candidate must be a cell the hostile can DRIVE from to the
     player — not merely an open cell somewhere on the map. Picking any
     open cell is what used to strand whole waves: the generator scatters
     brick and stone through the maze, and a cell behind that brick looks
     identical to a cell in the middle of the arena unless reachability
     is actually tested. Those hostiles then sat in their pocket for the
     rest of the sector, jammed against a wall they never break.

     The arena generator now guarantees a drivable route to every floor
     cell, so this is the second lock on the same door: it also covers
     mid-sector cases the generator cannot know about, and it replaces
     the old fixed fallback corner, which was solid ground on every
     non-rectangular arena. */
  spawnCandidates(){
    const map = WORLD.map, pl = WORLD.player;
    if (!map || !pl) return [];
    let pc = map.cellOf(pl.x, pl.y);
    if (map.get(pc.c, pc.r) !== 0) {
      // player somehow inside geometry: fall back to the maze at large
      const open = [];
      for (let r = 1; r < map.rows - 1; r++) for (let c = 1; c < map.cols - 1; c++)
        if (map.get(c, r) === 0) open.push({ c, r });
      if (!open.length) return [];
      pc = open[0];
    }
    const reach = drivableFrom(map, pc.c, pc.r);
    const out = [];
    for (let r = 1; r < map.rows - 1; r++) for (let c = 1; c < map.cols - 1; c++) {
      if (!reach[r * map.cols + c] || map.get(c, r) !== 0) continue;
      const p = map.center(c, r);
      out.push({ x: p.x, y: p.y, d: dist2(p.x, p.y, pl.x, pl.y) });
    }
    return out;
  },
  pickSpawnCell(){
    const cand = this.spawnCandidates();
    // no arena to speak of: the player's own ground is the only cell
    // guaranteed to be open, and is still better than a wall
    if (!cand.length) return WORLD.player ? { x: WORLD.player.x, y: WORLD.player.y }
                                          : WORLD.map.center(1, 1);
    const MIN2 = (CFG.TILE * 7) ** 2;
    // far enough that a hostile never lands on top of the player; if the
    // arena is too small for that, take the most distant cells it has
    let pool = cand.filter(p => p.d >= MIN2);
    if (!pool.length) {
      const far = cand.reduce((a, b) => (b.d > a.d ? b : a));
      pool = cand.filter(p => p.d >= far.d * 0.6);
    }
    // prefer mid-distance spawns (not across the whole map), sampled so a
    // wave still arrives spread out rather than stacked on one tile
    let best = null, bestD = -1;
    for (let i = 0; i < 40; i++) {
      const p = pool[(Math.random() * pool.length) | 0];
      const scoreD = -Math.abs(p.d - (CFG.TILE * 13) ** 2);
      if (scoreD > bestD) { bestD = scoreD; best = p; }
    }
    return best || pool[0];
  },
  spawnEnemy(type, mods){
    if (this.def().noEnemies) return;
    const p = this.pickSpawnCell();
    const e = new Enemy(type, p.x, p.y, this.level, mods);
    WORLD.enemies.push(e);
    fxSpawnPortal(p.x, p.y, e.style.accent);
    AUDIO.beep(340);
  },
  bossSummon(n){
    const boss = WORLD.enemies.find(e => e.boss);
    if (!boss) return;
    this.showBanner("REINFORCEMENTS", "", 1.4);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      let x = boss.x + Math.cos(a) * 90, y = boss.y + Math.sin(a) * 90;
      if (WORLD.map.solidAtXY(x, y)) { x = boss.x; y = boss.y; }
      const e = new Enemy(chance(0.5) ? "grunt" : "hunter", x, y, this.level, {});
      WORLD.enemies.push(e);
      fxSpawnPortal(x, y, e.style.accent);
    }
  },
  comboMult(){ return Math.min(CFG.COMBO_MAX, 1 + 0.5 * Math.max(0, this.combo.n - 1)); },
  addScore(base, x, y){
    const pts = Math.round(base * this.comboMult());
    this.score += pts;
    if (x !== undefined) {
      fxText(x, y, "+" + fmt(pts), "#ffe27a", 15);
      if (this.combo.n > 1) fxText(x, y - 18, "x" + this.combo.n, "#8ffff6", 13);
    }
    return pts;
  },
  onEnemyDead(e, src){
    this.stats.kills++;
    COLDOPEN.onKill(e);
    /* Salvage Intake perk: hull recovered per kill. */
    if (PERKS.flags.lifesteal && WORLD.player && WORLD.player.alive)
      WORLD.player.hp = Math.min(WORLD.player.maxHp, WORLD.player.hp + PERKS.flags.lifesteal);
    DIRECTOR.onPlayerKill();
    /* Kill reward: every 6th kill in a streak refills a superpower, so
       powers are earned by playing rather than only bought with ads. */
    this.killStreak++;
    // cinematic slow-motion on a big streak or a last-hostile kill
    if (this.killStreak > 0 && this.killStreak % 12 === 0) {
      this.slowmo(0.42, 0.7);
      fxText(e.x, e.y - 40, "x" + this.killStreak + " STREAK", "#ffe27a", 17);
      AUDIO.powerUp();
    } else if (!e.boss && WORLD.enemies.filter(x => x.alive && x !== e).length === 0 &&
               !this.spawnQueue.length && this.waveState === "active") {
      this.slowmo(0.35, 0.55);      // final kill of a wave
    }
    if (this.killStreak % 6 === 0) {
      const p = POWERS.grantRandom(1);
      if (p) fxText(e.x, e.y - 26, "+1 " + p.label, p.color, 13);
    }
    this.combo.n++;
    this.combo.t = CFG.COMBO_WINDOW;
    this.combo.best = Math.max(this.combo.best, this.combo.n);
    this.addScore(e.scoreVal, e.x, e.y - 10);
    this.freeze = Math.max(this.freeze, e.boss ? 0.15 : 0.034);  // seconds
    if (e.boss) {
      this.slowmo(0.25, 1.1);
      CAM.tzoom = baseZoom();
      CAM.addShake(0.8);
      this.addSalvage(100);
      POWERS.grantRandom(2);
      AUDIO.setMusicMode("combat");  // the pressure lifts with the boss
      AUDIO.stingerWin();
      CG.happytime();              // platform celebration: boss down
      for (let i = 0; i < 4; i++)
        setTimeoutSafe(() => explode(e.x + rand(-50, 50), e.y + rand(-50, 50), { radius: 80, dmg: 0, breakTiles: true }), i * 140);
      for (let i = 0; i < 3; i++) spawnPickup(e.x + rand(-40, 40), e.y + rand(-40, 40));
    } else if (chance(DIRECTOR.dropChance() * (PERKS.flags.dropMul || 1))) {
      spawnPickup(e.x, e.y);
    }
  },
  onPlayerDead(){
    // Training and Free Run never end a run on death: respawn in place
    if (this.def().noFail) {
      const pl = WORLD.player;
      pl.alive = true; pl.hp = pl.maxHp; pl.invuln = this.def().invuln ? 1e9 : 3;
      pl.shieldHp = 0; pl.shieldT = 0;
      fxSpawnPortal(pl.x, pl.y, "#8ffff6");
      this.showBanner("SYSTEMS RESTORED", "No failure in this mode", 1.8);
      return;
    }
    /* Free field repairs come first. The rewarded-ad and salvage offers
       are still there once these run out, and they read far better as
       the third chance than as the first — a player with no salvage
       being asked to watch an ad thirty seconds in just leaves. */
    if ((this.freeContinues | 0) > 0) {
      this.freeContinues--;
      this.revivePlayer(true, true);
      this.showBanner("FIELD REPAIR COMPLETE",
        this.freeContinues + " repair" + (this.freeContinues === 1 ? "" : "s") + " remaining", 2.4);
      return;
    }
    this.waveState = "dead";
    this.slowmo(0.3, 1.4);
    this.deathRealT = 1.8;
    DIRECTOR.onPlayerDeath();
    CG.gameplayStop();
  },
  slowmo(scale, dur){ this.timescale = scale; this.slowmoT = dur; },

  /* Total emplacements this sector, and how many are still standing —
     shown live in the HUD. */
  obstaclesTotal: 0,
  onEmplacementDown(e){
    this.addScore(e.def.score, e.x, e.y - 12);
    this.addSalvage(30);
    this.stats.obstacles = (this.stats.obstacles || 0) + 1;
    fxText(e.x, e.y - 28, e.def.name + " DOWN", e.def.color, 13);
    CAM.addShake(0.3);
    if (WORLD.emplacements.length === 0 && this.obstaclesTotal > 0) {
      this.showBanner("ALL EMPLACEMENTS DESTROYED", "+400", 1.8);
      this.addScore(400);
      POWERS.grantRandom(1);
    }
  },

  /* ---- salvage: the non-ad currency for every ad reward ---- */
  addSalvage(n, x, y){
    SAVE.data.stats.salvage = Math.max(0, SAVE.data.stats.salvage + n);
    if (x !== undefined) fxText(x, y, "+" + n + " SALVAGE", "#ffe27a", 13);
    return SAVE.data.stats.salvage;
  },
  salvage(){ return SAVE.data.stats.salvage | 0; },
  spendSalvage(n){
    if (this.salvage() < n) return false;
    SAVE.data.stats.salvage -= n;
    SAVE.persist();
    return true;
  },

  /* ---- reward payloads (identical whether earned by ad or salvage) ---- */
  applyLoadout(){
    /* Drafted perks that act at the top of a sector rather than once:
       the reactive shield and the permanent escort drone. */
    PERKS.onSectorStart(WORLD.player);
    if (this.pendingArmour && WORLD.player) {
      WORLD.player.hp = Math.min(WORLD.player.maxHp, WORLD.player.hp + 35);
      WORLD.player.shieldHp = 45; WORLD.player.shieldT = 12;
      this.pendingArmour = false;
      this.showBanner("ARMOUR REFIT", "Shield online · hull reinforced", 1.8);
    }
    if (!this.pendingLoadout || !WORLD.player) return;
    const pl = WORLD.player;
    pl.shieldHp = 45; pl.shieldT = 12;
    pl.bombs = Math.min(pl.maxBombs, pl.bombs + 3);
    pl.rapidT = 15;
    POWERS.grantAll(1);
    this.pendingLoadout = null;
    this.showBanner("SUPPLY DROP RECEIVED", "Shield · +3 bombs · all powers +1", 2.2);
    fxPickupSparkle(pl.x, pl.y, "#8ffff6");
  },
  /* Revive: rebuild the player in place, keeping score and sector. */
  revivePlayer(inPlace, free){
    /* A free field repair must not consume the once-per-run rewarded
       revive — that offer is still the player's to spend later. */
    if (!free) this.revivesUsed++;
    const data = this.genForLevel(this.level);
    WORLD.reset(data);
    const pl = WORLD.player;
    /* WORLD.reset() built a fresh tank, so the drafted build has to be
       replayed onto it before anything reads maxHp — without this a run
       lost every upgrade it had earned the moment it used a repair. */
    PERKS.onSectorStart(pl);
    pl.hp = pl.maxHp;
    pl.shieldHp = 45; pl.shieldT = 12;
    pl.bombs = Math.min(pl.maxBombs, pl.bombs + 2);
    pl.invuln = 2.5;
    this.waveState = "prep";
    this.prepT = CFG.PREP_FIRST;
    // A full revive replays the wave that killed you; an emergency
    // respawn drops you back into the same one.
    if (!inPlace) this.wave = Math.max(0, this.wave - 1);
    this.deathRealT = -1;
    this.timescale = 1; this.slowmoT = 0; this.freeze = 0;
    if (!inPlace) this.combo = { n: 0, t: 0, best: this.combo.best };
    this.state = "playing";
    showScreen(null);
    CG.clearAllBanners();
    CG.gameplayStart();
    INPUT.setPointerLock(true);
    AUDIO.startEngine();
    AUDIO.startMusic("combat");
    AUDIO.duckMusic(false);
    this.showBanner("FIELD REPAIR COMPLETE", "Hull restored — shield online", 2.4);
    fxSpawnPortal(pl.x, pl.y, "#8ffff6");
  },

  hint(id, text){
    if (this.shownHints[id]) return;
    this.shownHints[id] = 1;
    this.hintMsg = { text, t: 4.5 };
  },
  hintDone(id){ this.shownHints[id] = 1; },
  showBanner(text, sub, dur){ this.banner = { text, sub: sub || "", t: 0, dur }; },

  ambient(){
    let a = WORLD.theme.ambient;
    if (this.modifier && this.modifier.ambient && this.waveState === "active") a += this.modifier.ambient;
    return clamp(a, 0, 0.78);
  },

  update(dt){
    this.stats.time += dt;
    COLDOPEN.update(dt);
    this.banner.t += dt;
    const M = this.def();
    // Time Attack clock — the run ends when it expires, not on death
    if (M.timeLimit) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 3.2 && this.timeLeft + dt > 3.2) AUDIO.bossAlert();
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.runComplete("TIME EXPIRED"); return; }
    }
    if (this.hintMsg.t > 0) this.hintMsg.t -= dt;
    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }

    // adaptive tutorial hints
    if (this.level === 1) {
      if (this.stats.time > 7 && this.stats.bombs === 0) this.hint("bomb", "SPACE — BOMBS EXCAVATE BRICK WALLS & CHAIN BARRELS");
      if (this.stats.time > 16) this.hint("boost", "HOLD SHIFT — OVERDRIVE BOOST");
      if (this.stats.time > 26) this.hint("power", INPUT.usingTouch
        ? "TAP A POWER CIRCLE (TOP RIGHT) TO FIRE A SUPERPOWER"
        : "KEYS 1-7 — SUPERPOWERS (SEE THE RACK, TOP RIGHT)");
    }
    if (WORLD.player && WORLD.player.alive && WORLD.player.hp < 32)
      this.hint("lowhp", "CRITICAL DAMAGE — HOSTILES DROP REPAIR KITS");

    switch (this.waveState) {
      /* Free Run has no hostiles: the objective is to level every
         barrel in the arena, then the next sector opens. */
      case "explore": {
        const left = WORLD.barrels.length;
        if (left !== this.barrelsLeft) {
          this.barrelsLeft = left;
          this.showBanner(left ? left + " TARGETS LEFT" : "ARENA CLEARED", "", 1.1);
        }
        if (left === 0) {
          this.waveState = "done";
          this.prepT = 1.6;
          this.lastClearBonus = 300 + this.level * 120;
          this.score += this.lastClearBonus;
          AUDIO.waveFanfare();
        }
        break;
      }
      /* Team Battle and Base Assault: one continuous engagement rather
         than staged waves. Team Battle ends when a squad is wiped out;
         Base Assault ends when a headquarters falls. */
      case "battle": {
        this.updateReinforcements(dt, M);
        if (this.teamWinT > 0) {
          this.teamWinT -= dt;
          if (this.teamWinT <= 0) {
            this.teamWinT = 0;
            // objective cleared: the Proceed screen, then a fresh arena
            this.waveState = "done";
            this.levelComplete();
          }
          break;
        }
        if (M.bases) break;                // bases decide the base mode
        if (WORLD.enemies.length === 0) {
          this.lastClearBonus = 900 + this.squadSize() * 300;
          this.score += this.lastClearBonus;
          this.addSalvage(150);
          this.showBanner("HOSTILE SQUAD ELIMINATED",
            "+ " + fmt(this.lastClearBonus) + " victory bonus", 2.4);
          AUDIO.waveFanfare();
          CG.happytime();
          this.teamWinT = 2.2;
        }
        break;
      }
      case "prep":
        this.prepT -= dt;
        if (this.prepT <= 0) this.startWave(this.wave + 1);
        break;
      case "active": {
        // staggered spawns
        for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
          this.spawnQueue[i].delay -= dt;
          if (this.spawnQueue[i].delay <= 0) {
            const q = this.spawnQueue.splice(i, 1)[0];
            this.spawnEnemy(q.type, q.mods);
          }
        }
        if (!this.spawnQueue.length && !WORLD.enemies.length) {
          // wave cleared
          const fast = (this.stats.time - this.waveStartT) < 26;
          DIRECTOR.onWaveClear(fast);
          this.addScore(200 + this.wave * 60);
          POWERS.grantRandom(1);            // wave-clear power reward
          if (this.wave >= this.wavesTotal) {
            this.waveState = "done";
            this.prepT = 1.8;
            this.lastClearBonus = 500 + this.level * 200;   // doublable by ad reward
            this.showBanner("SECTOR SECURED", "+ " + fmt(this.lastClearBonus) + " clearance bonus", 2.2);
            this.score += this.lastClearBonus;
            AUDIO.waveFanfare();
          } else {
            this.waveState = "prep";
            this.prepT = CFG.PREP_WAVE;
            this.showBanner("WAVE CLEARED", "Resupply inbound", 1.8);
            spawnPickup(WORLD.player.x + rand(-60, 60), WORLD.player.y + rand(-60, 60));
            if (chance(0.5)) spawnPickup(WORLD.player.x + rand(-80, 80), WORLD.player.y + rand(-80, 80));
          }
        }
        break;
      }
      case "done":
        this.prepT -= dt;
        if (this.prepT <= 0) this.levelComplete();
        break;
    }
  },

  levelComplete(){
    COLDOPEN.disarm();          // a cleared first sector is "onboarded"
    const M = this.def();
    // A one-sector mode finishes the whole run here instead
    if (M.single) { this.runComplete("SECTOR SECURED"); return; }
    this.state = "levelend";
    CG.gameplayStop();
    SAVE.data.stats.levels++;
    /* Deepest sector reached, banked so a death is a setback rather than
       a reset. Sector-advancing solo modes only — survival, the timed
       modes and the team modes have no sector to return to. */
    if (M.advance && !M.teams && !M.survival)
      META.data.checkpoint = Math.max(META.data.checkpoint | 0, this.level);
    this.addSalvage(40 + this.level * 10);
    POWERS.grantRandom(1);         // stage-clear power reward
    // endless game: sector 10 is treated as 100% completion
    const pct = clamp(this.level * 10, 0, 100);
    if (M.advance && pct > (SAVE.data.stats.bestPct | 0)) {
      SAVE.data.stats.bestPct = pct;
      CG.reportProgress(pct);
    }
    SAVE.persist();
    this.bonusClaimed = false;
    const acc = this.stats.shots ? Math.round(100 * this.stats.hits / this.stats.shots) : 0;
    /* The team modes clear an objective rather than a sector, so the
       screen names what was actually achieved and the button says
       Proceed — it opens the next stage on a freshly generated map. */
    document.getElementById("lc-title").textContent =
      M.bases ? "Hostile HQ Destroyed"
      : M.teams ? "Hostile Squad Eliminated"
      : "Sector " + this.level + " Cleared";
    /* Advance now opens the field refit rather than the next sector
       directly. The button keeps its position and styling, so nothing
       about the flow shifts — there is simply a choice inside it. */
    const nextBtn = document.querySelector('#scr-level [data-act="next"], #scr-level [data-act="perk-open"]');
    if (nextBtn) {
      nextBtn.dataset.act = "perk-open";
      nextBtn.innerHTML = "Field Refit &nbsp;&#9654;";
    }
    document.getElementById("lc-stats").innerHTML =
      statRow("Score", fmt(this.score)) +
      (M.teams ? statRow("Stage", this.level) + statRow("Squad", this.squadSize() + " v " + this.squadSize()) : "") +
      statRow("Kills", this.stats.kills) +
      statRow("Accuracy", acc + "%") +
      statRow("Best combo", "x" + Math.max(1, this.combo.best)) +
      (M.teams ? statRow("Squad left", WORLD.allies.filter(a => a.alive).length + " / " + this.squadSize())
               : statRow("Bricks razed", this.stats.bricks)) +
      statRow("Time", padTime(this.stats.time));
    showScreen("scr-level");
    animateResults("lc-stats");
    INPUT.setPointerLock(false);
    // Rotate the sector-clear offer so it never feels like the same prompt
    const clearOffers = ["bonus", "power", "armour", "salvagerun"];
    renderOffer("offer-level", clearOffers[this.level % clearOffers.length]);
    AUDIO.setEngine(0);
    AUDIO.duckMusic(true);
    AUDIO.stingerWin();
  },
  /* Advance to the next sector. A midgame ad may run here — a sector
     transition is exactly the "level change" break the SDK asks for.
     Skipped if a rewarded ad was just watched on this screen, since
     chaining two ads for one transition is not allowed. */
  async nextLevel(){
    // Never chain a midgame ad onto a rewarded one. The cooldown is set by
    // every rewarded ad, so this covers all sector-clear offers, not just
    // the clearance bonus.
    if (CG.rewardCooldownLeft() === 0 && !this.bonusClaimed) await CG.midgame();
    this.level++;
    // carry-over refit between sectors
    const pl = WORLD.player;
    const keepBombs = pl ? Math.max(3, pl.bombs) : 3;
    this.startLevel(this.level);
    WORLD.player.bombs = Math.min(WORLD.player.maxBombs, keepBombs);
    if (this.def().invuln) WORLD.player.invuln = 1e9;
    this.applyLoadout();
    this.state = "playing";
    showScreen(null);
    CG.clearAllBanners();
    CG.gameplayStart();
    INPUT.setPointerLock(true);
    AUDIO.startEngine();
  },
  /* Ends a run successfully (time up, single sector cleared). Uses the
     same results screen as a loss, with wording that reflects success. */
  runComplete(reason){
    if (this.state === "over") return;
    this.finished = true;
    this.finishReason = reason || "OPERATION COMPLETE";
    this.gameOver();
  },
  gameOver(){
    this.state = "over";
    this.timescale = 1;
    CG.gameplayStop();
    AUDIO.setEngine(0);
    AUDIO.duckMusic(true);
    if (this.finished) AUDIO.stingerWin(); else AUDIO.stingerFail();
    // fold run stats into lifetime stats
    const S = SAVE.data.stats;
    S.kills += this.stats.kills;
    S.deaths += 1;
    S.shots += this.stats.shots;
    S.hits += this.stats.hits;
    S.bombs += this.stats.bombs;
    S.bricks += this.stats.bricks;
    S.playTime += this.stats.time;
    S.games += 1;
    /* Every run advances the operator, even a bad one. A run that awards
       nothing is a run the player regrets, and a regretted run is not
       followed by another one tomorrow. */
    const xp = META.runXp();
    const gain = META.addXp(xp);
    const contracts = META.scoreContracts();
    const streakPay = this.def().daily ? META.completeDaily(this.score) : 0;
    this.lastXp = { amount: xp, levels: gain.levels, unlocked: gain.unlocked, contracts, streakPay };
    const isRecord = SAVE.addScore(this.score, this.level);
    const acc = this.stats.shots ? Math.round(100 * this.stats.hits / this.stats.shots) : 0;
    document.getElementById("go-score").textContent = fmt(this.score);
    document.getElementById("go-record").style.display = isRecord ? "block" : "none";
    const eyebrow = document.querySelector("#scr-over .eyebrow");
    const title = document.querySelector("#scr-over .scr-h");
    if (this.finished) {
      eyebrow.textContent = "// " + this.finishReason;
      eyebrow.style.color = "var(--ok)";
      title.textContent = this.def().name + " Complete";
    } else {
      eyebrow.textContent = "// Unit destroyed";
      eyebrow.style.color = "var(--danger)";
      title.textContent = "Operation Failed";
    }
    const MD = this.def();
    document.getElementById("go-stats").innerHTML =
      statRow("Mode", MD.name) +
      (MD.teams
        ? statRow("Squad", this.squadSize() + " v " + this.squadSize()) +
          (MD.bases
            ? statRow("Your HQ", (() => {
                const b = WORLD.bases.find(x => x.team === "player");
                return b ? (b.alive ? Math.round(100 * b.hp / b.maxHp) + "% intact" : "destroyed") : "—";
              })())
            : statRow("Squad left", WORLD.allies.filter(a => a.alive).length + " / " + this.squadSize()))
        : statRow(MD.survival ? "Waves survived" : "Sector reached",
                  MD.survival ? Math.max(0, this.wave - 1) : this.level)) +
      statRow("Kills", this.stats.kills) +
      statRow("Accuracy", acc + "%") +
      statRow("Best combo", "x" + Math.max(1, this.combo.best)) +
      statRow("Powers used", this.stats.powers || 0) +
      statRow("Damage taken", Math.round(this.stats.damageTaken)) +
      statRow("Survived", padTime(this.stats.time));
    renderRunProgress(this.lastXp);
    if (isRecord) CG.happytime();          // platform celebration: new best
    showScreen("scr-over");
    /* Roll the numbers rather than printing them. */
    animateResults("go-stats", "go-score", this.score);
    /* Announce what was earned, in the order it matters. */
    if (isRecord) TOAST.push("New service record", fmt(this.score) + " points", "var(--hostile-hot)");
    for (const u of (this.lastXp.unlocked || []))
      TOAST.push("Operator " + META.data.lvl, u.label, "var(--ok)");
    for (const c of (this.lastXp.contracts || []))
      TOAST.push("Contract complete", c.text + " · +" + c.pay + " salvage", "var(--friend)");
    INPUT.setPointerLock(false);
    // Death offers alternate between a full revive and an emergency respawn
    renderOffer("offer-over", (SAVE.data.stats.deaths | 0) % 2 === 0 ? "revive" : "respawn");
    CG.showBanner("banner-over");          // static screen, shown >5s
  },
  pause(){
    if (this.state !== "playing") return;
    this.state = "paused";
    showScreen("scr-pause");
    INPUT.setPointerLock(false);
    CG.gameplayStop();
    AUDIO.setEngine(0);
    AUDIO.duckMusic(true);       // score goes behind glass, not silent
  },
  resume(){
    if (this.state !== "paused") return;
    this.state = "playing";
    showScreen(null);
    CG.gameplayStart();
    INPUT.setPointerLock(true);
    AUDIO.startEngine();
    AUDIO.duckMusic(false);
  },
  quitToMenu(){
    this.state = "menu";
    INPUT.setPointerLock(false);
    CG.gameplayStop();
    CG.clearContext();
    AUDIO.setEngine(0);
    // the menu keeps its own score rather than falling silent
    AUDIO.menuMusic();
    AUDIO.duckMusic(false);
    showScreen("scr-main");
    refreshMainBest();
  },
};
function statRow(k, v){ return '<div class="sk">' + k + '</div><div class="sv">' + v + "</div>"; }
