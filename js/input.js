"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/input.js
   SECTION 4 — Input: keyboard, mouse, gamepad, dual virtual touch sticks.
   ================================================================ */
/* ================================================================
   SECTION 4 — INPUT (keyboard / mouse / gamepad / touch)
   ================================================================ */
const INPUT = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, down: false },
  padIndex: -1,
  pad: { mx: 0, my: 0, ax: 0, ay: 0, fire: false, bomb: false, bombPrev: false, boost: false, pausePrev: false, pauseHit: false },
  usingPad: false,
  usingTouch: false,
  touch: {
    move: { id: -1, sx: 0, sy: 0, x: 0, y: 0 },
    aim:  { id: -1, sx: 0, sy: 0, x: 0, y: 0 },
    bombTapT: 0,
  },

  init(canvas){
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return void this._swallow(e);
      this.keys.add(e.code);
      this.pressed.add(e.code);
      AUDIO.resume();
      this._swallow(e);
    });
    window.addEventListener("keyup", (e) => { this.keys.delete(e.code); });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouse.down = false;
      if (GAME.state === "playing") GAME.pause();
    });
    canvas.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.usingPad = false;
    });
    canvas.addEventListener("mousedown", (e) => {
      AUDIO.resume();
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    /* touch: left half = move stick, right half = aim/fire stick */
    const touchXY = (t) => ({ x: t.clientX, y: t.clientY });
    canvas.addEventListener("touchstart", (e) => {
      AUDIO.resume();
      this.usingTouch = true;
      for (const t of e.changedTouches) {
        const p = touchXY(t);
        if (p.x < window.innerWidth / 2 && this.touch.move.id === -1) {
          this.touch.move = { id: t.identifier, sx: p.x, sy: p.y, x: p.x, y: p.y };
        } else if (this.touch.aim.id === -1) {
          this.touch.aim = { id: t.identifier, sx: p.x, sy: p.y, x: p.x, y: p.y };
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        const p = touchXY(t);
        if (t.identifier === this.touch.move.id) { this.touch.move.x = p.x; this.touch.move.y = p.y; }
        if (t.identifier === this.touch.aim.id)  { this.touch.aim.x = p.x;  this.touch.aim.y = p.y; }
      }
      e.preventDefault();
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.move.id) {
          // quick tap on move side = bomb
          if (dist(this.touch.move.sx, this.touch.move.sy, this.touch.move.x, this.touch.move.y) < 14)
            this.touch.bombTapT = 0.1;
          this.touch.move.id = -1;
        }
        if (t.identifier === this.touch.aim.id) this.touch.aim.id = -1;
      }
      e.preventDefault();
    };
    canvas.addEventListener("touchend", touchEnd, { passive: false });
    canvas.addEventListener("touchcancel", touchEnd, { passive: false });

    window.addEventListener("gamepadconnected", (e) => { this.padIndex = e.gamepad.index; });
    window.addEventListener("gamepaddisconnected", () => { this.padIndex = -1; this.usingPad = false; });
  },
  _swallow(e){
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
  },

  pollPad(){
    this.pad.pauseHit = false;
    if (this.padIndex < 0) return;
    const gp = navigator.getGamepads && navigator.getGamepads()[this.padIndex];
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const mx = dz(gp.axes[0] || 0), my = dz(gp.axes[1] || 0);
    const ax = dz(gp.axes[2] || 0), ay = dz(gp.axes[3] || 0);
    this.pad.mx = mx; this.pad.my = my; this.pad.ax = ax; this.pad.ay = ay;
    const rt = gp.buttons[7] && gp.buttons[7].value > 0.3;
    const aBtn = gp.buttons[0] && gp.buttons[0].pressed;
    this.pad.fire = rt || aBtn || Math.hypot(ax, ay) > 0.85;
    const bombNow = (gp.buttons[2] && gp.buttons[2].pressed) || (gp.buttons[5] && gp.buttons[5].pressed);
    this.pad.bomb = bombNow && !this.pad.bombPrev;
    this.pad.bombPrev = bombNow;
    this.pad.boost = (gp.buttons[4] && gp.buttons[4].pressed) || (gp.buttons[6] && gp.buttons[6].value > 0.3);
    const pauseNow = gp.buttons[9] && gp.buttons[9].pressed;
    this.pad.pauseHit = pauseNow && !this.pad.pausePrev;
    this.pad.pausePrev = pauseNow;
    if (mx || my || ax || ay || this.pad.fire) this.usingPad = true;
  },

  isDown(code){ return this.keys.has(code); },
  wasPressed(code){ return this.pressed.has(code); },
  endFrame(){ this.pressed.clear(); if (this.touch.bombTapT > 0) this.touch.bombTapT = 0; },

  moveAxis(){
    let x = 0, y = 0;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) x -= 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) y -= 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) y += 1;
    x += this.pad.mx; y += this.pad.my;
    if (this.touch.move.id !== -1) {
      const dx = this.touch.move.x - this.touch.move.sx;
      const dy = this.touch.move.y - this.touch.move.sy;
      const d = Math.hypot(dx, dy);
      if (d > 8) { const s = Math.min(1, d / 56); x += (dx / d) * s; y += (dy / d) * s; }
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  },
  /* returns { ang, has } — aim direction override from pad/touch */
  aimOverride(){
    if (this.usingPad && (this.pad.ax || this.pad.ay))
      return { ang: Math.atan2(this.pad.ay, this.pad.ax), has: true };
    if (this.touch.aim.id !== -1) {
      const dx = this.touch.aim.x - this.touch.aim.sx;
      const dy = this.touch.aim.y - this.touch.aim.sy;
      if (Math.hypot(dx, dy) > 12) return { ang: Math.atan2(dy, dx), has: true };
    }
    return { ang: 0, has: false };
  },
  firing(){
    return this.mouse.down || this.pad.fire ||
      (this.touch.aim.id !== -1 &&
        Math.hypot(this.touch.aim.x - this.touch.aim.sx, this.touch.aim.y - this.touch.aim.sy) > 12);
  },
  bombHit(){ return this.wasPressed("Space") || this.pad.bomb || this.touch.bombTapT > 0; },
  boostDown(){ return this.isDown("ShiftLeft") || this.isDown("ShiftRight") || this.pad.boost; },
  pauseHit(){ return this.wasPressed("Escape") || this.wasPressed("KeyP") || this.pad.pauseHit; },
};
