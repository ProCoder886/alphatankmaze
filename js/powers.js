"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/powers.js
   SECTION 8b — SUPERPOWERS
   ----------------------------------------------------------------
   Seven activated superpowers bound to keys 1-7, to gamepad buttons
   and to tap targets on touch devices. Each power has a limited
   charge count earned through play (kills, pickups, sector clears and
   optional rewarded ads) plus its own cooldown, so no power can be
   spammed and none is ever required to finish a sector.

   The HUD rack drawn at the end of this file is the single source of
   truth for both the on-screen widget and the touch hit boxes.
   ================================================================ */
const POWERS = {
  DEFS: [
    { id: "booster", key: "Digit1", pad: 0, label: "BOOST",   name: "Booster Bomb",
      color: "#ff9a3c", cd: 8,  start: 2, cap: 6,
      desc: "Ring of demolition charges around your tank." },
    { id: "freeze",  key: "Digit2", pad: 1, label: "FREEZE",  name: "Freeze Strike",
      color: "#7ef0ff", cd: 13, start: 1, cap: 5,
      desc: "Flash-freezes every hostile in range." },
    { id: "explo",   key: "Digit3", pad: 2, label: "EXPLO",   name: "Explosive Shots",
      color: "#ffd05c", cd: 15, start: 1, cap: 4,
      desc: "Your shells detonate on impact for 12s." },
    { id: "missile", key: "Digit4", pad: 3, label: "MISSILE", name: "Homing Missile",
      color: "#ff7a45", cd: 6,  start: 2, cap: 8,
      desc: "Fire-and-forget missile that hunts the nearest hostile." },
    { id: "timebomb",key: "Digit5", pad: 4, label: "T-BOMB",  name: "Time Bomb",
      color: "#c98aff", cd: 17, start: 1, cap: 4,
      desc: "Delayed charge with a huge blast radius." },
    { id: "atomic",  key: "Digit6", pad: 5, label: "ATOMIC",  name: "Atomic Strike",
      color: "#ff4d5e", cd: 38, start: 0, cap: 2,
      desc: "Calls a devastating strike on your aim point." },
    { id: "drone",   key: "Digit7", pad: 6, label: "DRONE",   name: "Guardian Drone",
      color: "#7be27a", cd: 20, start: 1, cap: 4,
      desc: "Escort drone fights alongside you for 16s." },
  ],

  charges: {},     // id -> remaining charges this run
  cds: {},         // id -> cooldown remaining (s)
  rack: [],        // HUD hit boxes: {id, x, y, r}
  lastUsed: null,  // id of the most recently fired power (HUD pulse)
  lastUsedT: 0,

  byId(id){ return this.DEFS.find(p => p.id === id); },

  /* ---- run lifecycle ---- */
  reset(bonus){
    this.charges = {}; this.cds = {};
    for (const p of this.DEFS) {
      this.charges[p.id] = clamp(p.start + (bonus || 0), 0, p.cap);
      this.cds[p.id] = 0;
    }
    this.lastUsed = null; this.lastUsedT = 0;
  },
  grant(id, n){
    const p = this.byId(id);
    if (!p) return 0;
    const before = this.charges[p.id] | 0;
    this.charges[p.id] = clamp(before + n, 0, p.cap);
    return this.charges[p.id] - before;
  },
  /* Grants to a power that still has room, preferring rarer ones. */
  grantRandom(n){
    const room = this.DEFS.filter(p => (this.charges[p.id] | 0) < p.cap);
    if (!room.length) return null;
    room.sort((a, b) => (this.charges[a.id] | 0) / a.cap - (this.charges[b.id] | 0) / b.cap);
    const pick2 = room[Math.min(room.length - 1, (Math.random() * Math.min(3, room.length)) | 0)];
    this.grant(pick2.id, n || 1);
    return pick2;
  },
  grantAll(n){ for (const p of this.DEFS) this.grant(p.id, n); },
  total(){ let t = 0; for (const p of this.DEFS) t += this.charges[p.id] | 0; return t; },

  ready(id){
    const p = this.byId(id);
    if (!p) return false;
    return (this.charges[id] | 0) > 0 && (this.cds[id] || 0) <= 0;
  },

  update(dt){
    for (const p of this.DEFS) if (this.cds[p.id] > 0) this.cds[p.id] -= dt;
    if (this.lastUsedT > 0) this.lastUsedT -= dt;
  },

  /* ---- activation ---- */
  activate(id, pl, w){
    if (!pl || !pl.alive || !this.ready(id)) {
      if (pl && pl.alive && (this.charges[id] | 0) <= 0) AUDIO.beep(200);
      return false;
    }
    const p = this.byId(id);
    this.charges[id]--;
    this.cds[id] = p.cd;
    this.lastUsed = id; this.lastUsedT = 0.6;
    GAME.stats.powers = (GAME.stats.powers || 0) + 1;
    GAME.hintDone("power");
    this["fx_" + id](pl, w);
    return true;
  },

  /* ================================================================
     AIM TARGETING
     Every offensive power resolves to the point under the crosshair
     rather than to the tank's own position, so a power is aimed the same
     way the cannon is. Three things matter for that to feel right:

       - Touch and gamepad have no cursor, so the turret direction stands
         in for one at a comfortable stand-off range.
       - The point is clamped to the power's reach, so nothing can be
         dropped clear across the arena.
       - A raycast stops the point at the first wall in the way, so a
         strike aimed through a wall lands against it instead of behind
         it where the player cannot see the result.
     ================================================================ */
  aimPoint(pl, maxRange, minRange){
    const reach = maxRange || 520;
    let tx, ty;
    const ov = INPUT.aimOverride();
    if (ov.has || INPUT.usingTouch || INPUT.usingPad) {
      // no cursor: aim down the barrel at a readable stand-off
      const a = ov.has ? ov.ang : pl.tAngle;
      tx = pl.x + Math.cos(a) * reach * 0.62;
      ty = pl.y + Math.sin(a) * reach * 0.62;
    } else {
      const wp = CAM.screenToWorld(INPUT.mouse.x, INPUT.mouse.y);
      tx = wp.x; ty = wp.y;
    }
    let dx = tx - pl.x, dy = ty - pl.y;
    let d = Math.hypot(dx, dy);
    const a = d > 1 ? Math.atan2(dy, dx) : pl.tAngle;
    // clamp into the power's usable band
    if (minRange && d < minRange) d = minRange;
    if (d > reach) d = reach;
    tx = pl.x + Math.cos(a) * d;
    ty = pl.y + Math.sin(a) * d;
    /* Stop at the first wall so the strike lands where the player can see
       it — but never inside the minimum stand-off. Facing a wall at point
       blank must not walk an Atomic Strike back onto the player's own
       tank; the blast simply overlaps the wall, which it would level
       anyway. */
    const rc = WORLD.map.raycast(pl.x, pl.y, tx, ty);
    if (rc.hit) {
      const back = Math.max(minRange || 0, rc.d - 10);
      tx = pl.x + Math.cos(a) * back;
      ty = pl.y + Math.sin(a) * back;
    }
    return { x: tx, y: ty, ang: a, dist: Math.hypot(tx - pl.x, ty - pl.y) };
  },
  /* The hostile nearest the aim point, for powers that lock a target. */
  targetNear(x, y, radius){
    let best = null, bestD = radius * radius;
    for (const e of WORLD.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  /* Booster Bomb — a cluster salvo lobbed onto the aim point, the
     charges ringing the impact so the blasts cascade outward. */
  fx_booster(pl){
    const t = this.aimPoint(pl, 460, 70);
    const n = 5, R = 52;
    // centre charge first, then the ring around it
    plantBomb(t.x, t.y, pl, { fuse: 0.75, radius: 112, dmg: 60 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t.ang;
      const x = t.x + Math.cos(a) * R, y = t.y + Math.sin(a) * R;
      if (WORLD.map.solidAtXY(x, y)) continue;
      setTimeoutSafe(() => plantBomb(x, y, pl, { fuse: 0.85 + i * 0.06, radius: 104, dmg: 54 }), i * 40);
    }
    fxRing(t.x, t.y, R + 20, "#ff9a3c", 0.45);
    fxTracer(pl.x, pl.y, t.x, t.y, "#ff9a3c");
    AUDIO.bombPlant();
    GAME.showBanner("BOOSTER BOMB", "Cluster away", 1.1);
  },

  /* Freeze Strike — a cryo burst centred on the aim point, so it can be
     dropped onto a group across the arena instead of only on whatever
     happens to be crowding the player. */
  fx_freeze(pl){
    const t = this.aimPoint(pl, 520);
    const R = 300;
    fxRing(t.x, t.y, R, "#7ef0ff", 0.6);
    fxRing(t.x, t.y, R * 0.6, "#bffcff", 0.45);
    fxTracer(pl.x, pl.y, t.x, t.y, "#7ef0ff");
    FX.doFlash(0.14, "150,240,255");
    LIGHTS.flash(t.x, t.y, R, 0.4, 0.9);
    AUDIO.freeze();
    CAM.addShake(0.18);
    let hit = 0;
    for (const e of WORLD.enemies) {
      if (!e.alive || dist2(e.x, e.y, t.x, t.y) > R * R) continue;
      const dur = e.boss ? 2.6 : 5;
      e.stun = Math.max(e.stun, dur);
      e.frozenT = Math.max(e.frozenT || 0, dur);
      e.vel.x *= 0.1; e.vel.y *= 0.1;
      fxSparkBurst(e.x, e.y, 8, "#bffcff");
      hit++;
    }
    // static defences seize up too
    for (const em of WORLD.emplacements) {
      if (!em.alive || dist2(em.x, em.y, t.x, t.y) > R * R) continue;
      em.reloadT = Math.max(em.reloadT, 5);
      fxSparkBurst(em.x, em.y, 6, "#bffcff");
    }
    GAME.showBanner("FREEZE STRIKE", hit ? hit + " hostiles frozen" : "", 1.2);
  },

  /* Explosive Shots — timed weapon buff, shells detonate on impact. */
  fx_explo(pl){
    pl.exploShotT = 12;
    fxRing(pl.x, pl.y, 60, "#ffd05c", 0.4);
    /* Fires an immediate three-round explosive burst at the aim point on
       top of arming the buff, so the power lands on something the moment
       it is pressed rather than only changing what later shots do. */
    const t = this.aimPoint(pl, 560, 80);
    const m = pl.muzzle();
    for (let i = 0; i < 3; i++) {
      setTimeoutSafe(() => {
        if (!pl.alive) return;
        spawnShell(pl, m.x, m.y, t.ang + rand(-0.05, 0.05), {
          spd: 560, dmg: 26, r: 5, bounces: 0, color: "#ffd05c",
          brickDmg: 2, explosive: true,
        });
        AUDIO.shoot();
      }, i * 90);
    }
    AUDIO.powerUp();
    GAME.showBanner("EXPLOSIVE SHOTS", "Salvo away · 12 seconds", 1.2);
  },

  /* Homing Missile — launched down the aim line and locked to whatever
     is nearest that point, so the player chooses the victim instead of
     the missile picking whatever happens to be closest to the tank. */
  fx_missile(pl){
    const t = this.aimPoint(pl, 620, 60);
    const m = pl.muzzle();
    WORLD.missiles.push({
      x: m.x, y: m.y, owner: pl, team: pl.team,
      vx: Math.cos(t.ang) * 240, vy: Math.sin(t.ang) * 240,
      ang: t.ang, life: 5.2,
      // pre-locked on the aim point, and it holds that lock while it lives
      target: this.targetNear(t.x, t.y, 220), locked: true,
      aimX: t.x, aimY: t.y,
      retargetT: 0.6, trailT: 0,
      speed: 430, turn: 3.4, radius: 6, dmg: 62, blast: 108,
    });
    fxMuzzle(m.x, m.y, t.ang, 1.3);
    AUDIO.missile();
    CAM.addShake(0.12);
  },

  /* Time Bomb — lobbed onto the aim point rather than dropped underfoot,
     so it becomes an area-denial tool aimed at a chokepoint or a
     structure instead of something you have to run away from. */
  fx_timebomb(pl){
    const t = this.aimPoint(pl, 480, 60);
    plantBomb(t.x, t.y, pl, { fuse: 3.4, radius: 196, dmg: 132, big: true });
    fxRing(t.x, t.y, 46, "#c98aff", 0.5);
    fxTracer(pl.x, pl.y, t.x, t.y, "#c98aff");
    GAME.showBanner("TIME BOMB ARMED", "Clear the area", 1.4);
  },

  /* Atomic Strike — telegraphed, lands on the aim point (never on the
     player), so it reads as a called-in strike rather than a suicide. */
  fx_atomic(pl){
    const t = this.aimPoint(pl, 700, 170);
    WORLD.strikes.push({ x: t.x, y: t.y, t: 1.35, max: 1.35, radius: 300 });
    AUDIO.bossAlert();
    GAME.showBanner("ATOMIC STRIKE INBOUND", "Stand clear", 1.6);
  },

  /* Guardian Drone — deployed onto the aim point and holding that ground,
     hunting whatever is near it. It falls back to escorting the player
     once the area is clear, so it is a tool for taking a position rather
     than a passive bodyguard. */
  fx_drone(pl){
    const t = this.aimPoint(pl, 520, 60);
    WORLD.drones.push({
      owner: pl, team: pl.team, ang: rand(0, TAU), orbit: 54,
      x: pl.x, y: pl.y, life: 16, fireT: 0, tAngle: 0,
      postX: t.x, postY: t.y, postT: 9,
    });
    fxRing(t.x, t.y, 70, "#7be27a", 0.45);
    fxTracer(pl.x, pl.y, t.x, t.y, "#7be27a");
    AUDIO.powerUp();
    GAME.showBanner("GUARDIAN DRONE", "Holding your mark · 16 seconds", 1.2);
  },

  /* ---- input polling (keyboard / gamepad / touch) ---- */
  pollInput(pl, w){
    if (!pl || !pl.alive || GAME.state !== "playing") return;
    for (const p of this.DEFS) {
      if (INPUT.wasPressed(p.key) || INPUT.powerTapped(p.id)) this.activate(p.id, pl, w);
    }
  },
};

/* ================================================================
   POWER-DRIVEN WORLD OBJECTS
   ================================================================ */

/* ---- homing missiles ---- */
function updateMissiles(dt){
  const map = WORLD.map;
  for (let i = WORLD.missiles.length - 1; i >= 0; i--) {
    const m = WORLD.missiles[i];
    m.life -= dt;
    const detonate = () => {
      explode(m.x, m.y, { radius: m.blast, dmg: m.dmg, owner: m.owner });
      WORLD.missiles.splice(i, 1);
    };
    if (m.life <= 0) { detonate(); continue; }

    /* The lock the player set at launch is kept while the target lives.
       Only once it dies (or there was nothing at the aim point) does the
       missile fall back to hunting the nearest hostile — so a missile
       aimed at a specific tank goes to that tank. */
    m.retargetT -= dt;
    if (m.retargetT <= 0 && (!m.target || !m.target.alive)) {
      m.retargetT = 0.25;
      let best = null, bestD = Infinity;
      for (const e of WORLD.enemies) {
        if (!e.alive || e.spawnT > 0) continue;
        const d = dist2(m.x, m.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      m.target = best;
    }
    // with no target at all, fly to the mark the player set
    let wx = null, wy = null;
    if (m.target && m.target.alive) { wx = m.target.x; wy = m.target.y; }
    else if (m.aimX !== undefined && dist2(m.x, m.y, m.aimX, m.aimY) > 24 * 24) { wx = m.aimX; wy = m.aimY; }
    if (wx !== null) m.ang = angMove(m.ang, Math.atan2(wy - m.y, wx - m.x), m.turn * dt);
    const sp = Math.min(m.speed, Math.hypot(m.vx, m.vy) + 620 * dt);
    m.vx = Math.cos(m.ang) * sp; m.vy = Math.sin(m.ang) * sp;

    const steps = Math.max(1, Math.ceil(sp * dt / (CFG.TILE * 0.4)));
    for (let k = 0; k < steps; k++) {
      m.x += m.vx * dt / steps;
      m.y += m.vy * dt / steps;
      if (map.solidAtXY(m.x, m.y)) { detonate(); break; }
      let hitTank = false;
      for (const t of allTanks()) {
        if (!t.alive || t.team === m.team || t.invuln > 0) continue;
        if (dist2(m.x, m.y, t.x, t.y) < (t.radius + m.radius) ** 2) { detonate(); hitTank = true; break; }
      }
      if (hitTank) break;
    }
    if (!WORLD.missiles[i] || WORLD.missiles[i] !== m) continue;
    m.trailT -= dt;
    if (m.trailT <= 0) {
      m.trailT = 0.02;
      PARTS.spawn({ x: m.x, y: m.y, type: "fire", size: 7, size2: 1, life: 0.3, color: "#ffb060", drag: 0.9, layer: 1 });
      PARTS.spawn({ x: m.x, y: m.y, type: "smoke", size: 4, size2: 13, life: 0.7, color: "#6c6c70", layer: 0 });
    }
  }
}
function drawMissiles(c){
  for (const m of WORLD.missiles) {
    c.save();
    c.translate(m.x, m.y); c.rotate(m.ang);
    c.fillStyle = "#d8dde3";
    c.beginPath();
    c.moveTo(10, 0); c.lineTo(-6, -4.5); c.lineTo(-6, 4.5);
    c.closePath(); c.fill();
    c.fillStyle = "#ff7a45";
    c.fillRect(-8, -3, 4, 6);
    c.restore();
    LIGHTS.add(m.x, m.y, 70, 0.5);
  }
}

/* ---- guardian drones ---- */
function updateDrones(dt){
  for (let i = WORLD.drones.length - 1; i >= 0; i--) {
    const d = WORLD.drones[i];
    d.life -= dt;
    const pl = d.owner;
    if (d.life <= 0 || !pl || !pl.alive) {
      fxSparkBurst(d.x, d.y, 10, "#7be27a");
      WORLD.drones.splice(i, 1);
      continue;
    }
    /* The drone holds the mark the player deployed it on, orbiting that
       spot and covering it. Once the post expires — or the ground it was
       sent to is clear — it falls back to escorting the player. */
    d.ang += dt * 2.1;
    if (d.postT > 0) {
      d.postT -= dt;
      const stillWork = WORLD.enemies.some(e =>
        e.alive && dist2(e.x, e.y, d.postX, d.postY) < 340 * 340);
      if (!stillWork) d.postT = Math.min(d.postT, 1.2);
    }
    const anchorX = d.postT > 0 ? d.postX : pl.x;
    const anchorY = d.postT > 0 ? d.postY : pl.y;
    // ease toward the anchor so a long redeploy reads as flight, not a jump
    const tx = anchorX + Math.cos(d.ang) * d.orbit;
    const ty = anchorY + Math.sin(d.ang) * d.orbit;
    d.x = expLerp(d.x, tx, 4.5, dt);
    d.y = expLerp(d.y, ty, 4.5, dt);
    // engage the closest hostile in line of sight
    let best = null, bestD = 520 * 520;
    for (const e of WORLD.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const dd = dist2(d.x, d.y, e.x, e.y);
      if (dd < bestD && !WORLD.map.raycast(d.x, d.y, e.x, e.y).hit) { bestD = dd; best = e; }
    }
    d.fireT -= dt;
    if (best) {
      d.tAngle = Math.atan2(best.y - d.y, best.x - d.x);
      if (d.fireT <= 0) {
        d.fireT = 0.42;
        spawnShell(pl, d.x + Math.cos(d.tAngle) * 12, d.y + Math.sin(d.tAngle) * 12, d.tAngle,
          { spd: 520, dmg: 11, r: 3.2, bounces: 0, color: "#9dffa6", brickDmg: 1 });
        fxMuzzle(d.x, d.y, d.tAngle, 0.5);
        AUDIO.enemyShoot();
      }
    } else {
      d.tAngle = d.ang + Math.PI / 2;
    }
    if (chance(dt * 8))
      PARTS.spawn({ x: d.x, y: d.y, vx: rand(-14, 14), vy: rand(-14, 14), type: "trail",
        size: 3, size2: 0.5, life: 0.25, color: "#7be27a", layer: 1 });
  }
}
function drawDrones(c, time){
  for (const d of WORLD.drones) {
    const fade = d.life < 2 ? (0.4 + 0.6 * Math.abs(Math.sin(time * 9))) : 1;
    c.save();
    c.globalAlpha = fade;
    c.translate(d.x, d.y);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(2, 3, 9, 7, 0, 0, TAU); c.fill();
    c.rotate(d.tAngle);
    c.fillStyle = "#2f6b45";
    c.fillRect(2, -2, 12, 4);
    c.fillStyle = "#7be27a";
    c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill();
    c.fillStyle = "#eafff0";
    c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
    c.restore();
    c.globalAlpha = 1;
    LIGHTS.add(d.x, d.y, 66, 0.5);
  }
}

/* ---- atomic strikes (telegraph then detonation) ---- */
function updateStrikes(dt){
  for (let i = WORLD.strikes.length - 1; i >= 0; i--) {
    const s = WORLD.strikes[i];
    s.t -= dt;
    if (chance(dt * 10)) AUDIO.beep(s.t < 0.5 ? 1500 : 900);
    if (s.t <= 0) {
      WORLD.strikes.splice(i, 1);
      // layered blast: a hard core plus a wide shockwave
      explode(s.x, s.y, { radius: s.radius, dmg: 210, owner: WORLD.player });
      for (let k = 0; k < 6; k++) {
        const a = rand(0, TAU), r = rand(60, s.radius * 0.85);
        setTimeoutSafe(() => explode(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r,
          { radius: 120, dmg: 60, owner: WORLD.player }), 60 + k * 70);
      }
      FX.doFlash(0.5, "255,240,200");
      CAM.addShake(1);
      fxRing(s.x, s.y, s.radius * 1.5, "#fff0c0", 0.8);
      AUDIO.explosion(1.4);
    }
  }
}
function drawStrikes(c, time){
  for (const s of WORLD.strikes) {
    const k = 1 - s.t / s.max;
    c.save();
    c.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(time * 12));
    c.strokeStyle = "#ff4d5e";
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(s.x, s.y, s.radius * (1 - k * 0.55), 0, TAU); c.stroke();
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(s.x, s.y, s.radius * 0.35, 0, TAU); c.stroke();
    // cross-hairs on the impact point
    c.beginPath();
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2;
      c.moveTo(s.x + Math.cos(a) * 14, s.y + Math.sin(a) * 14);
      c.lineTo(s.x + Math.cos(a) * 34, s.y + Math.sin(a) * 34);
    }
    c.stroke();
    c.restore();
    LIGHTS.add(s.x, s.y, 150, 0.6);
  }
}

/* ================================================================
   HUD RACK — top-right power widget
   Colored ring per power with its key, live charge count and label.
   Doubles as the touch hit-test table (POWERS.rack).
   ================================================================ */
function drawPowerRack(c, time, x1, yTop){
  const P = POWERS;
  P.rack.length = 0;
  if (!WORLD.player) return yTop;

  const touch = INPUT.usingTouch;
  /* One row whenever it fits. Landscape screens are wide and short, so a
     single row costs width the game has to spare and saves the height it
     does not — and it is the same rack a desktop player sees. */
  const cellW = Math.round((touch ? 20 : 13) * 2 * UIS + 12 * UIS);
  const cols = (cellW * P.DEFS.length + 10 * UIS) <= W * 0.58 ? P.DEFS.length : 4;
  /* Touch gets a physically larger disc rather than an invisible pad around
     a small one: the tap target has to be at least as big as the graphic,
     and adjacent targets must never overlap or a thumb between two powers
     fires whichever happens to be first in the list. */
  const r = Math.round((touch ? 20 : 13) * UIS);
  const hitR = r + (touch ? 3 : 6) * UIS;
  const gapX = Math.max(Math.round(r * 2 + 12 * UIS), Math.ceil(hitR * 2) + 2);
  const gapY = Math.max(Math.round(r * 2 + 20 * UIS), Math.ceil(hitR * 2) + 2);
  const rows = Math.ceil(P.DEFS.length / cols);
  const boxW = gapX * Math.min(cols, P.DEFS.length) + 10 * UIS;
  const boxH = gapY * rows + 14 * UIS;
  const bx = x1 - boxW, by = yTop;

  // panel
  c.fillStyle = "rgba(8,12,18,0.5)";
  c.strokeStyle = "rgba(120,160,180,0.28)";
  c.lineWidth = 1;
  c.beginPath();
  if (c.roundRect) c.roundRect(bx, by, boxW, boxH, 5); else c.rect(bx, by, boxW, boxH);
  c.fill(); c.stroke();

  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let i = 0; i < P.DEFS.length; i++) {
    const p = P.DEFS[i];
    const col = i % cols, row = (i / cols) | 0;
    // A short last row is centred so the rack stays symmetric.
    const inRow = Math.min(cols, P.DEFS.length - row * cols);
    const rowOff = (cols - inRow) * gapX / 2;
    const cx = bx + 5 * UIS + rowOff + gapX * col + gapX / 2;
    const cy = by + 7 * UIS + gapY * row + r + 1;
    const n = P.charges[p.id] | 0;
    const cd = P.cds[p.id] || 0;
    const usable = n > 0 && cd <= 0;
    P.rack.push({ id: p.id, x: cx, y: cy, r: hitR });

    // dim disc
    c.globalAlpha = usable ? 1 : 0.45;
    c.fillStyle = "rgba(10,16,22,0.9)";
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    // cooldown sweep
    if (cd > 0) {
      c.fillStyle = "rgba(120,150,170,0.22)";
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd / p.cd));
      c.closePath(); c.fill();
    }
    // colored ring
    c.strokeStyle = p.color;
    c.lineWidth = usable ? 2.2 : 1.4;
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
    // just-used pulse
    if (P.lastUsed === p.id && P.lastUsedT > 0) {
      c.globalAlpha = P.lastUsedT / 0.6;
      c.strokeStyle = "#ffffff";
      c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, r + 4 + (1 - P.lastUsedT / 0.6) * 8, 0, TAU); c.stroke();
      c.globalAlpha = usable ? 1 : 0.45;
    }
    // key number
    c.fillStyle = usable ? p.color : "rgba(200,215,225,0.75)";
    c.font = "700 " + FS(12) + "px Consolas, monospace";
    c.fillText(String(i + 1), cx, cy + 0.5);
    // charge badge
    c.fillStyle = n > 0 ? "#0b1016" : "rgba(11,16,22,0.8)";
    c.beginPath(); c.arc(cx + r * 0.85, cy - r * 0.85, r * 0.55, 0, TAU); c.fill();
    c.strokeStyle = n > 0 ? p.color : "rgba(120,140,150,0.5)";
    c.lineWidth = 1;
    c.beginPath(); c.arc(cx + r * 0.85, cy - r * 0.85, r * 0.55, 0, TAU); c.stroke();
    c.fillStyle = n > 0 ? "#eaf6fa" : "rgba(160,175,185,0.7)";
    c.font = "700 " + FS(9) + "px Consolas, monospace";
    c.fillText(String(n), cx + r * 0.85, cy - r * 0.85 + 0.5);
    // label
    c.fillStyle = usable ? "rgba(223,233,238,0.85)" : "rgba(160,175,185,0.55)";
    c.font = "700 " + FS(8) + "px Bahnschrift, 'Segoe UI', sans-serif";
    c.fillText(p.label, cx, cy + r + 7 * UIS);
    c.globalAlpha = 1;
  }
  c.textBaseline = "alphabetic";
  return by + boxH;
}
