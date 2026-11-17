/*
 * pages/play.js — play against the engine with a live coach.
 */
(function () {
  'use strict';
  const { Store, esc, page, $ } = CC;
  const { PIECE_NAMES } = Chess;
  const MATE = Engine.MATE;
  const pieceName = (p) => I18N.piece(p);
  const aPiece = (p) => I18N.aPiece(p);
  const colorName = CC.colorName;
  const later = (fn, ms) => setTimeout(fn, ms);
  const el = CC.el;
  function matches(uci, expected) {
    const list = Array.isArray(expected) ? expected : [expected];
    return list.some((c) => (c.length === 4 ? uci.slice(0, 4) === c : uci === c));
  }
  function firstOf(expected) { return Array.isArray(expected) ? expected[0] : expected; }
  function setFeedback(node, kind, html) { node.className = 'status show ' + kind; node.innerHTML = html; }
  function shake(node) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }
  const trainingLayout = CC.trainingLayout;
  function PlayPage(root) {
    const S = Store.data.settings;
    const { holder, panel, evalbar } = trainingLayout(root);
    const board = new BoardView(holder, { onMove });
    const timers = [];
    let game = new Chess(), me = 'w', level = S.level, coach = S.coach, busy = false, over = false;
    let hintStage = 0, hintMove = null, evalWhite = 0, stats = null, lastOpening = null;

    board.set({ chess: game, movable: null });

    // -------- setup screen
    function setup() {
      over = true;
      evalbar.classList.add('hidden');
      board.set({ chess: new Chess(), movable: null, lastMove: null, arrows: [], marks: {}, orientation: S.color === 'b' ? 'b' : 'w' });
      panel.innerHTML = `
        <div class="card">
          <h2>${t('Play vs the coach')}</h2>
          <div class="small muted" style="margin-bottom:8px">${t('Play as')}</div>
          <div class="seg" id="colorSeg">
            <button data-c="w">♔ ${t('White')}</button><button data-c="r">${t('Random')}</button><button data-c="b">♚ ${t('Black')}</button>
          </div>
          <div class="small muted" style="margin:14px 0 8px">${t('Opponent strength')}</div>
          <div class="levels">
            ${Engine.LEVELS.map((l) => `<button class="level" data-l="${l.id}"><b>${t(l.name)}</b><span class="small muted">${l.elo}</span></button>`).join('')}
          </div>
          <label class="row" style="margin-top:14px;cursor:pointer;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="coachBox" ${S.coach ? 'checked' : ''}>
            <span><b>${t('Coach mode')}</b> <span class="small muted">— ${t('rates your moves, explains mistakes and warns about threats')}</span></span></label>
          <button class="btn primary" id="startBtn" style="width:100%;margin-top:16px">${t('Start game')}</button>
        </div>`;
      const sync = () => {
        panel.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === S.color));
        panel.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('on', +b.dataset.l === S.level));
      };
      sync();
      panel.addEventListener('click', function onSetup(e) {
        const c = e.target.closest('[data-c]'), l = e.target.closest('[data-l]');
        if (c) { S.color = c.dataset.c; Store.save(); sync(); }
        if (l) { S.level = +l.dataset.l; Store.save(); sync(); }
        if (e.target.closest('#startBtn')) {
          S.coach = $('#coachBox', panel).checked; Store.save();
          panel.removeEventListener('click', onSetup);
          start();
        }
      });
    }

    // -------- game screen
    function start() {
      game = new Chess();
      me = S.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : S.color;
      level = S.level; coach = S.coach; over = false; busy = false; evalWhite = 0; lastOpening = null;
      stats = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, hints: 0 };
      const L = Engine.LEVELS.find((x) => x.id === level);
      panel.innerHTML = `
        <div class="card">
          <div class="player-row"><span class="sw-dot">🤖</span> ${t('Coach bot')} <span class="pill">${t(L.name)} ${L.elo}</span></div>
          <div class="captured" id="capOpp"></div>
          <div class="player-row" style="margin-top:6px"><span>🙂</span> ${t('You')} (${colorName(me)})</div>
          <div class="captured" id="capMe"></div>
          <div class="status show info" id="status"></div>
          <div class="small muted" id="opening" style="margin-top:6px"></div>
        </div>
        <div class="row">
          <button class="btn" data-a="hint">💡 ${t('Hint')}</button>
          <button class="btn" data-a="undo">↶ ${t('Undo')}</button>
          <button class="btn" data-a="flip">⇅ ${t('Flip')}</button>
          <button class="btn" data-a="resign">🏳 ${t('Resign')}</button>
          <span class="spacer"></span>
          <button class="btn primary" data-a="new">${t('New game')}</button>
        </div>
        <div class="card ${coach ? '' : 'hidden'}"><h3>🎓 ${t('Coach')}</h3><div class="coach-feed" id="feed"></div></div>
        <div class="card"><h3>${t('Moves')}</h3><div class="movelist" id="moves"><span class="muted small" style="grid-column:1/-1">${t('No moves yet.')}</span></div></div>`;
      evalbar.classList.toggle('hidden', !coach);
      board.set({ chess: game, orientation: me, movable: null, lastMove: null, arrows: [], marks: {} });
      if (coach) say('tip', me === 'w'
        ? t('You have White, so you move first. Aim for the centre (e4 or d4), develop your knights and bishops, and castle early.')
        : t("You have Black. Respond in the centre, develop your pieces and castle. I'll comment on every move."));
      refresh();
      if (game.turn !== me) engineTurn();
    }

    function say(tag, html) {
      const feed = $('#feed', panel);
      if (!feed) return;
      const labels = { best: 'Best', great: 'Great', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder', threat: 'Threat', tip: 'Tip', book: 'Book' };
      const node = el(`<div class="coach-msg"><span class="tag ${tag}">${t(labels[tag] || tag)}</span><div>${html}</div></div>`);
      feed.prepend(node);
    }

    function status(html, kind) {
      const s = $('#status', panel);
      if (!s) return;
      s.className = 'status show ' + (kind || 'info');
      s.innerHTML = html;
    }

    function refresh() {
      board.set({ movable: !over && !busy && game.turn === me ? me : null });
      renderMoves();
      renderCaptured();
      renderEval();
      const op = Engine.openingName(game);
      if (op) lastOpening = t(op);
      const opEl = $('#opening', panel);
      if (opEl) opEl.textContent = lastOpening ? '📖 ' + lastOpening : '';
      if (!over) {
        if (busy) status(t('Thinking…'));
        else if (game.turn === me) status(game.inCheck() ? '⚠ ' + t('You are in check!') : t('Your move'), game.inCheck() ? 'bad' : 'info');
      }
    }

    function renderMoves() {
      const box = $('#moves', panel);
      if (!box || !game.history.length) return;
      let html = '';
      game.history.forEach((m, i) => {
        if (i % 2 === 0) html += `<span class="n">${Math.floor(i / 2) + 1}.</span>`;
        html += `<span class="${i === game.history.length - 1 ? 'cur' : ''}">${esc(m.san)}</span>`;
      });
      if (game.history.length % 2 === 1) html += '<span></span>';
      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;
    }

    function renderCaptured() {
      const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
      const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
      for (const p of game.board) if (p && p.toLowerCase() !== 'k') count[Chess.colorOf(p)][p.toLowerCase()]++;
      const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
      const mat = (c) => Object.keys(vals).reduce((s, t) => s + count[c][t] * vals[t], 0);
      const lost = (c) => ['q', 'r', 'b', 'n', 'p'].map((t) =>
        BoardView.pieceHtml(c, t, 'mini').repeat(Math.max(0, start[t] - count[c][t]))).join('');
      const opp = me === 'w' ? 'b' : 'w';
      const diff = mat(me) - mat(opp);
      const capMe = $('#capMe', panel), capOpp = $('#capOpp', panel);
      if (capMe) capMe.innerHTML = lost(opp) + (diff > 0 ? `<span class="adv">+${diff}</span>` : '');
      if (capOpp) capOpp.innerHTML = lost(me) + (diff < 0 ? `<span class="adv">+${-diff}</span>` : '');
    }

    function renderEval() {
      if (!coach) return;
      let pct;
      if (Math.abs(evalWhite) > MATE - 500) pct = evalWhite > 0 ? 100 : 0;
      else pct = 50 + 50 * (2 / (1 + Math.exp(-evalWhite / 300)) - 1);
      $('.white', evalbar).style.height = pct + '%';
      const lab = $('.label', evalbar);
      lab.textContent = Engine.formatScore(evalWhite).replace('+', '');
      const whiteBottom = board.orientation === 'w';
      evalbar.style.transform = whiteBottom ? '' : 'rotate(180deg)';
      lab.style.transform = whiteBottom ? '' : 'rotate(180deg)';
      lab.style.top = pct >= 50 === whiteBottom ? 'auto' : '3px';
      lab.style.bottom = pct >= 50 === whiteBottom ? '3px' : 'auto';
      lab.style.color = pct >= 50 ? '#333' : '#eee';
    }

    function onMove(m) {
      if (over || busy || game.turn !== me) return;
      const before = game.clone();
      const res = game.move(m);
      if (!res) return;
      Sound.forMove(res);
      hintStage = 0; hintMove = null;
      busy = true;
      board.set({ lastMove: [res.fromSq, res.toSq], arrows: [], marks: {}, selected: null });
      refresh();
      if (checkOver()) { if (coach) review(before, res); return; }
      timers.push(later(() => {
        if (coach) review(before, res);
        timers.push(later(engineTurn, 30));
      }, 40));
    }

    function engineTurn() {
      busy = true;
      refresh();
      timers.push(later(() => {
        if (over) return;
        const choice = Engine.chooseMove(game, level);
        const r = game.move(choice.move);
        if (!r) { busy = false; refresh(); return; }
        if (choice.score != null) evalWhite = me === 'w' ? -choice.score : choice.score;
        Sound.forMove(r);
        busy = false;
        board.set({ lastMove: [r.fromSq, r.toSq], animate: [r.fromSq, r.toSq] });
        refresh();
        if (checkOver()) return;
        if (coach) threatWatch(r);
      }, 300));
    }

    function checkOver() {
      const r = game.result();
      if (!r) return false;
      finish(r.winner === null ? 'draw' : r.winner === me ? 'win' : 'loss', r.reason);
      return true;
    }

    function finish(outcome, reason) {
      over = true; busy = false;
      const G = Store.data.games;
      G.played++;
      if (outcome === 'win') G.won++; else if (outcome === 'loss') G.lost++; else G.drawn++;
      Store.save();
      const rs = t(reason);
      const msg = outcome === 'win' ? '🏆 ' + t('You won by {reason}!', { reason: rs }) : outcome === 'loss' ? t('You lost by {reason}.', { reason: rs }) : t('Draw by {reason}.', { reason: rs });
      status(msg + ` <a href="javascript:void 0" data-a="new">${t('Play again')}</a>`, outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : 'info');
      Sound.play(outcome === 'win' ? 'end' : outcome === 'loss' ? 'fail' : 'end');
      Store.bump();
      if (coach && stats) {
        const parts = [];
        for (const k of ['blunder', 'mistake', 'inaccuracy']) if (stats[k]) parts.push(CC.plural(stats[k], k));
        say('tip', `<b>${t('Game over.')}</b> ${parts.length ? t('You made {list}.', { list: parts.join(', ') }) : t('No serious mistakes — great game!')} ` +
          t('{n} of your moves were good or best.', { n: stats.best + stats.good }) +
          (stats.blunder ? ' ' + t('Most blunders come from not checking what your opponent can capture — do a blunder check before every move.') : ''));
      }
      board.set({ movable: null });
    }

    // -------- coaching
    function review(before, res) {
      const r = Engine.search(before, { depth: 3, timeMs: 900, exact: true });
      const best = r.root[0];
      const played = r.root.find((x) => x.uci === res.uci);
      if (!best || !played) return;
      const loss = best.score - played.score;
      const bestSan = before.san(best.m);
      const isBest = best.uci === res.uci;
      evalWhite = me === 'w' ? played.score : -played.score;
      renderEval();
      const reasons = [];
      if (res.flags === 'k' || res.flags === 'q') reasons.push(t('Castling tucks your king away and brings a rook toward the centre.'));
      if (res.captured) reasons.push(t('You captured {piece}.', { piece: aPiece(res.captured) }));
      if (res.san.includes('+') && !res.san.includes('#')) reasons.push(t('Check — forcing moves keep the initiative.'));
      const pt = res.piece.toLowerCase();
      if (game.history.length <= 20 && (pt === 'n' || pt === 'b') && (res.from >> 3) === (me === 'w' ? 0 : 7)) reasons.push(t('Developing a piece — exactly what the opening is about.'));
      if (game.history.length <= 8 && pt === 'p' && ['e4', 'd4', 'e5', 'd5'].includes(res.toSq)) reasons.push(t('Claiming the centre with a pawn.'));
      if (pt === 'q' && game.history.length <= 10 && !res.captured) reasons.push(t('Careful with early queen moves: she can be chased around while your opponent develops.'));

      if (game.isCheckmate()) { stats.best++; say('great', `<b>${esc(res.san)}</b> — ${t('checkmate! Beautifully done.')}`); return; }
      if (best.score > MATE - 500 && played.score < MATE - 500) {
        stats.mistake++;
        say('mistake', `<b>${esc(res.san)}</b> — ` + t('you had a forced checkmate starting with {san}!', { san: `<b>${esc(bestSan)}</b>` }));
        return;
      }
      if (loss <= 15) {
        stats.best++;
        say(isBest ? 'best' : 'great', `<b>${esc(res.san)}</b> — ${isBest ? t('the best move!') : t('excellent, as good as the top choice.')} ${esc(reasons[0] || '')}`);
        return;
      }
      if (loss <= 60) {
        stats.good++;
        say('good', `<b>${esc(res.san)}</b> — ${t('good move.')} ${esc(reasons[0] || '')} <span class="muted">(${t('{san} was slightly stronger.', { san: esc(bestSan) })})</span>`);
        return;
      }
      if (loss <= 150) {
        stats.inaccuracy++;
        const why = best.m.captured ? ' — ' + t('it wins {piece}', { piece: aPiece(best.m.captured) }) : '';
        say('inaccuracy', t('{san} is a bit imprecise.', { san: `<b>${esc(res.san)}</b>` }) + ' ' + t('{san} was better', { san: `<b>${esc(bestSan)}</b>` }) + why + '.');
        return;
      }
      // Mistake / blunder: explain the opponent's best reply.
      const tag = loss > 300 ? 'blunder' : 'mistake';
      stats[tag]++;
      const after = before.clone();
      after.move(res.uci);
      const rep = Engine.search(after, { depth: 2, timeMs: 400 });
      let why;
      if (rep.move && rep.score > MATE - 500) why = t('It allows a forced checkmate, starting with {san}.', { san: `<b>${esc(rep.move.san)}</b>` });
      else if (rep.move && rep.move.captured) why = t('Your opponent can answer {san}, winning your {piece}.', { san: `<b>${esc(rep.move.san)}</b>`, piece: pieceName(rep.move.captured) });
      else if (best.m.captured) why = t('You missed {san}, which wins {piece}.', { san: `<b>${esc(bestSan)}</b>`, piece: aPiece(best.m.captured) });
      else if (rep.move) why = t('It gives your opponent a strong reply: {san}.', { san: `<b>${esc(rep.move.san)}</b>` });
      else why = '';
      say(tag, `<b>${esc(res.san)}</b> — ${tag === 'blunder' ? t('a blunder.') : t('a mistake.')} ${why} ` + t('Better was {san}.', { san: `<b>${esc(bestSan)}</b>` }));
    }

    function threatWatch(engineMove) {
      if (game.inCheck()) { say('threat', t('{san} is check! Capture the checking piece, block, or move your king.', { san: `<b>${esc(engineMove.san)}</b>` })); return; }
      // "Null move": what would the opponent do if it were their turn again?
      const parts = game.fen().split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      parts[3] = '-';
      let tp;
      try { tp = new Chess(parts.join(' ')); } catch (_) { return; }
      if (tp.inCheck(me)) return;
      const r = Engine.search(tp, { depth: 2, timeMs: 350 });
      if (!r.move) return;
      const gain = r.score - Engine.evaluate(tp);
      if (r.score > MATE - 500) say('threat', t('Watch out — your opponent threatens {san}, checkmate!', { san: `<b>${esc(r.move.san)}</b>` }));
      else if (r.move.captured && gain >= 150) say('threat', t('Your {piece} on {sq} is in danger: your opponent threatens {san}.', { piece: pieceName(r.move.captured), sq: r.move.toSq, san: `<b>${esc(r.move.san)}</b>` }));
    }

    function hint() {
      if (over || busy || game.turn !== me) return;
      if (!hintMove || hintStage === 0) {
        const r = Engine.search(game, { depth: 4, timeMs: 900 });
        hintMove = r.move;
        if (stats) stats.hints++;
      }
      hintStage++;
      if (hintStage === 1) {
        board.set({ marks: { [hintMove.fromSq]: 'mark-hint' } });
        status('💡 ' + t('Consider your {piece} on {sq}.', { piece: pieceName(hintMove.piece), sq: hintMove.fromSq }));
      } else {
        board.set({ arrows: [[hintMove.fromSq, hintMove.toSq, 'blue']] });
        status(`💡 ${esc(hintMove.san)}`);
      }
    }

    function undo() {
      if (busy || !game.history.length) return;
      if (game.turn === me) { game.undo(); if (game.turn !== me) game.undo(); }
      else game.undo();
      if (game.turn !== me) { // undo went back to the engine's turn (player is Black at move 1)
        if (!game.history.length) { over = false; refresh(); engineTurn(); return; }
        game.undo();
      }
      over = false; hintStage = 0;
      const lm = game.history[game.history.length - 1];
      board.set({ lastMove: lm ? [lm.fromSq, lm.toSq] : null, arrows: [], marks: {} });
      if (coach) say('tip', t('Move taken back. Have another look!'));
      refresh();
    }

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'hint') hint();
      else if (a === 'undo') undo();
      else if (a === 'flip') { board.set({ orientation: board.orientation === 'w' ? 'b' : 'w' }); renderEval(); }
      else if (a === 'resign') { if (!over && game.history.length) finish('loss', 'resignation'); }
      else if (a === 'new') setup();
    });

    setup();
    return () => timers.forEach(clearTimeout);
  }
  page('play', (root) => PlayPage(root));
})();
