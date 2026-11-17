/*
 * pages/puzzles.js — rated tactical puzzles (data/puzzles.json).
 */
(function () {
  'use strict';
  const { Store, esc, page, $ } = CC;
  const { PIECE_NAMES } = Chess;
  const MATE = Engine.MATE;
  const pieceName = (p) => I18N.piece(p);
  const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
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
  function pickPuzzle() {
    const d = Store.data.puzzles;
    const unsolved = CCData.puzzles.filter((p) => !d.solved[p.id]);
    const pool = unsolved.length ? unsolved : CCData.puzzles;
    return pool.slice().sort((a, b) => Math.abs(a.rating - d.rating) - Math.abs(b.rating - d.rating))[0];
  }

  function PuzzlePage(root, id) {
    const puzzle = CCData.puzzles.find((p) => String(p.id) === id) || pickPuzzle();
    const { holder, panel } = trainingLayout(root);
    const P = Store.data.puzzles;
    const timers = [];
    const chess = new Chess(puzzle.fen);
    const me = chess.turn;
    let ply = 0, finished = false, penalized = false, hinted = 0, busy = false;

    panel.innerHTML = `
      <div class="card">
        <div class="row"><span class="pill">${esc(puzzle.theme)}</span><span class="pill">${t('Rating')} ${puzzle.rating}</span><span class="spacer"></span>
          <span class="small muted">${t('Puzzle')} #${puzzle.id}</span></div>
        <h2 style="margin-top:10px">${esc(puzzle.title)}</h2>
        <div class="turn"><span class="sw ${me}"></span>${t('Find the best move for {color}', { color: colorName(me) })}</div>
      </div>
      <div class="status"></div>
      <div class="row">
        <button class="btn" data-a="hint">💡 ${t('Hint')}</button>
        <button class="btn" data-a="solution">${t('Show solution')}</button>
        <button class="btn" data-a="retry">↺ ${t('Retry')}</button>
        <span class="spacer"></span>
        <button class="btn primary" data-a="next">${t('Next puzzle')} →</button>
      </div>
      <div class="card">
        <div class="row"><div><div class="small muted">${t('Your puzzle rating')}</div><div style="font-size:28px;font-weight:700" id="pr">${P.rating}</div></div>
        <span class="spacer"></span><div style="text-align:right"><div class="small muted">${t('Streak')}</div><div style="font-size:22px;font-weight:700" id="ps">${P.streak} 🔥</div></div></div>
      </div>
      <div class="card"><h3>${t('All puzzles')}</h3><div class="puzzle-chips"></div></div>`;
    const fb = $('.status', panel);
    const chips = $('.puzzle-chips', panel);
    chips.innerHTML = CCData.puzzles.map((p) => `<button class="chip ${P.solved[p.id] ? 'solved' : P.failed[p.id] ? 'failed' : ''} ${p.id === puzzle.id ? 'cur' : ''}" title="${esc(p.title)} (${p.rating})" data-id="${p.id}">${p.id}</button>`).join('');

    const board = new BoardView(holder, { onMove });
    board.set({ chess, orientation: me, movable: me });

    const expected = () => 1 / (1 + Math.pow(10, (puzzle.rating - P.rating) / 400));
    function updateRating(delta) {
      P.rating = Math.max(100, P.rating + delta);
      $('#pr', panel).textContent = P.rating + (delta ? ` (${delta > 0 ? '+' : ''}${delta})` : '');
      $('#ps', panel).textContent = P.streak + ' 🔥';
      Store.save();
    }
    function penalize() {
      if (penalized || finished) return;
      penalized = true;
      if (!P.solved[puzzle.id]) {
        P.failed[puzzle.id] = true;
        P.streak = 0;
        updateRating(-Math.round(32 * expected()));
      }
    }
    function solved(msg) {
      finished = true;
      board.set({ movable: null });
      let extra = '';
      if (!penalized && !hinted && !P.solved[puzzle.id]) {
        P.streak++;
        P.best = Math.max(P.best || 0, P.streak);
        updateRating(Math.round(32 * (1 - expected())));
        extra = ' ' + t('Rating up!');
      }
      Store.bump();
      if (!penalized) { P.solved[puzzle.id] = true; delete P.failed[puzzle.id]; Store.save(); }
      Sound.play('correct');
      setFeedback(fb, 'good', `✓ ${esc(msg || t('Solved!'))}${extra}<div class="small" class="explain-text">${esc(puzzle.explain)}</div>`);
      const chip = chips.querySelector(`[data-id="${puzzle.id}"]`);
      if (chip && !penalized) chip.className = 'chip solved cur';
    }

    function onMove(m) {
      if (finished || busy) return;
      const before = new Chess(chess.fen());
      const res = chess.move(m);
      if (!res) return;
      const exp = puzzle.solution[ply];
      if (matches(res.uci, exp) || chess.isCheckmate()) return correct(res);
      if (puzzle.noVerify) return reject();
      // Maybe an alternative that is just as good? Ask the engine.
      busy = true;
      board.set({ lastMove: [res.fromSq, res.toSq], movable: null });
      setFeedback(fb, 'info', t('Checking your move…'));
      timers.push(later(() => {
        const remaining = puzzle.solution.length - ply;
        const depth = Math.min(4, Math.max(2, remaining));
        const userScore = -Engine.search(new Chess(chess.fen()), { depth, timeMs: 1500 }).score;
        before.move(exp);
        const solScore = -Engine.search(before, { depth, timeMs: 1500 }).score;
        busy = false;
        if (solScore > 150 && userScore >= solScore - 40) {
          board.set({ movable: null });
          solved(t('That works too!') + ' ' + t('The main line was {san}.', { san: firstMoveSan() }));
        } else reject();
      }, 30));
      function reject() {
        chess.undo();
        board.set({ movable: me, lastMove: null });
        penalize();
        Sound.play('wrong');
        shake(holder);
        setFeedback(fb, 'bad', '✗ ' + t('Not the best move. Try again!'));
      }
    }

    function firstMoveSan() {
      const c = new Chess(puzzle.fen);
      const r = c.move(puzzle.solution[0]);
      return r ? r.san : puzzle.solution[0];
    }

    function correct(res) {
      Sound.forMove(res);
      ply++;
      board.set({ lastMove: [res.fromSq, res.toSq], arrows: [], marks: {} });
      if (chess.isCheckmate()) return solved(t('Checkmate!'));
      if (ply >= puzzle.solution.length) return solved(t('Solved!'));
      busy = true;
      board.set({ movable: null });
      setFeedback(fb, 'good', t('Best move! Keep going…'));
      timers.push(later(() => {
        const r = chess.move(puzzle.solution[ply]);
        ply++;
        busy = false;
        Sound.forMove(r);
        board.set({ lastMove: [r.fromSq, r.toSq], animate: [r.fromSq, r.toSq], movable: me });
        setFeedback(fb, 'info', t('Opponent played {san}. Your move.', { san: `<b>${esc(r.san)}</b>` }));
      }, 600));
    }

    function hint() {
      if (finished) return;
      const uci = firstOf(puzzle.solution[ply]);
      hinted++;
      if (hinted === 1) {
        board.set({ marks: { [uci.slice(0, 2)]: 'mark-hint' } });
        setFeedback(fb, 'info', '💡 ' + t('Look at your {piece} on {sq}.', { piece: pieceName(chess.get(uci.slice(0, 2))), sq: uci.slice(0, 2) }) + ' ' + t('(Hints mean no rating gain.)'));
      } else {
        board.set({ arrows: [[uci.slice(0, 2), uci.slice(2, 4), 'blue']] });
      }
    }

    function showSolution() {
      if (finished) return;
      penalize();
      finished = true;
      board.set({ movable: null, marks: {}, arrows: [] });
      const step = () => {
        if (ply >= puzzle.solution.length) {
          setFeedback(fb, 'info', t('Solution shown.') + ` ${esc(puzzle.explain)}`);
          return;
        }
        const r = chess.move(firstOf(puzzle.solution[ply]));
        ply++;
        Sound.forMove(r);
        board.set({ lastMove: [r.fromSq, r.toSq] });
        timers.push(later(step, 800));
      };
      step();
    }

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a],[data-id]');
      if (!b) return;
      if (b.dataset.id) { location.hash = '#/puzzles/' + b.dataset.id; if (b.dataset.id === String(puzzle.id)) CC.route(); return; }
      const a = b.dataset.a;
      if (a === 'hint') hint();
      else if (a === 'solution') showSolution();
      else if (a === 'retry') { location.hash = '#/puzzles/' + puzzle.id; CC.route(); }
      else if (a === 'next') {
        const n = pickPuzzle();
        const target = n.id === puzzle.id ? CCData.puzzles[(CCData.puzzles.indexOf(puzzle) + 1) % CCData.puzzles.length] : n;
        location.hash = '#/puzzles/' + target.id;
      }
    });
    return () => timers.forEach(clearTimeout);
  }
  page('puzzles', (root, [id]) => PuzzlePage(root, id));
})();
