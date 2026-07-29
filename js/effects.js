"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/effects.js
   SECTION 6 — Pooled particles, composite FX helpers, dynamic 2D lighting, persistent decals, acoustic events (AI hearing), screen-space FX.
   ================================================================ */
/* ================================================================
   SECTION 6 — PARTICLES / LIGHTING / DECALS / ACOUSTIC EVENTS
   ================================================================ */
const PARTS = {
  pool: [],
  spawn(o){
    if (this.pool.length >= QT.parts) {
      if (!o.vip) return null;
      this.pool.shift();
    }
    const p = {
      x: o.x, y: o.y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 0.5, max: o.life || 0.5,
      size: o.size !== undefined ? o.size : 3,
      size2: o.size2 !== undefined ? o.size2 : (o.size !== undefined ? o.size : 3),
      drag: o.drag !== undefined ? o.drag : 1,
      grav: o.grav || 0,
      rot: o.rot || 0, vr: o.vr || 0,
      type: o.type || "spark",
      color: o.color || "#ffcf7a",
      alpha: o.alpha !== undefined ? o.alpha : 1,
      layer: o.layer !== undefined ? o.layer : 1,
      text: o.text || null,
      vip: !!o.vip,
    };
    this.pool.push(p);
    return p;
  },
  update(dt){
    const arr = this.pool;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      if (p.drag !== 1) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
      p.rot += p.vr * dt;
      // gentle sway for weather
      if (p.type === "snow" || p.type === "leaf" || p.type === "ash")
        p.x += Math.sin(p.life * 3 + p.rot * 7) * 18 * dt;
    }
  },
  draw(c, layer){
    const arr = this.pool;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (p.layer !== layer) continue;
      const t = p.life / p.max;              // 1 -> 0
      const size = lerp(p.size2, p.size, t); // size at spawn -> size2 at death
      const a = p.alpha * Math.min(1, t * 2);
      switch (p.type) {
        case "spark": {
          c.globalCompositeOperation = "lighter";
          c.strokeStyle = p.color;
          c.globalAlpha = a;
          c.lineWidth = Math.max(1, size * 0.5);
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          c.stroke();
          c.globalCompositeOperation = "source-over";
          break;
        }
        case "fire": case "flash": case "trail": {
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = a;
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.5, size));
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = g;
          c.beginPath(); c.arc(p.x, p.y, Math.max(0.5, size), 0, TAU); c.fill();
          c.globalCompositeOperation = "source-over";
          break;
        }
        case "smoke": {
          c.globalAlpha = a * 0.35;
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, Math.max(0.5, size), 0, TAU); c.fill();
          break;
        }
        case "debris": case "casing": {
          c.globalAlpha = a;
          c.fillStyle = p.color;
          c.save();
          c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillRect(-size / 2, -size / 3, size, size * 0.66);
          c.restore();
          break;
        }
        case "ring": {
          const r = lerp(2, p.size, 1 - t);
          c.globalAlpha = a;
          c.strokeStyle = p.color;
          c.lineWidth = Math.max(1, 3 * t);
          c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
          break;
        }
        case "text": {
          c.globalAlpha = Math.min(1, t * 3);
          c.fillStyle = p.color;
          c.font = "700 " + Math.round(p.size) + "px Consolas, monospace";
          c.textAlign = "center";
          c.fillText(p.text, p.x, p.y);
          break;
        }
        case "rain": {
          c.globalAlpha = a * 0.5;
          c.strokeStyle = p.color;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          c.stroke();
          break;
        }
        case "snow": case "ash": {
          c.globalAlpha = a * 0.8;
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, size, 0, TAU); c.fill();
          break;
        }
        case "leaf": {
          c.globalAlpha = a * 0.85;
          c.fillStyle = p.color;
          c.save();
          c.translate(p.x, p.y); c.rotate(p.rot);
          c.beginPath(); c.ellipse(0, 0, size, size * 0.45, 0, 0, TAU); c.fill();
          c.restore();
          break;
        }
        case "dust": {
          c.globalAlpha = a * 0.22;
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, size, 0, TAU); c.fill();
          break;
        }
      }
    }
    c.globalAlpha = 1;
  },
};

/* ---- composite FX helpers ---- */
function fxMuzzle(x, y, ang, scale){
  scale = scale || 1;
  PARTS.spawn({ x, y, type: "flash", size: 26 * scale, size2: 4, life: 0.08, color: "#ffe9b0", layer: 1, vip: true });
  for (let i = 0; i < 5; i++) {
    const a = ang + rand(-0.35, 0.35);
    const sp = rand(180, 420) * scale;
    PARTS.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, type: "spark", size: 3, life: rand(0.06, 0.16), color: "#ffcf7a", drag: 0.86 });
  }
  PARTS.spawn({ x, y, vx: Math.cos(ang) * 40, vy: Math.sin(ang) * 40, type: "smoke", size: 5, size2: 16 * scale, life: 0.5, color: "#9aa3ac", layer: 1 });
  LIGHTS.flash(x, y, 120 * scale, 0.09, 0.9);
}
function fxCasing(x, y, ang){
  const a = ang + Math.PI / 2 + rand(-0.4, 0.4);
  PARTS.spawn({ x, y, vx: Math.cos(a) * rand(60, 130), vy: Math.sin(a) * rand(60, 130), type: "casing", size: 4, life: 0.6, color: "#c8a24a", drag: 0.88, rot: rand(0, TAU), vr: rand(-14, 14), layer: 0 });
}
function fxSmokePuffs(x, y, n, opts){
  opts = opts || {};
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(10, opts.speed || 60);
    PARTS.spawn({
      x: x + rand(-6, 6), y: y + rand(-6, 6),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.rise || 12),
      type: "smoke", size: rand(4, 8), size2: rand(18, opts.big || 34),
      life: rand(0.7, opts.life || 1.6), color: opts.color || "#767d85", drag: 0.94, layer: 1,
    });
  }
}
function fxFireBurst(x, y, n, radius){
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(30, radius * 2.2);
    PARTS.spawn({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      type: "fire", size: rand(10, 22), size2: 2,
      life: rand(0.2, 0.55), color: pick(["#ffd27a", "#ff9a3c", "#ff6b2b", "#ffe9b0"]),
      drag: 0.88, layer: 1, vip: true,
    });
  }
}
function fxSparkBurst(x, y, n, color){
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(120, 460);
    PARTS.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, type: "spark", size: rand(2, 4), life: rand(0.12, 0.4), color: color || "#ffd27a", drag: 0.86 });
  }
}
function fxDebris(x, y, n, color){
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(60, 300);
    PARTS.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, type: "debris", size: rand(3, 8), life: rand(0.4, 1.1), color, drag: 0.88, rot: rand(0, TAU), vr: rand(-16, 16), layer: 0 });
  }
}
function fxRing(x, y, size, color, life){
  PARTS.spawn({ x, y, type: "ring", size, life: life || 0.4, color: color || "#ffffff", vip: true });
}
/* A brief trail from the tank to the point a targeted superpower was
   aimed at, so the player can see where their power was sent. */
function fxTracer(x0, y0, x1, y1, color){
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = clamp(Math.round(d / 22), 2, 26);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    PARTS.spawn({
      x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t,
      type: "trail", size: 5, size2: 0.5,
      life: 0.18 + t * 0.22, color: color || "#8ffff6", layer: 1, vip: true,
    });
  }
  fxRing(x1, y1, 26, color || "#8ffff6", 0.3);
}
function fxText(x, y, text, color, size){
  PARTS.spawn({ x, y, vy: -46, type: "text", text, color: color || "#ffffff", size: size || 15, life: 0.9, vip: true, layer: 1 });
}
function fxExplosionVisual(x, y, radius){
  const s = radius / 100;
  PARTS.spawn({ x, y, type: "flash", size: radius * 1.35, size2: 8, life: 0.14, color: "#fff3d0", vip: true, layer: 1 });
  fxFireBurst(x, y, Math.round(14 + 12 * s), radius * 0.6);
  fxSparkBurst(x, y, Math.round(10 + 10 * s));
  fxSmokePuffs(x, y, Math.round(6 + 6 * s), { speed: 80, big: 44, life: 2.0, color: "#565c63" });
  fxRing(x, y, radius * 1.15, "rgba(255,214,150,0.9)", 0.35);
  LIGHTS.flash(x, y, radius * 2.6, 0.28, 1.0);
}
function fxBrickBurst(x, y, color){
  fxDebris(x, y, 8, color || "#8a5a3b");
  fxSmokePuffs(x, y, 3, { speed: 40, big: 22, life: 0.9, color: "#6e5a4b" });
}
function fxSpawnPortal(x, y, color){
  fxRing(x, y, 64, color || "#ff7a45", 0.7);
  fxRing(x, y, 34, "#ffffff", 0.45);
  fxSparkBurst(x, y, 12, color || "#ff9a5c");
  LIGHTS.flash(x, y, 150, 0.5, 0.7);
}
function fxExhaust(x, y, ang){
  PARTS.spawn({
    x, y, vx: Math.cos(ang) * rand(30, 70), vy: Math.sin(ang) * rand(30, 70),
    type: "fire", size: rand(5, 9), size2: 1, life: rand(0.12, 0.25),
    color: pick(["#7ef0ff", "#46e0d8", "#bffcff"]), drag: 0.9, layer: 0,
  });
}
function fxPickupSparkle(x, y, color){
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU), sp = rand(40, 160);
    PARTS.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, type: "trail", size: rand(3, 6), size2: 1, life: rand(0.25, 0.5), color, drag: 0.9 });
  }
  fxRing(x, y, 40, color, 0.35);
}

/* ---- dynamic 2D lighting: ambient darkness with punched lights ---- */
const LIGHTS = {
  cv: null, cx: null, scale: 1,
  steady: [],   // cleared each frame: {x,y,r,i}
  flashes: [],  // transient:        {x,y,r,ttl,max,i}
  ensure(){
    if (!this.cv) { this.cv = document.createElement("canvas"); this.cx = this.cv.getContext("2d"); }
    const s = QT.lightScale;
    const w = Math.max(2, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.scale = s;
  },
  add(x, y, r, i){ this.steady.push({ x, y, r, i: i === undefined ? 1 : i }); },
  flash(x, y, r, ttl, i){ this.flashes.push({ x, y, r, ttl, max: ttl, i: i === undefined ? 1 : i }); },
  update(dt){
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].ttl -= dt;
      if (this.flashes[i].ttl <= 0) this.flashes.splice(i, 1);
    }
  },
  render(mainCtx, ambient, tint){
    this.steady.length > 400 && (this.steady.length = 400);
    if (ambient <= 0.03) { this.steady.length = 0; return; }
    this.ensure();
    const c = this.cx, s = this.scale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.fillStyle = tint || "rgba(6,10,20," + ambient + ")";
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    c.globalCompositeOperation = "destination-out";
    const punch = (L, mul) => {
      const p = CAM.worldToScreen(L.x, L.y);
      const r = L.r * CAM.zoom * s;
      if (r < 2) return;
      const px = p.x * s, py = p.y * s;
      if (px < -r || py < -r || px > this.cv.width + r || py > this.cv.height + r) return;
      const g = c.createRadialGradient(px, py, 0, px, py, r);
      const a = clamp(L.i * mul, 0, 1);
      g.addColorStop(0, "rgba(0,0,0," + a + ")");
      g.addColorStop(0.55, "rgba(0,0,0," + a * 0.55 + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill();
    };
    for (const L of this.steady) punch(L, 1);
    for (const L of this.flashes) punch(L, L.ttl / L.max);
    this.steady.length = 0;
    mainCtx.drawImage(this.cv, 0, 0, W, H);
  },
};

/* ---- persistent world-space decals: scorch, treads, wrecks ---- */
const DECALS = {
  cv: null, cx: null,
  scale: 1,
  init(w, h){
    // Half-resolution decal layer keeps memory sane on the larger arenas;
    // scorch marks and treads are soft, so the loss is invisible.
    this.scale = (QT.floorScale || 1) >= 1 ? 0.5 : 0.35;
    this.cv = document.createElement("canvas");
    this.cv.width = Math.max(2, Math.round(w * this.scale));
    this.cv.height = Math.max(2, Math.round(h * this.scale));
    this.cx = this.cv.getContext("2d");
    this.cx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.w = w; this.h = h;
  },
  scorch(x, y, r){
    if (!this.cx) return;
    const c = this.cx;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(10,8,6,0.55)");
    g.addColorStop(0.6, "rgba(10,8,6,0.3)");
    g.addColorStop(1, "rgba(10,8,6,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  },
  tread(x, y, ang, w){
    if (!this.cx) return;
    const c = this.cx;
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.fillStyle = "rgba(12,12,14,0.10)";
    c.fillRect(-3, -w, 6, 3.4);
    c.fillRect(-3, w - 3.4, 6, 3.4);
    c.restore();
  },
  wreck(x, y, ang, color, scale){
    if (!this.cx) return;
    const c = this.cx;
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.scale(scale, scale);
    c.fillStyle = "rgba(18,18,20,0.9)";
    c.fillRect(-16, -12, 32, 24);
    c.fillStyle = color;
    c.globalAlpha = 0.25;
    c.fillRect(-14, -10, 28, 20);
    c.globalAlpha = 0.9;
    c.fillStyle = "rgba(8,8,10,0.9)";
    c.beginPath(); c.arc(rand(-4, 4), rand(-4, 4), 8, 0, TAU); c.fill();
    c.restore();
    this.scorch(x, y, 34 * scale);
  },
};

/* ---- acoustic events: AI "hearing" ---- */
const NOISES = {
  list: [],
  add(x, y, r){ this.list.push({ x, y, r, ttl: 0.35 }); },
  update(dt){
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].ttl -= dt;
      if (this.list[i].ttl <= 0) this.list.splice(i, 1);
    }
  },
  heardAt(x, y){
    for (const n of this.list)
      if (dist2(x, y, n.x, n.y) < n.r * n.r) return n;
    return null;
  },
};

/* ---- screen-space FX state ---- */
const FX = {
  flash: 0, flashColor: "255,255,255",
  doFlash(strength, rgb){ this.flash = Math.max(this.flash, strength); this.flashColor = rgb || "255,255,255"; },
  update(dt){ this.flash = Math.max(0, this.flash - dt * 3.2); },
};
