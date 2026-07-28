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
function drawHUD(c, time){
  const pl = WORLD.player;
  if (!pl) return;
  c.textBaseline = "alphabetic";
  const pad = Math.round(16 * UIS);
  const padL = pad + SAFE.l, padR = pad + SAFE.r, padT = pad + SAFE.t;
  /* --- left cluster: HP / shield / boost / bombs / buffs ---
     Every offset scales with UIS so labels, bars and icons keep their
     relative spacing at any viewport size. */
  const LBL = Math.round(42 * UIS);          // label column width
  const barH = Math.round(14 * UIS);
  const rowHp = Math.round(20 * UIS), rowBoost = Math.round(16 * UIS);
  let y = padT;
  const bw = Math.min(230 * UIS, W * 0.32);
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
  /* --- right cluster: score / combo --- */
  c.textAlign = "right";
  c.fillStyle = "rgba(223,233,238,0.6)";
  c.font = "700 " + FS(10) + "px Bahnschrift, 'Segoe UI', sans-serif";
  c.fillText("SCORE", W - padR, padT + FS(9));
  c.fillStyle = "#eaf6fa";
  c.font = "700 " + FS(26) + "px Consolas, monospace";
  c.fillText(fmt(GAME.score), W - padR, padT + FS(37));
  if (GAME.combo.n > 1) {
    const pct = GAME.combo.t / CFG.COMBO_WINDOW;
    const cw = 110 * UIS;
    c.fillStyle = "#8ffff6";
    c.font = "700 " + FS(16) + "px Consolas, monospace";
    c.fillText("x" + GAME.combo.n + " COMBO", W - padR, padT + FS(59));
    c.fillStyle = "rgba(8,12,18,0.6)";
    c.fillRect(W - padR - cw, padT + FS(66), cw, 4 * UIS);
    c.fillStyle = "#8ffff6";
    c.fillRect(W - padR - cw * pct, padT + FS(66), cw * pct, 4 * UIS);
  }
  /* --- superpower rack (top-right, under the score) --- */
  const rackTop = padT + FS(GAME.combo.n > 1 ? 74 : 46);
  drawPowerRack(c, time, W - padR, rackTop);
  /* --- top-center: sector / wave --- */
  c.textAlign = "center";
  c.fillStyle = "rgba(223,233,238,0.65)";
  c.font = "700 " + FS(11) + "px Bahnschrift, 'Segoe UI', sans-serif";
  const MD = GAME.def();
  let waveTxt = MD.name + "  ·  ";
  if (MD.noEnemies) waveTxt += "SECTOR " + GAME.level + "  ·  TARGETS " + GAME.barrelsLeft;
  else if (MD.survival) waveTxt += "WAVE " + Math.max(1, GAME.wave);
  else waveTxt += "SECTOR " + GAME.level + "  ·  WAVE " + Math.max(1, GAME.wave) + "/" + GAME.wavesTotal;
  if (GAME.modifier && GAME.waveState === "active") waveTxt += "  ·  " + GAME.modifier.label;
  c.fillText(waveTxt, W / 2, padT + FS(9));
  // Time Attack clock, red and pulsing in the last ten seconds
  if (MD.timeLimit) {
    const low = GAME.timeLeft <= 10;
    c.fillStyle = low ? "#ff4d5e" : "#eaf6fa";
    c.font = "700 " + FS(low ? 24 : 20) + "px Consolas, monospace";
    c.globalAlpha = low ? 0.65 + 0.35 * Math.abs(Math.sin(time * 8)) : 1;
    c.fillText(padTime(Math.ceil(GAME.timeLeft)), W / 2, padT + FS(34));
    c.globalAlpha = 1;
  }
  /* --- boss bar --- */
  const boss = WORLD.enemies.find(e => e.boss && e.alive);
  if (boss) {
    const bw2 = Math.min(420 * UIS, W * 0.55);
    const bossH = Math.round(12 * UIS);
    const bx2 = W / 2 - bw2 / 2, by2 = padT + FS(20);
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
    c.globalAlpha = a * 0.9;
    c.fillStyle = "rgba(8,12,18,0.55)";
    c.font = "700 " + FS(12) + "px Consolas, monospace";
    const tw = c.measureText(GAME.hintMsg.text).width;
    c.fillRect(W / 2 - tw / 2 - 14 * UIS, H - (74 * UIS) - SAFE.b, tw + 28 * UIS, 26 * UIS);
    c.fillStyle = "#8ffff6";
    c.fillText(GAME.hintMsg.text, W / 2, H - (56 * UIS) - SAFE.b);
    c.globalAlpha = 1;
  }
  /* --- minimap --- */
  MINI.draw(c);
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
    const drawStick = (st) => {
      if (st.id === -1) return;
      c.strokeStyle = "rgba(143,255,246,0.35)";
      c.lineWidth = 2;
      c.beginPath(); c.arc(st.sx, st.sy, 52, 0, TAU); c.stroke();
      c.fillStyle = "rgba(143,255,246,0.4)";
      const dx = clamp(st.x - st.sx, -52, 52), dy = clamp(st.y - st.sy, -52, 52);
      c.beginPath(); c.arc(st.sx + dx, st.sy + dy, 20, 0, TAU); c.fill();
    };
    drawStick(INPUT.touch.move);
    drawStick(INPUT.touch.aim);
  }
  /* --- fps --- */
  if (SETTINGS.fps) {
    c.textAlign = "left";
    c.fillStyle = "rgba(143,255,246,0.7)";
    c.font = "700 " + FS(11) + "px Consolas, monospace";
    c.fillText(FPSMON.fps.toFixed(0) + " FPS · " + (SETTINGS.quality === "auto" ? ["HIGH", "MED", "LOW"][autoTier] + "*" : SETTINGS.quality.toUpperCase()), padL, H - 14 - SAFE.b);
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
  g.addColorStop(1, "#05070a");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // drifting tactical grid
  c.strokeStyle = "rgba(70,224,216,0.05)";
  c.lineWidth = 1;
  const gs = 64;
  const off = (time * 14) % gs;
  c.beginPath();
  for (let x = -gs + off; x < W + gs; x += gs) { c.moveTo(x, 0); c.lineTo(x, H); }
  for (let y = -gs + off; y < H + gs; y += gs) { c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke();
  // radar sweep
  const rx = W * 0.5, ry = H * 0.52, rr = Math.min(W, H) * 0.42;
  c.save();
  c.globalAlpha = 0.6;
  c.strokeStyle = "rgba(70,224,216,0.10)";
  for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(rx, ry, rr * k / 3, 0, TAU); c.stroke(); }
  const sweep = time * 0.9;
  const sg = c.createConicGradient ? c.createConicGradient(sweep, rx, ry) : null;
  if (sg) {
    sg.addColorStop(0, "rgba(70,224,216,0.10)");
    sg.addColorStop(0.12, "rgba(70,224,216,0)");
    sg.addColorStop(1, "rgba(70,224,216,0)");
    c.fillStyle = sg;
    c.beginPath(); c.arc(rx, ry, rr, 0, TAU); c.fill();
  }
  c.restore();
}

function render(time){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!WORLD.map || GAME.state === "menu") {
    renderMenuBackdrop(ctx, time);
    return;
  }
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, W, H);
  const rect = CAM.visible();
  CAM.begin(ctx);
  ctx.drawImage(WORLD.floorCv, 0, 0);
  if (DECALS.cv) ctx.drawImage(DECALS.cv, 0, 0);
  WORLD.map.draw(ctx, WORLD.theme, rect);
  PARTS.draw(ctx, 0);
  drawMines(ctx);
  drawBombs(ctx, time);
  drawBarrels(ctx);
  drawPickups(ctx, time);
  drawStrikes(ctx, time);
  for (const e of WORLD.enemies) e.draw(ctx, time);
  if (WORLD.player) WORLD.player.draw(ctx, time);
  drawDrones(ctx, time);
  drawShells(ctx);
  drawMissiles(ctx);
  PARTS.draw(ctx, 1);
  CAM.end(ctx);
  // dynamic lighting overlay
  LIGHTS.render(ctx, GAME.ambient(), WORLD.theme.lightTint + GAME.ambient() + ")");
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
/* Shows the signed-in CrazyGames username. No in-game account, no login
   flow and no external login options — guests simply see nothing. */
function renderOperator(){
  const el = document.getElementById("cg-operator");
  if (!el) return;
  const name = CG.user && CG.user.username;
  el.textContent = name ? "OPERATOR — " + name : "";
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
  const canBuy = salvage >= R.cost;
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
      '<button class="btn" data-act="rw-buy" data-rw="' + rewardId + '" data-cont="' + containerId + '"' +
        (canBuy ? "" : " disabled") + ">" + R.label + " — " + R.cost + " Salvage</button>" +
    "</div>" +
    '<div class="offer-note' + (blocked ? " blocked" : "") + '">' +
      (blocked ? blocked + "<br>" : "") +
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
   OPERATION TYPE (game mode) SELECTION
   ================================================================ */
function renderModes(){
  const el = document.getElementById("mode-list");
  if (!el) return;
  el.innerHTML = MODE_ORDER.map(id => {
    const M = MODES[id];
    const on = GAME.mode === id ? " on" : "";
    return '<button class="mode-card' + on + '" data-act="mode-pick" data-mode="' + id + '">' +
             '<span class="mode-name">' + M.name + "</span>" +
             '<span class="mode-sub">' + M.sub + "</span>" +
           "</button>";
  }).join("");
}
function refreshModeLabel(){
  const el = document.getElementById("main-mode");
  if (el) el.textContent = "OPERATION — " + GAME.def().name;
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
    if (btn.disabled || CG.busy()) return;   // no input while an ad is in flight
    AUDIO.uiClick();
    switch (btn.dataset.act) {
      /* --- CrazyGames rewarded-ad offers --- */
      case "rw-ad":  claimReward(btn.dataset.rw, btn.dataset.cont, true); break;
      case "rw-buy": claimReward(btn.dataset.rw, btn.dataset.cont, false); break;

      case "play": GAME.startRun(); break;
      case "how": showScreen("scr-how"); break;
      case "settings":
        GAME.settingsReturn = GAME.state === "paused" ? "scr-pause" : "scr-main";
        showScreen("scr-set");
        break;
      case "records": renderRecords(); showScreen("scr-rec"); break;
      case "modes": renderModes(); showScreen("scr-modes"); break;
      case "mode-pick":
        GAME.mode = btn.dataset.mode;
        SAVE.data.lastMode = GAME.mode;
        SAVE.persist();
        renderModes();
        refreshModeLabel();
        showScreen("scr-main");
        break;
      case "back-main": showScreen("scr-main"); break;
      case "set-back":
        SAVE.persist();
        showScreen(GAME.settingsReturn);
        break;
      case "resume": GAME.resume(); break;
      case "restart": GAME.startRun(); break;
      case "quit": GAME.quitToMenu(); break;
      /* Restarting after a death is a map change — the documented
         moment for a midgame ad. Never chained onto a rewarded ad. */
      case "retry":
        (async () => {
          if (CG.rewardCooldownLeft() === 0) await CG.midgame();
          GAME.startRun();
        })();
        break;
      case "next": GAME.nextLevel(); break;
      case "wipe":
        SAVE.wipe();
        SETTINGS = SAVE.data.settings;
        syncSettingsUI();
        renderRecords();
        refreshMainBest();
        break;
    }
  });
  // live settings
  const onRange = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      SETTINGS[key] = parseFloat(el.value);
      el.style.setProperty("--fill", (el.value / el.max * 100) + "%");
      AUDIO.applyVolumes();
    });
  };
  onRange("set-sfx", "sfx");
  onRange("set-music", "music");
  onRange("set-shake", "shake");
  document.getElementById("set-quality").addEventListener("change", (e) => {
    SETTINGS.quality = e.target.value;
    resolveQuality();
  });
  document.getElementById("set-diff").addEventListener("change", (e) => {
    SETTINGS.difficulty = e.target.value;
  });
  document.getElementById("set-crt").addEventListener("change", (e) => {
    SETTINGS.crt = e.target.checked;
    document.body.classList.toggle("crt-on", SETTINGS.crt);
  });
  document.getElementById("set-fps").addEventListener("change", (e) => {
    SETTINGS.fps = e.target.checked;
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
    if (this.fps < 46 && autoTier < 2) { autoTier++; resolveQuality(); }
    else if (this.fps > 57 && autoTier > 0 && GAME.state !== "playing") { autoTier--; resolveQuality(); }
  },
};
function resolveQuality(){
  QT = SETTINGS.quality === "auto"
    ? [QUALITY.high, QUALITY.med, QUALITY.low][autoTier]
    : (QUALITY[SETTINGS.quality] || QUALITY.high);
  resize();
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
  DPR = Math.min(window.devicePixelRatio || 1, QT.dpr);
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
}

let lastT = 0, acc = 0;
function frame(tms){
  requestAnimationFrame(frame);
  const t = tms / 1000;
  let realDt = Math.min(0.1, t - lastT || 0.016);
  lastT = t;
  FPSMON.tick(realDt);
  INPUT.pollPad();

  /* An ad is being requested or is playing: the game must not
     progress and input must not reach it (CrazyGames requirement).
     Rendering continues so the frozen frame stays behind the overlay. */
  if (CG.busy()) {
    render(t);
    INPUT.endFrame();
    return;
  }

  // pause toggle
  if (INPUT.pauseHit()) {
    if (GAME.state === "playing") GAME.pause();
    else if (GAME.state === "paused") GAME.resume();
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

window.addEventListener("load", async () => {
  cv = document.getElementById("game");
  ctx = cv.getContext("2d");
  // Initialise the CrazyGames SDK before anything reads saved data:
  // the data module preloads the player's cross-device progress.
  await CG.init();
  CG.loadingStart();
  SAVE.load();
  SETTINGS = SAVE.data.settings;
  CG.applyMute();                 // honour the platform muteAudio setting
  // Phones/tablets and the CrazyGames App start a tier down so weaker
  // devices reach a stable frame rate immediately; auto-quality still
  // adapts from there.
  if (CG.device === "mobile" || CG.device === "tablet") autoTier = 1;
  resolveQuality();
  syncSettingsUI();
  refreshMainBest();
  if (SAVE.data.lastMode && MODES[SAVE.data.lastMode]) GAME.mode = SAVE.data.lastMode;
  renderOperator();
  refreshModeLabel();
  renderModes();
  renderOffer("offer-main", "supply");
  CG.showBanner("banner-menu");
  INPUT.init(cv);
  bindUI();
  window.addEventListener("resize", resize);
  CG.loadingStop();               // loading complete, menu is interactive
  requestAnimationFrame(frame);
});
