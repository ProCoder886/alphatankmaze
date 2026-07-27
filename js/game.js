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
    if (level >= 1) unlocked.push("hunter");
    if (level >= 2) unlocked.push("bomber");
    if (level >= 3) unlocked.push("sniper");
    if (level >= 4) unlocked.push("heavy");
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
  weatherAcc: 0,

  reset(levelData){
    this.map = levelData.map;
    this.theme = levelData.theme;
    this.floorCv = levelData.floorCv;
    this.enemies = []; this.shells = []; this.mines = [];
    this.bombs = []; this.pickups = [];
    this.barrels = levelData.barrels.map(makeBarrel);
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
      if (e.type === "boss") boss = true;
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
  cv: null, cx: null, dirty: true, scale: 3,
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
      c.fillStyle = v === 1 ? "rgba(140,165,185,0.65)" : "rgba(200,140,100,0.6)";
      c.fillRect(cc * s, r * s, s, s);
    }
    this.dirty = false;
  },
  draw(c){
    const map = WORLD.map;
    if (!map) return;
    if (map.dirty || this.dirty) { this.rebuild(); map.dirty = false; }
    const mw = this.cv.width, mh = this.cv.height;
    const maxW = Math.min(190, W * 0.28);
    const k = Math.min(maxW / mw, 150 / mh);
    const dw = mw * k, dh = mh * k;
    const x = W - dw - 16, y = H - dh - 16;
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
    for (const p of WORLD.pickups) dot(p.x, p.y, "#ffe27a", 2);
    for (const e of WORLD.enemies) dot(e.x, e.y, e.type === "boss" ? "#ff4d5e" : "#ff7a45", e.type === "boss" ? 4 : 2.4);
    if (WORLD.player && WORLD.player.alive) dot(WORLD.player.x, WORLD.player.y, "#46e0d8", 3);
  },
};

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

  resetStats(){
    this.stats = { shots: 0, hits: 0, kills: 0, bombs: 0, damageTaken: 0, pickups: 0, time: 0, bricks: 0 };
  },
  startRun(){
    this.resetStats();
    this.score = 0;
    this.combo = { n: 0, t: 0, best: 0 };
    this.shownHints = {};
    this.timescale = 1; this.slowmoT = 0; this.freeze = 0;
    this.deathRealT = -1;
    DIRECTOR.reset();
    this.level = 1;
    this.startLevel(this.level);
    this.state = "playing";
    showScreen(null);
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
    this.bossLevel = level % 3 === 0;
    this.wavesTotal = clamp(3 + Math.floor((level - 1) / 2), 3, 5);
    this.waveState = "prep";
    this.prepT = 2.4;
    this.modifier = null;
    this.showBanner("SECTOR " + level + " — " + data.theme.name, data.theme.sub, 2.6);
  },
  startWave(n){
    this.wave = n;
    this.waveStartT = this.stats.time;
    this.modifier = DIRECTOR.rollModifier(this.level, n);
    const isBossWave = this.bossLevel && n === this.wavesTotal;
    let comp;
    if (isBossWave) {
      comp = ["boss", "grunt", "grunt"];
      this.showBanner("⚠ COMMAND UNIT DETECTED", "Neutralize the boss", 3);
      AUDIO.bossAlert();
      CAM.tzoom = 0.88;
      this.hint("boss", "COMMAND UNIT — DODGE THE CHARGE, PUNISH THE SPIN-UP");
    } else {
      comp = (this.modifier && this.modifier.force)
        ? this.modifier.force.slice()
        : DIRECTOR.compose(this.level, DIRECTOR.budget(this.level, n));
      this.showBanner("WAVE " + n + " / " + this.wavesTotal,
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
    const p = this.pickSpawnCell();
    const e = new Enemy(type, p.x, p.y, this.level, mods);
    WORLD.enemies.push(e);
    fxSpawnPortal(p.x, p.y, e.style.accent);
    AUDIO.beep(340);
  },
  bossSummon(n){
    const boss = WORLD.enemies.find(e => e.type === "boss");
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
    this.combo.n++;
    this.combo.t = CFG.COMBO_WINDOW;
    this.combo.best = Math.max(this.combo.best, this.combo.n);
    this.addScore(e.scoreVal, e.x, e.y - 10);
    this.freeze = Math.max(this.freeze, e.type === "boss" ? 9 : 2);
    if (e.type === "boss") {
      this.slowmo(0.25, 1.1);
      CAM.tzoom = 1;
      CAM.addShake(0.8);
      for (let i = 0; i < 4; i++)
        setTimeoutSafe(() => explode(e.x + rand(-50, 50), e.y + rand(-50, 50), { radius: 80, dmg: 0, breakTiles: true }), i * 140);
      for (let i = 0; i < 3; i++) spawnPickup(e.x + rand(-40, 40), e.y + rand(-40, 40));
    } else if (chance(DIRECTOR.dropChance())) {
      spawnPickup(e.x, e.y);
    }
  },
  onPlayerDead(){
    this.waveState = "dead";
    this.slowmo(0.3, 1.4);
    this.deathRealT = 1.8;
    DIRECTOR.onPlayerDeath();
  },
  slowmo(scale, dur){ this.timescale = scale; this.slowmoT = dur; },

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
    if (this.hintMsg.t > 0) this.hintMsg.t -= dt;
    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }

    // adaptive tutorial hints
    if (this.level === 1) {
      if (this.stats.time > 7 && this.stats.bombs === 0) this.hint("bomb", "SPACE — BOMBS EXCAVATE BRICK WALLS & CHAIN BARRELS");
      if (this.stats.time > 16) this.hint("boost", "HOLD SHIFT — OVERDRIVE BOOST");
    }
    if (WORLD.player && WORLD.player.alive && WORLD.player.hp < 32)
      this.hint("lowhp", "CRITICAL DAMAGE — HOSTILES DROP REPAIR KITS");

    switch (this.waveState) {
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
          if (this.wave >= this.wavesTotal) {
            this.waveState = "done";
            this.prepT = 1.8;
            this.showBanner("SECTOR SECURED", "+ " + fmt(500 + this.level * 200) + " clearance bonus", 2.2);
            this.score += 500 + this.level * 200;
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
    this.state = "levelend";
    SAVE.data.stats.levels++;
    SAVE.persist();
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
    AUDIO.setEngine(0);
  },
  nextLevel(){
    this.level++;
    // carry-over refit between sectors
    const pl = WORLD.player;
    const keepBombs = pl ? Math.max(3, pl.bombs) : 3;
    this.startLevel(this.level);
    WORLD.player.bombs = Math.min(WORLD.player.maxBombs, keepBombs);
    this.state = "playing";
    showScreen(null);
    AUDIO.startEngine();
  },
  gameOver(){
    this.state = "over";
    this.timescale = 1;
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
    document.getElementById("go-stats").innerHTML =
      statRow("Sector reached", this.level) +
      statRow("Kills", this.stats.kills) +
      statRow("Accuracy", acc + "%") +
      statRow("Best combo", "x" + Math.max(1, this.combo.best)) +
      statRow("Damage taken", Math.round(this.stats.damageTaken)) +
      statRow("Survived", padTime(this.stats.time));
    showScreen("scr-over");
  },
  pause(){
    if (this.state !== "playing") return;
    this.state = "paused";
    showScreen("scr-pause");
    AUDIO.setEngine(0);
  },
  resume(){
    if (this.state !== "paused") return;
    this.state = "playing";
    showScreen(null);
    AUDIO.startEngine();
  },
  quitToMenu(){
    this.state = "menu";
    AUDIO.setEngine(0);
    AUDIO.stopMusic();
    showScreen("scr-main");
    refreshMainBest();
  },
};
function statRow(k, v){ return '<div class="sk">' + k + '</div><div class="sv">' + v + "</div>"; }
