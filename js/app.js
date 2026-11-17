/*
 * app.js — Chess Coach application: routing, home, lessons, puzzles and play-vs-coach.
 */
(function () {
  'use strict';
  const { sqName, sqIndex, PIECE_NAMES } = Chess;
  const GLYPH = BoardView.GLYPH;
  const MATE = Engine.MATE;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const app = $('#app');

  // ------------------------------------------------------------------ storage
  const Store = (() => {
    const KEY = 'chess-coach-v1';
    const defaults = () => ({
      lessons: {},
      puzzles: { solved: {}, failed: {}, rating: 800, streak: 0, best: 0 },
      games: { played: 0, won: 0, lost: 0, drawn: 0 },
      settings: { level: 2, color: 'w', coach: true, sound: true, theme: null },
    });
    let data = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const k of Object.keys(data)) if (saved[k]) data[k] = Object.assign(data[k], saved[k]);
    } catch (_) { /* storage unavailable */ }
    return {
      get data() { return data; },
      save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } },
      reset() { data = defaults(); this.save(); },
    };
  })();

  // -------------------------------------------------------------------- sound
  const Sound = {
    ctx: null,
    tone(freq, start, dur, type, vol) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t = ctx.currentTime + start;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    },
    play(kind) {
      if (!Store.data.settings.sound) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (kind === 'move') this.tone(440, 0, 0.09, 'triangle', 0.15);
        else if (kind === 'capture') { this.tone(300, 0, 0.12, 'square', 0.06); this.tone(220, 0.04, 0.12, 'triangle', 0.12); }
        else if (kind === 'good') { this.tone(660, 0, 0.14); this.tone(880, 0.11, 0.25); }
        else if (kind === 'bad') this.tone(180, 0, 0.25, 'sawtooth', 0.05);
        else if (kind === 'win') { this.tone(523, 0, 0.15); this.tone(659, 0.12, 0.15); this.tone(784, 0.24, 0.35); }
      } catch (_) { /* audio unavailable */ }
    },
    forMove(m) { this.play(m && m.captured ? 'capture' : 'move'); },
  };

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function md(text) {
    return esc(text).split(/\n\n+/).map((p) => '<p>' + p
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\n/g, '<br>') + '</p>').join('');
  }
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const colorName = (c) => (c === 'w' ? 'White' : 'Black');
  const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  const pieceName = (p) => PIECE_NAMES[p.toLowerCase()];
  function matches(uci, expected) {
    const list = Array.isArray(expected) ? expected : [expected];
    return list.some((c) => (c.length === 4 ? uci.slice(0, 4) === c : uci === c));
  }
  function firstOf(expected) { return Array.isArray(expected) ? expected[0] : expected; }
  function setFeedback(node, kind, html) {
    node.className = 'feedback show ' + kind;
    node.innerHTML = html;
  }
  function clearFeedback(node) { node.className = 'feedback'; node.innerHTML = ''; }
  function shake(node) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }
  const later = (fn, ms) => setTimeout(fn, ms);

  // -------------------------------------------------------------------- tips
  const TIPS = [
    ['🧠', 'Before every move, ask: what is my opponent threatening?'],
    ['🔍', 'Look for Checks, Captures and Threats — in that order.'],
    ['🏰', 'Castle early. A king in the centre is a target.'],
    ['♞', 'Knights on the rim are dim — keep them near the centre.'],
    ['⚖', "Don't grab material if it leaves your king or pieces exposed."],
    ['🎯', 'Two attackers beat one defender. Count before you capture.'],
    ['🛡', 'Every piece should be defended, or doing something important.'],
    ['♜', 'Rooks love open files and the 7th rank.'],
    ['♔', 'In the endgame, your king is a strong piece — use it!'],
    ['⏳', "When you see a good move, look for a better one. Then check it's safe."],
    ['🧩', 'Ten puzzles a day will improve your tactics faster than anything else.'],
    ['♛', "Don't bring your queen out too early: it gets chased around."],
  ];

  // ------------------------------------------------------------------ router
  let cleanup = null;
  const routes = { '': Home, learn: LearnList, lesson: LessonPage, puzzles: PuzzlePage, play: PlayPage };
  function route() {
    if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    const view = routes[name] || Home;
    app.innerHTML = '';
    document.querySelectorAll('.nav a').forEach((a) => {
      const r = a.dataset.route;
      a.classList.toggle('active', r === name || (r === 'learn' && name === 'lesson') || (r === '' && !routes[name]));
    });
    cleanup = view(app, arg) || null;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // ==================================================================== HOME
  function nextLesson() {
    return LESSONS.find((l) => !Store.data.lessons[l.id]) || LESSONS[0];
  }

  function Home(root) {
    const d = Store.data;
    const lessonsDone = LESSONS.filter((l) => d.lessons[l.id]).length;
    const solved = Object.keys(d.puzzles.solved).length;
    const nl = nextLesson();
    const tip = TIPS[Math.floor(Date.now() / 864e5) % TIPS.length];
    root.innerHTML = `
      <section class="hero">
        <div>
          <span class="pill green">Your personal chess coach</span>
          <h1>Learn chess, one move at a time.</h1>
          <p>Interactive lessons from the very first move to tactics and endgames, puzzles that adapt to your level,
             and a coach that explains your mistakes while you play.</p>
          <div class="row">
            <a class="btn primary" href="#/lesson/${nl.id}">${lessonsDone ? 'Continue' : 'Start'}: ${esc(nl.title)}</a>
            <a class="btn" href="#/play">Play vs the coach</a>
          </div>
        </div>
        <div class="hero-board" id="heroBoard"></div>
      </section>
      <div class="stats">
        <div class="stat"><div class="v">${lessonsDone}/${LESSONS.length}</div><div class="l">Lessons completed</div></div>
        <div class="stat"><div class="v">${d.puzzles.rating}</div><div class="l">Puzzle rating</div></div>
        <div class="stat"><div class="v">${solved}/${PUZZLES.length}</div><div class="l">Puzzles solved</div></div>
        <div class="stat"><div class="v">${d.games.won}–${d.games.drawn}–${d.games.lost}</div><div class="l">Games W–D–L</div></div>
      </div>
      <div class="modes">
        <a class="card mode" href="#/learn">
          <div class="big">📘</div><h2>Learn</h2>
          <div class="muted">${LESSONS.length} interactive lessons: how the pieces move, rules, strategy, tactics, checkmates and endgames.</div>
          <div class="progress"><div style="width:${(lessonsDone / LESSONS.length) * 100}%"></div></div>
        </a>
        <a class="card mode" href="#/puzzles">
          <div class="big">🧩</div><h2>Puzzles</h2>
          <div class="muted">Train your tactical vision. Puzzles are picked to match your rating.</div>
          <div class="progress"><div style="width:${(solved / PUZZLES.length) * 100}%"></div></div>
        </a>
        <a class="card mode" href="#/play">
          <div class="big">🤖</div><h2>Play</h2>
          <div class="muted">Four difficulty levels. The coach rates every move and warns you about threats.</div>
          <div class="small muted">${d.games.played} game${d.games.played === 1 ? '' : 's'} played</div>
        </a>
      </div>
      <div class="card tip"><div class="big">${tip[0]}</div><div><h3>Tip of the day</h3><div class="muted">${esc(tip[1])}</div></div></div>`;
    const hb = new BoardView($('#heroBoard', root), {});
    hb.set({
      chess: new Chess('4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 17'),
      arrows: [['b3', 'b8', 'green'], ['d1', 'd8', 'blue']], showCoords: false,
    });
  }

  // ============================================================= LEARN LIST
  function LearnList(root) {
    const d = Store.data;
    let html = '<h1>Learn</h1><p class="muted">Work through the lessons in order, or jump to any topic. Each one takes 2–5 minutes.</p>';
    let chapter = null;
    for (const l of LESSONS) {
      if (l.chapter !== chapter) {
        if (chapter) html += '</div>';
        chapter = l.chapter;
        html += `<div class="chapter">${esc(chapter)}</div><div class="lesson-grid">`;
      }
      const done = !!d.lessons[l.id];
      html += `<a class="card lesson-card ${done ? 'done' : ''}" href="#/lesson/${l.id}">
        <div class="ico">${l.icon}</div>
        <div><h3>${esc(l.title)}</h3><div class="small muted">${esc(l.summary)}</div></div>
        ${done ? '<span class="check">✓</span>' : ''}</a>`;
    }
    html += '</div>';
    root.innerHTML = html;
  }

  // ============================================================ LESSON PAGE
  function trainingLayout(root) {
    root.innerHTML = `
      <div class="train">
        <div class="board-col"><div class="evalbar hidden"><div class="white"></div><div class="label"></div></div><div class="board-holder"></div></div>
        <div class="panel"></div>
      </div>`;
    return { holder: $('.board-holder', root), panel: $('.panel', root), evalbar: $('.evalbar', root) };
  }

  function LessonPage(root, id) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) { location.hash = '#/learn'; return null; }
    const idx = LESSONS.indexOf(lesson);
    const { holder, panel } = trainingLayout(root);
    panel.innerHTML = `
      <div class="card">
        <div class="row"><span class="pill">${esc(lesson.chapter)}</span><span class="spacer"></span><a class="small" href="#/learn">All lessons</a></div>
        <h2 style="margin-top:10px">${lesson.icon} ${esc(lesson.title)}</h2>
        <div class="dots"></div>
      </div>
      <div class="card"><div class="step-text"></div></div>
      <div class="feedback"></div>
      <div class="row">
        <button class="btn" data-a="back">← Back</button>
        <button class="btn" data-a="hint">💡 Hint</button>
        <button class="btn" data-a="reset">↺ Reset</button>
        <span class="spacer"></span>
        <button class="btn primary" data-a="next">Next →</button>
      </div>`;
    const dots = $('.dots', panel), text = $('.step-text', panel), fb = $('.feedback', panel);
    const btn = (a) => panel.querySelector(`[data-a="${a}"]`);
    const timers = [];
    const board = new BoardView(holder, { onMove, onSquareClick });
    let step, si = 0, chess, ply = 0, done = false, hintLevel = 0, moveCount = 0, busy = false;

    function renderDots() {
      dots.innerHTML = lesson.steps.map((_, i) => `<span class="${i < si ? 'done' : ''} ${i === si ? 'cur' : ''}"></span>`).join('');
    }

    function load(i) {
      timers.forEach(clearTimeout); timers.length = 0;
      si = i; step = lesson.steps[i];
      done = step.type === 'info'; ply = 0; hintLevel = 0; moveCount = 0; busy = false;
      clearFeedback(fb);
      text.innerHTML = md(step.text);
      renderDots();
      chess = new Chess(step.fen);
      const orientation = step.type === 'move' || step.type === 'practice' ? chess.turn : 'w';
      board.set({
        chess, orientation, selected: null, lastMove: null,
        movable: ['stars', 'move', 'practice'].includes(step.type) ? chess.turn : null,
        clickMode: step.type === 'click',
        arrows: step.arrows || [], marks: Object.assign({}, step.marks || {}),
        stars: new Set(step.stars || []),
      });
      btn('back').disabled = i === 0;
      btn('hint').disabled = step.type === 'info' || step.type === 'stars';
      btn('reset').disabled = step.type === 'info' || step.type === 'click';
      updateNext();
      if (step.type === 'move' || step.type === 'practice') {
        setFeedback(fb, 'info', `<span class="turn"><span class="sw ${chess.turn}"></span>${colorName(chess.turn)} to move</span>`);
      }
    }

    function updateNext() {
      const last = si === lesson.steps.length - 1;
      btn('next').textContent = last ? 'Finish ✓' : 'Next →';
      btn('next').disabled = !done;
    }

    function complete(msg) {
      done = true;
      board.set({ movable: null, clickMode: false });
      setFeedback(fb, 'good', '✓ ' + esc(msg || 'Well done!'));
      Sound.play('good');
      updateNext();
    }

    function wrong(msg) {
      Sound.play('bad');
      shake(holder);
      setFeedback(fb, 'bad', esc(msg || 'Not quite — try again.'));
      board.set({ selected: null });
    }

    function onSquareClick(sq) {
      if (done) return;
      if (step.targets.includes(sq)) { board.flash(sq, 'flash-good'); board.set({ marks: { [sq]: 'mark-green' } }); complete(`Yes, that's ${sq}!`); }
      else { board.flash(sq, 'flash-bad'); wrong(`That's ${sq}. Try again!`); }
    }

    function onMove(m) {
      if (done || busy) return;
      if (step.type === 'stars') {
        const res = chess.move(m);
        if (!res) return;
        chess.turn = 'w'; chess.ep = -1; moveCount++;
        const stars = board.stars;
        if (stars.has(res.toSq)) { stars.delete(res.toSq); Sound.play('capture'); } else Sound.play('move');
        board.set({ lastMove: [res.fromSq, res.toSq], movable: 'w' });
        if (!stars.size) complete(`All stars collected in ${moveCount} move${moveCount === 1 ? '' : 's'}!`);
        return;
      }
      if (step.type === 'move') return onLessonMove(m);
      if (step.type === 'practice') return onPracticeMove(m);
    }

    function onLessonMove(m) {
      const res = chess.move(m);
      if (!res) return;
      const exp = step.solution[ply];
      const ok = matches(res.uci, exp) || ((step.mate || chess.isCheckmate()) && chess.isCheckmate());
      if (!ok) { chess.undo(); board.set({}); wrong(step.wrong); return; }
      Sound.forMove(res);
      ply++;
      board.set({ lastMove: [res.fromSq, res.toSq], arrows: [], marks: {} });
      if (ply >= step.solution.length || chess.isCheckmate()) { complete(step.success); return; }
      busy = true;
      board.set({ movable: null });
      setFeedback(fb, 'good', 'Good! Keep going…');
      timers.push(later(() => {
        const r = chess.move(step.solution[ply]);
        ply++;
        busy = false;
        Sound.forMove(r);
        board.set({ lastMove: [r.fromSq, r.toSq], movable: chess.turn });
        if (ply >= step.solution.length) complete(step.success);
        else setFeedback(fb, 'info', `${colorName(chess.turn === 'w' ? 'b' : 'w')} played <b>${esc(r.san)}</b>. Your move!`);
      }, 600));
    }

    function onPracticeMove(m) {
      const player = board.movable;
      const res = chess.move(m);
      if (!res) return;
      Sound.forMove(res);
      board.set({ lastMove: [res.fromSq, res.toSq], arrows: [], marks: {} });
      if (step.goal === 'promote' && res.promotion) {
        if (chess.isStalemate()) return practiceFail('Stalemate! The game is a draw. Promote when the enemy king still has a move.');
        const capt = chess.legal().some((x) => x.to === res.to);
        if (capt) return practiceFail('Your new queen can be captured. Bring your king closer first.');
        return complete('Promoted! You escorted the pawn all the way.');
      }
      if (chess.isCheckmate()) return complete(`Checkmate in ${Math.ceil(chess.history.length / 2)} moves. Excellent technique!`);
      const r = chess.result();
      if (r) return practiceFail(`Draw by ${r.reason}. Press Reset and try again.`);
      busy = true;
      board.set({ movable: null });
      setFeedback(fb, 'info', 'Thinking…');
      timers.push(later(() => {
        const s = Engine.search(chess, { depth: 6, timeMs: 600 });
        const rr = chess.move(s.move.uci);
        busy = false;
        Sound.forMove(rr);
        board.set({ lastMove: [rr.fromSq, rr.toSq], movable: player });
        if (rr.captured) return practiceFail(`The computer captured your ${pieceName(rr.captured)}. Press Reset and try again.`);
        const r2 = chess.result();
        if (r2) return practiceFail(`Draw by ${r2.reason}. Press Reset and try again.`);
        setFeedback(fb, 'info', `Black played <b>${esc(rr.san)}</b>. Your move.`);
      }, 250));
    }

    function practiceFail(msg) {
      Sound.play('bad');
      board.set({ movable: null });
      setFeedback(fb, 'bad', esc(msg));
    }

    function hint() {
      if (step.type === 'click') { board.flash(step.targets[0], 'flash-good'); return; }
      let uci;
      if (step.type === 'move') uci = firstOf(step.solution[ply]);
      else if (step.type === 'practice') uci = Engine.search(chess, { depth: 6, timeMs: 600 }).move.uci;
      if (!uci) return;
      hintLevel++;
      if (hintLevel === 1) {
        board.set({ marks: { [uci.slice(0, 2)]: 'mark-hint' } });
        setFeedback(fb, 'info', `💡 Try moving the ${pieceName(chess.get(uci.slice(0, 2)))} on ${uci.slice(0, 2)}.`);
      } else {
        board.set({ arrows: [[uci.slice(0, 2), uci.slice(2, 4), 'blue']] });
        setFeedback(fb, 'info', '💡 Follow the arrow.');
      }
    }

    function finishLesson() {
      Store.data.lessons[lesson.id] = true;
      Store.save();
      Sound.play('win');
      const next = LESSONS[idx + 1];
      panel.innerHTML = `
        <div class="card done-card">
          <div class="big">🎉</div>
          <h2>Lesson complete!</h2>
          <p class="muted">You finished <b>${esc(lesson.title)}</b>.</p>
          <div class="row" style="justify-content:center">
            ${next ? `<a class="btn primary" href="#/lesson/${next.id}">Next: ${esc(next.title)} →</a>` : '<a class="btn primary" href="#/puzzles">Try some puzzles →</a>'}
            <a class="btn" href="#/learn">All lessons</a>
          </div>
        </div>`;
      board.set({ movable: null, clickMode: false });
    }

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'next') { if (si < lesson.steps.length - 1) load(si + 1); else finishLesson(); }
      else if (a === 'back') load(Math.max(0, si - 1));
      else if (a === 'reset') load(si);
      else if (a === 'hint') hint();
    });

    load(0);
    return () => timers.forEach(clearTimeout);
  }

  // ============================================================ PUZZLE PAGE
  function pickPuzzle() {
    const d = Store.data.puzzles;
    const unsolved = PUZZLES.filter((p) => !d.solved[p.id]);
    const pool = unsolved.length ? unsolved : PUZZLES;
    return pool.slice().sort((a, b) => Math.abs(a.rating - d.rating) - Math.abs(b.rating - d.rating))[0];
  }

  function PuzzlePage(root, id) {
    const puzzle = PUZZLES.find((p) => String(p.id) === id) || pickPuzzle();
    const { holder, panel } = trainingLayout(root);
    const P = Store.data.puzzles;
    const timers = [];
    const chess = new Chess(puzzle.fen);
    const me = chess.turn;
    let ply = 0, finished = false, penalized = false, hinted = 0, busy = false;

    panel.innerHTML = `
      <div class="card">
        <div class="row"><span class="pill">${esc(puzzle.theme)}</span><span class="pill">Rating ${puzzle.rating}</span><span class="spacer"></span>
          <span class="small muted">Puzzle #${puzzle.id}</span></div>
        <h2 style="margin-top:10px">${esc(puzzle.title)}</h2>
        <div class="turn"><span class="sw ${me}"></span>Find the best move for ${colorName(me)}</div>
      </div>
      <div class="feedback"></div>
      <div class="row">
        <button class="btn" data-a="hint">💡 Hint</button>
        <button class="btn" data-a="solution">Show solution</button>
        <button class="btn" data-a="retry">↺ Retry</button>
        <span class="spacer"></span>
        <button class="btn primary" data-a="next">Next puzzle →</button>
      </div>
      <div class="card">
        <div class="row"><div><div class="small muted">Your puzzle rating</div><div style="font-size:28px;font-weight:700" id="pr">${P.rating}</div></div>
        <span class="spacer"></span><div style="text-align:right"><div class="small muted">Streak</div><div style="font-size:22px;font-weight:700" id="ps">${P.streak} 🔥</div></div></div>
      </div>
      <div class="card"><h3>All puzzles</h3><div class="puzzle-chips"></div></div>`;
    const fb = $('.feedback', panel);
    const chips = $('.puzzle-chips', panel);
    chips.innerHTML = PUZZLES.map((p) => `<button class="chip ${P.solved[p.id] ? 'solved' : P.failed[p.id] ? 'failed' : ''} ${p.id === puzzle.id ? 'cur' : ''}" title="${esc(p.title)} (${p.rating})" data-id="${p.id}">${p.id}</button>`).join('');

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
        extra = ' Rating up!';
      }
      if (!penalized) { P.solved[puzzle.id] = true; delete P.failed[puzzle.id]; Store.save(); }
      Sound.play('good');
      setFeedback(fb, 'good', `✓ ${esc(msg || 'Solved!')}${extra}<div class="small" style="margin-top:6px;color:var(--text)">${esc(puzzle.explain)}</div>`);
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
      setFeedback(fb, 'info', 'Checking your move…');
      timers.push(later(() => {
        const remaining = puzzle.solution.length - ply;
        const depth = Math.min(4, Math.max(2, remaining));
        const userScore = -Engine.search(new Chess(chess.fen()), { depth, timeMs: 1500 }).score;
        before.move(exp);
        const solScore = -Engine.search(before, { depth, timeMs: 1500 }).score;
        busy = false;
        if (solScore > 150 && userScore >= solScore - 40) {
          board.set({ movable: null });
          solved(`That works too! The main line was ${firstMoveSan()}.`);
        } else reject();
      }, 30));
      function reject() {
        chess.undo();
        board.set({ movable: me, lastMove: null });
        penalize();
        Sound.play('bad');
        shake(holder);
        setFeedback(fb, 'bad', '✗ Not the best move. Try again!');
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
      if (chess.isCheckmate()) return solved('Checkmate!');
      if (ply >= puzzle.solution.length) return solved('Solved!');
      busy = true;
      board.set({ movable: null });
      setFeedback(fb, 'good', 'Best move! Keep going…');
      timers.push(later(() => {
        const r = chess.move(puzzle.solution[ply]);
        ply++;
        busy = false;
        Sound.forMove(r);
        board.set({ lastMove: [r.fromSq, r.toSq], movable: me });
        setFeedback(fb, 'info', `Opponent played <b>${esc(r.san)}</b>. Your move.`);
      }, 600));
    }

    function hint() {
      if (finished) return;
      const uci = firstOf(puzzle.solution[ply]);
      hinted++;
      if (hinted === 1) {
        board.set({ marks: { [uci.slice(0, 2)]: 'mark-hint' } });
        setFeedback(fb, 'info', `💡 Look at your ${pieceName(chess.get(uci.slice(0, 2)))} on ${uci.slice(0, 2)}. (Hints mean no rating gain.)`);
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
          setFeedback(fb, 'info', `Solution shown. ${esc(puzzle.explain)}`);
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
      if (b.dataset.id) { location.hash = '#/puzzles/' + b.dataset.id; if (b.dataset.id === String(puzzle.id)) route(); return; }
      const a = b.dataset.a;
      if (a === 'hint') hint();
      else if (a === 'solution') showSolution();
      else if (a === 'retry') { location.hash = '#/puzzles/' + puzzle.id; route(); }
      else if (a === 'next') {
        const n = pickPuzzle();
        const target = n.id === puzzle.id ? PUZZLES[(PUZZLES.indexOf(puzzle) + 1) % PUZZLES.length] : n;
        location.hash = '#/puzzles/' + target.id;
      }
    });
    return () => timers.forEach(clearTimeout);
  }

  // ============================================================== PLAY PAGE
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
          <h2>Play vs the coach</h2>
          <div class="small muted" style="margin-bottom:8px">Play as</div>
          <div class="seg" id="colorSeg">
            <button data-c="w">♔ White</button><button data-c="r">Random</button><button data-c="b">♚ Black</button>
          </div>
          <div class="small muted" style="margin:14px 0 8px">Opponent strength</div>
          <div class="levels">
            ${Engine.LEVELS.map((l) => `<button class="level" data-l="${l.id}"><b>${l.name}</b><span class="small muted">${l.elo}</span></button>`).join('')}
          </div>
          <label class="row" style="margin-top:14px;cursor:pointer;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="coachBox" ${S.coach ? 'checked' : ''}>
            <span><b>Coach mode</b> <span class="small muted">— rates your moves, explains mistakes and warns about threats</span></span></label>
          <button class="btn primary" id="startBtn" style="width:100%;margin-top:16px">Start game</button>
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
          <div class="player-row"><span class="sw-dot">🤖</span> Coach bot <span class="pill">${L.name} ${L.elo}</span></div>
          <div class="captured" id="capOpp"></div>
          <div class="player-row" style="margin-top:6px"><span>🙂</span> You (${colorName(me)})</div>
          <div class="captured" id="capMe"></div>
          <div class="feedback show info" id="status" style="margin-top:8px"></div>
          <div class="small muted" id="opening" style="margin-top:6px"></div>
        </div>
        <div class="row">
          <button class="btn" data-a="hint">💡 Hint</button>
          <button class="btn" data-a="undo">↶ Undo</button>
          <button class="btn" data-a="flip">⇅ Flip</button>
          <button class="btn" data-a="resign">🏳 Resign</button>
          <span class="spacer"></span>
          <button class="btn primary" data-a="new">New game</button>
        </div>
        <div class="card ${coach ? '' : 'hidden'}"><h3>🎓 Coach</h3><div class="coach-feed" id="feed"></div></div>
        <div class="card"><h3>Moves</h3><div class="movelist" id="moves"><span class="muted small" style="grid-column:1/-1">No moves yet.</span></div></div>`;
      evalbar.classList.toggle('hidden', !coach);
      board.set({ chess: game, orientation: me, movable: null, lastMove: null, arrows: [], marks: {} });
      if (coach) say('tip', me === 'w'
        ? 'You have White, so you move first. Aim for the centre (e4 or d4), develop your knights and bishops, and castle early.'
        : 'You have Black. Respond in the centre, develop your pieces and castle. I\'ll comment on every move.');
      refresh();
      if (game.turn !== me) engineTurn();
    }

    function say(tag, html) {
      const feed = $('#feed', panel);
      if (!feed) return;
      const labels = { best: 'Best', great: 'Great', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder', threat: 'Threat', tip: 'Tip', book: 'Book' };
      const node = el(`<div class="coach-msg"><span class="tag ${tag}">${labels[tag] || tag}</span><div>${html}</div></div>`);
      feed.prepend(node);
    }

    function status(html, kind) {
      const s = $('#status', panel);
      if (!s) return;
      s.className = 'feedback show ' + (kind || 'info');
      s.innerHTML = html;
    }

    function refresh() {
      board.set({ movable: !over && !busy && game.turn === me ? me : null });
      renderMoves();
      renderCaptured();
      renderEval();
      const op = Engine.openingName(game);
      if (op) lastOpening = op;
      const opEl = $('#opening', panel);
      if (opEl) opEl.textContent = lastOpening ? '📖 ' + lastOpening : '';
      if (!over) {
        if (busy) status('Thinking…');
        else if (game.turn === me) status(game.inCheck() ? '⚠ You are in check!' : 'Your move', game.inCheck() ? 'bad' : 'info');
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
        `<span class="piece ${c}">${BoardView.pieceSvg(t)}</span>`.repeat(Math.max(0, start[t] - count[c][t]))).join('');
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
        board.set({ lastMove: [r.fromSq, r.toSq] });
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
      const msg = outcome === 'win' ? `🏆 You won by ${reason}!` : outcome === 'loss' ? `You lost by ${reason}.` : `Draw by ${reason}.`;
      status(msg + ' <a href="javascript:void 0" data-a="new">Play again</a>', outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : 'info');
      Sound.play(outcome === 'win' ? 'win' : outcome === 'loss' ? 'bad' : 'move');
      if (coach && stats) {
        const parts = [];
        for (const k of ['blunder', 'mistake', 'inaccuracy']) if (stats[k]) parts.push(`${stats[k]} ${k}${stats[k] > 1 ? 's' : ''}`);
        say('tip', `<b>Game over.</b> ${parts.length ? 'You made ' + parts.join(', ') + '.' : 'No serious mistakes — great game!'} ` +
          `${stats.best + stats.good} of your moves were good or best.` +
          (stats.blunder ? ' Most blunders come from not checking what your opponent can capture — do a blunder check before every move.' : ''));
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
      if (res.flags === 'k' || res.flags === 'q') reasons.push('Castling tucks your king away and brings a rook toward the centre.');
      if (res.captured) reasons.push(`You captured ${article(pieceName(res.captured))} ${pieceName(res.captured)}.`);
      if (res.san.includes('+') && !res.san.includes('#')) reasons.push('Check — forcing moves keep the initiative.');
      const t = res.piece.toLowerCase();
      if (game.history.length <= 20 && (t === 'n' || t === 'b') && (res.from >> 3) === (me === 'w' ? 0 : 7)) reasons.push('Developing a piece — exactly what the opening is about.');
      if (game.history.length <= 8 && t === 'p' && ['e4', 'd4', 'e5', 'd5'].includes(res.toSq)) reasons.push('Claiming the centre with a pawn.');
      if (t === 'q' && game.history.length <= 10 && !res.captured) reasons.push('Careful with early queen moves: she can be chased around while your opponent develops.');

      if (game.isCheckmate()) { stats.best++; say('great', `<b>${esc(res.san)}</b> — checkmate! Beautifully done.`); return; }
      if (best.score > MATE - 500 && played.score < MATE - 500) {
        stats.mistake++;
        say('mistake', `<b>${esc(res.san)}</b> — you had a forced checkmate starting with <b>${esc(bestSan)}</b>!`);
        return;
      }
      if (loss <= 15) {
        stats.best++;
        say(isBest ? 'best' : 'great', `<b>${esc(res.san)}</b> — ${isBest ? 'the best move!' : 'excellent, as good as the top choice.'} ${esc(reasons[0] || '')}`);
        return;
      }
      if (loss <= 60) {
        stats.good++;
        say('good', `<b>${esc(res.san)}</b> — good move. ${esc(reasons[0] || '')} <span class="muted">(${esc(bestSan)} was slightly stronger.)</span>`);
        return;
      }
      if (loss <= 150) {
        stats.inaccuracy++;
        const why = best.m.captured ? ` — it wins ${article(pieceName(best.m.captured))} ${pieceName(best.m.captured)}` : '';
        say('inaccuracy', `<b>${esc(res.san)}</b> is a bit imprecise. <b>${esc(bestSan)}</b> was better${why}.`);
        return;
      }
      // Mistake / blunder: explain the opponent's best reply.
      const tag = loss > 300 ? 'blunder' : 'mistake';
      stats[tag]++;
      const after = before.clone();
      after.move(res.uci);
      const rep = Engine.search(after, { depth: 2, timeMs: 400 });
      let why;
      if (rep.move && rep.score > MATE - 500) why = `It allows a forced checkmate, starting with <b>${esc(rep.move.san)}</b>.`;
      else if (rep.move && rep.move.captured) why = `Your opponent can answer <b>${esc(rep.move.san)}</b>, winning your ${pieceName(rep.move.captured)}.`;
      else if (best.m.captured) why = `You missed <b>${esc(bestSan)}</b>, which wins ${article(pieceName(best.m.captured))} ${pieceName(best.m.captured)}.`;
      else if (rep.move) why = `It gives your opponent a strong reply: <b>${esc(rep.move.san)}</b>.`;
      else why = '';
      say(tag, `<b>${esc(res.san)}</b> — ${tag === 'blunder' ? 'a blunder.' : 'a mistake.'} ${why} Better was <b>${esc(bestSan)}</b>.`);
    }

    function threatWatch(engineMove) {
      if (game.inCheck()) { say('threat', `<b>${esc(engineMove.san)}</b> is check! Capture the checking piece, block, or move your king.`); return; }
      // "Null move": what would the opponent do if it were their turn again?
      const parts = game.fen().split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      parts[3] = '-';
      let t;
      try { t = new Chess(parts.join(' ')); } catch (_) { return; }
      if (t.inCheck(me)) return;
      const r = Engine.search(t, { depth: 2, timeMs: 350 });
      if (!r.move) return;
      const gain = r.score - Engine.evaluate(t);
      if (r.score > MATE - 500) say('threat', `Watch out — your opponent threatens <b>${esc(r.move.san)}</b>, checkmate!`);
      else if (r.move.captured && gain >= 150) say('threat', `Your ${pieceName(r.move.captured)} on ${r.move.toSq} is in danger: your opponent threatens <b>${esc(r.move.san)}</b>.`);
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
        status(`💡 Consider your ${pieceName(hintMove.piece)} on ${hintMove.fromSq}.`);
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
      if (coach) say('tip', 'Move taken back. Have another look!');
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

  // ------------------------------------------------------------ chrome/footer
  function applyTheme() {
    const t = Store.data.settings.theme;
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }
  $('#themeBtn').addEventListener('click', () => {
    const dark = Store.data.settings.theme ? Store.data.settings.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    Store.data.settings.theme = dark ? 'light' : 'dark';
    Store.save(); applyTheme();
  });
  const soundBtn = $('#soundBtn');
  const syncSound = () => { soundBtn.textContent = Store.data.settings.sound ? 'sound on' : 'sound off'; };
  soundBtn.addEventListener('click', () => { Store.data.settings.sound = !Store.data.settings.sound; Store.save(); syncSound(); });
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('Reset all lessons, puzzle rating and game stats?')) { Store.reset(); applyTheme(); syncSound(); route(); }
  });
  applyTheme(); syncSound();
  route();
})();
