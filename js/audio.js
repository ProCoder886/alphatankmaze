"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/audio.js
   SECTION 3 — Procedural audio engine: Web Audio SFX, engine loop, generative adaptive music. Zero audio files.
   ================================================================ */
/* ================================================================
   SECTION 3 — PROCEDURAL AUDIO ENGINE
   All SFX and music are synthesized in real time via Web Audio.
   Zero audio files. Adaptive music intensity driven by combat.
   ================================================================ */
const AUDIO = {
  ctx: null, master: null, sfxBus: null, musicBus: null,
  noiseBuf: null,
  engineOsc: null, engineOsc2: null, engineFilter: null, engineGain: null,
  music: { playing: false, step: 0, nextT: 0, intensity: 0.2, timer: null, chord: 0 },
  _lastPing: 0,
  /* Muted while a CrazyGames video ad plays, or when the platform
     muteAudio setting is on. Applied at the master bus so it
     overrides the in-game volume sliders, as the SDK requires. */
  muted: false,

  init(){
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 8;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    // pre-render 1s of white noise
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  },
  resume(){
    this.init();
    // iOS parks the context in "interrupted" after a call or backgrounding;
    // both states need an explicit resume from a user gesture.
    if (this.ctx && (this.ctx.state === "suspended" || this.ctx.state === "interrupted")) {
      const p = this.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  },
  applyVolumes(){
    if (!this.ctx) return;
    this.sfxBus.gain.value = SETTINGS.sfx * SETTINGS.sfx;
    this.musicBus.gain.value = SETTINGS.music * SETTINGS.music * 0.7;
    this.master.gain.value = this.muted ? 0 : 0.9;
  },
  setMuted(m){
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
  },
  now(){ return this.ctx ? this.ctx.currentTime : 0; },

  /* --- primitive synth helpers --- */
  tone(o){
    if (!this.ctx) return;
    const t = o.t !== undefined ? o.t : this.now();
    const osc = this.ctx.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.dur || 0.1));
    const g = this.ctx.createGain();
    const vol = o.vol !== undefined ? o.vol : 0.2;
    const atk = o.attack !== undefined ? o.attack : 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.1));
    osc.connect(g); g.connect(o.bus || this.sfxBus);
    osc.start(t); osc.stop(t + (o.dur || 0.1) + 0.05);
  },
  noise(o){
    if (!this.ctx) return;
    const t = o.t !== undefined ? o.t : this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = this.ctx.createBiquadFilter();
    f.type = o.filter || "lowpass";
    f.frequency.setValueAtTime(o.ff || 1000, t);
    if (o.ff2 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.ff2), t + (o.dur || 0.2));
    f.Q.value = o.q || 0.8;
    const g = this.ctx.createGain();
    const vol = o.vol !== undefined ? o.vol : 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.2));
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t); src.stop(t + (o.dur || 0.2) + 0.05);
  },

  /* --- combat SFX --- */
  shoot(){
    this.noise({ dur: 0.09, filter: "highpass", ff: 900, vol: 0.24 });
    this.tone({ f: 260, f2: 90, dur: 0.09, type: "square", vol: 0.14 });
  },
  enemyShoot(){
    this.noise({ dur: 0.08, filter: "highpass", ff: 700, vol: 0.13 });
    this.tone({ f: 180, f2: 70, dur: 0.08, type: "square", vol: 0.08 });
  },
  heavyShoot(){
    this.noise({ dur: 0.16, filter: "lowpass", ff: 1400, ff2: 200, vol: 0.28 });
    this.tone({ f: 110, f2: 45, dur: 0.16, type: "square", vol: 0.16 });
  },
  sniperShoot(){
    this.noise({ dur: 0.06, filter: "highpass", ff: 2400, vol: 0.3 });
    this.tone({ f: 1600, f2: 300, dur: 0.14, type: "sawtooth", vol: 0.12 });
  },
  ricochet(){
    const t = this.now();
    if (t - this._lastPing < 0.05) return;
    this._lastPing = t;
    this.tone({ f: rand(2200, 2900), f2: rand(1100, 1400), dur: 0.09, type: "triangle", vol: 0.12 });
    this.noise({ dur: 0.03, filter: "highpass", ff: 3000, vol: 0.08 });
  },
  brickBreak(){
    this.noise({ dur: 0.18, filter: "bandpass", ff: 420, q: 1.6, vol: 0.26 });
    this.tone({ f: 150, f2: 60, dur: 0.12, type: "triangle", vol: 0.1 });
  },
  explosion(size){
    size = clamp(size || 0.5, 0, 1.4);
    this.noise({ dur: 0.45 + size * 0.5, filter: "lowpass", ff: 1100, ff2: 70, vol: 0.34 + size * 0.28, attack: 0.002 });
    this.tone({ f: 90, f2: 28, dur: 0.4 + size * 0.4, type: "sine", vol: 0.3 + size * 0.2 });
    if (size > 0.6) this.noise({ dur: 0.2, filter: "highpass", ff: 1800, vol: 0.16 });
  },
  hurt(){ this.tone({ f: 200, f2: 80, dur: 0.14, type: "sawtooth", vol: 0.2 }); },
  shieldHit(){ this.tone({ f: 950, f2: 620, dur: 0.12, type: "sine", vol: 0.16 }); },
  pickup(){
    const t = this.now();
    this.tone({ t, f: 660, dur: 0.07, type: "sine", vol: 0.14 });
    this.tone({ t: t + 0.07, f: 880, dur: 0.07, type: "sine", vol: 0.14 });
    this.tone({ t: t + 0.14, f: 1320, dur: 0.12, type: "sine", vol: 0.14 });
  },
  bombPlant(){
    this.tone({ f: 520, dur: 0.05, type: "square", vol: 0.12 });
    this.noise({ dur: 0.05, filter: "highpass", ff: 1200, vol: 0.08 });
  },
  beep(f){ this.tone({ f: f || 880, dur: 0.05, type: "square", vol: 0.09 }); },
  emp(){
    this.tone({ f: 180, f2: 2400, dur: 0.5, type: "sawtooth", vol: 0.18 });
    this.noise({ dur: 0.5, filter: "highpass", ff: 800, ff2: 4000, vol: 0.14 });
  },
  laserLock(){ this.tone({ f: 1450, dur: 0.06, type: "sine", vol: 0.07 }); },
  uiClick(){ this.resume(); this.tone({ f: 740, f2: 620, dur: 0.05, type: "triangle", vol: 0.1 }); },
  waveFanfare(){
    const t = this.now();
    this.tone({ t, f: 440, dur: 0.12, type: "triangle", vol: 0.16 });
    this.tone({ t: t + 0.12, f: 660, dur: 0.2, type: "triangle", vol: 0.16 });
  },
  bossAlert(){
    const t = this.now();
    for (let i = 0; i < 3; i++)
      this.tone({ t: t + i * 0.26, f: 240, f2: 200, dur: 0.2, type: "sawtooth", vol: 0.2 });
  },
  playerDeath(){
    this.explosion(1.3);
    this.tone({ f: 300, f2: 40, dur: 1.2, type: "sawtooth", vol: 0.2 });
  },

  /* --- player engine loop --- */
  startEngine(){
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth"; this.engineOsc.frequency.value = 62;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = "sawtooth"; this.engineOsc2.frequency.value = 63.5;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass"; this.engineFilter.frequency.value = 280;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxBus);
    this.engineOsc.start(); this.engineOsc2.start();
  },
  setEngine(v){ // v: 0..1 throttle
    if (!this.engineOsc) return;
    const t = this.now();
    this.engineGain.gain.setTargetAtTime(0.02 + v * 0.085, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(58 + v * 85, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(59.5 + v * 88, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(240 + v * 900, t, 0.1);
  },
  stopEngine(){
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); this.engineOsc2.stop(); } catch (e) {}
    this.engineOsc = this.engineOsc2 = this.engineFilter = this.engineGain = null;
  },

  /* --- generative adaptive music ---
     16th-note scheduler; layers gate in with intensity (0..1):
     bass pulse -> hats -> arpeggio -> kick/snare -> pad stabs   */
  startMusic(){
    this.init();
    if (!this.ctx || this.music.playing) return;
    this.music.playing = true;
    this.music.step = 0;
    this.music.chord = 0;
    this.music.nextT = this.now() + 0.1;
    this.music.timer = setInterval(() => this._musicSched(), 40);
  },
  stopMusic(){
    this.music.playing = false;
    if (this.music.timer) { clearInterval(this.music.timer); this.music.timer = null; }
  },
  setIntensity(v){ this.music.intensity = expLerp(this.music.intensity, clamp(v, 0, 1), 2.5, 0.05); },
  _musicSched(){
    if (!this.music.playing) return;
    const m = this.music;
    const bpm = 104 + m.intensity * 30;
    const six = 60 / bpm / 4;
    while (m.nextT < this.now() + 0.14) {
      this._musicStep(m.nextT, m.step, m.intensity);
      m.nextT += six;
      m.step++;
    }
  },
  _musicStep(t, step, int){
    const bus = this.musicBus;
    const s = step % 16;
    const PROG = [0, -4, 3, -2]; // semitone shifts, A minor drift
    if (step % 16 === 0) this.music.chord = ((step / 16) | 0) % 4;
    const semi = PROG[this.music.chord];
    const base = 110 * Math.pow(2, semi / 12);
    // bass pulse
    if (s % 4 === 0)
      this.tone({ t, bus, f: base / 2, dur: 0.16, type: "square", vol: 0.09 + int * 0.05 });
    // hats
    if (int > 0.12 && s % 2 === 1)
      this.noise({ t, bus, dur: 0.03, filter: "highpass", ff: 6000, vol: 0.028 + int * 0.03 });
    // arpeggio (minor pentatonic walk)
    if (int > 0.3 && s % 2 === 0) {
      const scale = [0, 3, 5, 7, 10, 12];
      const n = scale[(step * 5 + this.music.chord) % scale.length];
      this.tone({ t, bus, f: base * 2 * Math.pow(2, n / 12), dur: 0.11, type: "triangle", vol: 0.05 + int * 0.045 });
    }
    // kick
    if (int > 0.42 && (s === 0 || s === 8))
      this.tone({ t, bus, f: 120, f2: 38, dur: 0.12, type: "sine", vol: 0.2 });
    // snare
    if (int > 0.55 && (s === 4 || s === 12))
      this.noise({ t, bus, dur: 0.09, filter: "bandpass", ff: 1400, q: 1.1, vol: 0.09 });
    // pad stab at bar start, high intensity
    if (int > 0.68 && s === 0) {
      this.tone({ t, bus, f: base * 2, dur: 0.7, type: "sawtooth", vol: 0.035, attack: 0.08 });
      this.tone({ t, bus, f: base * 2 * Math.pow(2, 3 / 12), dur: 0.7, type: "sawtooth", vol: 0.03, attack: 0.08 });
    }
  },
};
