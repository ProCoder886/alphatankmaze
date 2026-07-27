"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/tanks.js
   SECTION 9 — Tanks: shared physics chassis, Player, enemy tactical FSM AI (patrol/hunt/engage/flee/breach), predictive targeting, sniper lock, boss phases.
   ================================================================ */
/* ================================================================
   SECTION 9 — TANKS
   Shared physics chassis, the Player, and the Enemy tactical AI:
   FSM (patrol / hunt / engage / flee / breach), A* navigation,
   LOS + hearing perception, predictive lead targeting, sniper
   lock-on, bomber wall-breaching, and the phase-based boss.
   ================================================================ */
class Tank {
  constructor(x, y, team){
    this.x = x; this.y = y;
    this.vel = { x: 0, y: 0 };
    this.angle = 0;          // hull facing
    this.tAngle = 0;         // turret facing
    this.aimAng = 0;         // desired turret facing
    this.moveIn = { x: 0, y: 0 };
    this.team = team;
    this.hp = 100; this.maxHp = 100;
    this.radius = 15;
    this.mass = 1;
    this.speed = 150;
    this.accel = 7.5;
    this.turn = 6;
    this.turretSpd = 8;
    this.reload = 0.5;
    this.reloadT = 0;
    this.alive = true;
    this.flashT = 0;
    this.shieldHp = 0; this.shieldT = 0;
    this.invuln = 0;
    this.stun = 0;
    this.spawnT = 0;
    this.recoil = 0;
    this.treadT = 0;
    this.treadPhase = 0;
    this.tilt = 0;
    this.barrelLen = 24;
    this.style = { hull: "#666", dark: "#333", accent: "#aaa", barrel: "#444" };
  }
  speedMul(){ return 1; }
  update(dt, w){
    if (!this.alive) return;
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.recoil = Math.max(0, this.recoil - dt * 40);
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shieldHp = 0; }
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      if ((this.spawnT * 12 | 0) % 2 === 0)
        fxRing(this.x, this.y, 30 + this.spawnT * 40, this.style.accent, 0.2);
      return;
    }
    if (this.stun > 0) {
      this.stun -= dt;
      this.moveIn.x = 0; this.moveIn.y = 0;
      if (chance(dt * 14)) fxSparkBurst(this.x + rand(-10, 10), this.y + rand(-10, 10), 2, "#c98aff");
    } else if (this.think) {
      this.think(dt, w);
    }
    // drive physics: momentum toward desired velocity
    const sp = this.speed * this.speedMul();
    const dx = this.moveIn.x * sp, dy = this.moveIn.y * sp;
    const blend = 1 - Math.exp(-this.accel * dt);
    const ax = (dx - this.vel.x) * blend;
    const ay = (dy - this.vel.y) * blend;
    this.vel.x += ax;
    this.vel.y += ay;
    this.x += this.vel.x * dt;
    this.y += this.vel.y * dt;
    this.collideTiles(w.map);
    const spd = Math.hypot(this.vel.x, this.vel.y);
    if (spd > 18) {
      this.angle = angMove(this.angle, Math.atan2(this.vel.y, this.vel.x), this.turn * dt * clamp(spd / 100, 0.4, 1.4));
      this.treadPhase += spd * dt * 0.14;
      this.treadT -= dt;
      if (this.treadT <= 0) {
        this.treadT = 0.09;
        DECALS.tread(this.x, this.y, this.angle, this.radius * 0.72);
      }
    }
    // visual hull pitch from acceleration along facing
    const fwdAcc = (ax * Math.cos(this.angle) + ay * Math.sin(this.angle)) / Math.max(dt, 1e-4);
    this.tilt = expLerp(this.tilt, clamp(fwdAcc / 2400, -0.09, 0.09), 8, dt);
    // turret slew
    this.tAngle = angMove(this.tAngle, this.aimAng, this.turretSpd * dt);
  }
  collideTiles(map){
    const T = CFG.TILE, r = this.radius;
    for (let pass = 0; pass < 2; pass++) {
      const c0 = Math.floor((this.x - r) / T), c1 = Math.floor((this.x + r) / T);
      const r0 = Math.floor((this.y - r) / T), r1 = Math.floor((this.y + r) / T);
      for (let cr = r0; cr <= r1; cr++) for (let cc = c0; cc <= c1; cc++) {
        if (!map.solidAt(cc, cr)) continue;
        const cx = clamp(this.x, cc * T, cc * T + T);
        const cy = clamp(this.y, cr * T, cr * T + T);
        let ddx = this.x - cx, ddy = this.y - cy;
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { ddx = 0; ddy = -1; d = 1; }
        else { ddx /= d; ddy /= d; }
        const push = r - d;
        this.x += ddx * push;
        this.y += ddy * push;
        const vn = this.vel.x * ddx + this.vel.y * ddy;
        if (vn < 0) { this.vel.x -= ddx * vn; this.vel.y -= ddy * vn; }
      }
    }
  }
  muzzle(){
    const len = this.barrelLen + this.radius - this.recoil;
    return { x: this.x + Math.cos(this.tAngle) * len, y: this.y + Math.sin(this.tAngle) * len };
  }
  fireShell(spec, angOffset){
    const m = this.muzzle();
    const ang = this.tAngle + (angOffset || 0);
    spawnShell(this, m.x, m.y, ang, spec);
    this.recoil = 6;
    // recoil impulse on hull
    this.vel.x -= Math.cos(ang) * 24 / this.mass;
    this.vel.y -= Math.sin(ang) * 24 / this.mass;
    fxMuzzle(m.x, m.y, ang, spec.r > 4.5 ? 1.35 : 1);
    fxCasing(this.x + Math.cos(this.tAngle) * 8, this.y + Math.sin(this.tAngle) * 8, this.tAngle);
    NOISES.add(this.x, this.y, 480);
  }
  damage(amount, sx, sy, src){
    if (!this.alive || this.invuln > 0 || this.spawnT > 0) return;
    if (this.shieldHp > 0) {
      const used = Math.min(this.shieldHp, amount);
      this.shieldHp -= used;
      amount -= used;
      AUDIO.shieldHit();
      fxRing(this.x, this.y, this.radius + 12, "#7ec8ff", 0.25);
      if (amount <= 0) return;
    }
    this.hp -= amount;
    this.flashT = 0.12;
    fxSparkBurst(sx !== undefined ? sx : this.x, sy !== undefined ? sy : this.y, 5, "#ffd27a");
    this.onDamaged && this.onDamaged(amount, src);
    if (this.hp <= 0) this.die(src);
  }
  die(src){
    if (!this.alive) return;
    this.alive = false;
    DECALS.wreck(this.x, this.y, this.angle, this.style.hull, this.radius / 15);
    explode(this.x, this.y, { radius: 58 + this.radius * 1.6, dmg: 16, owner: this, breakTiles: false });
    fxDebris(this.x, this.y, 10, this.style.hull);
    this.onDeath && this.onDeath(src);
  }
  drawTreads(c){
    const w = this.radius * 2.15, h = this.radius * 2.0;
    c.fillStyle = this.style.dark;
    const tw = w * 0.32;
    c.fillRect(-w / 2, -h / 2, w, tw);
    c.fillRect(-w / 2, h / 2 - tw, w, tw);
    // animated tread links
    c.fillStyle = "rgba(0,0,0,0.4)";
    const linkW = 5;
    const off = (this.treadPhase % linkW);
    for (let x = -w / 2 - off; x < w / 2; x += linkW) {
      c.fillRect(x, -h / 2 + 1, 2, tw - 2);
      c.fillRect(x, h / 2 - tw + 1, 2, tw - 2);
    }
  }
  draw(c, time){
    if (!this.alive) return;
    const ghost = this.spawnT > 0;
    c.save();
    c.translate(this.x, this.y);
    if (ghost) c.globalAlpha = 0.35 + 0.25 * Math.sin(time * 20);
    // shadow
    c.fillStyle = "rgba(0,0,0,0.32)";
    c.beginPath();
    c.ellipse(3, 5, this.radius * 1.15, this.radius * 0.95, 0, 0, TAU);
    c.fill();
    // hull
    c.save();
    c.rotate(this.angle);
    c.scale(1 + this.tilt, 1 - Math.abs(this.tilt) * 0.5);
    this.drawTreads(c);
    const w = this.radius * 1.9, h = this.radius * 1.5;
    const grad = c.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, this.style.hull);
    grad.addColorStop(1, this.style.dark);
    c.fillStyle = grad;
    c.beginPath();
    if (c.roundRect) c.roundRect(-w / 2, -h / 2, w, h, 5); else c.rect(-w / 2, -h / 2, w, h);
    c.fill();
    c.fillStyle = this.style.accent;
    c.fillRect(w * 0.18, -h / 2 + 3, 4, h - 6); // front stripe
    c.fillStyle = "rgba(255,255,255,0.10)";
    c.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, 4);
    c.restore();
    // turret
    c.save();
    c.rotate(this.tAngle);
    c.fillStyle = this.style.barrel;
    const bl = this.barrelLen + this.radius - this.recoil;
    c.fillRect(this.radius * 0.2, -3.2, bl - this.radius * 0.2, 6.4);
    c.fillStyle = this.style.dark;
    c.fillRect(bl - 6, -4.4, 6, 8.8); // muzzle brake
    if (this.twin) {
      c.fillStyle = this.style.barrel;
      c.fillRect(this.radius * 0.2, -8, bl * 0.85, 4.4);
      c.fillRect(this.radius * 0.2, 3.6, bl * 0.85, 4.4);
    }
    const tg = c.createRadialGradient(-2, -2, 1, 0, 0, this.radius * 0.72);
    tg.addColorStop(0, this.style.accent);
    tg.addColorStop(1, this.style.dark);
    c.fillStyle = tg;
    c.beginPath(); c.arc(0, 0, this.radius * 0.72, 0, TAU); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.4)";
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, this.radius * 0.72, 0, TAU); c.stroke();
    c.restore();
    // hit flash
    if (this.flashT > 0) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = this.flashT / 0.12 * 0.7;
      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(0, 0, this.radius * 1.2, 0, TAU); c.fill();
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = ghost ? 0.4 : 1;
    }
    // shield bubble
    if (this.shieldHp > 0) {
      c.globalAlpha = 0.35 + 0.15 * Math.sin(time * 6);
      c.strokeStyle = "#7ec8ff";
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, this.radius + 8, 0, TAU); c.stroke();
      c.globalAlpha = 0.08;
      c.fillStyle = "#7ec8ff";
      c.fill();
      c.globalAlpha = 1;
    }
    // stun indicator
    if (this.stun > 0) {
      c.fillStyle = "#c98aff";
      for (let k = 0; k < 3; k++) {
        const a = time * 5 + k * (TAU / 3);
        c.beginPath();
        c.arc(Math.cos(a) * (this.radius + 6), Math.sin(a) * (this.radius + 6) - 4, 2.4, 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }
}

/* ================================================================
   PLAYER
   ================================================================ */
class Player extends Tank {
  constructor(x, y){
    super(x, y, "player");
    this.hp = CFG.PLAYER_HP; this.maxHp = CFG.PLAYER_HP;
    this.radius = 15;
    this.speed = 172;
    this.accel = 8.5;
    this.turn = 8;
    this.turretSpd = 14;
    this.reload = 0.42;
    this.barrelLen = 22;
    this.style = { hull: "#2f7d80", dark: "#173a3d", accent: "#8ffff6", barrel: "#245c60" };
    this.bombs = 3;
    this.maxBombs = 6;
    this.bombCd = 0;
    this.boost = 1;
    this.rapidT = 0; this.tripleT = 0; this.speedT = 0;
    this.invuln = 1.2;
    this.exhaustT = 0;
    this.shell = { spd: 560, dmg: 20, r: 4, bounces: 1, color: "#8ffff6", brickDmg: 1 };
  }
  speedMul(){
    let m = 1;
    if (this.speedT > 0) m *= 1.3;
    if (this.boosting) m *= 1.55;
    return m;
  }
  think(dt, w){
    // timers
    this.rapidT = Math.max(0, this.rapidT - dt);
    this.tripleT = Math.max(0, this.tripleT - dt);
    this.speedT = Math.max(0, this.speedT - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    // movement
    const mv = INPUT.moveAxis();
    this.moveIn.x = mv.x; this.moveIn.y = mv.y;
    // boost
    const wantBoost = INPUT.boostDown() && (mv.x || mv.y);
    this.boosting = wantBoost && this.boost > 0.06;
    if (this.boosting) {
      this.boost = Math.max(0, this.boost - dt * 0.55);
      this.exhaustT -= dt;
      if (this.exhaustT <= 0) {
        this.exhaustT = 0.03;
        fxExhaust(this.x - Math.cos(this.angle) * this.radius, this.y - Math.sin(this.angle) * this.radius, this.angle + Math.PI);
      }
    } else {
      this.boost = Math.min(1, this.boost + dt * 0.32);
    }
    // aiming
    const ov = INPUT.aimOverride();
    if (ov.has) {
      this.aimAng = ov.ang;
    } else {
      const wp = CAM.screenToWorld(INPUT.mouse.x, INPUT.mouse.y);
      this.aimAng = Math.atan2(wp.y - this.y, wp.x - this.x);
    }
    // fire
    if (INPUT.firing() && this.reloadT <= 0) {
      this.reloadT = this.rapidT > 0 ? 0.15 : this.reload;
      const spec = Object.assign({}, this.shell);
      if (this.rapidT > 0) spec.dmg = 16;
      if (this.tripleT > 0) {
        const tri = Object.assign({}, spec, { dmg: Math.round(spec.dmg * 0.72) });
        this.fireShell(tri, -0.16);
        this.fireShell(tri, 0);
        this.fireShell(tri, 0.16);
      } else {
        this.fireShell(spec, 0);
      }
      AUDIO.shoot();
      CAM.addShake(0.07);
      GAME.stats.shots++;
    }
    // bomb
    if (INPUT.bombHit() && this.bombs > 0 && this.bombCd <= 0) {
      this.bombs--;
      this.bombCd = 0.4;
      const bx = this.x + Math.cos(this.angle) * 6;
      const by = this.y + Math.sin(this.angle) * 6;
      plantBomb(bx, by, this);
      GAME.stats.bombs++;
      GAME.hintDone("bomb");
    }
    // engine audio throttle
    AUDIO.setEngine(clamp(Math.hypot(this.vel.x, this.vel.y) / 240, 0, 1));
  }
  onDamaged(amount, src){
    AUDIO.hurt();
    CAM.addShake(clamp(amount / 60, 0.12, 0.5));
    FX.doFlash(clamp(amount / 220, 0.05, 0.22), "255,80,90");
    GAME.stats.damageTaken += amount;
    DIRECTOR.onPlayerHit(amount);
  }
  onDeath(src){
    AUDIO.playerDeath();
    AUDIO.setEngine(0);
    CAM.addShake(1);
    FX.doFlash(0.5, "255,120,80");
    GAME.onPlayerDead();
  }
}

/* ================================================================
   ENEMY AI
   ================================================================ */
const ENEMY_TYPES = {
  grunt: {
    hp: 42, speed: 92, accel: 6, turn: 5, turretSpd: 3.2, reload: 1.7,
    radius: 15, mass: 1, range: 430, prefDist: 250, aimErr: 0.16, lead: 0.35,
    shell: { spd: 380, dmg: 10, r: 4, bounces: 1, color: "#ff9d6c", brickDmg: 1 },
    score: 100, cost: 3, barrelLen: 20,
    style: { hull: "#a34a3c", dark: "#5c2620", accent: "#ff9d6c", barrel: "#7a352c" },
  },
  hunter: {
    hp: 58, speed: 140, accel: 8.5, turn: 7.5, turretSpd: 5.4, reload: 2.2,
    radius: 14, mass: 0.9, range: 420, prefDist: 185, aimErr: 0.11, lead: 0.8,
    shell: { spd: 440, dmg: 8, r: 3.5, bounces: 1, color: "#ffb03a", brickDmg: 1 },
    score: 175, cost: 5, barrelLen: 22, burst: 3, burstGap: 0.13,
    style: { hull: "#b8622c", dark: "#6b3618", accent: "#ffd05c", barrel: "#8a4820" },
  },
  sniper: {
    hp: 34, speed: 84, accel: 6, turn: 5.5, turretSpd: 4.5, reload: 3.1,
    radius: 13, mass: 0.85, range: 760, prefDist: 460, aimErr: 0.015, lead: 0.95,
    shell: { spd: 800, dmg: 26, r: 4.5, bounces: 0, color: "#7ef0ff", brickDmg: 2 },
    score: 200, cost: 6, barrelLen: 34, lockTime: 0.6,
    style: { hull: "#3d6a80", dark: "#1e3542", accent: "#7ef0ff", barrel: "#2c4d5e" },
  },
  bomber: {
    hp: 64, speed: 108, accel: 7, turn: 6, turretSpd: 3.6, reload: 2.4,
    radius: 16, mass: 1.1, range: 320, prefDist: 165, aimErr: 0.18, lead: 0.3,
    shell: { spd: 360, dmg: 9, r: 4, bounces: 0, color: "#ffd05c", brickDmg: 1 },
    score: 200, cost: 6, barrelLen: 18,
    style: { hull: "#8a7a2e", dark: "#4d4418", accent: "#ffe27a", barrel: "#655a22" },
  },
  heavy: {
    hp: 175, speed: 58, accel: 4, turn: 3.2, turretSpd: 2.2, reload: 2.7,
    radius: 20, mass: 1.9, range: 500, prefDist: 300, aimErr: 0.12, lead: 0.5,
    shell: { spd: 400, dmg: 16, r: 5.5, bounces: 1, color: "#ffcf5c", brickDmg: 2 },
    score: 320, cost: 11, barrelLen: 28, twin: true,
    style: { hull: "#6a4a8a", dark: "#38264d", accent: "#c98aff", barrel: "#4e3566" },
  },
  boss: {
    hp: 650, speed: 66, accel: 4.5, turn: 3.4, turretSpd: 2.8, reload: 2.0,
    radius: 30, mass: 3, range: 620, prefDist: 300, aimErr: 0.1, lead: 0.7,
    shell: { spd: 430, dmg: 14, r: 5, bounces: 1, color: "#ff4d5e", brickDmg: 2 },
    score: 2500, cost: 0, barrelLen: 40, twin: true,
    style: { hull: "#8a2e38", dark: "#471219", accent: "#ff4d5e", barrel: "#631e26" },
  },
};

class Enemy extends Tank {
  constructor(type, x, y, level, mods){
    super(x, y, "enemy");
    this.type = type;
    const D = ENEMY_TYPES[type];
    this.def = D;
    mods = mods || {};
    const hpScale = (1 + (level - 1) * 0.07) * (mods.hp || 1) * DIRECTOR.hpMul();
    this.hp = this.maxHp = Math.round(D.hp * hpScale * (type === "boss" ? 1 + level * 0.2 : 1));
    this.speed = D.speed * (mods.speed || 1) * DIRECTOR.speedMul();
    this.accel = D.accel; this.turn = D.turn;
    this.turretSpd = D.turretSpd;
    this.reload = D.reload;
    this.radius = D.radius; this.mass = D.mass;
    this.barrelLen = D.barrelLen;
    this.twin = !!D.twin;
    this.style = D.style;
    this.aimErrMod = mods.aim || 1;
    this.scoreVal = Math.round(D.score * (mods.score || 1));
    // AI state
    this.state = "patrol";
    this.stateT = 0;
    this.path = null; this.pathI = 0;
    this.repathT = rand(0, 0.6);
    this.perceptT = rand(0, 0.15);
    this.canSee = false;
    this.lastSeen = null;   // {x,y,age}
    this.strafeDir = chance(0.5) ? 1 : -1;
    this.strafeT = rand(0.8, 2);
    this.burstLeft = 0; this.burstT = 0;
    this.lockT = -1; this.lockPt = null;
    this.bombCd = rand(2, 5);
    this.mineCd = rand(3, 6);
    this.fleeing = false;
    this.stuckT = 0;
    this.prevX = x; this.prevY = y;
    this.spawnT = 0.7;
    this.invuln = 1.1;
    this.aimAng = this.tAngle = rand(0, TAU);
    // boss
    if (type === "boss") {
      this.attack = null;
      this.attackT = 3.5;
      this.telegraphT = 0;
      this.chargeT = 0;
      this.chargeDir = 0;
      this.summon66 = false;
      this.summon33 = false;
    }
  }

  /* ---- perception: vision (LOS raycast) + hearing (noise events) ---- */
  perceive(dt, w){
    this.perceptT -= dt;
    if (this.lastSeen) this.lastSeen.age += dt;
    if (this.perceptT > 0) return;
    this.perceptT = 0.13;
    const pl = w.player;
    if (!pl || !pl.alive) { this.canSee = false; return; }
    const d = dist(this.x, this.y, pl.x, pl.y);
    this.canSee = false;
    if (d < CFG.SIGHT_RANGE * (this.type === "sniper" ? 1.5 : 1)) {
      const rc = w.map.raycast(this.x, this.y, pl.x, pl.y);
      if (!rc.hit) {
        this.canSee = true;
        this.lastSeen = { x: pl.x, y: pl.y, age: 0 };
      }
    }
    if (!this.canSee) {
      const n = NOISES.heardAt(this.x, this.y);
      if (n && (!this.lastSeen || this.lastSeen.age > 0.5))
        this.lastSeen = { x: n.x, y: n.y, age: 0.2 };
    }
  }

  setState(s){ if (this.state !== s) { this.state = s; this.stateT = 0; this.path = null; this.repathT = 0; } }

  /* ---- navigation ---- */
  navTo(w, tx, ty, breach){
    this.repathT -= CFG.STEP;
    const need = !this.path || this.repathT <= 0 ||
      (this.navGoal && dist2(this.navGoal.x, this.navGoal.y, tx, ty) > (CFG.TILE * 2) ** 2);
    if (need) {
      this.repathT = rand(0.9, 1.4);
      this.navGoal = { x: tx, y: ty };
      const a = w.map.cellOf(this.x, this.y);
      const b = w.map.cellOf(tx, ty);
      this.path = findPath(w.map, a.c, a.r, b.c, b.r, { breach });
      this.pathI = 0;
    }
    if (!this.path || this.pathI >= this.path.length) { this.moveIn.x = 0; this.moveIn.y = 0; return false; }
    const wp = this.path[this.pathI];
    const d = dist(this.x, this.y, wp.x, wp.y);
    if (d < 16) { this.pathI++; return true; }
    // bombers plant a charge instead of driving into a brick waypoint
    if (breach && w.map.get(wp.c, wp.r) === 2) {
      if (d < CFG.TILE * 1.15 && this.bombCd <= 0) {
        this.bombCd = 6.5;
        plantBomb(this.x + (wp.x - this.x) * 0.4, this.y + (wp.y - this.y) * 0.4, this, { fuse: 1.5, radius: 92, dmg: 40 });
        this.fleeFrom = { x: wp.x, y: wp.y, t: 1.6 };
      }
      if (this.fleeFrom && this.fleeFrom.t > 0) return true;
    }
    this.moveIn.x = (wp.x - this.x) / d;
    this.moveIn.y = (wp.y - this.y) / d;
    return true;
  }

  /* ---- combat targeting: predictive lead + skill-scaled error ---- */
  aimAtPlayer(w){
    const pl = w.player;
    const d = dist(this.x, this.y, pl.x, pl.y);
    const tt = d / this.def.shell.spd;
    const lead = this.def.lead * DIRECTOR.leadMul();
    const tx = pl.x + pl.vel.x * tt * lead;
    const ty = pl.y + pl.vel.y * tt * lead;
    const err = this.def.aimErr * this.aimErrMod * DIRECTOR.aimErrMul();
    this.aimAng = Math.atan2(ty - this.y, tx - this.x) + rand(-err, err);
    return d;
  }
  tryFire(w, d){
    if (this.reloadT > 0 || d > this.def.range) return;
    const trueAng = Math.atan2(w.player.y - this.y, w.player.x - this.x);
    if (Math.abs(angDiff(this.tAngle, trueAng)) > 0.14) return;
    if (this.def.burst) {
      this.burstLeft = this.def.burst;
      this.burstT = 0;
      this.reloadT = this.reload;
    } else if (this.type === "heavy" || this.type === "boss") {
      this.fireShell(this.def.shell, -0.05);
      this.fireShell(this.def.shell, 0.05);
      if (this.type === "boss") this.fireShell(this.def.shell, 0);
      this.reloadT = this.reload;
      AUDIO.heavyShoot();
      CAM.addShake(0.1);
    } else {
      this.fireShell(this.def.shell, 0);
      this.reloadT = this.reload;
      AUDIO.enemyShoot();
    }
  }
  runBurst(dt){
    if (this.burstLeft <= 0) return;
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = this.def.burstGap;
      this.burstLeft--;
      this.fireShell(this.def.shell, rand(-0.03, 0.03));
      AUDIO.enemyShoot();
    }
  }

  think(dt, w){
    const pl = w.player;
    this.stateT += dt;
    this.bombCd = Math.max(0, this.bombCd - dt);
    this.mineCd = Math.max(0, this.mineCd - dt);
    if (this.fleeFrom) { this.fleeFrom.t -= dt; if (this.fleeFrom.t <= 0) this.fleeFrom = null; }
    this.perceive(dt, w);
    this.runBurst(dt);
    if (!pl || !pl.alive) { this.moveIn.x = 0; this.moveIn.y = 0; return; }
    if (this.type === "boss") return this.thinkBoss(dt, w);

    // stuck detection -> force repath
    const moved = dist2(this.x, this.y, this.prevX, this.prevY);
    if ((this.moveIn.x || this.moveIn.y) && moved < 1.2) {
      this.stuckT += dt;
      if (this.stuckT > 0.8) { this.stuckT = 0; this.path = null; this.repathT = 0; this.strafeDir *= -1; }
    } else this.stuckT = 0;
    this.prevX = this.x; this.prevY = this.y;

    // low-morale retreat
    if (this.hp < this.maxHp * 0.28 && this.state !== "flee" && this.type !== "heavy" && chance(dt * 2)) {
      this.setState("flee");
      if (this.type === "bomber" && this.mineCd <= 0) { layMine(this.x, this.y, this); this.mineCd = 5; }
    }

    switch (this.state) {
      case "patrol": {
        if (this.canSee) { this.setState("engage"); break; }
        if (this.lastSeen && this.lastSeen.age < CFG.HEAR_MEMORY) { this.setState("hunt"); break; }
        if (!this.wander || dist2(this.x, this.y, this.wander.x, this.wander.y) < 40 * 40 || this.stateT > 6) {
          this.stateT = 0;
          const cells = [];
          for (let i = 0; i < 12; i++) {
            const c = randInt(1, w.map.cols - 2), r = randInt(1, w.map.rows - 2);
            if (w.map.get(c, r) === 0) cells.push(w.map.center(c, r));
          }
          this.wander = cells.length ? pick(cells) : { x: this.x, y: this.y };
        }
        this.navTo(w, this.wander.x, this.wander.y, false);
        this.aimAng = this.moveIn.x || this.moveIn.y ? Math.atan2(this.moveIn.y, this.moveIn.x) : this.aimAng;
        // bombers seed corridors while patrolling
        if (this.type === "bomber" && this.mineCd <= 0 && chance(dt * 0.5)) {
          layMine(this.x, this.y, this);
          this.mineCd = rand(5, 8);
        }
        break;
      }
      case "hunt": {
        if (this.canSee) { this.setState("engage"); break; }
        if (!this.lastSeen || this.lastSeen.age > CFG.HEAR_MEMORY) { this.setState("patrol"); break; }
        const breach = this.type === "bomber";
        this.navTo(w, this.lastSeen.x, this.lastSeen.y, breach);
        this.aimAng = this.moveIn.x || this.moveIn.y ? Math.atan2(this.moveIn.y, this.moveIn.x) : this.aimAng;
        if (dist2(this.x, this.y, this.lastSeen.x, this.lastSeen.y) < 50 * 50) this.lastSeen.age = 99;
        break;
      }
      case "engage": {
        if (!this.canSee) {
          if (this.lockT >= 0) { this.lockT = -1; this.lockPt = null; }
          if (this.stateT > 0.8) this.setState("hunt");
          break;
        }
        const d = this.aimAtPlayer(w);
        // spacing: approach / back off / strafe
        const dx = pl.x - this.x, dy = pl.y - this.y;
        const nx = dx / Math.max(1, d), ny = dy / Math.max(1, d);
        let mx = 0, my = 0;
        const pd = this.def.prefDist;
        if (d > pd + 50) { mx = nx; my = ny; }
        else if (d < pd - 50) { mx = -nx; my = -ny; }
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = rand(0.8, 2.0); if (chance(0.6)) this.strafeDir *= -1; }
        mx += -ny * this.strafeDir * 0.85;
        my += nx * this.strafeDir * 0.85;
        const mm = Math.hypot(mx, my) || 1;
        this.moveIn.x = mx / mm; this.moveIn.y = my / mm;
        // sniper: telegraphed lock-on
        if (this.type === "sniper") {
          if (this.reloadT <= 0 && this.lockT < 0 && d < this.def.range) {
            this.lockT = this.def.lockTime * DIRECTOR.lockMul();
            GAME.hint("sniper", "SNIPER LOCK — BREAK LINE OF SIGHT");
          }
          if (this.lockT >= 0) {
            this.moveIn.x *= 0.15; this.moveIn.y *= 0.15;
            this.lockT -= dt;
            this.aimAng = Math.atan2(pl.y - this.y, pl.x - this.x);
            const rc = w.map.raycast(this.muzzle().x, this.muzzle().y, pl.x, pl.y);
            this.lockPt = { x: rc.x, y: rc.y };
            if ((this.lockT * 10 | 0) % 2 === 0) AUDIO.laserLock();
            if (this.lockT <= 0) {
              this.fireShell(this.def.shell, 0);
              this.reloadT = this.reload;
              AUDIO.sniperShoot();
              this.lockT = -1; this.lockPt = null;
            }
          }
        } else {
          this.tryFire(w, d);
        }
        // bombers drop mines in the player's path
        if (this.type === "bomber" && this.mineCd <= 0 && d < 260) {
          layMine(this.x, this.y, this);
          this.mineCd = rand(4, 7);
        }
        break;
      }
      case "flee": {
        if (this.stateT > 4 || this.hp > this.maxHp * 0.4) { this.setState(this.canSee ? "engage" : "patrol"); break; }
        if (!this.fleeTarget || this.stateT < 0.1) {
          let best = null, bestD = -1;
          for (let i = 0; i < 10; i++) {
            const c = randInt(1, w.map.cols - 2), r = randInt(1, w.map.rows - 2);
            if (w.map.get(c, r) !== 0) continue;
            const p = w.map.center(c, r);
            const dd = dist2(p.x, p.y, pl.x, pl.y);
            if (dd > bestD) { bestD = dd; best = p; }
          }
          this.fleeTarget = best || { x: this.x, y: this.y };
        }
        this.navTo(w, this.fleeTarget.x, this.fleeTarget.y, false);
        if (this.canSee) { const d = this.aimAtPlayer(w); this.tryFire(w, d); }
        break;
      }
    }
  }

  /* ---- boss: phase attacks ---- */
  thinkBoss(dt, w){
    const pl = w.player;
    const d = dist(this.x, this.y, pl.x, pl.y);
    // phase summons
    if (!this.summon66 && this.hp < this.maxHp * 0.66) { this.summon66 = true; GAME.bossSummon(2); }
    if (!this.summon33 && this.hp < this.maxHp * 0.33) { this.summon33 = true; GAME.bossSummon(3); }
    if (this.attack === "radial") {
      this.telegraphT -= dt;
      this.moveIn.x *= 0.1; this.moveIn.y *= 0.1;
      this.aimAng += dt * 9;
      this.tAngle = this.aimAng;
      if ((this.telegraphT * 14 | 0) % 2 === 0)
        fxRing(this.x, this.y, this.radius + 14, "#ff4d5e", 0.15);
      if (this.telegraphT <= 0) {
        const n = 14;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + rand(-0.04, 0.04);
          const m = { x: this.x + Math.cos(a) * (this.radius + 10), y: this.y + Math.sin(a) * (this.radius + 10) };
          spawnShell(this, m.x, m.y, a, Object.assign({}, this.def.shell, { bounces: 2, spd: 320 }));
        }
        AUDIO.explosion(0.7);
        CAM.addShake(0.4);
        this.attack = null;
        this.attackT = rand(4, 6);
      }
      return;
    }
    if (this.attack === "charge") {
      if (this.telegraphT > 0) {
        this.telegraphT -= dt;
        this.moveIn.x = 0; this.moveIn.y = 0;
        this.chargeDir = Math.atan2(pl.y - this.y, pl.x - this.x);
        this.angle = angMove(this.angle, this.chargeDir, 8 * dt);
        if ((this.telegraphT * 10 | 0) % 2 === 0)
          fxExhaust(this.x - Math.cos(this.angle) * this.radius, this.y - Math.sin(this.angle) * this.radius, this.angle + Math.PI);
        if (this.telegraphT <= 0) { this.chargeT = 1.15; AUDIO.bossAlert(); }
      } else {
        this.chargeT -= dt;
        this.moveIn.x = Math.cos(this.chargeDir);
        this.moveIn.y = Math.sin(this.chargeDir);
        this.vel.x = this.moveIn.x * 430;
        this.vel.y = this.moveIn.y * 430;
        // smash brick in the way
        const probe = w.map.cellOf(this.x + this.moveIn.x * (this.radius + 14), this.y + this.moveIn.y * (this.radius + 14));
        if (w.map.get(probe.c, probe.r) === 2) {
          w.map.destroyBrick(probe.c, probe.r);
          fxBrickBurst(probe.c * CFG.TILE + 24, probe.r * CFG.TILE + 24, WORLD.theme.brick.base);
          AUDIO.brickBreak();
          CAM.addShake(0.2);
        }
        // ram damage
        if (dist2(this.x, this.y, pl.x, pl.y) < (this.radius + pl.radius + 4) ** 2) {
          pl.vel.x += this.moveIn.x * 420;
          pl.vel.y += this.moveIn.y * 420;
          pl.damage(32, this.x, this.y, this);
          this.chargeT = 0;
        }
        if (this.chargeT <= 0) { this.attack = null; this.attackT = rand(4.5, 6.5); }
      }
      return;
    }
    // default engage behavior
    this.perceptT = 0; // boss always tracks
    this.canSee = !w.map.raycast(this.x, this.y, pl.x, pl.y).hit;
    if (this.canSee) {
      this.aimAtPlayer(w);
      this.tryFire(w, d);
      const nx = (pl.x - this.x) / Math.max(1, d), ny = (pl.y - this.y) / Math.max(1, d);
      let mx = d > this.def.prefDist ? nx : -nx;
      let my = d > this.def.prefDist ? ny : -ny;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(1, 2.2); this.strafeDir *= -1; }
      mx += -ny * this.strafeDir * 0.6;
      my += nx * this.strafeDir * 0.6;
      const mm = Math.hypot(mx, my) || 1;
      this.moveIn.x = mx / mm; this.moveIn.y = my / mm;
    } else {
      this.navTo(w, pl.x, pl.y, true);
      if (this.navGoal && this.bombCd <= 0) this.bombCd = 3;
    }
    // schedule attacks
    this.attackT -= dt;
    if (this.attackT <= 0) {
      if (this.canSee && d < 420 && chance(0.55)) {
        this.attack = "charge"; this.telegraphT = 0.8; AUDIO.bossAlert();
      } else {
        this.attack = "radial"; this.telegraphT = 0.9;
      }
    }
  }

  onDeath(src){
    GAME.onEnemyDead(this, src);
  }
  draw(c, time){
    super.draw(c, time);
    if (!this.alive) return;
    // sniper laser telegraph
    if (this.lockT >= 0 && this.lockPt) {
      const m = this.muzzle();
      const a = 0.25 + 0.55 * (1 - this.lockT / this.def.lockTime);
      c.save();
      c.globalAlpha = a;
      c.strokeStyle = "#ff4d5e";
      c.lineWidth = this.lockT < 0.18 ? 2.4 : 1.2;
      c.setLineDash(this.lockT < 0.18 ? [] : [6, 6]);
      c.beginPath();
      c.moveTo(m.x, m.y);
      c.lineTo(this.lockPt.x, this.lockPt.y);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    // health bar
    if (this.hp < this.maxHp && this.spawnT <= 0) {
      const w = this.type === "boss" ? 56 : 30;
      const y = this.y - this.radius - 12;
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillRect(this.x - w / 2, y, w, 4.5);
      const pct = clamp(this.hp / this.maxHp, 0, 1);
      c.fillStyle = pct > 0.5 ? "#7be27a" : (pct > 0.25 ? "#ffd05c" : "#ff4d5e");
      c.fillRect(this.x - w / 2 + 0.75, y + 0.75, (w - 1.5) * pct, 3);
    }
  }
}
