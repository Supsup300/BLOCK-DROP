(function (root) {
  "use strict";

  const GAME_KEY = "blockdrop.game.v1";
  const META_KEY = "blockdrop.meta.v1";
  const SETTINGS_KEY = "blockdrop.settings.v1";

  class StorageService {
    read(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
      } catch (_error) {
        return fallback;
      }
    }

    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_error) {
        return false;
      }
    }

    loadGame() {
      return this.read(GAME_KEY, null);
    }

    saveGame(state) {
      return this.write(GAME_KEY, { savedAt: Date.now(), state });
    }

    clearGame() {
      try { localStorage.removeItem(GAME_KEY); } catch (_error) { /* Storage unavailable. */ }
    }

    loadMeta() {
      return {
        gamesPlayed: 0,
        bestScore: 0,
        linesCleared: 0,
        bestCombo: 1,
        totalPlayMs: 0,
        tutorialSeen: false,
        gamesSinceInterstitial: 0,
        lastInterstitialAt: Date.now(),
        level: 1,
        levelLines: 0,
        unlockedPostcards: [],
        ...this.read(META_KEY, {})
      };
    }

    saveMeta(meta) {
      return this.write(META_KEY, meta);
    }

    loadSettings() {
      return { sound: true, vibration: true, ...this.read(SETTINGS_KEY, {}) };
    }

    saveSettings(settings) {
      return this.write(SETTINGS_KEY, settings);
    }
  }

  class AudioManager {
    constructor(enabled = true) {
      this.enabled = enabled;
      this.context = null;
      this.lastMoveAt = 0;
    }

    setEnabled(value) {
      this.enabled = Boolean(value);
    }

    ensureContext() {
      if (!this.enabled) return null;
      const AudioContext = root.AudioContext || root.webkitAudioContext;
      if (!AudioContext) return null;
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
      return this.context;
    }

    tone(frequency, duration, delay = 0, volume = .035, type = "sine") {
      const context = this.ensureContext();
      if (!context) return;
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    }

    play(name) {
      if (!this.enabled) return;
      const patterns = {
        take: [[360, .055, 0, .018, "sine"]],
        move: [[430, .025, 0, .008, "sine"]],
        invalid: [[135, .09, 0, .025, "square"]],
        drop: [[230, .055, 0, .035, "triangle"], [390, .075, .035, .025, "sine"]],
        clear: [[520, .09, 0, .035, "sine"], [720, .12, .055, .036, "triangle"]],
        double: [[480, .08, 0, .038, "triangle"], [690, .09, .055, .038, "triangle"], [890, .13, .11, .04, "sine"]],
        combo: [[610, .08, 0, .032, "triangle"], [820, .09, .045, .038, "triangle"], [1040, .12, .095, .035, "sine"]],
        record: [[523, .11, 0, .03, "sine"], [659, .11, .09, .032, "sine"], [784, .18, .18, .035, "triangle"]],
        joker: [[310, .08, 0, .03, "triangle"], [560, .13, .07, .03, "sine"]],
        gameover: [[270, .13, 0, .028, "triangle"], [210, .18, .11, .025, "triangle"]],
        level: [[530, .07, 0, .028, "sine"], [700, .1, .05, .032, "triangle"], [900, .14, .11, .034, "sine"]],
        postcard: [[440, .08, 0, .03, "sine"], [660, .1, .07, .034, "triangle"], [880, .12, .15, .036, "sine"], [1100, .18, .23, .03, "sine"]],
        click: [[440, .045, 0, .018, "sine"]]
      };
      (patterns[name] || patterns.click).forEach((args) => this.tone(...args));
    }
  }

  class Haptics {
    constructor(enabled = true) {
      this.enabled = enabled;
    }

    setEnabled(value) {
      this.enabled = Boolean(value);
    }

    pulse(kind) {
      if (!this.enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
      const patterns = {
        drop: 9,
        clear: 18,
        combo: [22, 28, 30],
        record: [16, 35, 16, 35, 28],
        invalid: 24,
        joker: [12, 22, 12]
      };
      navigator.vibrate(patterns[kind] || 8);
    }
  }

  class SimulatedAdProvider {
    constructor(showOverlay) {
      this.showOverlay = showOverlay;
    }

    async showRewarded(placement) {
      await this.showOverlay({ kind: "rewarded", placement, duration: 3000 });
      return { completed: true, placement, simulated: true };
    }

    async showInterstitial(placement) {
      await this.showOverlay({ kind: "interstitial", placement, duration: 2500 });
      return { completed: true, placement, simulated: true };
    }
  }

  class NativeAdProvider {
    constructor(bridge) {
      this.bridge = bridge;
      this.pending = new Map();
      this.sequence = 0;
      this.timeoutMs = 180000;
      root.__blockDropNativeCallbacks = {
        resolve: (requestId, payload) => this.settle(requestId, true, payload),
        reject: (requestId, reason) => this.settle(requestId, false, reason)
      };
    }

    static isSupported(bridge) {
      return Boolean(
        bridge &&
        typeof bridge.showRewarded === "function" &&
        typeof bridge.showInterstitial === "function"
      );
    }

    settle(requestId, succeeded, value) {
      const request = this.pending.get(String(requestId));
      if (!request) return;
      this.pending.delete(String(requestId));
      clearTimeout(request.timer);
      if (!succeeded) {
        request.reject(new Error(String(value || "native_ad_failed")));
        return;
      }
      try {
        request.resolve(typeof value === "string" ? JSON.parse(value) : value);
      } catch (_error) {
        request.resolve({ completed: false, reason: "invalid_native_response" });
      }
    }

    request(method, placement) {
      return new Promise((resolve, reject) => {
        const requestId = `ad-${Date.now()}-${this.sequence += 1}`;
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          reject(new Error("native_ad_timeout"));
        }, this.timeoutMs);
        this.pending.set(requestId, { resolve, reject, timer });
        try {
          this.bridge[method](requestId, String(placement || "unknown"));
        } catch (error) {
          this.pending.delete(requestId);
          clearTimeout(timer);
          reject(error);
        }
      });
    }

    async showRewarded(placement) {
      const result = await this.request("showRewarded", placement);
      const rewarded = Boolean(result?.rewarded);
      return { completed: rewarded, rewarded, placement, native: true, reason: result?.reason || null };
    }

    async showInterstitial(placement) {
      const result = await this.request("showInterstitial", placement);
      return { completed: Boolean(result?.completed), placement, native: true, reason: result?.reason || null };
    }
  }

  class AdsManager {
    constructor(provider, options = {}) {
      this.provider = provider;
      this.interstitialEvery = Number(options.interstitialEvery || 3);
      this.minimumIntervalMs = Number(options.minimumIntervalMs || 90 * 1000);
      this.demoMode = Boolean(options.demoMode);
    }

    async showRewarded(placement) {
      try {
        return await this.provider.showRewarded(placement);
      } catch (error) {
        return { completed: false, placement, reason: error?.message || "ad_unavailable" };
      }
    }

    shouldShowInterstitial(meta) {
      if (this.demoMode) return Number(meta.gamesSinceInterstitial || 0) >= 1;
      const enoughGames = Number(meta.gamesSinceInterstitial || 0) >= this.interstitialEvery;
      const enoughTime = Date.now() - Number(meta.lastInterstitialAt || 0) >= this.minimumIntervalMs;
      return enoughGames && enoughTime;
    }

    async showInterstitial(placement) {
      try {
        return await this.provider.showInterstitial(placement);
      } catch (error) {
        return { completed: false, placement, reason: error?.message || "ad_unavailable" };
      }
    }
  }

  root.BlockDropServices = { StorageService, AudioManager, Haptics, SimulatedAdProvider, NativeAdProvider, AdsManager };
})(typeof window !== "undefined" ? window : globalThis);
