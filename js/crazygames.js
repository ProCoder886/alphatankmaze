"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/crazygames.js
   CRAZYGAMES HTML5 SDK v3 INTEGRATION
   ----------------------------------------------------------------
   Implements the official CrazyGames SDK modules:
     ad     — midgame + rewarded video ads, adblock detection
     banner — responsive banners on static (non-gameplay) screens
     game   — gameplay start/stop, loading start/stop, happytime,
              completion %, game context, muteAudio setting
     user   — account availability / current user / system info
     data   — cross-device progress save (localStorage-compatible)

   Docs: https://docs.crazygames.com/sdk/intro/
   All SDK access funnels through this module so the rest of the
   game never touches window.CrazyGames directly, and so the game
   stays fully playable when the SDK is absent, disabled (non
   CrazyGames domain) or blocked by an adblocker.
   ================================================================ */
const CG = {
  /* ---- state ---- */
  ready: false,          // SDK.init() resolved
  env: "disabled",       // "local" | "crazygames" | "disabled"
  available: false,      // SDK usable (local or crazygames)
  adblock: false,        // adblocker detected
  adPending: false,      // ad requested, awaiting adStarted/adError
  adPlaying: false,      // ad actually on screen (audio muted, game paused)
  sdkMute: false,        // platform muteAudio setting
  user: null,            // logged-in CrazyGames user (or null)
  device: "desktop",

  _gameplayOn: false,
  _lastRewardT: -1e9,    // performance.now()/1000 of last rewarded ad shown
  _bannerT: {},          // containerId -> last request time (s)
  _watchdog: null,

  /* Rewarded ads must not be offered too often (SDK requirement).
     While cooling down the offer button is disabled and shows the timer. */
  REWARD_COOLDOWN: 45,

  /* ================================================================
     INIT
     ================================================================ */
  async init(){
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk) {
      // SDK script unavailable (offline, self-hosted build, blocked): play on.
      this.env = "disabled";
      this.available = false;
      return;
    }
    try {
      await sdk.init();
      this.ready = true;
      this.env = sdk.environment || "disabled";
      this.available = this.env === "local" || this.env === "crazygames";
    } catch (e) {
      this.env = "disabled";
      this.available = false;
      console.warn("[CG] SDK init failed, continuing without SDK:", e);
      return;
    }
    if (!this.available) return;

    // platform audio setting takes priority over the in-game audio sliders
    try {
      const s = sdk.game.settings;
      if (s) this.sdkMute = !!s.muteAudio;
      sdk.game.addSettingsChangeListener((ns) => {
        this.sdkMute = !!(ns && ns.muteAudio);
        this.applyMute();
      });
    } catch (e) { /* settings unsupported — ignore */ }

    // user module (optional: greeting + feedback context only)
    try {
      if (sdk.user.isUserAccountAvailable) {
        this.user = await sdk.user.getUser();
        sdk.user.addAuthListener((u) => { this.user = u; });
      }
      const info = sdk.user.systemInfo;
      if (info && info.device && info.device.type) this.device = info.device.type;
    } catch (e) { /* not logged in / unavailable — ignore */ }

    // adblock detection: never block play, only gate the ad-reward path
    try {
      this.adblock = await sdk.ad.hasAdblock();
    } catch (e) { this.adblock = false; }
  },

  sdk(){ return this.available ? window.CrazyGames.SDK : null; },

  /* ================================================================
     DATA MODULE — cross-device progress save
     Same API as localStorage; falls back to localStorage when the
     SDK is unavailable. Existing localStorage saves are migrated on
     first run so no player loses progress.
     ================================================================ */
  storage: {
    _mod(){
      const s = CG.sdk();
      return s && s.data ? s.data : null;
    },
    getItem(key){
      const m = this._mod();
      if (m) {
        try {
          const v = m.getItem(key);
          if (v !== null && v !== undefined) return v;
          // migrate a pre-SDK localStorage save into the data module
          const legacy = localStorage.getItem(key);
          if (legacy !== null) { try { m.setItem(key, legacy); } catch (e) {} return legacy; }
          return null;
        } catch (e) { /* fall through to localStorage */ }
      }
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value){
      const m = this._mod();
      if (m) { try { m.setItem(key, value); } catch (e) { console.warn("[CG] data setItem failed", e); } }
      try { localStorage.setItem(key, value); } catch (e) {}
    },
    removeItem(key){
      const m = this._mod();
      if (m) { try { m.removeItem(key); } catch (e) {} }
      try { localStorage.removeItem(key); } catch (e) {}
    },
  },

  /* ================================================================
     GAME MODULE — lifecycle events
     ================================================================ */
  loadingStart(){ const s = this.sdk(); if (s) { try { s.game.loadingStart(); } catch (e) {} } },
  loadingStop(){ const s = this.sdk(); if (s) { try { s.game.loadingStop(); } catch (e) {} } },

  /* Called whenever the player starts or resumes playing
     (deploy, resume from pause, revive, next sector). */
  gameplayStart(){
    if (this._gameplayOn) return;
    this._gameplayOn = true;
    const s = this.sdk();
    if (s) { try { s.game.gameplayStart(); } catch (e) {} }
  },
  /* Called on every break in play (pause, sector end, death, menu). */
  gameplayStop(){
    if (!this._gameplayOn) return;
    this._gameplayOn = false;
    const s = this.sdk();
    if (s) { try { s.game.gameplayStop(); } catch (e) {} }
  },
  /* Celebration on the platform — used sparingly (boss kill, new record). */
  happytime(){ const s = this.sdk(); if (s) { try { s.game.happytime(); } catch (e) {} } },
  /* Endless game: sector 10 is treated as 100% completion. */
  reportProgress(pct){
    const s = this.sdk();
    if (!s) return;
    try { s.game.reportGameCompletedPercentage(clamp(Math.round(pct), 0, 100)); } catch (e) {}
  },
  setContext(obj){ const s = this.sdk(); if (s) { try { s.game.setGameContext(obj); } catch (e) {} } },
  clearContext(){ const s = this.sdk(); if (s) { try { s.game.clearGameContext(); } catch (e) {} } },

  /* ================================================================
     AD MODULE
     Per SDK requirements: the UI is blocked from the moment the ad
     is requested until adFinished/adError, audio is muted only once
     the ad actually starts, and an unfilled/blocked ad must never
     leave the game stuck or reward the player.
     ================================================================ */
  adsAvailable(){ return this.available && !this.adblock; },

  /* Resolves { ok:true } only when the ad played to completion. */
  requestAd(type){
    return new Promise((resolve) => {
      const s = this.sdk();
      if (!s) { resolve({ ok: false, error: { code: "sdkUnavailable" } }); return; }

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(this._watchdog);
        this._watchdog = null;
        this.adPending = false;
        if (this.adPlaying) { this.adPlaying = false; this.applyMute(); }
        this.hideAdOverlay();
        resolve(result);
      };

      this.adPending = true;
      this.showAdOverlay("Loading advertisement");
      // Safety net: the game must never freeze waiting on an ad callback.
      this._watchdog = setTimeout(() => finish({ ok: false, error: { code: "timeout" } }), 45000);

      try {
        s.ad.requestAd(type, {
          adStarted: () => {
            this.adPlaying = true;
            this.applyMute();               // mute only when the ad really starts
            this.showAdOverlay("Advertisement playing");
          },
          adFinished: () => finish({ ok: true }),
          adError: (error) => {
            console.warn("[CG] ad error (" + type + "):", error);
            finish({ ok: false, error: error || { code: "other" } });
          },
        });
      } catch (e) {
        finish({ ok: false, error: { code: "other", message: String(e) } });
      }
    });
  },

  /* Midgame ad — only at natural breaks (sector transition, restart
     after death). The SDK enforces its own frequency cap, so an
     ignored request is harmless and the game must simply continue. */
  async midgame(){
    if (!this.adsAvailable()) return false;
    const r = await this.requestAd("midgame");
    return r.ok;
  },

  /* Rewarded ad — player-initiated only. Resolves true only when the
     ad completed, which is the only case where a reward may be given. */
  async rewarded(){
    if (!this.adsAvailable()) return false;
    const r = await this.requestAd("rewarded");
    if (r.ok) this._lastRewardT = performance.now() / 1000;
    return r.ok;
  },

  rewardCooldownLeft(){
    const left = this.REWARD_COOLDOWN - (performance.now() / 1000 - this._lastRewardT);
    return left > 0 ? Math.ceil(left) : 0;
  },

  /* Why a rewarded offer can't be taken right now (null = it can). */
  rewardBlockedReason(){
    if (!this.available) return "Rewards are available on CrazyGames.";
    if (this.adblock) return "Ad blocker detected — disable it to claim ad rewards.";
    const cd = this.rewardCooldownLeft();
    if (cd > 0) return "Next ad reward available in " + cd + "s.";
    if (this.adPending || this.adPlaying) return "Advertisement in progress…";
    return null;
  },

  /* ================================================================
     BANNER MODULE
     Responsive banners on static screens only (never during play).
     Honours the 30s per-container refresh limit.
     ================================================================ */
  showBanner(containerId){
    const s = this.sdk();
    if (!s) return;
    if (this.adPending || this.adPlaying) return;   // videoAdPlaying error otherwise
    const el = document.getElementById(containerId);
    if (!el) return;
    const now = performance.now() / 1000;
    if (this._bannerT[containerId] && now - this._bannerT[containerId] < 31) return;
    this._bannerT[containerId] = now;
    el.classList.add("has-banner");
    try {
      s.banner.requestResponsiveBanner(containerId).catch((e) => {
        console.warn("[CG] banner request failed", e);
        el.classList.remove("has-banner");
      });
    } catch (e) { el.classList.remove("has-banner"); }
  },
  clearBanner(containerId){
    const s = this.sdk();
    const el = document.getElementById(containerId);
    if (el) el.classList.remove("has-banner");
    if (!s) return;
    try { s.banner.clearBanner(containerId); } catch (e) {}
  },
  clearAllBanners(){
    const s = this.sdk();
    document.querySelectorAll(".cg-banner").forEach(el => el.classList.remove("has-banner"));
    if (!s) return;
    try { s.banner.clearAllBanners(); } catch (e) {}
  },

  /* ================================================================
     AUDIO MUTE — platform setting OR an ad currently playing
     ================================================================ */
  audioMuted(){ return this.sdkMute || this.adPlaying; },
  applyMute(){ if (typeof AUDIO !== "undefined") AUDIO.setMuted(this.audioMuted()); },

  /* ================================================================
     BLOCKING AD OVERLAY
     Prevents any interaction (and any game progress) while an ad is
     being requested or shown, as required by the SDK guidelines.
     ================================================================ */
  showAdOverlay(text){
    const ov = document.getElementById("ad-overlay");
    if (!ov) return;
    const label = document.getElementById("ad-ov-title");
    if (label) label.textContent = text;
    ov.classList.add("active");
    ov.setAttribute("aria-hidden", "false");
  },
  hideAdOverlay(){
    const ov = document.getElementById("ad-overlay");
    if (!ov) return;
    ov.classList.remove("active");
    ov.setAttribute("aria-hidden", "true");
  },

  /* True while an ad request/playback is in flight — the main loop
     and input handling must stay frozen for this duration. */
  busy(){ return this.adPending || this.adPlaying; },
};
