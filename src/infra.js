// ---------- Storage (never throws) ----------
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not remembered; this page still uses it.
    }
  },
};

// ---------- Speech (off by default) ----------
// 'voice' speaks with the browser's own voice (speechSynthesis), which never
// reaches the braille display. 'voiceover' writes to live regions: VoiceOver
// and NVDA speak them but also flash them over the braille line for a few
// seconds. Neither is ever used during play.
class Speech {
  constructor(root) {
    const make = () => {
      const el = document.createElement('div');
      el.className = 'visually-hidden';
      el.setAttribute('aria-live', 'polite');
      // JAWS in Firefox ignores regions marked atomic. Each message replaces
      // the region's whole text anyway.
      if (!/firefox/i.test(navigator.userAgent)) el.setAttribute('aria-atomic', 'true');
      root.append(el);
      return el;
    };
    // Two regions used in turn, so a repeated message is still spoken.
    this.regions = [make(), make()];
    this.next = 0;
    this.timer = 0;
    this.mode = 'off';
  }
  say(text) {
    this.clear();
    if (!text) return;
    if (this.mode === 'voice') {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = document.documentElement.lang || 'en';
        speechSynthesis.speak(u);
      } catch {
        // No browser voice; the braille line has everything.
      }
    } else if (this.mode === 'voiceover') {
      const region = this.regions[this.next++ % 2];
      this.timer = setTimeout(() => {
        region.textContent = text;
      }, 60);
    }
  }
  clear() {
    clearTimeout(this.timer);
    for (const el of this.regions) el.textContent = '';
    try {
      if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
    } catch {
      // Nothing to stop.
    }
  }
}

// ---------- Sounds: the original's three cues and a countdown, made with Web Audio ----------
class Sounds {
  constructor() {
    this.ctx = null;
    this.level = 'on'; // on, quiet or off
  }
  /** Browsers start audio only after a key press or click; called on every input. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      // No audio; the game is complete without it.
    }
  }
  get blocked() {
    return this.level !== 'off' && (!this.ctx || this.ctx.state !== 'running');
  }
  tone(freq, at, length, { type = 'square', gain = 0.07, to = freq } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const g = gain * (this.level === 'quiet' ? 0.25 : 1);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, at + length);
    amp.gain.setValueAtTime(g, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }
  play(name) {
    if (this.level === 'off') return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'jump': this.tone(480, t, 0.06, { to: 720 }); break;
      case 'milestone': this.tone(1046, t, 0.09); this.tone(1318, t + 0.11, 0.09); break;
      case 'hit': this.tone(220, t, 0.25, { type: 'sawtooth', to: 90, gain: 0.09 }); break;
      case 'beat': this.tone(660, t, 0.08, { type: 'triangle', gain: 0.1 }); break;
      case 'go': this.tone(990, t, 0.08, { type: 'triangle', gain: 0.1 }); break;
      case 'pause': this.tone(330, t, 0.08, { type: 'triangle', gain: 0.08 }); break;
    }
  }
}
