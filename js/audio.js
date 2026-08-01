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
  musicFade: null, musicFilter: null,      // crossfade + "focus" filter sweep
  fxSend: null, delay: null,               // shared delay/space send
  noiseBuf: null,
  engineOsc: null, engineOsc2: null, engineFilter: null, engineGain: null,
  music: {
    playing: false, step: 0, nextT: 0, intensity: 0.2, timer: null, chord: 0,
    mode: "menu",        // "menu" | "combat" | "boss"
    want: "menu",        // mode to switch to on the next bar
    ducked: false,       // paused / overlay: filter and level pulled down
  },
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

    /* Music chain: notes -> fade -> filter -> bus -> master.
       The fade node belongs to the crossfade between menu and combat
       music; the bus stays under the player's volume slider so the two
       never fight over the same gain. The filter is what makes the menu
       read as "focus" music and opens up as a fight escalates. */
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 900;
    this.musicFilter.Q.value = 0.6;
    this.musicFilter.connect(this.musicBus);
    this.musicFade = this.ctx.createGain();
    this.musicFade.gain.value = 1;
    this.musicFade.connect(this.musicFilter);

    /* One shared feedback delay, used as a send by music and by the
       bigger SFX. A little space behind the sounds is most of what
       separates a synthesized game from a scored one, and a single
       delay line costs almost nothing on a weak device. */
    this.fxSend = this.ctx.createGain();
    this.fxSend.gain.value = 1;
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.26;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.34;
    const dFilter = this.ctx.createBiquadFilter();
    dFilter.type = "lowpass";
    dFilter.frequency.value = 2000;
    const dOut = this.ctx.createGain();
    dOut.gain.value = 0.5;
    this.fxSend.connect(this.delay);
    this.delay.connect(dFilter);
    dFilter.connect(fb);
    fb.connect(this.delay);          // feedback loop
    dFilter.connect(dOut);
    dOut.connect(this.master);

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
    /* Browsers refuse to start audio before a gesture, so the menu score
       cannot begin at boot — it starts on the player's first touch of the
       page instead, which is the earliest moment it is allowed to. */
    if (this.ctx && !this.music.playing && typeof GAME !== "undefined" &&
        (GAME.state === "menu" || GAME.state === "intro")) this.startMusic("menu");
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
    this._send(g, o.send);
    osc.start(t); osc.stop(t + (o.dur || 0.1) + 0.05);
    /* A second voice a few cents away turns a bare oscillator into a
       chorused one — the cheapest way to make a synth sound produced. */
    if (o.detune) {
      const osc2 = this.ctx.createOscillator();
      osc2.type = o.type || "sine";
      osc2.frequency.setValueAtTime((o.f || 440) * (1 + o.detune), t);
      if (o.f2 !== undefined)
        osc2.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2 * (1 + o.detune)), t + (o.dur || 0.1));
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.6), t + atk);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.1));
      osc2.connect(g2); g2.connect(o.bus || this.sfxBus);
      this._send(g2, o.send);
      osc2.start(t); osc2.stop(t + (o.dur || 0.1) + 0.05);
    }
  },
  /* Taps a voice into the shared delay at the given amount (0..1). */
  _send(node, amount){
    if (!amount || !this.fxSend) return;
    const s = this.ctx.createGain();
    s.gain.value = amount;
    node.connect(s);
    s.connect(this.fxSend);
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
    this._send(g, o.send);
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
  /* --- superpower SFX --- */
  freeze(){
    this.tone({ f: 1800, f2: 320, dur: 0.5, type: "sine", vol: 0.18 });
    this.noise({ dur: 0.45, filter: "highpass", ff: 5200, ff2: 1200, vol: 0.14 });
  },
  missile(){
    this.noise({ dur: 0.4, filter: "lowpass", ff: 900, ff2: 2600, vol: 0.2, attack: 0.02 });
    this.tone({ f: 220, f2: 520, dur: 0.35, type: "sawtooth", vol: 0.12 });
  },
  powerUp(){
    const t = this.now();
    this.tone({ t, f: 520, dur: 0.08, type: "triangle", vol: 0.14 });
    this.tone({ t: t + 0.07, f: 780, dur: 0.08, type: "triangle", vol: 0.14 });
    this.tone({ t: t + 0.14, f: 1170, dur: 0.16, type: "triangle", vol: 0.14 });
  },
  /* ================================================================
     MENU / UI FEEDBACK
     ----------------------------------------------------------------
     Every control in the menus answers, and each kind of answer is a
     different voice: hovering, choosing, confirming, going back,
     toggling, refusing and deploying are all distinguishable with the
     screen switched off. All of them route a little signal into the
     shared delay so the console sounds like a room rather than a
     speaker. resume() is called from the noisiest of them because a
     browser will not start audio until the player touches the page.
     ================================================================ */
  uiClick(){
    this.resume();
    const t = this.now();
    this.tone({ t, f: 740, f2: 620, dur: 0.05, type: "triangle", vol: 0.1, send: 0.12 });
    this.noise({ t, dur: 0.03, filter: "highpass", ff: 3200, vol: 0.05 });
  },
  /* Deliberately tiny: a hover sound is heard hundreds of times a
     session and has to sit under everything else. */
  uiHover(){
    this.resume();
    this.tone({ f: 1180, f2: 1320, dur: 0.03, type: "sine", vol: 0.03, send: 0.1 });
  },
  uiSelect(){
    this.resume();
    const t = this.now();
    this.tone({ t, f: 620, dur: 0.05, type: "triangle", vol: 0.1, send: 0.14 });
    this.tone({ t: t + 0.05, f: 930, dur: 0.08, type: "triangle", vol: 0.09, detune: 0.004, send: 0.18 });
    this.noise({ t, dur: 0.04, filter: "highpass", ff: 4200, vol: 0.04 });
  },
  /* Tab changes get their own softer two-note figure so switching
     sections never sounds like committing to something. */
  uiTab(){
    this.resume();
    const t = this.now();
    this.tone({ t, f: 880, dur: 0.04, type: "sine", vol: 0.07, send: 0.14 });
    this.tone({ t: t + 0.04, f: 1170, dur: 0.06, type: "sine", vol: 0.06, send: 0.2 });
  },
  uiToggle(on){
    this.resume();
    this.tone({ f: on ? 700 : 480, f2: on ? 980 : 360, dur: 0.07, type: "square", vol: 0.09, send: 0.12 });
    this.noise({ dur: 0.04, filter: "bandpass", ff: on ? 2600 : 1400, q: 2, vol: 0.05 });
  },
  uiBack(){
    this.resume();
    const t = this.now();
    this.tone({ t, f: 620, dur: 0.05, type: "triangle", vol: 0.09, send: 0.14 });
    this.tone({ t: t + 0.05, f: 415, f2: 360, dur: 0.09, type: "triangle", vol: 0.08, send: 0.18 });
  },
  /* A control that cannot be used still answers — silence reads as a
     broken button, a short muted thud reads as "not now". */
  uiDenied(){
    this.resume();
    this.tone({ f: 240, f2: 180, dur: 0.09, type: "square", vol: 0.07 });
    this.noise({ dur: 0.06, filter: "lowpass", ff: 700, vol: 0.05 });
  },
  /* Sliders tick as they move, quietly and rate-limited by the caller. */
  uiTick(v){
    this.tone({ f: 900 + clamp(v || 0, 0, 1) * 700, dur: 0.018, type: "sine", vol: 0.028 });
  },
  /* Page turn for the onboarding briefing. */
  uiPage(fwd){
    this.resume();
    const t = this.now();
    this.noise({ t, dur: 0.14, filter: "bandpass", ff: fwd ? 900 : 700, ff2: fwd ? 2400 : 420, q: 1.2, vol: 0.07 });
    this.tone({ t, f: fwd ? 520 : 460, f2: fwd ? 780 : 350, dur: 0.1, type: "triangle", vol: 0.07, send: 0.16 });
  },
  uiDeploy(){
    this.resume();
    const t = this.now();
    // rising three-note call over a filter sweep — the launch cue
    this.tone({ t, f: 330, dur: 0.10, type: "sawtooth", vol: 0.13, detune: 0.006, send: 0.1 });
    this.tone({ t: t + 0.09, f: 495, dur: 0.10, type: "sawtooth", vol: 0.12, detune: 0.006, send: 0.14 });
    this.tone({ t: t + 0.18, f: 660, dur: 0.26, type: "triangle", vol: 0.14, detune: 0.005, send: 0.26 });
    this.tone({ t: t + 0.18, f: 990, dur: 0.26, type: "sine", vol: 0.06, send: 0.3 });
    this.noise({ t, dur: 0.4, filter: "lowpass", ff: 400, ff2: 2200, vol: 0.12, send: 0.15 });
    this.tone({ t, f: 70, f2: 45, dur: 0.5, type: "sine", vol: 0.16 });   // sub thump
  },
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

  /* ================================================================
     GENERATIVE ADAPTIVE MUSIC
     ----------------------------------------------------------------
     A 16th-note scheduler with a lookahead, writing directly to the
     Web Audio clock so the groove never drifts with the frame rate.
     Three scores share it:

       menu   — slow, wide, sparse. Deliberately low-information focus
                music: a pad bed, a soft sub pulse and a bell figure
                that wanders, with the bus filter closed down so it
                sits behind the interface instead of competing with it.
       combat — the layered score. Layers gate in with intensity, which
                the world raises as hostiles close in, and the bus
                filter opens with it so a fight audibly brightens.
       boss    — combat with a darker mode, a faster floor and a
                tritone drone under it.

     Switching happens on a bar line through a short crossfade, so the
     menu never cuts off mid-phrase when the player deploys.
     ================================================================ */
  SCALES: {
    // minor pentatonic (menu) and natural minor + b5 tension (combat/boss)
    menu:   [0, 3, 5, 7, 10, 12, 15],
    combat: [0, 3, 5, 7, 10, 12],
    boss:   [0, 1, 5, 6, 8, 11, 12],
  },
  PROGS: {
    menu:   [0, -4, -2, -5],
    combat: [0, -4, 3, -2],
    boss:   [0, -1, -6, -4],
  },
  /* Menu score, but only once the page is allowed to make sound. Calling
     this before the player has touched anything would construct an
     AudioContext the browser immediately blocks, which costs a console
     warning and buys nothing — resume() starts the score at the first
     real gesture instead. */
  menuMusic(){
    if (!this.ctx) return;
    this.startMusic("menu");
  },
  startMusic(mode){
    this.init();
    if (!this.ctx) return;
    const want = mode || "combat";
    if (this.music.playing) { this.setMusicMode(want); return; }
    this.music.playing = true;
    this.music.mode = this.music.want = want;
    this.music.step = 0;
    this.music.chord = 0;
    this.music.nextT = this.now() + 0.1;
    if (this.musicFade) this.musicFade.gain.setValueAtTime(1, this.now());
    this.music.timer = setInterval(() => this._musicSched(), 40);
    this._applyMusicFilter(true);
  },
  stopMusic(){
    this.music.playing = false;
    if (this.music.timer) { clearInterval(this.music.timer); this.music.timer = null; }
  },
  /* Queue a score change. The swap itself lands on the next bar so the
     transition is musical rather than abrupt. */
  setMusicMode(mode){
    if (!this.ctx) return;
    if (!this.music.playing) { this.startMusic(mode); return; }
    if (this.music.want === mode) return;
    this.music.want = mode;
    const t = this.now();
    this.musicFade.gain.cancelScheduledValues(t);
    this.musicFade.gain.setValueAtTime(this.musicFade.gain.value, t);
    this.musicFade.gain.linearRampToValueAtTime(0.12, t + 0.22);
    this.musicFade.gain.linearRampToValueAtTime(1, t + 0.75);
  },
  /* Pause / overlay: pull the score behind glass instead of cutting it. */
  duckMusic(on){
    if (this.music.ducked === !!on) return;
    this.music.ducked = !!on;
    this._applyMusicFilter();
  },
  _applyMusicFilter(instant){
    if (!this.musicFilter) return;
    const m = this.music;
    let hz;
    if (m.ducked) hz = 420;
    else if (m.mode === "menu") hz = 1500 + m.intensity * 200;
    else hz = 900 + m.intensity * 5200;          // fights audibly open up
    const t = this.now();
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(hz, t, instant ? 0.01 : 0.35);
  },
  setIntensity(v){
    const before = this.music.intensity;
    this.music.intensity = expLerp(before, clamp(v, 0, 1), 2.5, 0.05);
    if (Math.abs(this.music.intensity - before) > 0.02) this._applyMusicFilter();
  },
  _musicSched(){
    if (!this.music.playing) return;
    const m = this.music;
    const bpm = m.mode === "menu" ? 82 : (m.mode === "boss" ? 128 : 104) + m.intensity * 30;
    const six = 60 / bpm / 4;
    while (m.nextT < this.now() + 0.14) {
      // score changes take effect on a bar line
      if (m.step % 16 === 0 && m.want !== m.mode) {
        m.mode = m.want;
        m.chord = 0;
        this._applyMusicFilter();
      }
      if (m.mode === "menu") this._menuStep(m.nextT, m.step);
      else this._combatStep(m.nextT, m.step, m.intensity, m.mode === "boss");
      m.nextT += six;
      m.step++;
    }
  },

  /* ---- menu score: focus music, wide and unhurried ---- */
  _menuStep(t, step){
    const bus = this.musicFade;
    const s = step % 32;                       // two-bar phrase
    const PROG = this.PROGS.menu;
    if (s === 0) this.music.chord = ((step / 32) | 0) % PROG.length;
    const base = 110 * Math.pow(2, PROG[this.music.chord] / 12);
    // sub pulse on the downbeat of each bar
    if (s % 16 === 0)
      this.tone({ t, bus, f: base / 2, dur: 0.9, type: "sine", vol: 0.11, attack: 0.05 });
    // sustained pad chord, root + fifth + minor third, slow attack
    if (s === 0) {
      for (const semi of [0, 7, 15]) {
        this.tone({ t, bus, f: base * Math.pow(2, semi / 12), dur: 3.4,
          type: "sawtooth", vol: semi === 0 ? 0.032 : 0.022, attack: 0.9, detune: 0.005, send: 0.25 });
      }
    }
    // bell figure: wanders the pentatonic, never on a strict pattern
    if (s % 8 === 2 || s === 13 || s === 27) {
      const sc = this.SCALES.menu;
      const n = sc[(step * 3 + this.music.chord * 2) % sc.length];
      this.tone({ t, bus, f: base * 4 * Math.pow(2, n / 12), dur: 0.5,
        type: "sine", vol: 0.045, attack: 0.006, send: 0.42 });
    }
    // distant air, so the silence between notes is never dead
    if (s === 8)
      this.noise({ t, bus, dur: 2.2, filter: "bandpass", ff: 500, ff2: 300, q: 0.7, vol: 0.016, attack: 0.7 });
  },

  /* ---- combat score: the layered adaptive stack ---- */
  _combatStep(t, step, int, boss){
    const bus = this.musicFade;
    const s = step % 16;
    const PROG = boss ? this.PROGS.boss : this.PROGS.combat;
    if (s === 0) this.music.chord = ((step / 16) | 0) % PROG.length;
    const base = 110 * Math.pow(2, PROG[this.music.chord] / 12);
    // driving bass, detuned for weight
    if (s % 4 === 0)
      this.tone({ t, bus, f: base / 2, dur: 0.17, type: "square",
        vol: 0.09 + int * 0.05, detune: 0.004 });
    // off-beat bass answer once the fight has weight
    if (int > 0.5 && s % 8 === 6)
      this.tone({ t, bus, f: base / 2, dur: 0.1, type: "square", vol: 0.05 + int * 0.03 });
    // hats
    if (int > 0.12 && s % 2 === 1)
      this.noise({ t, bus, dur: 0.03, filter: "highpass", ff: 6000, vol: 0.026 + int * 0.03 });
    if (int > 0.6 && s % 4 === 3)
      this.noise({ t, bus, dur: 0.06, filter: "highpass", ff: 4200, vol: 0.02, send: 0.2 });
    // arpeggio
    if (int > 0.3 && s % 2 === 0) {
      const sc = boss ? this.SCALES.boss : this.SCALES.combat;
      const n = sc[(step * 5 + this.music.chord) % sc.length];
      this.tone({ t, bus, f: base * 2 * Math.pow(2, n / 12), dur: 0.11,
        type: "triangle", vol: 0.05 + int * 0.045, send: int > 0.55 ? 0.22 : 0 });
    }
    // kick + snare
    if (int > 0.42 && (s === 0 || s === 8))
      this.tone({ t, bus, f: 120, f2: 38, dur: 0.12, type: "sine", vol: 0.2 });
    if (int > 0.55 && (s === 4 || s === 12))
      this.noise({ t, bus, dur: 0.09, filter: "bandpass", ff: 1400, q: 1.1, vol: 0.09, send: 0.18 });
    // pad stabs at the top of the bar once it is genuinely hot
    if (int > 0.68 && s === 0) {
      this.tone({ t, bus, f: base * 2, dur: 0.7, type: "sawtooth", vol: 0.035, attack: 0.08, detune: 0.005 });
      this.tone({ t, bus, f: base * 2 * Math.pow(2, 3 / 12), dur: 0.7, type: "sawtooth", vol: 0.03, attack: 0.08 });
    }
    // boss drone: a tritone under everything, the sound of being outgunned
    if (boss && s === 0)
      this.tone({ t, bus, f: base * Math.pow(2, 6 / 12), dur: 2.0, type: "sawtooth",
        vol: 0.022, attack: 0.4, detune: 0.008, send: 0.3 });
  },

  /* ---- musical stingers, keyed to whatever chord is playing ---- */
  _chordBase(){
    const m = this.music;
    const PROG = m.mode === "boss" ? this.PROGS.boss
      : m.mode === "menu" ? this.PROGS.menu : this.PROGS.combat;
    return 110 * Math.pow(2, PROG[m.chord % PROG.length] / 12);
  },
  stingerWin(){
    const t = this.now(), base = this._chordBase();
    [0, 7, 12, 19].forEach((semi, i) => {
      this.tone({ t: t + i * 0.075, f: base * 2 * Math.pow(2, semi / 12), dur: 0.4,
        type: "triangle", vol: 0.11, send: 0.35 });
    });
  },
  stingerFail(){
    const t = this.now(), base = this._chordBase();
    [0, -3, -8].forEach((semi, i) => {
      this.tone({ t: t + i * 0.16, f: base * Math.pow(2, semi / 12), dur: 0.7,
        type: "sawtooth", vol: 0.1, attack: 0.02, detune: 0.01, send: 0.3 });
    });
  },
};
