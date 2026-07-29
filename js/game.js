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
const DIRECTOR = {
  skill: 0.45, // 0 (struggling) .. 1 (dominating)
  reset(){ this.skill = 0.45; },
  nudge(v){ this.skill = clamp(this.skill + v, 0, 1); },
  onPlayerKill(){ this.nudge(0.013); },
  onPlayerHit(dmg){ this.nudge(-dmg * 0.0009); },
  onPlayerDeath(){ this.nudge(-0.16); },
  onWaveClear(fast){ this.nudge(fast ? 0.03 : 0.008); },
  _fixed(){
    switch (SETTINGS.difficulty) {
      case "easy": return 0.18;
      case "normal": return 0.5;
      case "hard": return 0.85;
      default: return null;
    }
  },
  eff(){ const f = this._fixed(); return f === null ? this.skill : f; },
  aimErrMul(){ return lerp(1.8, 0.55, this.eff()); },
  leadMul(){ return lerp(0.5, 1.15, this.eff()); },
  speedMul(){ return lerp(0.88, 1.12, this.eff()); },
  hpMul(){ return lerp(0.85, 1.18, this.eff()); },
  lockMul(){ return lerp(1.5, 0.8, this.eff()); },
  dropChance(){ return lerp(0.36, 0.2, this.eff()); },
  budget(level, wave){
    return Math.round((11 + level * 5.5 + wave * 4) * lerp(0.72, 1.25, this.eff()));
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
    while (budget > 0 && out.length < 12 && guard++ < 60) {
      const affordable = unlocked.filter(t => ENEMY_TYPES[t].cost <= budget);
      if (!affordable.length) break;
      const t = pick(affordable);
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
    if (!chance(0.4 + this.eff() * 0.2)) return null;
    return pick(this.MODS);
  },
};

/* ================================================================
   SECTION 11 — WORLD (entity container + simulation step)
   ================================================================ */
const WORLD = {
  map: null, theme: THEMES[0], floorCv: null,
  player: null,
  enemies: [], shells: [], mines: [], bombs: [], barrels: [], pickups: [],
  missiles: [], drones: [], strikes: [],   // superpower objects
  emplacements: [],                        // static enemy structures
  weatherAcc: 0,

  reset(levelData){
    this.map = levelData.map;
    this.theme = levelData.theme;
    this.floorCv = levelData.floorCv;
    this.enemies = []; this.shells = []; this.mines = [];
    this.bombs = []; this.pickups = [];
    this.missiles = []; this.drones = []; this.strikes = [];
    this.barrels = levelData.barrels.map(makeBarrel);
    this.emplacements = (levelData.emplacements || []).map(e => makeEmplacement(e.kind, e.x, e.y));
    PARTS.pool.length = 0;
    LIGHTS.flashes.length = 0;
    NOISES.list.length = 0;
    TIMERS.length = 0;
    DECALS.init(this.map.cols * CFG.TILE, this.map.rows * CFG.TILE);
    this.player = new Player(levelData.playerSpawn.x, levelData.playerSpawn.y);
    CAM.tzoom = 1;
    CAM.snap(this.player.x, this.player.y);
    MINI.dirty = true;
  },

  update(dt){
    NOISES.update(dt);
    LIGHTS.update(dt);
    if (this.player) this.player.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
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
      a.x -= nx * overlap * (b.mass / tm);
      a.y -= ny * overlap * (b.mass / tm);
      b.x += nx * overlap * (a.mass / tm);
      b.y += ny * overlap * (a.mass / tm);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--)
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
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
    if (!this.cv) { this.cv = document.createElement("canvas"); this.cx = this.cv.getContext("2d"); }
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
    for (const e of WORLD.enemies) dot(e.x, e.y, e.boss ? "#ff4d5e" : "#ff7a45", e.boss ? 4 : 2.4);
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
};
const MODE_ORDER = ["campaign", "survival", "timeattack", "quick", "endless", "freerun", "training"];

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
  startRun(modeId){
    if (modeId && MODES[modeId]) this.mode = modeId;
    const M = this.def();
    this.finished = false;
    this.timeLeft = M.timeLimit || 0;
    this.resetStats();
    this.score = 0;
    this.combo = { n: 0, t: 0, best: 0 };
    this.shownHints = {};
    this.timescale = 1; this.slowmoT = 0; this.freeze = 0;
    this.deathRealT = -1;
    this.revivesUsed = 0;          // rewarded revive is once per run
    POWERS.reset(M.allPowers ? 9 : 0);
    this.killStreak = 0;
    this.pendingLoadout = this.pendingLoadout || null;
    DIRECTOR.reset();
    this.level = 1;
    this.startLevel(this.level);
    if (M.invuln) WORLD.player.invuln = 1e9;
    this.applyLoadout();           // consume a claimed supply-drop reward
    this.state = "playing";
    showScreen(null);
    CG.clearAllBanners();
    CG.gameplayStart();
    INPUT.setPointerLock(true);
    AUDIO.resume();
    AUDIO.startEngine();
    AUDIO.startMusic();
    this.hint("move", INPUT.usingTouch
      ? "LEFT THUMB DRIVE — RIGHT THUMB AIM & FIRE — TAP LEFT SIDE FOR BOMB"
      : "WASD DRIVE — MOUSE AIM — HOLD LMB FIRE — SPACE BOMB");
  },
  startLevel(level){
    const data = genLevel(level);
    WORLD.reset(data);
    this.wave = 0;
    const M = this.def();
    this.bossLevel = !!M.bosses && !M.survival && level % 3 === 0;
    this.wavesTotal = M.survival ? 9999
      : (M.single ? 3 : clamp(3 + Math.floor((level - 1) / 2), 3, 5));
    this.barrelsLeft = WORLD.barrels.length;
    this.obstaclesTotal = WORLD.emplacements.length;
    this.waveState = M.noEnemies ? "explore" : "prep";
    this.prepT = 2.4;
    this.modifier = null;
    this.showBanner((this.def().survival ? "ARENA — " : "SECTOR " + level + " — ") + data.theme.name,
      data.shape.name + " · " + data.theme.sub, 2.6);
    // attach state to any player feedback sent from this sector
    CG.setContext({ mode: this.mode, sector: level, shape: data.shape.id, theme: data.theme.name, difficulty: SETTINGS.difficulty });
  },
  startWave(n){
    this.wave = n;
    this.waveStartT = this.stats.time;
    this.modifier = DIRECTOR.rollModifier(this.level, n);
    const M = this.def();
    const isBossWave = (this.bossLevel && n === this.wavesTotal) ||
                       (M.survival && M.bosses && n % 5 === 0);
    let comp;
    if (isBossWave) {
      comp = [bossTypeForLevel(this.level), "grunt", "grunt"];
      this.showBanner("⚠ " + (ENEMY_TYPES[bossTypeForLevel(this.level)].title || "BOSS") + " DETECTED", "Neutralize the boss", 3);
      AUDIO.bossAlert();
      CAM.tzoom = 0.88;
      this.hint("boss", "COMMAND UNIT — DODGE THE CHARGE, PUNISH THE SPIN-UP");
    } else {
      comp = (this.modifier && this.modifier.force)
        ? this.modifier.force.slice()
        : DIRECTOR.compose(M.survival ? 1 + Math.floor(n / 2) : this.level, DIRECTOR.budget(this.level, n));
      this.showBanner(M.survival ? "WAVE " + n : "WAVE " + n + " / " + this.wavesTotal,
        this.modifier ? "⚡ " + this.modifier.label : "", 2.2);
      AUDIO.waveFanfare();
    }
    const mods = this.modifier ? this.modifier.apply : {};
    this.spawnQueue = comp.map((type, i) => ({ type, delay: 0.4 + i * 0.5, mods }));
    this.waveState = "active";
  },
  pickSpawnCell(){
    const map = WORLD.map, pl = WORLD.player;
    let best = null, bestD = -1;
    for (let i = 0; i < 40; i++) {
      const c = randInt(1, map.cols - 2), r = randInt(1, map.rows - 2);
      if (map.get(c, r) !== 0) continue;
      const p = map.center(c, r);
      const d = dist2(p.x, p.y, pl.x, pl.y);
      if (d < (CFG.TILE * 7) ** 2) continue;
      // prefer mid-distance spawns (not across the whole map)
      const scoreD = -Math.abs(d - (CFG.TILE * 13) ** 2);
      if (scoreD > bestD) { bestD = scoreD; best = p; }
    }
    return best || map.center(map.cols - 2, map.rows - 2);
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
      CAM.tzoom = 1;
      CAM.addShake(0.8);
      this.addSalvage(100);
      POWERS.grantRandom(2);
      CG.happytime();              // platform celebration: boss down
      for (let i = 0; i < 4; i++)
        setTimeoutSafe(() => explode(e.x + rand(-50, 50), e.y + rand(-50, 50), { radius: 80, dmg: 0, breakTiles: true }), i * 140);
      for (let i = 0; i < 3; i++) spawnPickup(e.x + rand(-40, 40), e.y + rand(-40, 40));
    } else if (chance(DIRECTOR.dropChance())) {
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
  revivePlayer(inPlace){
    this.revivesUsed++;
    const data = genLevel(this.level);
    WORLD.reset(data);
    const pl = WORLD.player;
    pl.hp = pl.maxHp;
    pl.shieldHp = 45; pl.shieldT = 12;
    pl.bombs = Math.min(pl.maxBombs, pl.bombs + 2);
    pl.invuln = 2.5;
    this.waveState = "prep";
    this.prepT = 2.4;
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
    AUDIO.startMusic();
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
            this.prepT = 3.2;
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
    const M = this.def();
    // A one-sector mode finishes the whole run here instead
    if (M.single) { this.runComplete("SECTOR SECURED"); return; }
    this.state = "levelend";
    CG.gameplayStop();
    SAVE.data.stats.levels++;
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
    document.getElementById("lc-title").textContent = "Sector " + this.level + " Cleared";
    document.getElementById("lc-stats").innerHTML =
      statRow("Score", fmt(this.score)) +
      statRow("Kills", this.stats.kills) +
      statRow("Accuracy", acc + "%") +
      statRow("Best combo", "x" + Math.max(1, this.combo.best)) +
      statRow("Bricks razed", this.stats.bricks) +
      statRow("Time", padTime(this.stats.time));
    showScreen("scr-level");
    INPUT.setPointerLock(false);
    // Rotate the sector-clear offer so it never feels like the same prompt
    const clearOffers = ["bonus", "power", "armour", "salvagerun"];
    renderOffer("offer-level", clearOffers[this.level % clearOffers.length]);
    AUDIO.setEngine(0);
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
    document.getElementById("go-stats").innerHTML =
      statRow("Mode", this.def().name) +
      statRow(this.def().survival ? "Waves survived" : "Sector reached",
              this.def().survival ? Math.max(0, this.wave - 1) : this.level) +
      statRow("Kills", this.stats.kills) +
      statRow("Accuracy", acc + "%") +
      statRow("Best combo", "x" + Math.max(1, this.combo.best)) +
      statRow("Powers used", this.stats.powers || 0) +
      statRow("Damage taken", Math.round(this.stats.damageTaken)) +
      statRow("Survived", padTime(this.stats.time));
    if (isRecord) CG.happytime();          // platform celebration: new best
    showScreen("scr-over");
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
  },
  resume(){
    if (this.state !== "paused") return;
    this.state = "playing";
    showScreen(null);
    CG.gameplayStart();
    INPUT.setPointerLock(true);
    AUDIO.startEngine();
  },
  quitToMenu(){
    this.state = "menu";
    INPUT.setPointerLock(false);
    CG.gameplayStop();
    CG.clearContext();
    AUDIO.setEngine(0);
    AUDIO.stopMusic();
    showScreen("scr-main");
    refreshMainBest();
  },
};
function statRow(k, v){ return '<div class="sk">' + k + '</div><div class="sv">' + v + "</div>"; }
