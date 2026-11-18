/*
 * trainer.js — the exercise engine shared by lessons and drills.
 *
 * kinds:
 *   line  — play one side (or both) of a fixed variation; the other side is auto-played
 *   watch — step through a variation with forward/back
 *   find  — find a forcing sequence (solution alternates you / opponent);
 *           alternatives are checked by the engine unless `engine: false`
 *   play  — reach a goal against the engine: "mate" | "promote" | "hold" (moves = limit)
 *
 * opts.guided (lessons): the teacher announces every move of line/find steps with an
 * arrow and its explanation before you play it. Drills run unguided (from memory).
 *
 * Emits events through opts.onEvent({type, ...}):
 *   status {html, tone}   comment {san, why, by, ok}   moves {}   done {success, mistakes, hints, avgMs, note}
 */
(function (global) {
  'use strict';
  const { PIECE_NAMES } = Chess;
  const MATE = Engine.MATE;
  const clean = (s) => String(s || '').replace(/[+#!?]/g, '').replace(/0/g, 'O').trim();
  const sanEq = (a, b) => clean(a) === clean(b);
  const pname = (p) => I18N.piece(p);
  const colorName = (c) => (c === 'w' ? t('White') : t('Black'));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  class Trainer {
    constructor(board, opts) {
      this.board = board;
      this.opts = Object.assign({ mode: 'lesson', delay: 550 }, opts || {});
      this.timers = [];
      board.opts.onMove = (m) => this.onUserMove(m);
    }

    emit(ev) { if (this.opts.onEvent) this.opts.onEvent(ev); }
    status(html, tone) { this.emit({ type: 'status', html, tone: tone || 'info' }); }
    later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    destroy() { this.clearTimers(); this.finished = true; }

    start(spec) {
      this.clearTimers();
      this.spec = spec;
      this.kind = spec.kind;
      this.chess = CCData.startPosition(spec);
      this.startFen = this.chess.fen();
      this.mistakes = 0; this.hints = 0; this.hintStage = 0; this.attempts = 0;
      this.times = []; this.turnStart = 0; this.busy = false; this.finished = false;
      this.userMoves = 0;
      this.lastOpp = null;
      const k = this.kind;
      if (k === 'line' || k === 'watch') {
        this.line = CCData.parseMoves(spec.moves);
        this.idx = 0;
        this.sides = k === 'watch' ? [] : spec.you === 'both' ? ['w', 'b'] : [spec.you || 'w'];
      } else if (k === 'find') {
        this.sol = CCData.normSolution(spec.solution);
        this.ply = 0;
        this.sides = [this.chess.turn];
      } else if (k === 'play') {
        this.sides = [spec.you || this.chess.turn];
      }
      const orient = spec.orientation || (this.sides.length === 1 ? this.sides[0] : (spec.you === 'b' ? 'b' : 'w'));
      this.board.set({ chess: this.chess, orientation: orient, lastMove: null, arrows: spec.arrows || [], marks: spec.marks || {}, selected: null, movable: null });
      this.emit({ type: 'moves' });
      if (k === 'watch') { this.status(t('Use <b>▶ Next move</b> to step through the game.')); this.syncWatch(); return; }
      this.next();
    }

    // ------------------------------------------------------------------ flow
    userTurn() { return this.sides.includes(this.chess.turn); }

    setMovable() {
      const can = !this.finished && !this.busy && this.userTurn();
      this.board.set({ movable: can ? this.chess.turn : null });
      if (can) this.turnStart = performance.now();
    }

    next() {
      if (this.finished) return;
      const k = this.kind;
      if (k === 'line') {
        if (this.idx >= this.line.length) return this.done(true);
        if (this.userTurn()) { this.setMovable(); if (this.opts.guided) this.teach(this.line[this.idx]); else this.promptLine(); return; }
        this.autoPlay(() => {
          const res = this.play(this.line[this.idx].san);
          this.emit({ type: 'comment', san: res.san, why: this.line[this.idx].why, by: 'opp', ok: true });
          this.lastOpp = { san: res.san, color: res.color, why: this.line[this.idx].why };
          this.idx++;
        });
      } else if (k === 'find') {
        if (this.ply >= this.sol.length) return this.done(true, this.spec.why);
        if (this.userTurn()) { this.setMovable(); if (this.opts.guided) this.teach({ san: this.sol[this.ply][0] }); return; }
        this.autoPlay(() => {
          const res = this.play(this.sol[this.ply][0]);
          this.emit({ type: 'comment', san: res.san, by: 'opp', ok: true });
          this.lastOpp = { san: res.san, color: res.color };
          if (!this.opts.guided) this.status(t('{color} replied {san}. Your move.', { color: colorName(res.color), san: `<b>${esc(res.san)}</b>` }));
          this.ply++;
        });
      } else if (k === 'play') {
        if (this.userTurn()) { this.setMovable(); return; }
        this.engineReply();
      }
    }

    /** Guided mode: show the next move with an arrow and explain it before the student plays it. */
    teach(exp) {
      const uci = this.uciOf(exp.san);
      if (uci) this.board.set({ arrows: [[uci.slice(0, 2), uci.slice(2, 4), 'green']] });
      let html = '';
      const o = this.lastOpp;
      if (o) html += `<div class="opp-said">${t('{color} played {san}', { color: colorName(o.color), san: `<b>${esc(o.san)}</b>` })}${o.why ? ': ' + esc(o.why) : '.'}</div>`;
      html += `<div class="teach">👨‍🏫 ${t('Now play {san}', { san: `<b>${esc(exp.san)}</b>` })}${exp.why ? ': ' + esc(exp.why) : '. ' + t('Follow the arrow.')}</div>`;
      this.lastOpp = null;
      this.status(html, 'teach');
    }

    promptLine() {
      if (this.opts.mode === 'drill') this.status(t('Your move as {color}.', { color: `<b>${colorName(this.chess.turn)}</b>` }));
      else if (this.idx === 0 || this.sides.length === 2) this.status(t("Play {color}'s move.", { color: `<b>${colorName(this.chess.turn)}</b>` }));
    }

    autoPlay(fn) {
      this.busy = true;
      this.board.set({ movable: null });
      this.later(() => {
        this.busy = false;
        if (this.finished) return;
        fn();
        this.next();
      }, this.opts.delay);
    }

    /** Play a move on the board with sound + animation. */
    play(input) {
      const res = this.chess.move(input);
      if (!res) throw new Error(`Illegal move in data: ${JSON.stringify(input)} at ${this.chess.fen()}`);
      Sound.forMove(res);
      this.board.set({ lastMove: [res.fromSq, res.toSq], animate: [res.fromSq, res.toSq], arrows: [], marks: {}, selected: null });
      this.emit({ type: 'moves' });
      return res;
    }

    done(success, note) {
      if (this.finished) return;
      this.finished = true;
      this.board.set({ movable: null });
      const avgMs = this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0;
      Sound.play(success ? 'correct' : 'fail');
      this.emit({ type: 'done', success, mistakes: this.mistakes, hints: this.hints, avgMs, note: note || '' });
    }

    // ------------------------------------------------------------- user move
    onUserMove(m) {
      if (this.finished || this.busy || !this.userTurn()) return;
      const before = this.chess.clone();
      const res = this.chess.move(m);
      if (!res) return;
      const elapsed = performance.now() - this.turnStart;
      this.hintStage = 0;
      if (this.kind === 'line') return this.onLineMove(res, elapsed);
      if (this.kind === 'find') return this.onFindMove(res, before, elapsed);
      if (this.kind === 'play') return this.onPlayMove(res);
    }

    accept(res, elapsed, why) {
      this.times.push(elapsed);
      this.attempts = 0;
      Sound.forMove(res);
      this.board.set({ lastMove: [res.fromSq, res.toSq], arrows: [], marks: {}, selected: null });
      this.emit({ type: 'moves' });
      this.emit({ type: 'comment', san: res.san, why, by: 'you', ok: true });
    }

    reject(res, html, revealUci) {
      this.chess.undo();
      this.mistakes++;
      this.attempts++;
      Sound.play('wrong');
      const reveal = revealUci && (this.opts.mode === 'drill' || this.opts.guided || this.attempts >= 2);
      this.board.set({ selected: null, lastMove: this.lastPlayed(), arrows: reveal ? [[revealUci.slice(0, 2), revealUci.slice(2, 4), 'green']] : [], marks: { [res.toSq]: 'mark-red' } });
      this.emit({ type: 'moves' });
      this.emit({ type: 'wrong', san: res.san });
      this.status(html, 'bad');
      this.setMovable();
    }

    /** Custom explanation for a wrong move; keys may be written with or without +/#. */
    wrongFor(san) {
      const w = this.spec.wrong || {};
      const k = Object.keys(w).find((x) => clean(x) === clean(san));
      return k ? w[k] : null;
    }

    lastPlayed() {
      const h = this.chess.history;
      const l = h[h.length - 1];
      return l ? [l.fromSq, l.toSq] : null;
    }

    uciOf(san) {
      const m = this.chess.findMove(san);
      if (!m) return null;
      return Chess.sqName(m.from) + Chess.sqName(m.to) + (m.promotion || '');
    }

    onLineMove(res, elapsed) {
      const exp = this.line[this.idx];
      if (sanEq(res.san, exp.san)) {
        this.accept(res, elapsed, exp.why);
        this.idx++;
        this.status(this.opts.mode === 'drill' ? '✓ ' + t('Correct') : `✓ <b>${esc(res.san)}</b>`, 'good');
        return this.next();
      }
      const playedSan = res.san;
      this.chess.undo();
      const expUci = this.uciOf(exp.san);
      this.chess.move(res.uci);
      if (this.opts.guided) return this.reject(res, '✗ ' + t('Not that one. Follow the green arrow: play {san}.', { san: `<b>${esc(exp.san)}</b>` }), expUci);
      const custom = this.wrongFor(playedSan);
      const reveal = this.opts.mode === 'drill' || this.attempts >= 1;
      const html = '✗ ' + t("{san} isn't the move we're learning here.", { san: `<b>${esc(playedSan)}</b>` }) +
        (custom ? ` ${esc(custom)}` : '') +
        (reveal ? ' ' + t('The line continues {san}', { san: `<b>${esc(exp.san)}</b>` }) + (exp.why ? ': ' + esc(exp.why) : '.') : ' ' + t('Try again, or use a hint.'));
      this.reject(res, html, expUci);
    }

    onFindMove(res, before, elapsed) {
      const exp = this.sol[this.ply];
      const isMate = this.chess.isCheckmate();
      if (exp.some((s) => sanEq(s, res.san)) || isMate) {
        this.accept(res, elapsed);
        this.ply++;
        if (isMate || this.ply >= this.sol.length) return this.done(true, this.spec.why);
        this.status('✓ ' + t('Good. Keep going…'), 'good');
        return this.next();
      }
      const custom = this.wrongFor(res.san);
      const expUci = (() => { const c = before.clone(); const m = c.findMove(exp[0]); return m ? Chess.sqName(m.from) + Chess.sqName(m.to) + (m.promotion || '') : null; })();
      if (this.opts.guided) return this.reject(res, '✗ ' + (custom ? `<b>${esc(res.san)}</b>? ${esc(custom)} ` : '') + t('Not that one. Follow the green arrow: play {san}.', { san: `<b>${esc(exp[0])}</b>` }), expUci);
      if (custom) return this.reject(res, `✗ <b>${esc(res.san)}</b>? ${esc(custom)}`, expUci);
      if (this.spec.engine === false) return this.reject(res, '✗ ' + t("{san} isn't the move we're looking for. Try again.", { san: `<b>${esc(res.san)}</b>` }), expUci);
      // Engine arbitration: is the alternative just as good?
      this.busy = true;
      this.board.set({ movable: null, lastMove: [res.fromSq, res.toSq] });
      this.status(t('Checking your move with the engine…'));
      this.later(() => {
        const after = this.chess.clone();
        const depth = 4;
        const userScore = -Engine.search(after, { depth, timeMs: 1200 }).score;
        const sol = before.clone();
        sol.move(exp[0]);
        const solScore = -Engine.search(sol, { depth, timeMs: 1200 }).score;
        this.busy = false;
        if (userScore >= solScore - 50) {
          this.accept(res, elapsed);
          const main = new Chess(before.fen()).move(exp[0]);
          return this.done(true, t('That works too!') + ' ' + t('The main line was {san}.', { san: `**${main ? main.san : exp[0]}**` }) + `\n\n${this.spec.why || ''}`);
        }
        const why = this.refutation(after, userScore, solScore);
        this.reject(res, '✗ ' + t("{san} isn't best.", { san: `<b>${esc(res.san)}</b>` }) + ' ' + why, expUci);
      }, 30);
    }

    /** Explain why the position after the user's move is bad, from the engine's reply. */
    refutation(after, userScore, solScore) {
      const r = Engine.search(after, { depth: 3, timeMs: 700 });
      if (!r.move) return '';
      const san = `<b>${esc(r.move.san)}</b>`;
      if (r.score > MATE - 500) return t('It allows {san} with a forced mate.', { san });
      if (r.move.captured) return t('The opponent answers {san}, winning your {piece}.', { san, piece: pname(r.move.captured) });
      const cmp = userScore != null && solScore != null ? ' ' + t('The engine rates it {a} for you, against {b} for the best move.', { a: Engine.formatScore(userScore), b: Engine.formatScore(solScore) }) : '';
      return t('After {san} you have let the advantage slip.', { san }) + cmp;
    }

    // ------------------------------------------------------------ play mode
    onPlayMove(res) {
      this.userMoves++;
      Sound.forMove(res);
      this.board.set({ lastMove: [res.fromSq, res.toSq], arrows: [], marks: {}, selected: null });
      this.emit({ type: 'moves' });
      const g = this.spec.goal, limit = this.spec.moves;
      if (g === 'promote' && res.promotion) {
        if (this.chess.isStalemate()) return this.fail(t('Stalemate! Promote only when the enemy king still has a move.'));
        if (this.chess.legal().some((x) => x.to === res.to)) return this.fail(t('Your new piece can be captured. Bring your king closer first.'));
        return this.done(true, t("Promoted safely. That's the technique!"));
      }
      if (this.chess.isCheckmate()) return this.done(true, t('Checkmate in {n} moves.', { n: this.userMoves }) + (limit ? ' ' + t('(target: {n})', { n: limit }) : ''));
      const r = this.chess.result();
      if (r) return g === 'hold' ? this.done(true, t('Draw by {reason}. Held!', { reason: t(r.reason) })) : this.fail(t('Draw by {reason}. Press Retry and try again.', { reason: t(r.reason) }));
      if (g === 'mate' && limit && this.userMoves >= limit) return this.fail(t('Out of moves: you needed mate within {n}. Tighten the box and try again.', { n: limit }));
      if (g === 'hold' && limit && this.userMoves >= limit) return this.done(true, t('You held for {n} moves. The defence works!', { n: limit }));
      this.engineReply();
    }

    engineReply() {
      this.busy = true;
      this.board.set({ movable: null });
      this.status(t('Engine is thinking…'));
      this.later(() => {
        if (this.finished) return;
        const s = Engine.search(this.chess, { depth: 7, timeMs: 700 });
        const rr = this.play(s.move.uci);
        this.busy = false;
        const g = this.spec.goal;
        if (this.chess.isCheckmate()) return this.fail(t('You were checkmated.'));
        if ((g === 'mate' || g === 'promote') && rr.captured) return this.fail(t('The engine captured your {piece}. Press Retry.', { piece: pname(rr.captured) }));
        const r = this.chess.result();
        if (r) return g === 'hold' ? this.done(true, t('Draw by {reason}. Held!', { reason: t(r.reason) })) : this.fail(t('Draw by {reason}. Press Retry and try again.', { reason: t(r.reason) }));
        if (g === 'hold' && s.score > 600) return this.fail(t('After {san} the position is lost. Review the defensive method and retry.', { san: `<b>${esc(rr.san)}</b>` }));
        this.status(t('Engine played {san}. Your move.', { san: `<b>${esc(rr.san)}</b>` }) + (this.spec.moves && this.spec.goal !== 'promote' ? ` <span class="muted">(${this.userMoves}/${this.spec.moves})</span>` : ''));
        this.setMovable();
      }, 250);
    }

    fail(html) {
      this.mistakes++;
      this.status(html, 'bad');
      this.done(false);
    }

    // ------------------------------------------------------------ watch mode
    syncWatch() {
      this.emit({ type: 'watch', canBack: this.idx > 0, canForward: this.idx < this.line.length });
      if (this.idx >= this.line.length && !this.finished) this.done(true);
    }
    forward() {
      if (this.kind !== 'watch' || this.idx >= this.line.length) return;
      const res = this.play(this.line[this.idx].san);
      this.emit({ type: 'comment', san: res.san, why: this.line[this.idx].why, by: 'opp', ok: true });
      this.status(this.line[this.idx].why ? `<b>${esc(res.san)}</b> — ${esc(this.line[this.idx].why)}` : `<b>${esc(res.san)}</b>`);
      this.idx++;
      this.syncWatch();
    }
    back() {
      if (this.kind !== 'watch' || this.idx === 0) return;
      this.chess.undo();
      this.idx--;
      this.board.set({ lastMove: this.lastPlayed(), arrows: [] });
      this.emit({ type: 'moves' });
      this.status(this.idx ? t('Back to move {n}.', { n: this.idx }) : t('Start position.'));
      this.syncWatch();
    }

    // ------------------------------------------------------------------ hint
    hint() {
      if (this.finished || this.busy || !this.userTurn()) return;
      let uci = null;
      if (this.kind === 'line') uci = this.uciOf(this.line[this.idx].san);
      else if (this.kind === 'find') uci = this.uciOf(this.sol[this.ply][0]);
      else if (this.kind === 'play') { const s = Engine.search(this.chess, { depth: 7, timeMs: 800 }); uci = s.move && s.move.uci; }
      if (!uci) return;
      this.hints++;
      this.hintStage++;
      const from = uci.slice(0, 2);
      if (this.hintStage === 1) {
        this.board.set({ marks: { [from]: 'mark-hint' } });
        this.status('💡 ' + t('Look at your {piece} on {sq}.', { piece: pname(this.chess.get(from)), sq: from }));
      } else {
        this.board.set({ arrows: [[from, uci.slice(2, 4), 'blue']] });
        this.status('💡 ' + t('Follow the arrow.'));
      }
    }
  }

  Trainer.sanEq = sanEq;
  Trainer.clean = clean;
  global.Trainer = Trainer;
})(window);
