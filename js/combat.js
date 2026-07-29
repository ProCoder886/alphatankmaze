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
  for (const a of WORLD.allies) if (a.alive && a.spawnT <= 0) out.push(a);
  return out;
}
/* Every tank hostile to `team`, for AI target selection. In the team
   modes both sides field tanks, so an enemy's foes are the player plus
   the allied squad, and an ally's foes are the hostile squad. The
   opposing headquarters counts as a target too, which is what makes a
   squad push the objective once the defenders are down. */
function hostileTanks(w, team){
  const out = [];
  if (team !== "player" && w.player && w.player.alive && w.player.spawnT <= 0) out.push(w.player);
  const squad = team === "player" ? w.enemies : w.allies;
  for (const t of squad) if (t.alive && t.spawnT <= 0) out.push(t);
  for (const b of w.bases) if (b.alive && b.team !== team) out.push(b);
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
      const tv = map.get(c, r);
      if (tv !== 2 && tv !== 3) continue;
      const cx = c * T + T / 2, cy = r * T + T / 2;
      if (dist2(x, y, cx, cy) < (radius * 0.95) ** 2) {
        // stone shrugs off weak blasts; only strong ones level it
        if (tv === 3 && radius < 100) { map.damageTile(c, r, 3); continue; }
        map.destroyBrick(c, r);
        fxBrickBurst(cx, cy, tv === 3 ? WORLD.theme.stone.base : WORLD.theme.brick.base);
        if (owner === WORLD.player) GAME.stats.bricks++;
      }
    }
  }
  // tanks: falloff damage + radial impulse
  for (const t of allTanks()) {
    const d = dist(x, y, t.x, t.y);
    if (d > radius + t.radius) continue;
    /* Blasts follow the same team rule direct fire already does: a
       teammate is never hurt by your explosion. Without this a single
       Atomic Strike would erase your own squad, which reads as a bug
       when shells pass through them harmlessly. The owner still takes
       reduced damage from their own blast — that risk is the point. */
    if (owner && t !== owner && t.team === owner.team) continue;
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
  // emplacements take blast damage
  for (const em of WORLD.emplacements) {
    if (!em.alive) continue;
    const d = dist(x, y, em.x, em.y);
    if (d < radius + em.r) damageEmplacement(em, dmg * clamp(1 - d / (radius + em.r), 0.15, 1), owner);
  }
  /* Headquarters take blast damage too, but only from the other side —
     a defender's own bombs must never chip their objective. */
  for (const b of WORLD.bases) {
    if (!b.alive || (owner && owner.team === b.team)) continue;
    const d = dist(x, y, b.x, b.y);
    if (d < radius + b.radius)
      damageBase(b, dmg * clamp(1 - d / (radius + b.radius), 0.15, 1) * BASE_SIEGE_MUL, owner);
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
    explosive: !!spec.explosive,
    splash: spec.splash || 0,
    life: 3.2,
    trailT: 0,
  });
}
function killShell(s, i, sparkColor){
  fxSparkBurst(s.x, s.y, 6, sparkColor || s.color);
  WORLD.shells.splice(i, 1);
  // Explosive Shots superpower: every impact becomes a small blast
  if (s.explosive) explode(s.x, s.y, { radius: 66, dmg: 30, owner: s.owner });
  // artillery shells burst on impact
  else if (s.splash) explode(s.x, s.y, { radius: s.splash, dmg: s.dmg * 0.8, owner: s.owner });
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
        if (v === 2 || v === 3) {
          const res = map.damageTile(c, r, s.brickDmg);
          if (res === 2) {
            fxBrickBurst(c * T + T / 2, r * T + T / 2, v === 3 ? WORLD.theme.stone.base : WORLD.theme.brick.base);
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
      // shells hit emplacements
      if (!dead) for (const em of WORLD.emplacements) {
        if (!em.alive || s.team === "enemy") continue;
        if (dist2(s.x, s.y, em.x, em.y) < (em.r + s.r) ** 2) {
          damageEmplacement(em, s.dmg, s.owner);
          killShell(s, i); dead = true; break;
        }
      }
      // shells hit the opposing headquarters
      if (!dead) for (const b of WORLD.bases) {
        if (!b.alive || b.team === s.team) continue;
        if (dist2(s.x, s.y, b.x, b.y) < (b.radius + s.r) ** 2) {
          damageBase(b, s.dmg, s.owner);
          if (s.owner === WORLD.player) GAME.stats.hits++;
          killShell(s, i); dead = true; break;
        }
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
    big: !!opts.big,
    color: opts.big ? "#c98aff" : (owner.team === "player" ? "#46e0d8" : "#ff7a45"),
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
    const br = b.big ? 15 : 10;
    c.fillStyle = "#23282e";
    c.beginPath(); c.arc(0, 0, br, 0, TAU); c.fill();
    c.strokeStyle = b.color;
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, br, 0, TAU); c.stroke();
    c.globalAlpha = pulse;
    c.fillStyle = b.color;
    c.beginPath(); c.arc(0, 0, br * 0.4, 0, TAU); c.fill();
    c.globalAlpha = 1;
    c.restore();
    LIGHTS.add(b.x, b.y, (b.big ? 80 : 50) * pulse, 0.5);
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

/* ================================================================
   ENEMY EMPLACEMENTS
   Static hostile structures scattered across the arena: gun nests that
   shoot, lighthouses that sweep a beam and reveal you, and bunkers that
   simply soak damage. They are spaced apart so the map never feels
   crowded, and the HUD tracks how many are left.
   ================================================================ */
const EMPLACEMENTS = {
  nest:  { name: "GUN NEST",   hp: 90,  r: 19, color: "#ff7a45", dark: "#5c2a16",
           range: 380, reload: 1.5, score: 220 },
  tower: { name: "LIGHTHOUSE", hp: 70,  r: 17, color: "#ffd05c", dark: "#5c4a16",
           range: 0,   reload: 0,   score: 180, beam: true },
  bunker:{ name: "BUNKER",     hp: 190, r: 22, color: "#9ad8ff", dark: "#1d3b52",
           range: 300, reload: 2.6, score: 300 },
};
function makeEmplacement(kind, x, y){
  const D = EMPLACEMENTS[kind];
  return { kind, def: D, x, y, r: D.r, hp: D.hp, maxHp: D.hp,
           reloadT: rand(0, D.reload || 1), ang: rand(0, TAU), alive: true, flash: 0 };
}
function updateEmplacements(dt){
  const pl = WORLD.player;
  for (let i = WORLD.emplacements.length - 1; i >= 0; i--) {
    const e = WORLD.emplacements[i];
    e.flash = Math.max(0, e.flash - dt);
    if (!e.alive) {
      WORLD.emplacements.splice(i, 1);
      explode(e.x, e.y, { radius: 96, dmg: 34, owner: null });
      fxDebris(e.x, e.y, 14, e.def.color);
      GAME.onEmplacementDown(e);
      continue;
    }
    if (e.def.beam) { e.ang += dt * 0.9; }        // sweeping lighthouse beam
    if (!pl || !pl.alive || GAME.state !== "playing") continue;
    const d = dist(e.x, e.y, pl.x, pl.y);
    if (e.def.beam) {
      // reveals the player: the beam raises a noise event the AI can hear
      const beamAng = Math.atan2(pl.y - e.y, pl.x - e.x);
      if (d < 420 && Math.abs(angDiff(e.ang, beamAng)) < 0.28 &&
          !WORLD.map.raycast(e.x, e.y, pl.x, pl.y).hit) {
        NOISES.add(pl.x, pl.y, 420);
      }
      continue;
    }
    if (d > e.def.range) continue;
    if (WORLD.map.raycast(e.x, e.y, pl.x, pl.y).hit) continue;
    e.ang = angMove(e.ang, Math.atan2(pl.y - e.y, pl.x - e.x), 2.4 * dt);
    e.reloadT -= dt;
    if (e.reloadT <= 0 && Math.abs(angDiff(e.ang, Math.atan2(pl.y - e.y, pl.x - e.x))) < 0.18) {
      e.reloadT = e.def.reload;
      spawnShell({ team: "enemy" }, e.x + Math.cos(e.ang) * e.r, e.y + Math.sin(e.ang) * e.r, e.ang,
        { spd: 400, dmg: e.kind === "bunker" ? 14 : 10, r: 4, bounces: 0, color: e.def.color, brickDmg: 1 });
      fxMuzzle(e.x + Math.cos(e.ang) * e.r, e.y + Math.sin(e.ang) * e.r, e.ang, 0.8);
      AUDIO.enemyShoot();
    }
  }
}
function damageEmplacement(e, d, src){
  if (!e.alive) return;
  e.hp -= d;
  e.flash = 0.12;
  fxSparkBurst(e.x, e.y, 5, e.def.color);
  if (e.hp <= 0) { e.alive = false; e.killedBy = src; }
}
function drawEmplacements(c, time){
  for (const e of WORLD.emplacements) {
    const D = e.def;
    c.save();
    c.translate(e.x, e.y);
    // ground shadow
    c.fillStyle = "rgba(0,0,0,0.34)";
    c.beginPath(); c.ellipse(4, 6, e.r * 1.12, e.r * 0.9, 0, 0, TAU); c.fill();
    // base
    c.fillStyle = D.dark;
    c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.fill();
    c.strokeStyle = D.color;
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, e.r - 2, 0, TAU); c.stroke();
    // sandbag / plating ring
    c.fillStyle = "rgba(255,255,255,0.07)";
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      c.beginPath(); c.arc(Math.cos(a) * (e.r - 5), Math.sin(a) * (e.r - 5), 3.4, 0, TAU); c.fill();
    }
    if (D.beam) {
      // rotating lighthouse beam
      c.save();
      c.rotate(e.ang);
      const g = c.createLinearGradient(0, 0, 380, 0);
      g.addColorStop(0, "rgba(255,208,92,0.30)");
      g.addColorStop(1, "rgba(255,208,92,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(380, -58); c.lineTo(380, 58);
      c.closePath(); c.fill();
      c.restore();
      c.fillStyle = "#fff3c0";
      c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
      LIGHTS.add(e.x, e.y, 120, 0.6);
    } else {
      // barrel
      c.save();
      c.rotate(e.ang);
      c.fillStyle = D.dark;
      c.fillRect(e.r * 0.2, -3.4, e.r + 8, 6.8);
      c.fillStyle = D.color;
      c.fillRect(e.r + 2, -4.4, 5, 8.8);
      c.restore();
      c.fillStyle = D.color;
      c.beginPath(); c.arc(0, 0, e.r * 0.4, 0, TAU); c.fill();
    }
    if (e.flash > 0) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = e.flash / 0.12 * 0.7;
      c.fillStyle = "#fff";
      c.beginPath(); c.arc(0, 0, e.r * 1.15, 0, TAU); c.fill();
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
    }
    c.restore();
    // health bar
    if (e.hp < e.maxHp) {
      const w = 30, y = e.y - e.r - 11;
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillRect(e.x - w / 2, y, w, 4.5);
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      c.fillStyle = pct > 0.5 ? "#7be27a" : (pct > 0.25 ? "#ffd05c" : "#ff4d5e");
      c.fillRect(e.x - w / 2 + 0.75, y + 0.75, (w - 1.5) * pct, 3);
    }
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
    // salvage doubles as the currency that buys the same bonuses the
    // rewarded ads grant, so ad rewards always have a non-ad path
    case "coin": GAME.addScore(150, p.x, p.y); GAME.addSalvage(25); break;
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

/* ================================================================
   HEADQUARTERS — the objective structures of Base Assault
   A base is not a tank: it never moves and it is not part of the
   soft-body separation pass, so it is damaged by explicit checks in
   the shell and explosion resolvers rather than through allTanks().
   It still exposes the small surface the AI targeting code needs
   (x, y, radius, vel, alive, damage) so a tank can aim and lead on
   it exactly as it would on any other hostile.
   ================================================================ */
/* Structures are demolished with explosives, not chipped down with a
   cannon: a blast counts for far more against a headquarters than a
   shell does. That makes bombs, the Time Bomb and the Atomic Strike the
   siege tools, and keeps the objective from turning into a grind — with
   shells alone a base is a two-minute chore, with bombs it is a push. */
const BASE_SIEGE_MUL = 2.2;
const BASE_DEFS = {
  /* Blue for the player's headquarters, green for the hostile one. */
  player: { name: "ALLIED HQ",  color: "#2f6fe0", lit: "#7ea8ff", dark: "#12294f", hp: 700 },
  enemy:  { name: "HOSTILE HQ", color: "#2fa64f", lit: "#7be27a", dark: "#123d1f", hp: 700 },
};
function makeBase(team, x, y){
  const D = BASE_DEFS[team];
  return {
    team, def: D, x, y,
    radius: CFG.TILE * 1.55,          // a genuinely large structure
    hp: D.hp, maxHp: D.hp,
    alive: true, flash: 0, spin: 0, pulse: rand(0, TAU),
    vel: { x: 0, y: 0 },              // AI lead-targeting reads this
    isBase: true,
    spawnT: 0, invuln: 0,
    damage(amount, sx, sy, src){ damageBase(this, amount, src); },
  };
}
function damageBase(b, amount, src){
  if (!b || !b.alive) return;
  b.hp -= amount;
  b.flash = 0.14;
  fxSparkBurst(b.x + rand(-20, 20), b.y + rand(-20, 20), 6, b.def.lit);
  if (b.hp <= 0) { b.hp = 0; b.alive = false; GAME.onBaseDown(b, src); }
}
function enemyBaseOf(team){
  for (const b of WORLD.bases) if (b.team !== team && b.alive) return b;
  return null;
}
function updateBases(dt){
  for (const b of WORLD.bases) {
    b.flash = Math.max(0, b.flash - dt);
    b.spin += dt * (b.alive ? 0.5 : 0);
    b.pulse += dt * 2.2;
    if (b.alive) LIGHTS.add(b.x, b.y, 220, 0.8);
  }
}
function drawBases(c, time){
  for (const b of WORLD.bases) {
    const D = b.def, R = b.radius;
    const pct = clamp(b.hp / b.maxHp, 0, 1);
    c.save();
    c.translate(b.x, b.y);
    // ground shadow
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.beginPath(); c.ellipse(3, 6, R * 1.05, R * 0.9, 0, 0, TAU); c.fill();
    if (!b.alive) {
      // burnt-out husk
      c.fillStyle = "rgba(24,22,20,0.92)";
      c.beginPath(); c.arc(0, 0, R * 0.86, 0, TAU); c.fill();
      c.strokeStyle = "rgba(90,80,70,0.7)"; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, R * 0.86, 0, TAU); c.stroke();
      c.restore();
      continue;
    }
    // rotating outer ring of armour segments
    c.rotate(b.spin);
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate(i * TAU / 8);
      c.fillStyle = i % 2 ? D.dark : D.color;
      c.fillRect(R * 0.78, -R * 0.20, R * 0.30, R * 0.40);
      c.restore();
    }
    c.rotate(-b.spin);
    // hull plates
    c.fillStyle = D.dark;
    c.beginPath(); c.arc(0, 0, R * 0.80, 0, TAU); c.fill();
    c.fillStyle = D.color;
    c.beginPath(); c.arc(0, 0, R * 0.66, 0, TAU); c.fill();
    // panel seams
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + b.spin * 0.4;
      c.beginPath();
      c.moveTo(Math.cos(a) * R * 0.28, Math.sin(a) * R * 0.28);
      c.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
      c.stroke();
    }
    // reactor core: brightness tracks remaining integrity
    const beat = 0.72 + 0.28 * Math.sin(b.pulse) * pct;
    const g = c.createRadialGradient(0, 0, 2, 0, 0, R * 0.44);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, D.lit);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = beat * (0.35 + 0.65 * pct);
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R * 0.44, 0, TAU); c.fill();
    c.globalAlpha = 1;
    // specular highlight, matching the tanks' lighting direction
    c.fillStyle = "rgba(255,255,255,0.13)";
    c.beginPath(); c.ellipse(-R * 0.20, -R * 0.28, R * 0.34, R * 0.18, -0.5, 0, TAU); c.fill();
    // hit flash
    if (b.flash > 0) {
      c.globalAlpha = b.flash / 0.14 * 0.7;
      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(0, 0, R * 0.82, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    // damage cracks appear as integrity falls
    if (pct < 0.66) {
      c.strokeStyle = "rgba(20,10,6,0.75)";
      c.lineWidth = 2;
      const cracks = pct < 0.33 ? 6 : 3;
      for (let i = 0; i < cracks; i++) {
        const a = i * TAU / cracks + 0.4;
        c.beginPath();
        c.moveTo(Math.cos(a) * R * 0.16, Math.sin(a) * R * 0.16);
        c.lineTo(Math.cos(a + 0.3) * R * 0.72, Math.sin(a + 0.3) * R * 0.72);
        c.stroke();
      }
      if (chance(0.35)) PARTS.spawn({
        x: b.x + rand(-R * 0.6, R * 0.6), y: b.y + rand(-R * 0.6, R * 0.6),
        vx: rand(-10, 10), vy: rand(-40, -18),
        type: "smoke", size: rand(6, 13), life: 1.4, color: "#3a3a3a", layer: 1,
      });
    }
    c.restore();
    // integrity bar above the structure
    const w = R * 2.1, y = b.y - R - 16;
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillRect(b.x - w / 2, y, w, 7);
    c.fillStyle = pct > 0.5 ? D.lit : (pct > 0.22 ? "#ffd05c" : "#ff4d5e");
    c.fillRect(b.x - w / 2 + 1, y + 1, (w - 2) * pct, 5);
    c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 1;
    c.strokeRect(b.x - w / 2, y, w, 7);
    c.fillStyle = D.lit;
    c.font = "700 10px Bahnschrift, 'Segoe UI', sans-serif";
    c.textAlign = "center";
    c.fillText(D.name, b.x, y - 5);
  }
}
