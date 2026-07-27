"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/camera.js
   SECTION 5 — Camera: follow, look-ahead, trauma shake, zoom.
   ================================================================ */
/* ================================================================
   SECTION 5 — CAMERA (follow, look-ahead, trauma shake, zoom)
   ================================================================ */
const CAM = {
  x: 0, y: 0, zoom: 1, tzoom: 1,
  trauma: 0, ox: 0, oy: 0, rot: 0,
  snap(x, y){ this.x = x; this.y = y; this.trauma = 0; this.zoom = this.tzoom; },
  follow(target, dt, map){
    // look-ahead toward aim
    let lx = 0, ly = 0;
    if (!INPUT.usingPad && !INPUT.usingTouch) {
      lx = (INPUT.mouse.x - W / 2) * 0.22 / this.zoom;
      ly = (INPUT.mouse.y - H / 2) * 0.22 / this.zoom;
    } else {
      lx = Math.cos(target.tAngle) * 60;
      ly = Math.sin(target.tAngle) * 60;
    }
    const tx = target.x + target.vel.x * 0.14 + lx;
    const ty = target.y + target.vel.y * 0.14 + ly;
    this.x = expLerp(this.x, tx, 5.5, dt);
    this.y = expLerp(this.y, ty, 5.5, dt);
    this.zoom = expLerp(this.zoom, this.tzoom, 3, dt);
    // clamp inside map (with slack when map smaller than view)
    if (map) {
      const mw = map.cols * CFG.TILE, mh = map.rows * CFG.TILE;
      const hw = W / 2 / this.zoom, hh = H / 2 / this.zoom;
      if (mw > hw * 2) this.x = clamp(this.x, hw - 24, mw - hw + 24); else this.x = mw / 2;
      if (mh > hh * 2) this.y = clamp(this.y, hh - 24, mh - hh + 24); else this.y = mh / 2;
    }
    // trauma-based shake (quadratic falloff feels punchy)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * 16 * SETTINGS.shake;
    this.ox = rand(-1, 1) * sh;
    this.oy = rand(-1, 1) * sh;
    this.rot = rand(-1, 1) * this.trauma * this.trauma * 0.012 * SETTINGS.shake;
  },
  addShake(a){ this.trauma = Math.min(1, this.trauma + a); },
  begin(c){
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(this.rot);
    c.scale(this.zoom, this.zoom);
    c.translate(-this.x + this.ox, -this.y + this.oy);
  },
  end(c){ c.restore(); },
  screenToWorld(sx, sy){
    return {
      x: (sx - W / 2) / this.zoom + this.x - this.ox,
      y: (sy - H / 2) / this.zoom + this.y - this.oy,
    };
  },
  worldToScreen(wx, wy){
    return {
      x: (wx - this.x + this.ox) * this.zoom + W / 2,
      y: (wy - this.y + this.oy) * this.zoom + H / 2,
    };
  },
  visible(){
    const hw = W / 2 / this.zoom + 64, hh = H / 2 / this.zoom + 64;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  },
};
