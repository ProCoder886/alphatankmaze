"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/main.js
   SECTION 13-16 — HUD, render pipeline, UI wiring / screens, auto-quality, resize, main loop, boot.
   ================================================================ */
/* ================================================================
   SECTION 13 — HUD (canvas, screen-space)
   ================================================================ */
function chamferBar(c, x, y, w, h){
  const ch = Math.min(6, h / 2);
  c.beginPath();
  c.moveTo(x + ch, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - ch);
  c.lineTo(x + w - ch, y + h); c.lineTo(x, y + h); c.lineTo(x, y + ch);
  c.closePath();
}
/* Squad strength and, in Base Assault, the two headquarters. Drawn under
   the centre column so it reads as the objective panel it is. */
function drawTeamHud(c, time, y0, MD){
  const allies = WORLD.allies.filter(a => a.alive).length + (WORLD.player && WORLD.player.alive ? 1 : 0);
  const foes = WORLD.enemies.filter(e => e.alive).length;
  const pipW = Math.round(9 * UIS), pipH = Math.round(9 * UIS), gap = Math.round(4 * UIS);
  const cap = GAME.squadSize() + 1;
  const rowW = cap * (pipW + gap);
  const drawPips = (n, total, x, col, dir) => {
    for (let i = 0; i < total; i++) {
      c.fillStyle = i < n ? col : "rgba(120,140,150,0.22)";
      c.fillRect(x + dir * i * (pipW + gap) - (dir < 0 ? pipW : 0), y0 - pipH, pipW, pipH);
    }
  };
  const mid = Math.round(26 * UIS);
  c.textAlign = "right";
  c.font = "700 " + FS(10) + "px Bahnschrift, 'Segoe UI', sans-serif";
  c.fillStyle = "rgba(126,200,255,0.9)";
  c.fillText("ALLIES", W / 2 - mid - rowW - Math.round(6 * UIS), y0 - Math.round(1 * UIS));
  drawPips(allies, cap, W / 2 - mid, "#7ec8ff", -1);
  c.textAlign = "left";
  c.fillStyle = "rgba(255,122,69,0.9)";
  c.fillText("HOSTILES", W / 2 + mid + rowW + Math.round(6 * UIS), y0 - Math.round(1 * UIS));
  drawPips(foes, cap - 1, W / 2 + mid, "#ff7a45", 1);
  c.textAlign = "center";
  if (!MD.bases) return y0 + FS(14);      // clear of the pip row
  // headquarters integrity, allied on the left, hostile on the right
  const bw = Math.min(150 * UIS, W * 0.19), bh = Math.round(9 * UIS);
  const by = y0 + Math.round(9 * UIS);
  for (const b of WORLD.bases) {
    const mine = b.team === "player";
    const bx = mine ? W / 2 - mid - bw : W / 2 + mid;
    const pct = clamp(b.hp / b.maxHp, 0, 1);
    c.fillStyle = "rgba(8,12,18,0.65)";
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = b.alive ? (pct > 0.5 ? b.def.lit : pct > 0.22 ? "#ffd05c" : "#ff4d5e") : "rgba(90,80,70,0.8)";
    c.fillRect(bx + 1, by + 1, (bw - 2) * pct, bh - 2);
    c.strokeStyle = "rgba(120,160,180,0.4)"; c.lineWidth = 1;
    c.strokeRect(bx, by, bw, bh);
    c.fillStyle = "rgba(223,233,238,0.8)";
    c.font = "700 " + FS(8) + "px Consolas, monospace";
    c.textAlign = mine ? "left" : "right";
    c.fillText(mine ? "YOUR HQ" : "HOSTILE HQ", mine ? bx + 4 * UIS : bx + bw - 4 * UIS, by + bh + FS(9));
  }
  c.textAlign = "center";
  return by + bh + FS(23);      // clear of the HQ labels
}
function drawHUD(c, time){
  const pl = WORLD.player;
  if (!pl) return;
  c.textBaseline = "alphabetic";
  const pad = Math.round(16 * UIS);
  let padL = pad + SAFE.l;
  const padR = pad + SAFE.r, padT = pad + SAFE.t;
  /* With the game auto-deploying straight into a run, the way back to
     the command deck has to be visible — it is no longer a screen the
     player passed through on the way in.

     Touch gets a real tap target. Desktop gets a legend instead of a
     button on purpose: a hit box in this corner sits under the aiming
     crosshair, so a player firing up-left would pause mid-fight. The
     keyboard already has P and ESC; it only needed saying out loud. */
  INPUT.uiButtons.length = 0;
  if (INPUT.usingTouch) {
    const bs = Math.round(38 * UIS);
    const bx = padL, by = padT;
    INPUT.uiButtons.push({ id: "pause", x: bx, y: by, w: bs, h: bs });
    c.fillStyle = "rgba(8,12,18,0.6)";
    c.strokeStyle = "rgba(120,160,180,0.5)";
    c.lineWidth = 1;
    c.beginPath();
    if (c.roundRect) c.roundRect(bx, by, bs, bs, 5); else c.rect(bx, by, bs, bs);
    c.fill(); c.stroke();
    c.fillStyle = "#dfe9ee";
    const pw = Math.round(bs * 0.13), ph = Math.round(bs * 0.4);
    c.fillRect(bx + bs / 2 - pw * 2, by + (bs - ph) / 2, pw, ph);
    c.fillRect(bx + bs / 2 + pw, by + (bs - ph) / 2, pw, ph);
    padL += bs + Math.round(10 * UIS);
  }
  /* --- left cluster: HP / shield / boost / bombs / buffs ---
     Every offset scales with UIS so labels, bars and icons keep their
     relative spacing at any viewport size. */
  const LBL = Math.round(42 * UIS);          // label column width
  const barH = Math.round(14 * UIS);
  const rowHp = Math.round(20 * UIS), rowBoost = Math.round(16 * UIS);
  let y = padT;
  /* The bar has to stop short of the centred score column, or on a phone
     held sideways — where the cluster also carries the pause button — the
     two run into each other.

     In portrait there is no room beside the score column at all, so the
     whole left cluster drops below it and spans the width instead of
     competing for the row. */
  const tall = H > W;
  if (tall) y = padT + FS(96);
  const centreClear = W / 2 - 92 * UIS;
  const bw = tall
    ? clamp(W - padL - padR - LBL, 84 * UIS, 260 * UIS)
    : clamp(Math.min(230 * UIS, W * 0.32), 84 * UIS, Math.max(84 * UIS, centreClear - padL - LBL));
  c.font = "700 " + FS(11) + "px Bahnschrift, 'Segoe UI', sans-serif";
  c.textAlign = "left";
  c.fillStyle = "rgba(223,233,238,0.75)";
  c.fillText("HULL", padL, y + barH * 0.72);
  // hp bar
  c.fillStyle = "rgba(8,12,18,0.6)";
  chamferBar(c, padL + LBL, y, bw, barH); c.fill();
  const hpPct = clamp(pl.hp / pl.maxHp, 0, 1);
  const hpCol = hpPct > 0.5 ? "#46e0d8" : (hpPct > 0.25 ? "#ffd05c" : "#ff4d5e");
  c.save();
  chamferBar(c, padL + LBL, y, bw, barH); c.clip();
  c.fillStyle = hpCol;
  c.fillRect(padL + LBL, y, bw * hpPct, barH);
  c.fillStyle = "rgba(255,255,255,0.18)";
  c.fillRect(padL + LBL, y, bw * hpPct, barH * 0.36);
  if (pl.shieldHp > 0) {
    c.fillStyle = "rgba(126,200,255,0.85)";
    c.fillRect(padL + LBL, y + barH * 0.71, bw * clamp(pl.shieldHp / 45, 0, 1), barH * 0.29);
  }
  c.restore();
  c.strokeStyle = "rgba(120,160,180,0.4)"; c.lineWidth = 1;
  chamferBar(c, padL + LBL, y, bw, barH); c.stroke();
  c.fillStyle = "#eaf6fa";
  c.font = "700 " + FS(10) + "px Consolas, monospace";
  c.fillText(Math.max(0, Math.ceil(pl.hp)) + "/" + pl.maxHp, padL + LBL + 6 * UIS, y + barH * 0.78);
  // boost
  y += rowHp;
  const boostH = Math.round(7 * UIS);
  c.fillStyle = "rgba(223,233,238,0.55)";
  c.font = "700 " + FS(9) + "px Bahnschrift, 'Segoe UI', sans-serif";
  c.fillText("BOOST", padL, y + boostH);
  c.fillStyle = "rgba(8,12,18,0.6)";
  chamferBar(c, padL + LBL, y, bw * 0.7, boostH); c.fill();
  c.fillStyle = pl.boosting ? "#8ffff6" : "rgba(70,224,216,0.7)";
  c.fillRect(padL + LBL, y + 1, (bw * 0.7 - 2) * pl.boost, boostH - 2);
  // bombs
  y += rowBoost;
  const bombStep = Math.round(18 * UIS), bombSz = 9 * UIS;
  c.fillStyle = "rgba(223,233,238,0.55)";
  c.fillText("BOMBS", padL, y + bombSz);
  for (let i = 0; i < pl.maxBombs; i++) {
    const bx = padL + LBL + 2 * UIS + i * bombStep, by = y + bombSz * 0.55;
    c.save();
    c.translate(bx, by);
    c.rotate(Math.PI / 4);
    c.fillStyle = i < pl.bombs ? "#ff7a45" : "rgba(120,140,150,0.22)";
    c.fillRect(-bombSz / 2, -bombSz / 2, bombSz, bombSz);
    c.restore();
  }
  // active buffs
  y += Math.round(20 * UIS);
  const buffs = [];
  if (pl.rapidT > 0) buffs.push(["RAPID", pl.rapidT / 8, "#ffd05c"]);
  if (pl.tripleT > 0) buffs.push(["TRI", pl.tripleT / 10, "#ff9a5c"]);
  if (pl.speedT > 0) buffs.push(["OVR", pl.speedT / 8, "#8ffff6"]);
  if (pl.shieldT > 0 && pl.shieldHp > 0) buffs.push(["SHD", pl.shieldT / 12, "#7ec8ff"]);
  let bx = padL;
  const buffW = Math.round(52 * UIS), buffH = Math.round(16 * UIS);
  c.font = "700 " + FS(10) + "px Consolas, monospace";
  for (const [label, pct, col] of buffs) {
    c.fillStyle = "rgba(8,12,18,0.6)";
    chamferBar(c, bx, y, buffW, buffH); c.fill();
    c.fillStyle = col;
    c.fillRect(bx, y + buffH - 3 * UIS, buffW * clamp(pct, 0, 1), 3 * UIS);
    c.fillText(label, bx + 8 * UIS, y + buffH * 0.68);
    bx += buffW + 8 * UIS;
  }
  /* --- minimap: top-right corner, always showing the whole arena --- */
  MINI.draw(c);
  /* --- superpower rack ---
     On a mouse it stacks under the minimap, where it reads as part of
     the status column. On touch it moves to the bottom right, just
     above the aiming thumb: seven discs in the top corner of a phone
     are a stretch across the whole screen for the one hand that is
     already busy steering, which is why they went unused. */
  let rackTop;
  if (INPUT.usingTouch) {
    const rackH = Math.round((20 * 2 + 20) * UIS) * Math.ceil(POWERS.DEFS.length / 4) + Math.round(14 * UIS);
    rackTop = H - rackH - SAFE.b - Math.round(96 * UIS);
  } else {
    rackTop = (MINI.box ? MINI.box.y + MINI.box.h : padT) + Math.round(8 * UIS);
  }
  drawPowerRack(c, time, W - padR, rackTop);
  /* --- top-center: score, combo, sector / wave --- */
  c.textAlign = "center";
  c.fillStyle = "rgba(223,233,238,0.6)";
  c.font = "700 " + FS(10) + "px Bahnschrift, 'Segoe UI', sans-serif";
  c.fillText("SCORE", W / 2, padT + FS(9));
  c.fillStyle = "#eaf6fa";
  c.font = "700 " + FS(26) + "px Consolas, monospace";
  c.fillText(fmt(GAME.score), W / 2, padT + FS(37));
  if (GAME.combo.n > 1) {
    const pct = GAME.combo.t / CFG.COMBO_WINDOW;
    const cw = 110 * UIS;
    c.fillStyle = "#8ffff6";
    c.font = "700 " + FS(16) + "px Consolas, monospace";
    c.fillText("x" + GAME.combo.n + " COMBO", W / 2, padT + FS(57));
    c.fillStyle = "rgba(8,12,18,0.6)";
    c.fillRect(W / 2 - cw / 2, padT + FS(64), cw, 4 * UIS);
    c.fillStyle = "#8ffff6";
    c.fillRect(W / 2 - cw / 2, padT + FS(64), cw * pct, 4 * UIS);
  }
  c.fillStyle = "rgba(223,233,238,0.65)";
  c.font = "700 " + FS(11) + "px Bahnschrift, 'Segoe UI', sans-serif";
  const MD = GAME.def();
  let waveTxt = MD.name + "  ·  ";
  if (MD.teams) waveTxt += WORLD.theme.name + "  ·  " + GAME.squadSize() + " v " + GAME.squadSize();
  else if (MD.noEnemies) waveTxt += "SECTOR " + GAME.level + "  ·  TARGETS " + GAME.barrelsLeft;
  else if (MD.survival) waveTxt += "WAVE " + Math.max(1, GAME.wave);
  else waveTxt += "SECTOR " + GAME.level + "  ·  WAVE " + Math.max(1, GAME.wave) + "/" + GAME.wavesTotal;
  if (GAME.modifier && GAME.waveState === "active") waveTxt += "  ·  " + GAME.modifier.label;
  c.fillText(waveTxt, W / 2, padT + FS(GAME.combo.n > 1 ? 82 : 58));
  /* Everything below the mode line stacks: the team panel claims its own
     height and hands back the next free row, so the squad pips and HQ
     bars never sit on top of the emplacement counter. */
  let infoY = padT + FS(GAME.combo.n > 1 ? 96 : 72);
  if (MD.teams) infoY = drawTeamHud(c, time, infoY, MD);
  // live emplacement counter
  if (GAME.obstaclesTotal > 0) {
    const left = WORLD.emplacements.length;
    c.fillStyle = left ? "rgba(255,176,58,0.9)" : "rgba(123,226,122,0.95)";
    c.font = "700 " + FS(10) + "px Consolas, monospace";
    c.fillText("EMPLACEMENTS  " + (GAME.obstaclesTotal - left) + " / " + GAME.obstaclesTotal + " DESTROYED",
      W / 2, infoY);
    infoY += FS(14);
  }
  // Time Attack clock, red and pulsing in the last ten seconds
  if (MD.timeLimit) {
    const low = GAME.timeLeft <= 10;
    c.fillStyle = low ? "#ff4d5e" : "#eaf6fa";
    c.font = "700 " + FS(low ? 24 : 20) + "px Consolas, monospace";
    c.globalAlpha = low ? 0.65 + 0.35 * Math.abs(Math.sin(time * 8)) : 1;
    c.fillText(padTime(Math.ceil(GAME.timeLeft)), W / 2, padT + FS(GAME.combo.n > 1 ? 106 : 82));
    c.globalAlpha = 1;
  }
  /* --- boss bar --- */
  const boss = WORLD.enemies.find(e => e.boss && e.alive);
  if (boss) {
    const bw2 = Math.min(420 * UIS, W * 0.55);
    const bossH = Math.round(12 * UIS);
    const bx2 = W / 2 - bw2 / 2, by2 = padT + FS(GAME.combo.n > 1 ? 92 : 68);
    c.fillStyle = "rgba(8,12,18,0.7)";
    chamferBar(c, bx2, by2, bw2, bossH); c.fill();
    c.fillStyle = "#ff4d5e";
    c.fillRect(bx2 + 1, by2 + 1, (bw2 - 2) * clamp(boss.hp / boss.maxHp, 0, 1), bossH - 2);
    c.strokeStyle = "rgba(255,77,94,0.6)";
    chamferBar(c, bx2, by2, bw2, bossH); c.stroke();
    c.fillStyle = "#ffb0b8";
    c.font = "700 " + FS(9) + "px Consolas, monospace";
    c.fillText(boss.def.title || "COMMAND UNIT", W / 2, by2 + bossH * 0.78);
  }
  /* --- banner --- */
  if (GAME.banner.t < GAME.banner.dur) {
    const bt = GAME.banner.t, dur = GAME.banner.dur;
    const inT = clamp(bt / 0.25, 0, 1);
    const outT = clamp((dur - bt) / 0.4, 0, 1);
    const a = Math.min(inT, outT);
    const scale = 0.85 + 0.15 * easeOutBack(inT);
    c.save();
    c.translate(W / 2, H * 0.3);
    c.scale(scale, scale);
    c.globalAlpha = a;
    c.fillStyle = "rgba(8,12,18,0.35)";
    c.fillRect(-W, -34, W * 2, 68);
    c.fillStyle = "#eaf6fa";
    c.font = "800 " + FS(34) + "px Bahnschrift, 'Arial Narrow', sans-serif";
    c.fillText(GAME.banner.text, 0, 6);
    if (GAME.banner.sub) {
      c.fillStyle = "rgba(70,224,216,0.9)";
      c.font = "700 " + FS(13) + "px Bahnschrift, 'Segoe UI', sans-serif";
      c.fillText(GAME.banner.sub, 0, 28);
    }
    c.restore();
    c.globalAlpha = 1;
  }
  /* --- hint --- */
  if (GAME.hintMsg.t > 0) {
    const a = clamp(GAME.hintMsg.t / 0.5, 0, 1);
    /* On touch the bottom of the screen belongs to the thumb-zone guide
       and the stick rings, so the hint sits above the power rack
       instead of writing over them. */
    const hintBase = INPUT.usingTouch
      ? Math.max(FS(40), rackTop - 14 * UIS)
      : H - (56 * UIS) - SAFE.b;
    c.textAlign = "center";
    c.globalAlpha = a * 0.9;
    c.fillStyle = "rgba(8,12,18,0.55)";
    c.font = "700 " + FS(12) + "px Consolas, monospace";
    const tw = c.measureText(GAME.hintMsg.text).width;
    c.fillRect(W / 2 - tw / 2 - 14 * UIS, hintBase - 18 * UIS, tw + 28 * UIS, 26 * UIS);
    c.fillStyle = "#8ffff6";
    c.fillText(GAME.hintMsg.text, W / 2, hintBase);
    c.globalAlpha = 1;
  }
  /* --- low HP vignette --- */
  if (pl.alive && hpPct < 0.35) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    const a = (0.35 - hpPct) * 1.6 * (0.6 + 0.4 * pulse);
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, "rgba(180,20,30,0)");
    g.addColorStop(1, "rgba(180,20,30," + clamp(a, 0, 0.5) + ")");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  /* --- crosshair --- */
  if (!INPUT.usingTouch && pl.alive) {
    const mx = INPUT.mouse.x, my = INPUT.mouse.y;
    const spread = (7 + (pl.reloadT / Math.max(0.01, pl.rapidT > 0 ? 0.15 : pl.reload)) * 8) * UIS;
    c.strokeStyle = "rgba(143,255,246,0.9)";
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(mx, my, 3 * UIS, 0, TAU); c.stroke();
    for (let k = 0; k < 4; k++) {
      const a2 = k * Math.PI / 2 + Math.PI / 4;
      c.beginPath();
      c.moveTo(mx + Math.cos(a2) * spread, my + Math.sin(a2) * spread);
      c.lineTo(mx + Math.cos(a2) * (spread + 7 * UIS), my + Math.sin(a2) * (spread + 7 * UIS));
      c.stroke();
    }
  }
  /* --- touch sticks --- */
  if (INPUT.usingTouch) {
    const ring = 52 * UIS, knob = 20 * UIS;
    const drawStick = (st, col) => {
      if (st.id === -1) return;
      c.strokeStyle = "rgba(" + col + ",0.35)";
      c.lineWidth = 2 * UIS;
      c.beginPath(); c.arc(st.sx, st.sy, ring, 0, TAU); c.stroke();
      c.fillStyle = "rgba(" + col + ",0.4)";
      const dx = clamp(st.x - st.sx, -ring, ring), dy = clamp(st.y - st.sy, -ring, ring);
      c.beginPath(); c.arc(st.sx + dx, st.sy + dy, knob, 0, TAU); c.fill();
    };
    drawStick(INPUT.touch.move, "143,255,246");
    drawStick(INPUT.touch.aim, "255,208,92");
    /* Idle hint: the two thumb zones, so a first-time player on a phone
       can see where to put their thumbs before touching anything. */
    if (INPUT.touch.move.id === -1 && INPUT.touch.aim.id === -1 && GAME.touchHintT > 0) {
      const a = clamp(GAME.touchHintT / 1.5, 0, 1) * 0.5;
      const hy = H - ring - Math.round(18 * UIS) - SAFE.b;
      c.globalAlpha = a;
      c.font = "700 " + FS(10) + "px Bahnschrift, 'Segoe UI', sans-serif";
      c.textAlign = "center";
      c.setLineDash([5 * UIS, 5 * UIS]);
      c.lineWidth = 2 * UIS;
      const zone = (zx, col, l1, l2) => {
        c.strokeStyle = "rgba(" + col + ",0.9)";
        c.beginPath(); c.arc(zx, hy, ring, 0, TAU); c.stroke();
        c.fillStyle = "rgba(" + col + ",0.95)";
        c.fillText(l1, zx, hy - 4 * UIS);
        c.fillText(l2, zx, hy + 12 * UIS);
      };
      zone(W * 0.18 + SAFE.l, "143,255,246", "DRIVE", "TAP = BOMB");
      zone(W * 0.82 - SAFE.r, "255,208,92", "AIM", "HOLD = FIRE");
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
  }
  /* --- fps --- */
  let footY = H - 14 - SAFE.b;
  if (SETTINGS.fps) {
    c.textAlign = "left";
    c.fillStyle = "rgba(143,255,246,0.7)";
    c.font = "700 " + FS(11) + "px Consolas, monospace";
    c.fillText(FPSMON.fps.toFixed(0) + " FPS · " + (SETTINGS.quality === "auto" ? QUALITY_TIERS[autoTier].toUpperCase() + "*" : SETTINGS.quality.toUpperCase()), padL, footY);
    footY -= FS(16);
  }
  /* --- route back to the command deck ---
     The game now deploys straight into a run, so the way out has to be
     stated. Touch has the pause button up in the corner; a keyboard
     player gets this, in the bottom-left where nothing else lives, and
     it fades once it has been on screen long enough to be read. */
  if (!INPUT.usingTouch && GAME.state === "playing") {
    const age = GAME.stats ? GAME.stats.time : 0;
    const a = clamp(1 - (age - 14) / 3, 0, 1);
    if (a > 0.01) {
      c.globalAlpha = a * 0.7;
      c.textAlign = "left";
      c.fillStyle = "rgba(143,255,246,0.85)";
      c.font = "700 " + FS(10) + "px Consolas, monospace";
      c.fillText("P · MENU", padL, footY);
      c.globalAlpha = 1;
    }
  }
}

/* ================================================================
   SECTION 14 — RENDER PIPELINE
   ================================================================ */
let cv, ctx, W = 0, H = 0, DPR = 1;
/* UI scale keeps HUD text legible from the smallest supported iframe
   (800x450 @ dpr 1) up to 1920x1080 fullscreen. */
let UIS = 1;
function FS(px){ return Math.round(px * UIS); }
/* Device safe-area insets (notch / rounded corners / dynamic island),
   read from the CSS env() probe so the canvas HUD can avoid them. */
const SAFE = { t: 0, r: 0, b: 0, l: 0 };

function renderMenuBackdrop(c, time){
  const g = c.createRadialGradient(W * 0.5, H * 0.35, 60, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  g.addColorStop(0, "#101a24");
  g.addColorStop(0.55, "#0a1119");
  g.addColorStop(1, "#04060a");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  const cx = W * 0.5, cy = H * 0.52;
  const R = Math.min(W, H);

  // drifting tactical grid
  c.strokeStyle = "rgba(70,224,216,0.05)";
  c.lineWidth = 1;
  const gs = 64;
  const off = (time * 14) % gs;
  c.beginPath();
  for (let x = -gs + off; x < W + gs; x += gs) { c.moveTo(x, 0); c.lineTo(x, H); }
  for (let y = -gs + off; y < H + gs; y += gs) { c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke();

  // slow parallax starfield / dust motes
  c.save();
  for (let i = 0; i < 70; i++) {
    const seed = i * 127.1;
    const px = ((Math.sin(seed) * 43758.5) % 1 + 1) % 1;
    const py = ((Math.sin(seed * 1.7) * 27182.8) % 1 + 1) % 1;
    const depth = 0.3 + (i % 5) * 0.16;
    const x = (px * W + time * 9 * depth) % (W + 40) - 20;
    const y = (py * H + time * 4 * depth) % (H + 40) - 20;
    c.globalAlpha = 0.05 + depth * 0.10;
    c.fillStyle = i % 7 === 0 ? "#ffb03a" : "#8ffff6";
    c.fillRect(x, y, 1.5 + depth, 1.5 + depth);
  }
  c.restore();

  // concentric radar rings + sweep
  c.save();
  c.globalAlpha = 0.55;
  c.strokeStyle = "rgba(70,224,216,0.10)";
  for (let k = 1; k <= 4; k++) {
    c.lineWidth = k === 3 ? 1.6 : 1;
    c.beginPath(); c.arc(cx, cy, R * 0.11 * k, 0, TAU); c.stroke();
  }
  const sweep = time * 0.9;
  const sg = c.createConicGradient ? c.createConicGradient(sweep, cx, cy) : null;
  if (sg) {
    sg.addColorStop(0, "rgba(70,224,216,0.12)");
    sg.addColorStop(0.12, "rgba(70,224,216,0)");
    sg.addColorStop(1, "rgba(70,224,216,0)");
    c.fillStyle = sg;
    c.beginPath(); c.arc(cx, cy, R * 0.46, 0, TAU); c.fill();
  }
  c.restore();

  /* rotating wireframe polygons — the geometric layer of the backdrop */
  const polys = [
    { n: 3, r: 0.40, spd: -0.10, col: "255,122,69", w: 1.4 },
    { n: 5, r: 0.30, spd: 0.16,  col: "70,224,216", w: 1.2 },
    { n: 6, r: 0.52, spd: -0.06, col: "143,255,246", w: 1.0 },
    { n: 8, r: 0.62, spd: 0.04,  col: "201,138,255", w: 1.0 },
  ];
  for (const p of polys) {
    const rr = R * p.r * (1 + Math.sin(time * 0.35 + p.n) * 0.03);
    c.save();
    c.translate(cx, cy);
    c.rotate(time * p.spd);
    c.strokeStyle = "rgba(" + p.col + ",0.13)";
    c.lineWidth = p.w;
    c.beginPath();
    for (let k = 0; k <= p.n; k++) {
      const a = (k / p.n) * TAU;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    // vertex nodes
    c.fillStyle = "rgba(" + p.col + ",0.30)";
    for (let k = 0; k < p.n; k++) {
      const a = (k / p.n) * TAU;
      c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.2, 0, TAU); c.fill();
    }
    c.restore();
  }

  // orbiting glow nodes
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let k = 0; k < 5; k++) {
    const a = time * (0.22 + k * 0.05) + k * 1.9;
    const rr = R * (0.24 + k * 0.09);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.72;
    const gg = c.createRadialGradient(x, y, 0, x, y, 46);
    const col = k % 2 ? "255,176,58" : "70,224,216";
    gg.addColorStop(0, "rgba(" + col + ",0.16)");
    gg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gg;
    c.beginPath(); c.arc(x, y, 46, 0, TAU); c.fill();
  }
  c.restore();

  // horizon sweep bar
  const sy = (time * 90) % (H + 240) - 120;
  const lg = c.createLinearGradient(0, sy - 90, 0, sy + 90);
  lg.addColorStop(0, "rgba(70,224,216,0)");
  lg.addColorStop(0.5, "rgba(70,224,216,0.05)");
  lg.addColorStop(1, "rgba(70,224,216,0)");
  c.fillStyle = lg;
  c.fillRect(0, sy - 90, W, 180);

  // corner brackets for the command-deck framing
  c.strokeStyle = "rgba(120,160,180,0.18)";
  c.lineWidth = 2;
  const m = 26, L = 46;
  for (const [ox, oy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    c.beginPath();
    c.moveTo(ox, oy + dy * L); c.lineTo(ox, oy); c.lineTo(ox + dx * L, oy);
    c.stroke();
  }
}

function render(time){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // the briefing sits on the command-deck backdrop too, even when it is
  // replayed from the Manual tab after a sector has been generated
  if (!WORLD.map || GAME.state === "menu" || GAME.state === "intro") {
    renderMenuBackdrop(ctx, time);
    return;
  }
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, W, H);
  const rect = CAM.visible();
  CAM.begin(ctx);
  /* The floor is a pre-rendered canvas that a low-memory device may
     have refused. A flat themed wash is a survivable fallback; a throw
     here would be a crash on every frame. */
  if (WORLD.floorCv) {
    ctx.drawImage(WORLD.floorCv, 0, 0, WORLD.map.cols * CFG.TILE, WORLD.map.rows * CFG.TILE);
  } else {
    ctx.fillStyle = WORLD.theme.floor;
    ctx.fillRect(0, 0, WORLD.map.cols * CFG.TILE, WORLD.map.rows * CFG.TILE);
  }
  if (DECALS.cv) ctx.drawImage(DECALS.cv, 0, 0, DECALS.w, DECALS.h);
  WORLD.map.draw(ctx, WORLD.theme, rect);
  PARTS.draw(ctx, 0);
  drawMines(ctx);
  drawBombs(ctx, time);
  drawBarrels(ctx);
  drawPickups(ctx, time);
  drawEmplacements(ctx, time);
  drawBases(ctx, time);
  drawStrikes(ctx, time);
  for (const e of WORLD.enemies) e.draw(ctx, time);
  for (const a of WORLD.allies) a.draw(ctx, time);
  if (WORLD.player) WORLD.player.draw(ctx, time);
  drawDrones(ctx, time);
  drawShells(ctx);
  drawMissiles(ctx);
  PARTS.draw(ctx, 1);
  CAM.end(ctx);
  // dynamic lighting overlay
  LIGHTS.render(ctx, GAME.ambient(), WORLD.theme.lightTint + GAME.ambient() + ")");
  /* Bloom samples the lit frame, so a muzzle flash in a dark sector
     blooms and the same flash at noon does not. */
  POST.render(ctx, cv, W, H);
  // screen flash
  if (FX.flash > 0) {
    ctx.fillStyle = "rgba(" + FX.flashColor + "," + clamp(FX.flash, 0, 0.5) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  drawHUD(ctx, time);
}

/* ================================================================
   SECTION 15 — UI WIRING / SCREENS
   ================================================================ */
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  if (id) {
    document.getElementById(id).classList.add("active");
    document.body.classList.add("menu-open");
  } else {
    document.body.classList.remove("menu-open");
    // gameplay resumed: no banners may remain on screen during play
    CG.clearAllBanners();
  }
  // Banners are only allowed on static screens that stay up a while.
  if (id === "scr-main") {
    renderOffer("offer-main", "supply");
    renderDaily();
    renderContracts();
    refreshModeLabel();
    CG.showBanner("banner-menu");
  } else {
    CG.clearBanner("banner-menu");
  }
  if (id !== "scr-over") CG.clearBanner("banner-over");
}
function refreshMainBest(){
  document.getElementById("main-best").textContent =
    "BEST SCORE — " + fmt(SAVE.data.stats.best) + "   ·   SALVAGE — " + fmt(GAME.salvage());
}
/* ================================================================
   FIRST-RUN BRIEFING
   ----------------------------------------------------------------
   Four screens explaining the objective, the controls, the firepower
   and how the arena behaves. Shown once — the flag lives in the save,
   so it travels with the player's CrazyGames account rather than with
   the browser, and a second device does not re-run the briefing.

   It is skippable from every screen, replayable from the Manual tab,
   and it always hands off to the MAIN MENU. The game never opens
   straight into a run.
   ================================================================ */
const INTRO = {
  i: 0,
  N: 4,
  TITLES: ["Your Objective", "How To Play", "Your Firepower", "Reading The Arena"],
  active(){ return GAME.state === "intro"; },
  show(){
    GAME.state = "intro";
    this.i = 0;
    this.render(0);
    showScreen("scr-intro");
    // the menu score is the briefing's score too, once audio is allowed
    AUDIO.menuMusic();
  },
  render(dir){
    const slides = document.querySelectorAll("#scr-intro .intro-slide");
    slides.forEach((s, k) => {
      s.classList.toggle("back", dir < 0);
      s.classList.toggle("on", k === this.i);
    });
    const title = document.getElementById("intro-title");
    if (title) title.textContent = this.TITLES[this.i] || "";
    const step = document.getElementById("intro-step");
    if (step) step.textContent = "Screen " + (this.i + 1) + " of " + this.N;
    const dots = document.getElementById("intro-dots");
    if (dots) {
      dots.innerHTML = "";
      for (let k = 0; k < this.N; k++) {
        const d = document.createElement("i");
        if (k === this.i) d.className = "on";
        else if (k < this.i) d.className = "done";
        dots.appendChild(d);
      }
    }
    const prev = document.getElementById("intro-prev");
    if (prev) prev.disabled = this.i === 0;
    const next = document.getElementById("intro-next");
    if (next) next.innerHTML = this.i === this.N - 1
      ? "Enter Command Deck &nbsp;&#9654;" : "Next &nbsp;&#9654;";
  },
  go(step){
    const n = clamp(this.i + step, 0, this.N - 1);
    if (n === this.i) return;
    this.i = n;
    this.render(step);
    AUDIO.uiPage(step > 0);
  },
  next(){
    if (this.i >= this.N - 1) { this.finish(); return; }
    this.go(1);
  },
  /* The briefing is a reference document now, not a gate: it is reached
     from the Manual tab and nowhere else, so it no longer owns the
     `onboarded` flag — COLDOPEN sets that when the first sector is
     actually cleared, which is what the flag was always supposed to
     mean. Finishing simply returns to the deck it was opened from. */
  finish(){
    GAME.state = "menu";
    showScreen("scr-main");
    refreshMainBest();
  },
};

/* ================================================================
   CRAZYGAMES ACCOUNT (SDK user module)
   ----------------------------------------------------------------
   The CrazyGames account is the only identity this game has: there is
   no in-game account, no in-game username or avatar, no external login
   provider and no log-out. A signed-out player is a guest and can play
   everything; the log-in button is an optional extra in the top-right
   corner of the menu, and the auth prompt is never opened by itself.

   A signed-in player additionally gets the account-link action: the
   platform's standard showAccountLinkPrompt modal, which asks their
   permission to attach the operator service record to that account.
   "Yes" is remembered in the save (linkedId), so the badge shows a
   LINKED tag instead of the button from then on.
   ================================================================ */
/* True once the player has answered "yes" to the account-link modal for
   the account that is signed in right now. A different account taking
   over the device gets its own save — and so its own answer. */
function accountLinked(){
  return !!(SAVE.data && SAVE.data.linkedId && CG.account.id === SAVE.data.linkedId);
}
/* The account-link modal flow. Player-initiated: from the badge button,
   or offered once right after a sign-in that the login button started.
   "Yes" records the link and re-runs the token handshake for the newly
   linked record; "no" (or a dismissed modal) changes nothing and the
   button simply stays available. */
async function linkAccountFlow(){
  const A = CG.account;
  if (!A.available || A.isGuest() || accountLinked()) { renderAccount(); return; }
  const yes = await A.linkPrompt();
  if (yes) {
    SAVE.data.linkedId = A.id;
    SAVE.persist();
    A.verify();
    if (GAME.state === "playing")
      GAME.showBanner("RECORD LINKED", "Service record attached to " + (A.name() || "your account"), 2.2);
  }
  renderAccount();
}
function renderAccount(){
  const el = document.getElementById("cg-account");
  if (!el) return;
  const A = CG.account;
  // No account system on domains that embed the game (and off-platform):
  // nothing to show, and no log-in that could work.
  if (!A.available) { el.hidden = true; el.textContent = ""; return; }
  el.textContent = "";
  el.hidden = false;
  const role = document.createElement("span");
  role.className = "cg-role";
  if (A.isGuest()) {
    el.className = "cg-account guest";
    role.textContent = "Playing as guest";
    const btn = document.createElement("button");
    btn.className = "btn small cg-login";
    btn.dataset.act = "cg-login";
    btn.textContent = "Log in with CrazyGames";
    const note = document.createElement("span");
    note.className = "cg-note";
    note.textContent = "Optional — saves progress to your account";
    el.append(role, btn, note);
    return;
  }
  el.className = "cg-account signed";
  const img = document.createElement("img");
  img.className = "cg-avatar";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.onerror = () => { img.style.display = "none"; };
  if (A.avatar()) img.src = A.avatar();
  const box = document.createElement("div");
  box.className = "cg-id";
  role.textContent = "Operator";
  const name = document.createElement("span");
  name.className = "cg-name";
  name.textContent = A.name() || "";
  box.append(role, name);
  el.append(img, box);
  /* Account-link state: once linked, a quiet tag; until then, the
     button that opens the platform's standard link modal. */
  if (accountLinked()) {
    const tag = document.createElement("span");
    tag.className = "cg-linked";
    tag.title = "Service record linked to this CrazyGames account";
    tag.textContent = "Linked";
    el.append(tag);
  } else {
    const btn = document.createElement("button");
    btn.className = "btn small cg-login";
    btn.dataset.act = "cg-link";
    btn.textContent = "Link account";
    btn.title = "Attach your service record to this CrazyGames account";
    el.append(btn);
  }
}
/* The player's CrazyGames friends, listed in the service record. Fetched
   once per session (and again after a sign-in), never on a timer — the
   SDK rate-limits this call. */
let _friendsLoaded = false;
async function renderFriends(reset){
  const el = document.getElementById("cg-friends");
  if (!el) return;
  if (reset) { _friendsLoaded = false; el.hidden = true; el.textContent = ""; }
  if (!CG.account.available || CG.account.isGuest()) {
    el.hidden = true; el.textContent = "";
    return;
  }
  if (_friendsLoaded) return;
  _friendsLoaded = true;
  const page = await CG.account.friends(8);
  const list = page && Array.isArray(page.friends) ? page.friends : null;
  if (!list) { _friendsLoaded = false; return; }   // rate-limited / failed: retry later
  if (!list.length) { el.hidden = true; return; }
  el.textContent = "";
  el.hidden = false;
  const h = document.createElement("div");
  h.className = "friends-h";
  h.textContent = "CrazyGames friends — " + (page.total || list.length);
  const ul = document.createElement("ul");
  ul.className = "friends-list";
  for (const f of list) {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => { img.style.display = "none"; };
    if (f.profilePictureUrl) img.src = f.profilePictureUrl;
    const nm = document.createElement("span");
    nm.textContent = f.username || "";
    li.append(img, nm);
    ul.append(li);
  }
  el.append(h, ul);
}
/* A guest signed in, or a different account took over the session (one
   device, several players). The data module has already switched to that
   account's progress, so the profile is re-read from it — persisting the
   copy held in memory would write the previous player's progress over
   it. Nothing here logs anyone out: a log-out reloads the whole page. */
function reloadProfile(){
  SAVE.load();
  SETTINGS = SAVE.data.settings;
  META.bind();                  // a different account brings its own meta
  resolveQuality();
  syncSettingsUI();
  AUDIO.applyVolumes();
  refreshMainBest();
  renderRecords();
  if (GAME.state !== "menu") return;
  if (SAVE.data.lastMode && MODES[SAVE.data.lastMode] && !modeLocked(SAVE.data.lastMode)) GAME.mode = SAVE.data.lastMode;
  renderModes();
  renderLocations();
  renderSquadSizes();
  renderDifficulties();
  refreshModeLabel();
  renderOffer("offer-main", "supply");
  renderDaily();
  renderContracts();
}
function onAccountChange(user, changed){
  renderAccount();
  renderFriends(true);
  if (!changed) return;
  reloadProfile();
  if (user && GAME.state === "playing")
    GAME.showBanner("SIGNED IN — " + user.username, "Progress saves to your CrazyGames account", 2.6);
}
function renderRecords(){
  const list = document.getElementById("rec-list");
  const scores = SAVE.data.scores;
  if (!scores.length) {
    list.innerHTML = '<div class="empty-note">No operations on record. Deploy to begin.</div>';
  } else {
    list.innerHTML = scores.map(s => {
      const d = new Date(s.d);
      const ds = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return "<li><span class='sc'>" + fmt(s.s) + "</span><span class='lv'>SECTOR " + s.l + " · " + ds + "</span></li>";
    }).join("");
  }
  const S = SAVE.data.stats;
  const acc = S.shots ? Math.round(100 * S.hits / S.shots) : 0;
  document.getElementById("rec-stats").innerHTML =
    "Lifetime — <b>" + fmt(S.kills) + "</b> kills · <b>" + S.games + "</b> ops · <b>" + fmt(S.bricks) + "</b> bricks razed<br>" +
    "Accuracy <b>" + acc + "%</b> · Bombs <b>" + fmt(S.bombs) + "</b> · Sectors cleared <b>" + S.levels + "</b> · Time in field <b>" + padTime(S.playTime) + "</b>";
}
/* ================================================================
   REWARDED-AD OFFERS (CrazyGames SDK)
   ----------------------------------------------------------------
   Every offer follows the platform's rewarded-ad rules:
     · player-initiated, never on an active gameplay screen
     · the reward is always optional — the screen's normal Advance /
       Redeploy / Deploy buttons stay visible and identically styled
     · a video glyph makes it explicit that an ad will play
     · an equal-weight salvage alternative buys the same reward, so
       nothing is ad-gated
     · a reward is granted ONLY on the adFinished callback
     · offers are hidden or disabled (with the reason shown) while on
       cooldown, when an adblocker is active, or off-platform
   ================================================================ */
const REWARDS = {
  supply: {
    eyebrow: "Optional bonus — Pre-deployment supply drop",
    desc: () => "Deploy with a <b>shield</b>, <b>+3 bombs</b> and <b>15s rapid fire</b>.",
    label: "Supply Drop",
    cost: 75,
    avail: () => !GAME.pendingLoadout,
    grant(){ GAME.pendingLoadout = true; },
    done: "Supply drop secured — it deploys with you.",
  },
  bonus: {
    eyebrow: "Optional bonus — Clearance payout",
    desc: () => "Double this sector's <b>" + fmt(GAME.lastClearBonus || 0) + " pt</b> clearance bonus.",
    label: "Double Bonus",
    cost: 100,
    avail: () => !GAME.bonusClaimed && (GAME.lastClearBonus || 0) > 0,
    grant(){
      GAME.bonusClaimed = true;
      GAME.score += GAME.lastClearBonus;
      document.getElementById("lc-stats").innerHTML =
        document.getElementById("lc-stats").innerHTML.replace(
          /(<div class="sk">Score<\/div><div class="sv">)[^<]*/,
          "$1" + fmt(GAME.score));
    },
    done: "Clearance bonus doubled.",
  },
  power: {
    eyebrow: "Optional bonus — Ordnance resupply",
    desc: () => "Refill <b>two charges</b> of a superpower that is running low.",
    label: "Resupply",
    cost: 90,
    avail: () => POWERS.DEFS.some(p => (POWERS.charges[p.id] | 0) < p.cap),
    grant(){
      const p = POWERS.grantRandom(2);
      this.done = p ? "+2 " + p.name + " charges." : "Ordnance topped up.";
    },
    done: "Ordnance resupplied.",
  },
  overcharge: {
    eyebrow: "Optional bonus — Full overcharge",
    desc: () => "Adds <b>one charge to every superpower</b> before you deploy.",
    label: "Overcharge",
    cost: 200,
    avail: () => POWERS.DEFS.some(p => (POWERS.charges[p.id] | 0) < p.cap),
    grant(){ POWERS.grantAll(1); },
    done: "Every superpower charged.",
  },
  /* Respawn-on-the-spot: offered on death as an alternative to a full
     revive, cheaper and keeps the wave running. */
  respawn: {
    eyebrow: "Optional bonus — Emergency respawn",
    desc: () => "Drop straight back into <b>wave " + Math.max(1, GAME.wave) +
                "</b> with full hull and a shield. <b>Score and combo kept.</b>",
    label: "Respawn",
    cost: 120,
    avail: () => (GAME.revivesUsed || 0) < 1,
    grant(){ GAME.revivePlayer(true); },
    done: "Respawning on station…",
  },
  /* Salvage payout — converts a cleared sector into spendable currency. */
  salvagerun: {
    eyebrow: "Optional bonus — Salvage haul",
    desc: () => "Collect an extra <b>250 salvage</b> from this sector's wreckage.",
    label: "Salvage Haul",
    cost: 0,
    adOnly: true,
    avail: () => true,
    grant(){ GAME.addSalvage(250); },
    done: "+250 salvage recovered.",
  },
  /* Armour refit — a durability reward rather than a firepower one. */
  armour: {
    eyebrow: "Optional bonus — Armour refit",
    desc: () => "Start the next sector with a <b>shield</b> and <b>+35 hull</b>.",
    label: "Armour Refit",
    cost: 110,
    avail: () => true,
    grant(){ GAME.pendingArmour = true; },
    done: "Armour refit scheduled.",
  },
  revive: {
    eyebrow: "Optional bonus — Field repair drone",
    desc: () => "Redeploy in <b>Sector " + GAME.level + "</b> with full hull, shield and +2 bombs. <b>Score kept.</b>",
    label: "Revive",
    cost: 150,
    avail: () => (GAME.revivesUsed || 0) < 1,
    grant(){ GAME.revivePlayer(); },
    done: "Field repair inbound…",
  },
};
let _offerTimer = null;

function renderOffer(containerId, rewardId){
  const el = document.getElementById(containerId);
  if (!el) return;
  const R = REWARDS[rewardId];
  clearInterval(_offerTimer); _offerTimer = null;
  if (!R || !R.avail()) { el.classList.remove("on"); el.innerHTML = ""; return; }

  const blocked = CG.rewardBlockedReason();
  const salvage = GAME.salvage();
  const canBuy = !R.adOnly && salvage >= R.cost;
  // Never render an ad button that cannot do anything: off-platform, and
  // during Basic Launch (where the platform disables ads entirely), the
  // button is removed rather than shown disabled. An adblocker is the one
  // case that keeps a disabled button, because the docs require telling
  // the player why the feature is blocked.
  const showAdBtn = CG.available && !CG.adsDisabled;

  el.classList.add("on");
  el.innerHTML =
    '<div class="offer-h">' + R.eyebrow + "</div>" +
    '<div class="offer-desc">' + R.desc() + "</div>" +
    '<div class="btn-row">' +
      (showAdBtn
        ? '<button class="btn" data-act="rw-ad" data-rw="' + rewardId + '" data-cont="' + containerId + '"' +
          (blocked ? " disabled" : "") + '>' +
          '<span class="ad-ic">&#9654;</span>Watch Ad — ' + R.label + "</button>"
        : "") +
      (R.adOnly ? "" :
        '<button class="btn" data-act="rw-buy" data-rw="' + rewardId + '" data-cont="' + containerId + '"' +
        (canBuy ? "" : " disabled") + ">" + R.label + " — " + R.cost + " Salvage</button>") +
    "</div>" +
    '<div class="offer-note' + (blocked ? " blocked" : "") + '">' +
      (blocked ? blocked + "<br>" : "") +
      (R.adOnly ? "This bonus is optional — skip it and continue for free.<br>" : "") +
      "Salvage: <b>" + fmt(salvage) + "</b> · earned from salvage crates and cleared sectors." +
    "</div>";

  // live-refresh the cooldown countdown while the offer is on screen
  if (blocked && CG.rewardCooldownLeft() > 0) {
    _offerTimer = setInterval(() => {
      if (!document.body.contains(el) || !el.classList.contains("on")) {
        clearInterval(_offerTimer); _offerTimer = null; return;
      }
      renderOffer(containerId, rewardId);
    }, 1000);
  }
}

/* Claim a reward. `viaAd` grants only after a completed rewarded ad. */
async function claimReward(rewardId, containerId, viaAd){
  const R = REWARDS[rewardId];
  if (!R || !R.avail()) return;
  const el = document.getElementById(containerId);

  if (viaAd) {
    if (CG.rewardBlockedReason()) return;
    const ok = await CG.rewarded();
    if (!ok) {
      // adError / unfilled / adblock — never reward, always keep playing
      if (el) {
        const note = el.querySelector(".offer-note");
        if (note) {
          note.classList.add("blocked");
          note.innerHTML = "No advertisement was available, so no reward was given. " +
            "You can still use salvage.<br>Salvage: <b>" + fmt(GAME.salvage()) + "</b>";
        }
      }
      return;
    }
  } else {
    if (!GAME.spendSalvage(R.cost)) return;
  }

  // reward confirmation — the player must clearly see they were rewarded
  if (el) {
    el.innerHTML = '<div class="offer-h">Reward granted</div>' +
      '<div class="offer-desc">' + R.done + "</div>";
  }
  AUDIO.pickup();
  R.grant();
  SAVE.persist();
}

/* ================================================================
   RESULT-SCREEN COUNT-UP
   ----------------------------------------------------------------
   Score, kills and accuracy used to appear already finished. Rolling
   them up is the cheapest dopamine in the interface: the same numbers,
   delivered as an event rather than as a fact.
   ================================================================ */
let _countTimers = [];
function countUp(el, to, opts){
  if (!el) return;
  opts = opts || {};
  const dur = opts.dur || 900, delay = opts.delay || 0;
  const fmtFn = opts.fmt || fmt;
  /* prefers-reduced-motion gets the final value immediately — the
     information matters, the animation does not. */
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = fmtFn(to);
    return;
  }
  el.textContent = fmtFn(0);
  const t0 = performance.now() + delay;
  let lastTick = 0;
  const step = () => {
    const k = clamp((performance.now() - t0) / dur, 0, 1);
    if (k > 0) {
      const v = easeOutCubic(k) * to;
      el.textContent = fmtFn(v);
      /* One tick per ~70ms, not per frame — sixty ticks a second is a
         machine gun, not a counter. */
      if (performance.now() - lastTick > 70 && k < 1) { lastTick = performance.now(); AUDIO.uiTick(k); }
    }
    if (k < 1) _countTimers.push(requestAnimationFrame(step));
  };
  _countTimers.push(requestAnimationFrame(step));
}
function stopCountUps(){
  for (const id of _countTimers) cancelAnimationFrame(id);
  _countTimers = [];
}
/* Rolls every number on a results panel: the headline score, then each
   stat row in sequence so the eye is led down the column. */
function animateResults(rootId, bigId, score){
  stopCountUps();
  const big = bigId ? document.getElementById(bigId) : null;
  if (big && score !== undefined) countUp(big, score, { dur: 1100 });
  const vals = document.querySelectorAll("#" + rootId + " .sv");
  vals.forEach((el, i) => {
    const raw = el.textContent.trim();
    const m = raw.match(/^([\d,]+)(%?)$/);
    if (!m) return;                       // times, ratios, labels: leave them
    const target = parseInt(m[1].replace(/,/g, ""), 10);
    if (!isFinite(target) || target <= 0) return;
    const suffix = m[2];
    countUp(el, target, {
      dur: 650, delay: 120 + i * 80,
      fmt: (v) => fmt(v) + suffix,
    });
  });
}

/* ================================================================
   ZONE-REACTIVE MENU
   ----------------------------------------------------------------
   The deployment zone the player has chosen recolours the console.
   Sixteen distinct moods, identical layout, and it makes the zone
   picker feel like a decision rather than a dropdown.
   ================================================================ */
function applyZoneTheme(){
  const root = document.documentElement;
  const loc = SETTINGS.location;
  const t = (loc !== "random" && loc !== "rotate" && THEMES[+loc]) ? THEMES[+loc] : null;
  if (!t) { root.style.removeProperty("--friend"); root.style.removeProperty("--friend-hot"); return; }
  root.style.setProperty("--friend", t.accent);
  root.style.setProperty("--friend-hot", t.accent);
}

/* ================================================================
   TOAST STACK
   ----------------------------------------------------------------
   Progression that is not announced does not register, however much
   of it is being awarded. Queued top-right cards that dismiss
   themselves in sequence.
   ================================================================ */
const TOAST = {
  queue: [],
  showing: false,
  push(text, sub, color){
    this.queue.push({ text, sub: sub || "", color: color || "var(--friend)" });
    this._pump();
  },
  _pump(){
    if (this.showing || !this.queue.length) return;
    const host = document.getElementById("toasts");
    if (!host) { this.queue.length = 0; return; }
    this.showing = true;
    const t = this.queue.shift();
    const el = document.createElement("div");
    el.className = "toast";
    el.style.setProperty("--tc", t.color);
    el.innerHTML = '<span class="toast-t">' + t.text + "</span>" +
      (t.sub ? '<span class="toast-s">' + t.sub + "</span>" : "");
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => {
        el.remove();
        this.showing = false;
        this._pump();
      }, 320);
    }, 2600);
  },
};

/* ================================================================
   PROGRESSION SURFACES
   ----------------------------------------------------------------
   Three places the meta layer becomes visible: the daily operation
   card and the contract list on the command deck, and the operator
   block on the results screen. Progression that is not announced does
   not register, no matter how much of it is being awarded.
   ================================================================ */
/* The results screen, at the moment of highest emotion: what this run
   earned, and the specific named thing the next one is close to. */
function renderRunProgress(last){
  const el = document.getElementById("go-progress");
  if (!el) return;
  if (!last) { el.innerHTML = ""; return; }
  const nx = META.nextUnlock();
  const rows = [];
  rows.push(
    '<div class="xp-row"><span>OPERATOR ' + META.data.lvl + "</span>" +
    '<span class="xp-gain">+' + fmt(last.amount) + " XP</span></div>" +
    '<div class="xp-bar"><i style="width:0%"></i></div>');
  if (last.levels > 0)
    rows.push('<div class="xp-unlock">&#9733; Operator level ' + META.data.lvl +
      (last.unlocked.length ? " — " + last.unlocked.map(u => u.label).join(" · ") : "") + "</div>");
  else if (nx)
    rows.push('<div class="xp-next">Operator ' + nx.lvl + " — " + nx.label + "</div>");
  if (last.contracts && last.contracts.length)
    rows.push('<div class="xp-unlock">&#10004; Contract complete — ' +
      last.contracts.map(c => c.text).join(" · ") + "</div>");
  if (last.streakPay)
    rows.push('<div class="xp-unlock">Daily streak ' + META.data.daily.streak +
      " — +" + fmt(last.streakPay) + " salvage</div>");
  rows.push('<div class="xp-next">' + (META.dailyDone()
    ? "Next Daily Operation in " + META.hoursToReset() + "h"
    : "Today&rsquo;s Daily Operation is still open") + "</div>");
  el.innerHTML = rows.join("");
  /* Fill on the next frame so the CSS transition actually runs — a bar
     that is already full when it appears reads as a static label. */
  const bar = el.querySelector(".xp-bar i");
  if (bar) requestAnimationFrame(() => {
    bar.style.width = Math.round(META.levelPct() * 100) + "%";
  });
}

/* The command deck's return hook: today's operation, its streak, and
   how long is left to run it. */
function renderDaily(){
  const el = document.getElementById("daily-card");
  if (!el) return;
  META.rollDailyIfNeeded();
  const d = META.data.daily;
  const done = META.dailyDone();
  el.className = "daily-card" + (done ? " done" : "");
  el.innerHTML =
    "<div>" +
      '<div class="dc-t">Daily Operation</div>' +
      '<div class="dc-s">' + (done
        ? "Complete — best " + fmt(d.best) + " · resets in " + META.hoursToReset() + "h"
        : "The same arena for every player · " + META.hoursToReset() + "h left") + "</div>" +
    "</div>" +
    '<div class="dc-right">' +
      (d.streak > 0 ? '<span class="dc-streak">' + d.streak + " day streak</span>" : "") +
      (done ? "" : '<button class="btn small" data-act="daily-play">&#9654;&nbsp; Run it</button>') +
    "</div>";
}

/* Three errands a day, drawn from stats the game already collects. */
function renderContracts(){
  const el = document.getElementById("contracts");
  if (!el) return;
  const list = (META.data.contracts && META.data.contracts.list) || [];
  if (!list.length) { el.innerHTML = ""; return; }
  el.innerHTML = '<div class="tab-h">Daily contracts</div><ul>' +
    list.map(c =>
      '<li class="' + (c.done ? "done" : "") + '"><span>' + c.text + "</span>" +
      "<span>" + (c.done ? "PAID" : "+" + c.pay + " salvage") + "</span></li>").join("") +
    "</ul>";
}

/* ================================================================
   FIELD REFIT — the perk draft
   ----------------------------------------------------------------
   Three run-scoped upgrades between every sector. Rendered fresh each
   time so the offer is a genuine roll rather than a fixed ladder.
   ================================================================ */
function renderPerkDraft(){
  const el = document.getElementById("perk-grid");
  if (!el) return;
  const sub = document.getElementById("perk-sub");
  if (sub) sub.textContent = "Sector " + (GAME.level + 1) + " loadout";
  /* Operator level 7 widens the draft — one of the unlock ladder's
     rewards, and the only one that changes a screen's shape. */
  const n = META.has("perk_slot") ? 4 : 3;
  const offer = PERKS.roll(n);
  el.classList.toggle("wide", n > 3);
  el.innerHTML = offer.map(p =>
    '<button class="perk-card" data-act="perk-take" data-perk="' + p.id + '" style="--pk:' + p.color + '">' +
      '<span class="perk-name">' + p.name + "</span>" +
      '<span class="perk-desc">' + p.desc + "</span>" +
      (PERKS.count(p.id) ? '<span class="perk-stack">EQUIPPED &times;' + PERKS.count(p.id) + "</span>" : "") +
    "</button>").join("");
  /* What the build already is, so the choice has context. */
  const taken = document.getElementById("perk-taken");
  if (taken) {
    const names = PERKS.taken.map(id => {
      const d = PERKS.DEFS.find(x => x.id === id);
      return d ? d.name : null;
    }).filter(Boolean);
    taken.innerHTML = names.length
      ? '<span class="pt-h">Current build</span>' + names.map(n2 => '<span class="pt-i">' + n2 + "</span>").join("")
      : "";
  }
}

/* ================================================================
   OPERATION TYPE (game mode) SELECTION
   ================================================================ */
/* Operations gated behind the operator ladder. Everything not listed is
   always available — the ladder should read as a reason to keep playing,
   not as most of the game being withheld. */
const MODE_LOCK = {
  survival: { id: "mode_survival", lvl: 2 },
  basewar:  { id: "mode_basewar",  lvl: 5 },
  endless:  { id: "mode_endless",  lvl: 10 },
  team:     { id: "mode_team",     lvl: 20 },
};
function modeLocked(id){
  const L = MODE_LOCK[id];
  return !!(L && !META.has(L.id));
}
function renderModes(){
  const el = document.getElementById("mode-list");
  if (!el) return;
  el.innerHTML = MODE_ORDER.map(id => {
    const M = MODES[id];
    const on = GAME.mode === id ? " on" : "";
    const lock = MODE_LOCK[id];
    const locked = modeLocked(id);
    return '<button class="mode-card' + on + (locked ? " locked" : "") +
             '" data-act="mode-pick" data-mode="' + id + '"' + (locked ? " disabled" : "") + ">" +
             '<span class="mode-name">' + M.name + "</span>" +
             (locked
               ? '<span class="mode-lock">Operator ' + lock.lvl + " required</span>"
               : '<span class="mode-sub">' + M.sub + "</span>") +
           "</button>";
  }).join("");
}
function renderLocations(){
  const el = document.getElementById("set-location");
  if (!el) return;
  el.innerHTML =
    '<option value="random">Random</option>' +
    '<option value="rotate">Rotate by sector</option>' +
    THEMES.map((t, i) => '<option value="' + i + '">' + t.name + "</option>").join("");
  el.value = SETTINGS.location === undefined ? "random" : String(SETTINGS.location);
}
function renderDifficulties(){
  const el = document.getElementById("set-diff");
  if (!el) return;
  el.innerHTML = DIFF_ORDER.map(id => '<option value="' + id + '">' + DIFF_NAMES[id] + "</option>").join("");
  el.value = DIFF_ORDER.includes(SETTINGS.difficulty) ? SETTINGS.difficulty : "master";
}
/* Squad size: how many tanks each side fields in the two team modes.
   Both sides always get the same number, so the match stays a mirror. */
function renderSquadSizes(){
  const el = document.getElementById("set-teamsize");
  if (!el) return;
  let html = "";
  for (let n = CFG.SQUAD_MIN; n <= CFG.SQUAD_MAX; n++)
    html += '<option value="' + n + '">' + n + " v " + n + "</option>";
  el.innerHTML = html;
  el.value = String(clamp(SETTINGS.teamSize | 0, CFG.SQUAD_MIN, CFG.SQUAD_MAX));
}
function refreshModeLabel(){
  const el = document.getElementById("main-mode");
  const M = GAME.def();
  // the squad-size control only belongs to the team modes
  document.querySelectorAll(".team-only").forEach(n => { n.hidden = !M.squad; });
  if (!el) return;
  const loc = SETTINGS.location;
  const locName = loc === "random" ? "RANDOM"
    : loc === "rotate" ? "ROTATING"
    : (THEMES[+loc] ? THEMES[+loc].name : "RANDOM");
  el.textContent = "OPERATION — " + M.name + "   ·   ZONE — " + locName +
    (M.squad ? "   ·   " + GAME.squadSize() + " v " + GAME.squadSize() : "");
}

function syncSettingsUI(){
  const s = SETTINGS;
  const setRange = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.style.setProperty("--fill", (v / el.max * 100) + "%");
  };
  setRange("set-sfx", s.sfx);
  setRange("set-music", s.music);
  setRange("set-shake", s.shake);
  document.getElementById("set-quality").value = s.quality;
  document.getElementById("set-diff").value = s.difficulty;
  document.getElementById("set-crt").checked = s.crt;
  document.getElementById("set-fps").checked = s.fps;
  document.body.classList.toggle("crt-on", s.crt);
}
function bindUI(){
  document.getElementById("ui").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    /* A control that cannot act still answers. Silence on a disabled
       button reads as a broken interface; a short muted thud reads as
       "not right now", which is the truth. */
    if (btn.disabled) { AUDIO.uiDenied(); return; }
    if (CG.busy()) return;                   // no input while an ad is in flight
    const act = btn.dataset.act;
    if (act === "play" || act === "retry" || act === "restart" || act === "next") AUDIO.uiDeploy();
    else if (act === "tab") AUDIO.uiTab();
    else if (act === "mode-pick") AUDIO.uiSelect();
    else if (act === "quit" || act === "back-main" || act === "intro-skip") AUDIO.uiBack();
    else if (act === "intro-next" || act === "intro-prev") { /* INTRO plays its own page turn */ }
    else AUDIO.uiClick();
    switch (act) {
      /* --- CrazyGames rewarded-ad offers --- */
      case "rw-ad":  claimReward(btn.dataset.rw, btn.dataset.cont, true); break;
      case "rw-buy": claimReward(btn.dataset.rw, btn.dataset.cont, false); break;

      /* --- CrazyGames log in: the platform auth prompt, opened only by
             this button. The auth listener updates the profile and the
             menu; a successful sign-in is then the one moment the
             account-link modal is offered unprompted. (On CrazyGames a
             data-module game may instead be reloaded by the platform on
             login — then the badge's Link button covers the same ask.) */
      case "cg-login":
        (async () => {
          const user = await CG.account.login();
          if (user) await linkAccountFlow();
        })();
        break;
      /* --- CrazyGames account link: the platform's standard modal. --- */
      case "cg-link": linkAccountFlow(); break;

      /* --- first-run briefing --- */
      case "intro-next": INTRO.next(); break;
      case "intro-prev": INTRO.go(-1); break;
      case "intro-skip": INTRO.finish(); break;
      case "intro-replay": INTRO.show(); break;

      case "play": lockLandscape(); GAME.startRun(GAME.mode); break;
      /* The daily card's own deploy button: it selects the mode as well
         as starting it, so the player never has to find it in the list. */
      case "daily-play":
        GAME.mode = "daily";
        renderModes();
        lockLandscape();
        GAME.startRun("daily");
        break;
      /* Every menu section is a tab inside the single main menu. */
      case "tab": {
        const id = btn.dataset.tab;
        document.querySelectorAll("#scr-main .tab").forEach(t => t.classList.toggle("on", t === btn));
        document.querySelectorAll("#scr-main .tabpanel").forEach(pn => pn.classList.toggle("on", pn.id === id));
        if (id === "tab-record") { renderRecords(); renderFriends(); }
        break;
      }
      case "mode-pick":
        if (modeLocked(btn.dataset.mode)) { AUDIO.uiDenied(); break; }
        GAME.mode = btn.dataset.mode;
        SAVE.data.lastMode = GAME.mode;
        SAVE.persist();
        renderModes();
        refreshModeLabel();
        break;
      case "back-main": showScreen("scr-main"); break;
      case "resume": GAME.resume(); break;
      case "restart": GAME.startRun(); break;
      case "quit": GAME.quitToMenu(); break;
      /* Restarting after a death is a map change — the documented
         moment for a midgame ad. Never chained onto a rewarded ad. */
      case "retry":
        (async () => {
          if (CG.rewardCooldownLeft() === 0) await CG.midgame();
          /* Redeploy resumes from the banked checkpoint. Being sent back
             to sector one after a fifteen-minute climb is the moment
             most players close the tab. */
          GAME.startRun(GAME.mode, META.data.checkpoint || 1);
        })();
        break;
      case "next": GAME.nextLevel(); break;
      /* Advance routes through the refit draft; taking a card is what
         actually opens the next sector. */
      case "perk-open": renderPerkDraft(); showScreen("scr-perk"); break;
      case "perk-take":
        PERKS.take(btn.dataset.perk);
        GAME.nextLevel();
        break;
      case "wipe":
        SAVE.wipe();
        SETTINGS = SAVE.data.settings;
        syncSettingsUI();
        renderRecords();
        refreshMainBest();
        renderAccount();     // the wipe also cleared the account link
        break;
    }
  });
  // live settings
  const onRange = (id, key) => {
    const el = document.getElementById(id);
    let tickT = 0;
    el.addEventListener("input", () => {
      SETTINGS[key] = parseFloat(el.value);
      el.style.setProperty("--fill", (el.value / el.max * 100) + "%");
      AUDIO.applyVolumes();
      /* A slider that moves in silence feels dead, but one tick per input
         event is a machine-gun — rate-limit to something a hand can hear
         as individual detents. */
      const now = performance.now();
      if (now - tickT > 55) { tickT = now; AUDIO.uiTick(el.value / el.max); }
      SAVE.persist();
    });
  };
  // audible feedback on every menu control
  const ui = document.getElementById("ui");
  ui.addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT") AUDIO.uiSelect();
    else if (e.target.type === "checkbox") AUDIO.uiToggle(e.target.checked);
  });
  ui.addEventListener("pointerover", (e) => {
    const t = e.target.closest(".btn, .tab, .mode-card");
    if (t && !t.disabled && !INPUT.usingTouch) AUDIO.uiHover();
  });
  onRange("set-sfx", "sfx");
  onRange("set-music", "music");
  onRange("set-shake", "shake");
  document.getElementById("set-quality").addEventListener("change", (e) => {
    SETTINGS.quality = e.target.value;
    resolveQuality();
    SAVE.persist();
  });
  document.getElementById("set-location").addEventListener("change", (e) => {
    SETTINGS.location = e.target.value;
    SAVE.persist();
    refreshModeLabel();
    applyZoneTheme();          // the deck recolours to the chosen zone
  });
  document.getElementById("set-teamsize").addEventListener("change", (e) => {
    SETTINGS.teamSize = clamp(+e.target.value || CFG.SQUAD_MIN, CFG.SQUAD_MIN, CFG.SQUAD_MAX);
    AUDIO.uiSelect();
    SAVE.persist();
    refreshModeLabel();
  });
  document.getElementById("set-diff").addEventListener("change", (e) => {
    SETTINGS.difficulty = e.target.value;
    SAVE.persist();
  });
  document.getElementById("set-crt").addEventListener("change", (e) => {
    SETTINGS.crt = e.target.checked;
    document.body.classList.toggle("crt-on", SETTINGS.crt);
    SAVE.persist();
  });
  document.getElementById("set-fps").addEventListener("change", (e) => {
    SETTINGS.fps = e.target.checked;
    SAVE.persist();
  });
}

/* ================================================================
   SECTION 16 — AUTO-QUALITY / RESIZE / MAIN LOOP / BOOT
   ================================================================ */
const FPSMON = {
  acc: 0, n: 0, fps: 60, checkT: 0,
  tick(realDt){
    this.acc += realDt; this.n++;
    if (this.acc >= 0.5) {
      this.fps = this.n / this.acc;
      this.acc = 0; this.n = 0;
    }
    if (SETTINGS.quality !== "auto") return;
    this.checkT += realDt;
    if (this.checkT < 2.5) return;
    this.checkT = 0;
    if (this.fps < 46 && autoTier < QUALITY_TIERS.length - 1) { autoTier++; resolveQuality(); }
    else if (this.fps > 57 && autoTier > 0 && GAME.state !== "playing") { autoTier--; resolveQuality(); }
  },
};
function resolveQuality(){
  QT = SETTINGS.quality === "auto"
    ? QUALITY[QUALITY_TIERS[clamp(autoTier, 0, QUALITY_TIERS.length - 1)]]
    : (QUALITY[SETTINGS.quality] || QUALITY.ultra);
  resize();
}
/* Portrait is playable, not blocked.
   ----------------------------------------------------------------
   A phone opened upright used to hit a full stop here: PORTRAIT_BLOCKED
   made frame() return before any simulation ran, so the game was frozen
   behind a rotate prompt. Almost everyone opens a link holding the
   phone upright, and that single gate is most of the 29-point gap
   between desktop conversion (53.99%) and mobile (24.46%).

   A top-down game does not need landscape — a portrait viewport is
   simply a taller, narrower camera window, and CAM.follow() already
   clamps correctly for any aspect ratio. The flag stays because frame()
   reads it, but nothing sets it true any more. */
let PORTRAIT_BLOCKED = false;
let PORTRAIT_MODE = null;
let PORTRAIT_HINTED = false;
/* The camera's resting zoom for the current window shape. A tall
   portrait window shows far less arena across, so it pulls back to keep
   roughly the same amount of map in view. Everything that sets tzoom
   goes through this, or a sector change or a boss wave would silently
   snap a phone back to the landscape framing. */
function baseZoom(){ return PORTRAIT_MODE ? 0.82 : 1; }
/* Best-effort hardware orientation lock, from inside the deploy gesture.
   Browsers only honour it while the document is fullscreen and only on
   phones, so every failure path is silent — the rotate gate below is the
   guarantee that the game never runs in portrait. */
function lockLandscape(){
  if (!INPUT.touchDevice()) return;
  const so = screen && screen.orientation;
  if (!so || typeof so.lock !== "function") return;
  try {
    const r = so.lock("landscape");
    if (r && typeof r.catch === "function") r.catch(() => {});
  } catch (e) { /* unsupported or not fullscreen — the gate covers it */ }
}
function checkOrientation(){
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const portrait = window.innerHeight > window.innerWidth;
  const narrow = !!(coarse && portrait);
  PORTRAIT_BLOCKED = false;                 // never freeze the loop again
  if (narrow === PORTRAIT_MODE) return;
  PORTRAIT_MODE = narrow;
  document.body.classList.toggle("is-portrait", narrow);
  document.body.classList.remove("portrait-block");
  const gate = document.getElementById("rotate-gate");
  if (gate) gate.setAttribute("aria-hidden", "true");
  /* A tall window shows less arena across, so pull the camera back to
     keep roughly the same amount of map in view. */
  CAM.tzoom = baseZoom();
  if (narrow && !PORTRAIT_HINTED && GAME.state === "playing") {
    PORTRAIT_HINTED = true;
    GAME.hint("rotate", "TURN YOUR DEVICE SIDEWAYS FOR A WIDER VIEW");
  }
}
function readSafeArea(){
  const el = document.getElementById("safe-probe");
  if (!el) return;
  const cs = getComputedStyle(el);
  SAFE.t = parseFloat(cs.paddingTop) || 0;
  SAFE.r = parseFloat(cs.paddingRight) || 0;
  SAFE.b = parseFloat(cs.paddingBottom) || 0;
  SAFE.l = parseFloat(cs.paddingLeft) || 0;
}
function resize(){
  W = window.innerWidth; H = window.innerHeight;
  UIS = clamp(Math.min(W / 1280, H / 720), 1, 1.45);
  readSafeArea();
  checkOrientation();
  DPR = Math.min(window.devicePixelRatio || 1, QT.dpr);
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
}

/* The briefing carries one control list per input device. INPUT decides
   which is current — and can change its mind when a hybrid laptop's
   owner reaches for the mouse — so the body class tracks it. */
let _touchClass = null;
function syncInputClass(){
  if (_touchClass === INPUT.usingTouch) return;
  _touchClass = INPUT.usingTouch;
  document.body.classList.toggle("is-touch", _touchClass);
}

let lastT = 0, acc = 0;
/* requestAnimationFrame is re-armed first so the loop survives a throw,
   but the frame itself is still lost and the error still reports as a
   crash — so the body runs inside a guard and the input queue is
   drained either way, or a stuck key would persist into the next frame. */
function frame(tms){
  requestAnimationFrame(frame);
  try { frameStep(tms); }
  catch (e) { SAFETY._log("frame", e); SAFETY.run(() => INPUT.endFrame(), null, "frame-end"); }
}
function frameStep(tms){
  syncInputClass();
  const t = tms / 1000;
  let realDt = Math.min(0.1, t - lastT || 0.016);
  lastT = t;
  FPSMON.tick(realDt);
  INPUT.pollPad();

  /* An ad is being requested or is playing: the game must not
     progress and input must not reach it (CrazyGames requirement).
     Rendering continues so the frozen frame stays behind the overlay. */
  if (CG.busy() || PORTRAIT_BLOCKED) {
    render(t);
    INPUT.endFrame();
    return;
  }

  // pause toggle
  if (INPUT.pauseHit()) {
    if (GAME.state === "playing") GAME.pause();
    else if (GAME.state === "paused") GAME.resume();
  }

  // touch thumb-zone guide fades on its own clock, and the moment a
  // finger lands it has served its purpose
  if (GAME.touchHintT > 0) {
    if (INPUT.touch.move.id !== -1 || INPUT.touch.aim.id !== -1) GAME.touchHintT = Math.min(GAME.touchHintT, 0.4);
    GAME.touchHintT -= realDt;
  }
  // slow-motion recovery (real-time)
  if (GAME.slowmoT > 0) {
    GAME.slowmoT -= realDt;
    if (GAME.slowmoT <= 0) GAME.timescale = 1;
  }
  // death -> game-over transition (real-time)
  if (GAME.deathRealT > 0) {
    GAME.deathRealT -= realDt;
    if (GAME.deathRealT <= 0) { GAME.deathRealT = -1; GAME.gameOver(); }
  }

  if (GAME.state === "playing") {
    if (GAME.freeze > 0) {
      GAME.freeze -= realDt;
    } else {
      acc += realDt * GAME.timescale;
      let n = 0;
      while (acc >= CFG.STEP && n < CFG.MAX_SUBSTEPS) {
        WORLD.update(CFG.STEP);
        GAME.update(CFG.STEP);
        FX.update(CFG.STEP);
        acc -= CFG.STEP;
        n++;
      }
      if (n === CFG.MAX_SUBSTEPS) acc = 0; // drop backlog on hitch
    }
  }
  render(t);
  INPUT.endFrame();
}

/* ================================================================
   BOOT
   ----------------------------------------------------------------
   Split into an outer guard and an inner sequence. A boot that throws
   used to leave the page on the `booting` curtain with no screens and
   no render loop — a permanent black rectangle, which the platform
   reports as a load crash. Now any failure still drops the curtain,
   opens the command deck and starts the loop.
   ================================================================ */
window.addEventListener("load", () => { bootGame(); });

async function bootGame(){
  try { await boot(); }
  catch (e) {
    SAFETY._log("boot", e);
    document.body.classList.remove("booting");
    SAFETY.run(() => showScreen("scr-main"), null, "boot-fallback");
    requestAnimationFrame(frame);
  }
  SAFETY.booted = true;
}

async function boot(){
  cv = document.getElementById("game");
  ctx = cv && cv.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  /* Initialise the CrazyGames SDK before anything reads saved data: the
     account is read here (every launch, since a device can be shared)
     and the data module preloads that account's progress.

     The handshake gets 2.5 seconds and no more. A slow ad network is
     allowed to cost a moment; it is not allowed to cost the play. When
     the deadline fires the storage layer falls back to localStorage on
     its own and the game boots without the SDK. */
  await SAFETY.deadline(CG.init(), 2500, null);
  CG.loadingStart();
  SAVE.load();
  SETTINGS = SAVE.data.settings;
  META.bind();                    // meta must be live before any UI renders
  CG.applyMute();                 // honour the platform muteAudio setting
  // Phones/tablets and the CrazyGames App start a tier down so weaker
  // devices reach a stable frame rate immediately; auto-quality still
  // adapts from there.
  // Treat a coarse pointer on a small screen as mobile too: the SDK's
  // device type is unavailable off-platform, and Ultra is too heavy for
  // phone GPUs.
  const smallTouch = window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches &&
    Math.min(window.innerWidth, window.innerHeight) <= 820;
  if (CG.device === "mobile" || CG.device === "tablet" || smallTouch) {
    autoTier = 2;
    /* Phones start at Medium, not High. Auto-quality can still climb
       back up once the frame rate proves itself, but the first sector —
       which is where the allocation crash happens — is built at a size a
       low-end GPU can actually hold. */
    if (SETTINGS.quality === "ultra" || SETTINGS.quality === "high") SETTINGS.quality = "med";
  }
  resolveQuality();
  syncSettingsUI();
  refreshMainBest();
  if (SAVE.data.lastMode && MODES[SAVE.data.lastMode] && !modeLocked(SAVE.data.lastMode)) GAME.mode = SAVE.data.lastMode;
  /* From here a sign-in can arrive at any moment through the SDK auth
     listener, and the loaded profile and the menu are ready to follow it. */
  CG.onAccountChange = onAccountChange;
  renderAccount();
  refreshModeLabel();
  renderModes();
  renderLocations();
  renderSquadSizes();
  renderDifficulties();
  applyZoneTheme();
  refreshModeLabel();             // reveals the squad control if a team mode is saved
  INPUT.init(cv);
  bindUI();
  syncInputClass();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));
  checkOrientation();
  CG.loadingStop();               // loading complete
  requestAnimationFrame(frame);
  /* Launch lands in gameplay, not on a menu. Conversion is the share of
     loads that reach gameplayStart(), and every screen between the page
     and the tank spends a share of it — the Basic Launch report put that
     cost at two thirds of everyone who arrives. A first-time operator
     drops into a scripted cold-open sector that teaches by playing; a
     returning one drops into the mode they last chose.

     Nothing is removed: the command deck is one tap away on the HUD and
     through pause, and the four-screen briefing lives on in the Manual
     tab for anyone who wants it. */
  document.body.classList.remove("booting");
  autoDeploy();
}

/* The launch router. Called once, from boot(), after the save, the
   settings and the meta layer are all live. */
function autoDeploy(){
  const first = !SAVE.data.onboarded;
  if (first) {
    /* A first session is not the place to ask a stranger to choose an
       operation type or a difficulty tier. Campaign, adaptive, and a
       scripted opening that cannot kill them in the first minute. */
    GAME.mode = "campaign";
    SETTINGS.difficulty = "adaptive";
    COLDOPEN.arm();
  } else if (SAVE.data.lastMode && MODES[SAVE.data.lastMode] && !modeLocked(SAVE.data.lastMode)) {
    GAME.mode = SAVE.data.lastMode;
  }
  lockLandscape();
  SAFETY.run(() => GAME.startRun(GAME.mode), null, "autodeploy");
}
