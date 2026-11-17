/*
 * sound.js — synthesized board sounds (Web Audio, no audio files needed).
 *   move     — soft wooden "tock"
 *   capture  — heavier double knock
 *   check    — bright two-tone alert
 *   castle   — two quick tocks
 *   promote  — rising chime
 *   correct / wrong / end — training feedback
 * Sound.forMove(m) picks the right one for any move object returned by Chess#move.
 */
(function (global) {
  'use strict';
  let ctx = null, noiseBuf = null, enabled = true, volume = 0.9;

  function ac() {
    if (!ctx) {
      const C = global.AudioContext || global.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      // Short white-noise buffer used for the wooden attack of piece sounds.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Filtered noise burst + low body resonance = a piece landing on a wooden board. */
  function knock(t, freq, gain, decay) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    n.connect(bp).connect(g).connect(ctx.destination);
    n.start(t);
    n.stop(t + decay + 0.02);
    // body
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq / 7, t);
    o.frequency.exponentialRampToValueAtTime(freq / 11, t + decay);
    const og = ctx.createGain();
    og.gain.setValueAtTime(gain * 0.9 * volume, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.9);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + decay);
  }

  function tone(t, freq, dur, type, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((gain || 0.15) * volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  const SOUNDS = {
    move(t) { knock(t, 1900, 0.55, 0.07); },
    capture(t) { knock(t, 1300, 0.9, 0.09); knock(t + 0.045, 900, 0.75, 0.12); },
    castle(t) { knock(t, 1900, 0.5, 0.06); knock(t + 0.11, 1700, 0.5, 0.07); },
    check(t) { knock(t, 1600, 0.5, 0.06); tone(t + 0.01, 988, 0.16, 'triangle', 0.16); tone(t + 0.09, 1319, 0.22, 'triangle', 0.14); },
    promote(t) { knock(t, 1800, 0.5, 0.06); [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.05 + i * 0.06, f, 0.18, 'sine', 0.1)); },
    correct(t) { tone(t, 784, 0.12, 'sine', 0.13); tone(t + 0.09, 1175, 0.22, 'sine', 0.12); },
    wrong(t) { tone(t, 220, 0.18, 'square', 0.05); tone(t + 0.1, 165, 0.25, 'square', 0.05); },
    end(t) { [392, 494, 587, 784].forEach((f, i) => tone(t + i * 0.09, f, 0.45, 'triangle', 0.1)); },
    fail(t) { [392, 330, 262].forEach((f, i) => tone(t + i * 0.12, f, 0.3, 'triangle', 0.1)); },
  };

  const Sound = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },
    play(kind) {
      if (!enabled || !SOUNDS[kind]) return;
      try {
        if (!ac()) return;
        SOUNDS[kind](ctx.currentTime + 0.005);
      } catch (_) { /* audio unavailable */ }
    },
    /** Pick the sound for a move: check beats capture beats castle beats move. */
    forMove(m) {
      if (!m) return;
      if (/[+#]/.test(m.san || '')) this.play('check');
      else if (m.promotion) this.play('promote');
      else if (m.captured) this.play('capture');
      else if (m.flags === 'k' || m.flags === 'q') this.play('castle');
      else this.play('move');
    },
    /** Browsers only allow audio after a user gesture; warm the context up on the first tap. */
    unlock() { try { if (enabled) ac(); } catch (_) { /* ignore */ } },
  };

  global.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  global.Sound = Sound;
})(window);
