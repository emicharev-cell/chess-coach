/*
 * pages/lesson.js — the lesson player. Step types: text, line, watch (line with you:"watch"),
 * find, quiz, play. Board exercises run on the shared Trainer.
 */
(function () {
  'use strict';
  const { Store, esc, md, levelBadge, page, $ } = CC;

  const TYPE_LABEL = {
    text: ['📖', 'Concept'], line: ['♟', 'Play the line'], watch: ['▶', 'Watch'], find: ['🎯', 'Find the move'],
    quiz: ['❓', 'Quiz'], play: ['⚙️', 'Technique vs engine'],
  };

  page('lesson', function LessonPage(root, [id, stepArg]) {
    const lesson = CCData.lessonById[id];
    if (!lesson) { location.hash = '#/learn'; return null; }
    const S = Store.data.lessons[lesson.id] = Store.data.lessons[lesson.id] || { step: 0, done: false };
    const all = CCData.lessons;
    const idx = all.indexOf(lesson);
    const { holder, panel } = CC.trainingLayout(root);
    const board = new BoardView(holder, {});
    let trainer = null, si = 0, resolved = false, notes = [];

    panel.innerHTML = `
      <div class="card lesson-head">
        <div class="crumbs"><a href="#/learn/${lesson.track}">${esc(lesson.trackTitle)}</a> › <span>${esc(lesson.chapter)}</span></div>
        <h1 class="lesson-title">${esc(lesson.title)}</h1>
        <div class="lesson-meta">${lesson.eco ? `<span class="eco">${esc(lesson.eco)}</span>` : ''}${levelBadge(lesson.level || 1)}</div>
        <div class="steps-bar"></div>
      </div>
      <div class="card step-card">
        <div class="step-type"></div>
        <h2 class="step-title"></h2>
        <div class="step-text prose"></div>
        <div class="quiz"></div>
      </div>
      <div class="status"></div>
      <div class="notes card hidden"><h4>${t('Move notes')}</h4><div class="note-list"></div></div>
      <div class="controls">
        <button class="btn" data-a="wback" data-key="back" hidden>◀</button>
        <button class="btn primary" data-a="wfwd" data-key="next" hidden>${t('Next move')} ▶</button>
        <button class="btn" data-a="back" data-key="back">← ${t('Back')}</button>
        <button class="btn" data-a="hint">💡 ${t('Hint')}</button>
        <button class="btn" data-a="retry">↺ ${t('Retry')}</button>
        <span class="spacer"></span>
        <button class="btn primary" data-a="next" data-key="next">${t('Next')} →</button>
      </div>
      <div class="card refs-card">${CC.refsHtml(lesson.refs) || ''}</div>`;
    if (!lesson.refs || !lesson.refs.length) $('.refs-card', panel).remove();

    const bar = $('.steps-bar', panel), typeEl = $('.step-type', panel), titleEl = $('.step-title', panel);
    const textEl = $('.step-text', panel), quizEl = $('.quiz', panel), statusEl = $('.status', panel);
    const notesCard = $('.notes', panel), noteList = $('.note-list', panel);
    const btn = (a) => panel.querySelector(`[data-a="${a}"]`);

    function setStatus(html, tone) {
      statusEl.className = 'status show ' + (tone || 'info');
      statusEl.innerHTML = html;
    }
    function clearStatus() { statusEl.className = 'status'; statusEl.innerHTML = ''; }

    function renderBar() {
      bar.innerHTML = lesson.steps.map((s, i) => {
        const kd = s.type === 'line' && s.you === 'watch' ? 'watch' : s.type;
        return `<button class="sb ${i < si || (S.done) ? 'done' : ''} ${i === si ? 'cur' : ''}" data-step="${i}" title="${esc((s.title || t(TYPE_LABEL[kd][1])))}"></button>`;
      }).join('');
    }

    function renderNotes() {
      if (!notes.length) { notesCard.classList.add('hidden'); return; }
      notesCard.classList.remove('hidden');
      noteList.innerHTML = notes.map((n) => `<div class="note ${n.by}"><span class="san">${esc(n.num)}${esc(n.san)}</span>${n.why ? `<span class="why">${esc(n.why)}</span>` : ''}</div>`).join('');
      noteList.scrollTop = noteList.scrollHeight;
    }

    function onEvent(ev) {
      if (ev.type === 'status') setStatus(ev.html, ev.tone);
      else if (ev.type === 'comment') {
        const h = trainer.chess.history;
        const ply = h.length - 1;
        const full = trainer.chess.fen().split(' ')[5];
        const moveNo = h[ply].color === 'w' ? `${+full}.` : `${+full - 1}…`;
        notes.push({ san: ev.san, why: ev.why, by: ev.by, num: moveNo });
        renderNotes();
      } else if (ev.type === 'watch') {
        btn('wback').disabled = !ev.canBack;
        btn('wfwd').disabled = !ev.canForward;
      } else if (ev.type === 'done') {
        if (ev.success) {
          resolved = true;
          const msg = ev.note ? md(ev.note) : '';
          const head = trainer.kind === 'watch' ? t('End of the game.') : trainer.kind === 'play' ? t('Goal achieved!') : t('Excellent!');
          setStatus(`<div class="done-head">✓ ${head}</div>${msg}`, 'good');
          Store.bump();
        }
        updateNext();
      }
    }

    function load(i) {
      if (trainer) trainer.destroy();
      trainer = null;
      si = Math.max(0, Math.min(lesson.steps.length - 1, i));
      S.step = Math.max(S.step || 0, si);
      Store.save();
      const step = lesson.steps[si];
      const kind = step.type === 'line' && step.you === 'watch' ? 'watch' : step.type;
      resolved = kind === 'text';
      notes = [];
      renderNotes();
      clearStatus();
      const [ico, label] = TYPE_LABEL[kind];
      let sideTxt = '';
      if (kind === 'line') sideTxt = step.you === 'both' ? ' · ' + t('both sides') : ' · ' + t('you play {color}', { color: CC.colorName(step.you || 'w') });
      typeEl.innerHTML = `<span class="tbadge t-${kind}">${ico} ${t(label)}${sideTxt}</span><span class="muted small">${t('Step {a} of {b}', { a: si + 1, b: lesson.steps.length })}</span>`;
      titleEl.textContent = step.title || '';
      textEl.innerHTML = md(step.text || (kind === 'line' ? t('Play the moves of the line. Read the note for each move: it explains the purpose.') : ''));
      quizEl.innerHTML = '';
      btn('wback').hidden = btn('wfwd').hidden = kind !== 'watch';
      btn('hint').hidden = !['line', 'find', 'play'].includes(kind);
      btn('retry').hidden = !['line', 'find', 'play', 'watch', 'quiz'].includes(kind);
      btn('back').disabled = si === 0;
      renderBar();

      if (kind === 'text' || kind === 'quiz') {
        const ch = CCData.startPosition(step);
        const h = ch.history[ch.history.length - 1];
        board.set({ chess: ch, orientation: step.orientation || (lesson.side === 'b' ? 'b' : 'w'), movable: null, arrows: step.arrows || [], marks: markClasses(step.marks), lastMove: h ? [h.fromSq, h.toSq] : null, selected: null });
        if (kind === 'quiz') renderQuiz(step);
      } else {
        trainer = new Trainer(board, { mode: 'lesson', onEvent });
        trainer.start(Object.assign({}, step, { kind, arrows: step.arrows, marks: markClasses(step.marks), orientation: step.orientation }));
        if (kind === 'find') setStatus(`<span class="turn"><span class="sw ${trainer.chess.turn}"></span>${t('{color} to move', { color: CC.colorName(trainer.chess.turn) })}</span>`);
        if (kind === 'play') setStatus(`<span class="turn"><span class="sw ${step.you || trainer.chess.turn}"></span>${t('You play {color}', { color: CC.colorName(step.you || trainer.chess.turn) })}</span>`);
      }
      updateNext();
    }

    function markClasses(marks) {
      const out = {};
      for (const [sq, c] of Object.entries(marks || {})) out[sq] = 'mark-' + c;
      return out;
    }

    function renderQuiz(step) {
      quizEl.innerHTML = `<div class="q">${md(step.question)}</div>` + step.options.map((o, i) =>
        `<button class="opt" data-opt="${i}"><span class="letter">${'ABCD'[i]}</span><span>${esc(o.text)}</span></button>`).join('');
      quizEl.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
        const o = step.options[+b.dataset.opt];
        if (o.correct) {
          b.classList.add('right');
          quizEl.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
          setStatus(`<div class="done-head">✓ ${t('Correct')}</div>${md(o.why)}`, 'good');
          Sound.play('correct');
          resolved = true;
          Store.bump();
          updateNext();
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          setStatus(`✗ ${md(o.why)}`, 'bad');
          Sound.play('wrong');
        }
      }));
    }

    function updateNext() {
      const last = si === lesson.steps.length - 1;
      const b = btn('next');
      b.textContent = resolved ? (last ? t('Finish lesson') + ' ✓' : t('Next') + ' →') : t('Skip') + ' →';
      b.classList.toggle('primary', resolved);
    }

    function finish() {
      S.done = true; S.step = lesson.steps.length;
      Store.save();
      Store.bump(2);
      Sound.play('end');
      const next = all[idx + 1];
      const cards = CCData.cards.filter((c) => c.lessonId === lesson.id).length;
      if (trainer) trainer.destroy();
      panel.innerHTML = `
        <div class="card done-card">
          <div class="big">🏆</div>
          <h2>${t('Lesson complete')}</h2>
          <p class="muted">${t('You finished {title}.', { title: '<b>' + esc(lesson.title) + '</b>' })}${cards ? ' ' + t('Its {n} drill cards are now in your queue: review them tomorrow to lock them in.', { n: cards }) : ''}</p>
          <div class="row center">
            ${cards ? `<a class="btn primary" href="#/drill/lesson/${lesson.id}">🎯 ${t('Drill this lesson now')}</a>` : ''}
            ${next ? `<a class="btn ${cards ? '' : 'primary'}" href="#/lesson/${next.id}" data-key="next">${t('Next')}: ${esc(next.title)} →</a>` : ''}
            <a class="btn ghost" href="#/learn/${lesson.track}">${t('All lessons')}</a>
          </div>
        </div>
        ${CC.refsHtml(lesson.refs) ? `<div class="card">${CC.refsHtml(lesson.refs)}</div>` : ''}`;
      board.set({ movable: null });
    }

    panel.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-step]');
      if (seg) { load(+seg.dataset.step); return; }
      const b = e.target.closest('[data-a]');
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'next') { if (si < lesson.steps.length - 1) load(si + 1); else finish(); }
      else if (a === 'back') load(si - 1);
      else if (a === 'retry') load(si);
      else if (a === 'hint' && trainer) trainer.hint();
      else if (a === 'wfwd' && trainer) trainer.forward();
      else if (a === 'wback' && trainer) trainer.back();
    });

    const startAt = stepArg != null ? +stepArg : (S.done ? 0 : Math.min(S.step || 0, lesson.steps.length - 1));
    load(startAt);
    return () => { if (trainer) trainer.destroy(); };
  });
})();
