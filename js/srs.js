/*
 * srs.js — Leitner-style spaced repetition for drill cards.
 *
 * Each card has a box 0..7. Grades:
 *   'auto'  — correct, no hints, fast  -> box + 1 (the response is becoming automatic)
 *   'slow'  — correct but slow / hinted -> box stays (min 1)
 *   'miss'  — any mistake               -> box 0, due again immediately (re-queued this session)
 * The interval in days for each box: 0, 1, 2, 4, 8, 16, 32, 64.
 */
(function (global) {
  'use strict';
  const DAY = 864e5;
  const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64];
  const MASTERED_BOX = 4;

  const SRS = {
    INTERVALS, MASTERED_BOX,
    state(id) { return CC.Store.data.srs[id] || null; },
    isNew(id) { return !CC.Store.data.srs[id]; },
    isDue(id, now) { const s = this.state(id); return !!s && s.due <= (now || Date.now()); },
    isMastered(id) { const s = this.state(id); return !!s && s.box >= MASTERED_BOX; },

    /** Fast-response threshold per move (ms). Stricter in speed mode. */
    fastMs() { return CC.Store.data.settings.speed ? 3000 : 6000; },

    grade(result) {
      if (!result.success || result.mistakes > 0) return 'miss';
      if (result.hints > 0 || result.avgMs > this.fastMs() || result.slow) return 'slow';
      return 'auto';
    },

    record(id, result) {
      const g = this.grade(result);
      const now = Date.now();
      const s = this.state(id) || { box: 0, due: now, reps: 0, lapses: 0, avgMs: 0 };
      s.reps++;
      if (g === 'miss') { s.box = 0; s.lapses++; s.due = now; }
      else {
        if (g === 'auto') s.box = Math.min(INTERVALS.length - 1, s.box + 1);
        else s.box = Math.max(1, s.box);
        s.due = now + INTERVALS[s.box] * DAY - 3600e3; // an hour of slack so "tomorrow" means tomorrow
      }
      if (result.avgMs) s.avgMs = s.avgMs ? Math.round(s.avgMs * 0.6 + result.avgMs * 0.4) : Math.round(result.avgMs);
      s.last = now;
      CC.Store.data.srs[id] = s;
      CC.Store.save();
      return { grade: g, state: s };
    },

    stats(cards) {
      const now = Date.now();
      let due = 0, fresh = 0, mastered = 0, learning = 0;
      for (const c of cards) {
        const s = this.state(c.id);
        if (!s) fresh++;
        else {
          if (s.due <= now) due++;
          if (s.box >= MASTERED_BOX) mastered++; else learning++;
        }
      }
      return { due, fresh, mastered, learning, total: cards.length };
    },

    /** Build a session queue: due cards first (most overdue first), then up to `newLimit` new cards. */
    queue(cards, opts) {
      opts = opts || {};
      const now = Date.now();
      const due = cards.filter((c) => this.isDue(c.id, now)).sort((a, b) => this.state(a.id).due - this.state(b.id).due);
      const fresh = cards.filter((c) => this.isNew(c.id)).slice(0, opts.newLimit == null ? 8 : opts.newLimit);
      let q = due.concat(fresh);
      if (!q.length && opts.reviewAhead) {
        q = cards.slice().sort((a, b) => (this.state(a.id) || { due: 0 }).due - (this.state(b.id) || { due: 0 }).due);
      }
      return q.slice(0, opts.max || 20);
    },

    nextDueLabel(cards) {
      const ds = cards.map((c) => this.state(c.id)).filter(Boolean).map((s) => s.due).filter((d) => d > Date.now());
      if (!ds.length) return '';
      const ms = Math.min(...ds) - Date.now();
      if (ms < 3600e3) return t('within the hour');
      if (ms < DAY) return t('in {n} h', { n: Math.round(ms / 3600e3) });
      const d = Math.round(ms / DAY);
      return t(d === 1 ? 'in {n} day' : 'in {n} days', { n: d });
    },
  };

  global.SRS = SRS;
})(window);
