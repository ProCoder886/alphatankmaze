"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/combat.js
   SECTION 8 — Combat objects: shells (ricochet physics), bombs, mines, chain-reacting barrels, pickups, safe timers, master explosion resolver.
   ================================================================ */
/* ================================================================
   SECTION 8 — COMBAT OBJECTS
   Shells (ricochet physics), bombs, mines, barrels, pickups,
   and the master explosion resolver.
   ================================================================ */
function allTanks(){
  const out = [];
  if (WORLD.player && WORLD.player.alive) out.push(WORLD.player);
  for (const e of WORLD.enemies) if (e.alive && e.spawnT <= 0) out.push(e);
  return out;
}

function explode(x, y, opts){
  opts = opts || {};
  const radius = opts.radius || 80;
  const dmg = opts.dmg || 40;
  const owner = opts.owner || null;
  // visuals + audio
  fxExplosionVisual(x, y, radius);
  AUDIO.explosion(clamp(radius / 130, 0.3, 1.3));
  CAM.addShake(clamp(radius / 260, 0.15, 0.7));
  DECALS.scorch(x, y, radius * 0.55);
  FX.doFlash(clamp(radius / 700, 0.04, 0.16), "255,220,170");
  NOISES.add(x, y, 620);
  // destructible tiles
  if (opts.breakTiles !== false) {
    const T = CFG.TILE, map = WORLD.map;
    const c0 = Math.floor((x - radius) / T), c1 = Math.floor((x + radius) / T);
    const r0 = Math.floor((y - radius) / T), r1 = Math.floor((y + radius) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (map.get(c, r) !== 2) continue;
      const cx = c * T + T / 2, cy = r * T + T / 2;
      if (dist2(x, y, cx, cy) < (radius * 0.95) ** 2) {
        map.destroyBrick(c, r);
        fxBrickBurst(cx, cy, WORLD.theme.brick.base);
        if (owner === WORLD.player) GAME.stats.bricks++;
      }
    }
  }
  // tanks: falloff damage + radial impulse
  for (const t of allTanks()) {
    const d = dist(x, y, t.x, t.y);
    if (d > radius + t.radius) continue;
    const fall = clamp(1 - d / (radius + t.radius), 0.12, 1);
    let amount = dmg * fall;
    if (t === owner) amount *= 0.55; // reduced self-damage
    const nx = d > 1 ? (t.x - x) / d : 1, ny = d > 1 ? (t.y - y) / d : 0;
    const imp = (300 * fall) / (t.mass || 1);
    t.vel.x += nx * imp;
    t.vel.y += ny * imp;
    t.damage(amount, x, y, owner);
  }
  // chain: barrels
  for (const b of WORLD.barrels) {
    if (b.exploding) continue;
    if (dist2(x, y, b.x, b.y) < (radius + b.r) ** 2) damageBarrel(b, 999, owner);
  }
  // chain: mines
  for (const m of WORLD.mines) {
    if (m.fuse >= 0) continue;
    if (dist2(x, y, m.x, m.y) < (radius + 14) ** 2) m.fuse = rand(0.05, 0.16);
  }
}

/* ---- shells ---- */
function spawnShell(owner, x, y, ang, spec){
  WORLD.shells.push({
    owner, team: owner.team,
    x, y, px: x, py: y,
    vx: Math.cos(ang) * spec.spd,
    vy: Math.sin(ang) * spec.spd,
    r: spec.r || 4,
    dmg: spec.dmg,
    bounces: spec.bounces !== undefined ? spec.bounces : 1,
    brickDmg: spec.brickDmg || 1,
    color: spec.color || "#ffd27a",
    life: 3.2,
    trailT: 0,
  });
}
function killShell(s, i, sparkColor){
  fxSparkBurst(s.x, s.y, 6, sparkColor || s.color);
  WORLD.shells.splice(i, 1);
}
function updateShells(dt){
  const map = WORLD.map, T = CFG.TILE;
  const tanks = allTanks();
  for (let i = WORLD.shells.length - 1; i >= 0; i--) {
    const s = WORLD.shells[i];
    s.life -= dt;
    if (s.life <= 0) { WORLD.shells.splice(i, 1); continue; }
    const spd = Math.hypot(s.vx, s.vy);
    const steps = Math.max(1, Math.ceil(spd * dt / (T * 0.4)));
    const sdt = dt / steps;
    let dead = false;
    for (let k = 0; k < steps && !dead; k++) {
      s.px = s.x; s.py = s.y;
      s.x += s.vx * sdt;
      s.y += s.vy * sdt;
      const c = Math.floor(s.x / T), r = Math.floor(s.y / T);
      const v = map.get(c, r);
      if (v > 0) {
        if (v === 2) {
          const res = map.damageTile(c, r, s.brickDmg);
          if (res === 2) {
            fxBrickBurst(c * T + T / 2, r * T + T / 2, WORLD.theme.brick.base);
            AUDIO.brickBreak();
            if (s.owner === WORLD.player) GAME.stats.bricks++;
          } else {
            AUDIO.ricochet();
            fxSparkBurst(s.x, s.y, 4, "#d8b08a");
          }
          NOISES.add(s.x, s.y, 320);
          killShell(s, i); dead = true; break;
        }
        // steel: ricochet with axis-resolved normal
        if (s.bounces > 0) {
          const pc = Math.floor(s.px / T), pr = Math.floor(s.py / T);
          const hitX = c !== pc && map.solidAt(c, pr);
          const hitY = r !== pr && map.solidAt(pc, r);
          if (hitX || (!hitY && c !== pc)) s.vx = -s.vx;
          if (hitY || (!hitX && r !== pr)) s.vy = -s.vy;
          if (c === pc && r === pr) { s.vx = -s.vx; s.vy = -s.vy; }
          s.x = s.px; s.y = s.py;
          s.bounces--;
          AUDIO.ricochet();
          fxSparkBurst(s.x, s.y, 5, "#cfe3ff");
          NOISES.add(s.x, s.y, 260);
        } else {
          killShell(s, i); dead = true; break;
        }
      }
      // tank hits
      for (const t of tanks) {
        if (!t.alive || t.team === s.team) continue;
        if (t.invuln > 0) continue;
        const rr = t.radius + s.r;
        if (dist2(s.x, s.y, t.x, t.y) < rr * rr) {
          const nd = Math.max(1, dist(s.x, s.y, t.x, t.y));
          t.vel.x += (s.vx / spd) * 60 / (t.mass || 1);
          t.vel.y += (s.vy / spd) * 60 / (t.mass || 1);
          t.damage(s.dmg, s.x, s.y, s.owner);
          if (s.owner === WORLD.player) GAME.stats.hits++;
          fxSparkBurst(s.x, s.y, 8, s.color);
          killShell(s, i); dead = true;
          break;
        }
      }
      if (dead) break;
      // shells trip mines
      for (const m of WORLD.mines) {
        if (m.fuse >= 0 || m.arm > 0) continue;
        if (dist2(s.x, s.y, m.x, m.y) < 12 * 12) { m.fuse = 0.02; killShell(s, i); dead = true; break; }
      }
      // shells pop barrels
      if (!dead) for (const b of WORLD.barrels) {
        if (b.exploding) continue;
        if (dist2(s.x, s.y, b.x, b.y) < (b.r + s.r) ** 2) {
          damageBarrel(b, s.dmg, s.owner);
          killShell(s, i); dead = true;
          break;
        }
      }
    }
    if (dead) continue;
    // tracer trail
    s.trailT -= dt;
    if (s.trailT <= 0) {
      s.trailT = 0.016;
      PARTS.spawn({ x: s.x, y: s.y, type: "trail", size: s.r * 1.6, size2: 0.5, life: 0.14, color: s.color, layer: 1 });
    }
  }
}
function drawShells(c){
  let lit = 0;
  for (const s of WORLD.shells) {
    c.save();
    c.translate(s.x, s.y);
    c.rotate(Math.atan2(s.vy, s.vx));
    c.fillStyle = s.color;
    c.beginPath();
    c.ellipse(0, 0, s.r * 1.7, s.r, 0, 0, TAU);
    c.fill();
    c.fillStyle = "#fff";
    c.globalAlpha = 0.8;
    c.beginPath(); c.ellipse(s.r * 0.5, 0, s.r * 0.7, s.r * 0.45, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
    c.restore();
    if (lit < QT.shellLights) { LIGHTS.add(s.x, s.y, 46, 0.4); lit++; }
  }
}

/* ---- bombs (planted demolition charges) ---- */
function plantBomb(x, y, owner, opts){
  opts = opts || {};
  WORLD.bombs.push({
    x, y, owner, team: owner.team,
    fuse: opts.fuse || CFG.BOMB_FUSE,
    radius: opts.radius || CFG.BOMB_RADIUS,
    dmg: opts.dmg || CFG.BOMB_DMG,
    beepT: 0,
    color: owner.team === "player" ? "#46e0d8" : "#ff7a45",
  });
  AUDIO.bombPlant();
}
function updateBombs(dt){
  for (let i = WORLD.bombs.length - 1; i >= 0; i--) {
    const b = WORLD.bombs[i];
    b.fuse -= dt;
    b.beepT -= dt;
    if (b.beepT <= 0) {
      b.beepT = clamp(b.fuse * 0.4, 0.06, 0.35);
      AUDIO.beep(b.fuse < 0.4 ? 1200 : 780);
      fxRing(b.x, b.y, 20, b.color, 0.25);
    }
    if (b.fuse <= 0) {
      WORLD.bombs.splice(i, 1);
      explode(b.x, b.y, { radius: b.radius, dmg: b.dmg, owner: b.owner });
    }
  }
}
function drawBombs(c, time){
  for (const b of WORLD.bombs) {
    const pulse = 0.6 + 0.4 * Math.sin(time * (b.fuse < 0.4 ? 40 : 14));
    c.save();
    c.translate(b.x, b.y);
    c.fillStyle = "#23282e";
    c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill();
    c.strokeStyle = b.color;
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.stroke();
    c.globalAlpha = pulse;
    c.fillStyle = b.color;
    c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
    c.globalAlpha = 1;
    c.restore();
    LIGHTS.add(b.x, b.y, 50 * pulse, 0.5);
  }
}

/* ---- mines ---- */
function layMine(x, y, owner){
  if (WORLD.mines.length >= CFG.MINE_CAP) return;
  WORLD.mines.push({ x, y, team: owner.team, arm: 0.9, fuse: -1, blink: 0 });
  AUDIO.beep(520);
}
function updateMines(dt){
  for (let i = WORLD.mines.length - 1; i >= 0; i--) {
    const m = WORLD.mines[i];
    m.blink += dt;
    if (m.arm > 0) { m.arm -= dt; continue; }
    if (m.fuse >= 0) {
      m.fuse -= dt;
      if (m.fuse <= 0) {
        WORLD.mines.splice(i, 1);
        explode(m.x, m.y, { radius: 82, dmg: 36, owner: null });
      }
      continue;
    }
    for (const t of allTanks()) {
      if (t.team === m.team) continue;
      if (dist2(m.x, m.y, t.x, t.y) < (34 + t.radius) ** 2) { m.fuse = 0.12; AUDIO.beep(1400); break; }
    }
  }
}
function drawMines(c){
  for (const m of WORLD.mines) {
    const on = m.arm > 0 ? (m.blink * 8) % 2 < 1 : (m.blink * 3) % 2 < 1;
    c.save();
    c.translate(m.x, m.y);
    c.fillStyle = "#2c3138";
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill();
    c.strokeStyle = "#494f58";
    c.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      c.beginPath();
      c.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
      c.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
      c.stroke();
    }
    if (on) {
      c.fillStyle = m.fuse >= 0 ? "#ff4d5e" : "#ffb03a";
      c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
    }
    c.restore();
  }
}

/* ---- explosive barrels ---- */
function makeBarrel(cell){
  const p = WORLD.map.center(cell.c, cell.r);
  return { x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), r: 13, hp: 14, maxHp: 14, exploding: false, smokeT: 0, rot: rand(-0.3, 0.3) };
}
function damageBarrel(b, d, owner){
  if (b.exploding) return;
  b.hp -= d;
  fxSparkBurst(b.x, b.y, 4, "#ffb03a");
  if (b.hp <= 0) {
    b.exploding = true;
    // slight delay makes chains read as sequential blasts
    setTimeoutSafe(() => {
      const idx = WORLD.barrels.indexOf(b);
      if (idx >= 0) WORLD.barrels.splice(idx, 1);
      explode(b.x, b.y, { radius: 96, dmg: 46, owner: owner || null });
    }, rand(30, 130));
  }
}
function updateBarrels(dt){
  for (const b of WORLD.barrels) {
    if (b.hp < b.maxHp * 0.5 && !b.exploding) {
      b.smokeT -= dt;
      if (b.smokeT <= 0) {
        b.smokeT = 0.14;
        fxSmokePuffs(b.x, b.y - 4, 1, { speed: 12, big: 16, life: 0.9, color: "#4c4c50" });
      }
    }
  }
}
function drawBarrels(c){
  for (const b of WORLD.barrels) {
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.rot);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(3, 4, b.r, b.r * 0.8, 0, 0, TAU); c.fill();
    c.fillStyle = "#8a3d2e";
    c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill();
    c.strokeStyle = "#5c281e";
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, b.r - 3, 0, TAU); c.stroke();
    c.fillStyle = "#ffb03a";
    c.save();
    for (let k = 0; k < 4; k++) { c.rotate(TAU / 4); c.fillRect(-2, -b.r + 2, 4, 6); }
    c.restore();
    c.fillStyle = b.hp < b.maxHp * 0.5 ? "#ff4d5e" : "#d4552f";
    c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
    c.restore();
  }
}

/* safe timeout that pauses with the game (queued into GAME timers) */
const TIMERS = [];
function setTimeoutSafe(fn, ms){ TIMERS.push({ t: ms / 1000, fn }); }
function updateTimers(dt){
  for (let i = TIMERS.length - 1; i >= 0; i--) {
    TIMERS[i].t -= dt;
    if (TIMERS[i].t <= 0) { const f = TIMERS[i].fn; TIMERS.splice(i, 1); f(); }
  }
}

/* ---- field supplies (pickups) ---- */
const PICKUP_DEFS = {
  repair: { color: "#7be27a", glyph: "+", label: "REPAIR" },
  shield: { color: "#7ec8ff", glyph: "S", label: "SHIELD" },
  rapid:  { color: "#ffd05c", glyph: "R", label: "RAPID FIRE" },
  triple: { color: "#ff9a5c", glyph: "T", label: "TRI-SHOT" },
  speed:  { color: "#8ffff6", glyph: ">", label: "OVERDRIVE" },
  bomb:   { color: "#ff7a45", glyph: "B", label: "+2 BOMBS" },
  emp:    { color: "#c98aff", glyph: "E", label: "EMP BURST" },
  coin:   { color: "#ffe27a", glyph: "$", label: "SALVAGE" },
};
const DROP_TABLE = [
  ["repair", 21], ["shield", 12], ["rapid", 15], ["triple", 12],
  ["speed", 9], ["bomb", 16], ["emp", 6], ["coin", 9],
];
function rollDrop(){
  let total = 0;
  for (const [, w] of DROP_TABLE) total += w;
  let r = Math.random() * total;
  for (const [k, w] of DROP_TABLE) { r -= w; if (r <= 0) return k; }
  return "coin";
}
function spawnPickup(x, y, type){
  WORLD.pickups.push({ x, y, type: type || rollDrop(), t: rand(0, TAU), ttl: 22 });
}
function applyPickup(p, player){
  const def = PICKUP_DEFS[p.type];
  switch (p.type) {
    case "repair": player.hp = Math.min(player.maxHp, player.hp + 35); break;
    case "shield": player.shieldHp = 45; player.shieldT = 12; break;
    case "rapid":  player.rapidT = 8; break;
    case "triple": player.tripleT = 10; break;
    case "speed":  player.speedT = 8; break;
    case "bomb":   player.bombs = Math.min(player.maxBombs, player.bombs + 2); break;
    case "emp": {
      AUDIO.emp();
      fxRing(player.x, player.y, 320, "#c98aff", 0.7);
      FX.doFlash(0.18, "200,140,255");
      for (const e of WORLD.enemies) if (e.alive) {
        e.stun = Math.max(e.stun, e.type === "boss" ? 1.5 : 2.8);
        e.damage(8, player.x, player.y, player);
        fxSparkBurst(e.x, e.y, 6, "#c98aff");
      }
      break;
    }
    case "coin": GAME.addScore(150, p.x, p.y); break;
  }
  GAME.stats.pickups++;
  AUDIO.pickup();
  fxPickupSparkle(p.x, p.y, def.color);
  fxText(p.x, p.y - 18, def.label, def.color, 13);
}
function updatePickups(dt){
  const pl = WORLD.player;
  for (let i = WORLD.pickups.length - 1; i >= 0; i--) {
    const p = WORLD.pickups[i];
    p.t += dt;
    p.ttl -= dt;
    if (p.ttl <= 0) { WORLD.pickups.splice(i, 1); continue; }
    if (!pl || !pl.alive) continue;
    const d = dist(p.x, p.y, pl.x, pl.y);
    if (d < 72) { // magnetize
      const pull = (1 - d / 72) * 340 * dt;
      p.x += ((pl.x - p.x) / Math.max(1, d)) * pull * 3;
      p.y += ((pl.y - p.y) / Math.max(1, d)) * pull * 3;
    }
    if (d < pl.radius + 13) {
      applyPickup(p, pl);
      WORLD.pickups.splice(i, 1);
    }
  }
}
function drawPickups(c, time){
  for (const p of WORLD.pickups) {
    const def = PICKUP_DEFS[p.type];
    const bob = Math.sin(p.t * 3) * 3;
    const fade = p.ttl < 3 ? ((p.ttl * 5) % 1 < 0.55 ? 1 : 0.25) : 1;
    c.save();
    c.translate(p.x, p.y + bob);
    c.globalAlpha = fade;
    c.rotate(Math.sin(p.t * 1.8) * 0.15);
    c.fillStyle = "rgba(10,14,18,0.85)";
    c.strokeStyle = def.color;
    c.lineWidth = 2;
    const s = 11;
    c.beginPath();
    c.moveTo(0, -s); c.lineTo(s, 0); c.lineTo(0, s); c.lineTo(-s, 0);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = def.color;
    c.font = "700 12px Consolas, monospace";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(def.glyph, 0, 1);
    c.restore();
    c.globalAlpha = 1;
    LIGHTS.add(p.x, p.y, 40, 0.45);
  }
}
