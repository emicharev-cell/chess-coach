/*
 * pages/drill.js — Drill mode: spaced-repetition training of lines and positions,
 * as White and as Black, timed per move so responses become automatic.
 *   #/drill                    overview + decks + settings
 *   #/drill/session/all        today's mixed session (due + new cards)
 *   #/drill/deck/<id>          one deck
 *   #/drill/lesson/<id>        the cards of one lesson
 */
(function () {
  'use strict';
  const { Store, esc, md, page, $, plural } = CC;
  const SPEED_LIMIT = 10000;

  page('drill', function Drill(root, [mode, arg]) {
    if (mode === 'session' || mode === 'deck' || mode === 'lesson') return session(root, mode, arg);
    return overview(root);
  });

  // ================================================================ OVERVIEW
  function overview(root) {
    const S = Store.data.settings;
    const all = SRS.stats(CCData.cards);
    const todayN = Math.min(20, all.due + Math.min(all.fresh, S.newPerSession));
    root.innerHTML = `
      <div class="page-head">
        <h1>${t('Drill')}</h1>
        <p class="muted">${t('Muscle memory for chess. Each card is a position or a line you must play from memory, as White or as Black. Fast and correct pushes a card to a longer interval; any mistake brings it back right away. Over the days the right move becomes a reflex, and the blunders disappear.')}</p>
      </div>
      <div class="card drill-hero">
        <div>
          <div class="eyebrow">${t('Today')}</div>
          <div class="drill-big">${todayN ? plural(todayN, 'card') : t('All caught up') + ' ✓'}</div>
          <div class="muted small">${t('{a} due for review · {b} new available · {c} automated', { a: all.due, b: all.fresh, c: all.mastered })}</div>
        </div>
        <a class="btn primary lg" href="#/drill/session/all">▶ ${todayN ? t('Start session') : t('Review ahead')}</a>
      </div>
      <div class="drill-settings card">
        <label class="switch"><input type="checkbox" id="speedBox" ${S.speed ? 'checked' : ''}><span class="slider"></span>
          <span><b>${t('Speed pressure')}</b><br><span class="small muted">${t("A 10-second clock per move, and the 'automatic' threshold drops from 6 s to 3 s.")}</span></span></label>
        <div class="newper"><span class="small muted">${t('New cards per session')}</span>
          <div class="seg">${[4, 8, 12, 20].map((n) => `<button data-new="${n}" class="${S.newPerSession === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      </div>
      <h2 class="section-title">${t('Decks')}</h2>
      <div class="deck-grid">
        ${CCData.decks.map((d) => {
          const st = SRS.stats(d.cards);
          const pct = st.total ? Math.round((st.mastered / st.total) * 100) : 0;
          const learnPct = st.total ? Math.round(((st.mastered + st.learning) / st.total) * 100) : 0;
          return `<div class="card deck-card">
            <div class="deck-top"><span class="deck-ico">${d.icon}</span><div><h3>${esc(d.title)}</h3><div class="small muted">${plural(st.total, 'card')}</div></div></div>
            <p class="small muted">${esc(d.blurb)}</p>
            <div class="mastery"><div class="m-learn" style="width:${learnPct}%"></div><div class="m-done" style="width:${pct}%"></div></div>
            <div class="deck-foot">
              <span class="small">${t('{a} due · {b} new · {c} automated', { a: '<b>' + st.due + '</b>', b: '<b>' + st.fresh + '</b>', c: '<b>' + st.mastered + '</b>' })}</span>
              <a class="btn small ${st.due ? 'primary' : ''}" href="#/drill/deck/${d.id}">${t('Drill')}</a>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="card explain">
        <h3>${t('How the scheduling works')}</h3>
        <p class="small muted">${t('Cards climb through 8 boxes, with review intervals of 0, 1, 2, 4, 8, 16, 32 and 64 days (a Leitner system). A card counts as automated from box 4 upwards, meaning you have answered it correctly and quickly at least four times in a row, over more than a week. This is the same principle grandmasters use to keep their repertoire files: little and often beats cramming.')}</p>
      </div>`;
    root.addEventListener('click', (e) => {
      const n = e.target.closest('[data-new]');
      if (n) { S.newPerSession = +n.dataset.new; Store.save(); CC.route(); }
    });
    $('#speedBox', root).addEventListener('change', (e) => { S.speed = e.target.checked; Store.save(); });
  }

  // ================================================================= SESSION
  function session(root, mode, arg) {
    const S = Store.data.settings;
    let cards, title;
    if (mode === 'deck') { const d = CCData.deckById[arg]; if (!d) { location.hash = '#/drill'; return null; } cards = d.cards; title = d.title; }
    else if (mode === 'lesson') { const l = CCData.lessonById[arg]; if (!l) { location.hash = '#/drill'; return null; } cards = CCData.cards.filter((c) => c.lessonId === arg); title = l.title; }
    else { cards = CCData.cards; title = t("Today's session"); }
    const queue = SRS.queue(cards, { newLimit: mode === 'lesson' ? 99 : S.newPerSession, max: mode === 'lesson' ? 30 : 20, reviewAhead: true });
    if (!queue.length) { root.innerHTML = `<div class="card"><h2>${t('No cards here yet')}</h2><p><a href="#/drill">${t('Back to Drill')}</a></p></div>`; return null; }

    const { holder, panel } = CC.trainingLayout(root);
    const board = new BoardView(holder, {});
    const requeued = {};
    const results = [];
    let i = 0, trainer = null, card = null, slow = false, wrongs = [], tick = null, done = false;

    panel.innerHTML = `
      <div class="card drill-head">
        <div class="row"><span class="pill">🎯 ${esc(title)}</span><span class="spacer"></span><span class="small muted" id="dCount"></span><a class="small" href="#/drill">${t('Exit')}</a></div>
        <div class="progress"><div id="dProg"></div></div>
      </div>
      <div class="card step-card">
        <div class="step-type" id="dType"></div>
        <h2 class="step-title" id="dTitle"></h2>
        <div class="step-text prose" id="dText"></div>
        <details class="ctx hidden" id="dCtxWrap"><summary>${t('Lesson context')}</summary><div class="prose small" id="dCtx"></div></details>
      </div>
      <div class="clock" id="dClock"><span class="t">0.0s</span><div class="clock-bar"><div></div></div></div>
      <div class="status" id="dStatus"></div>
      <div class="result hidden" id="dResult"></div>
      <div class="controls">
        <button class="btn" data-a="hint">💡 ${t('Hint')}</button>
        <button class="btn" data-a="reveal">👁 ${t('Show me')}</button>
        <span class="spacer"></span>
        <button class="btn primary" data-a="next" data-key="next" disabled>${t('Next card')} →</button>
      </div>`;
    const statusEl = $('#dStatus', panel), resultEl = $('#dResult', panel), clock = $('#dClock', panel);
    const btn = (a) => panel.querySelector(`[data-a="${a}"]`);

    function setStatus(html, tone) { statusEl.className = 'status show ' + (tone || 'info'); statusEl.innerHTML = html; }

    function onEvent(ev) {
      if (ev.type === 'status') setStatus(ev.html, ev.tone);
      else if (ev.type === 'wrong') {
        if (trainer.kind === 'line') wrongs.push(trainer.line[trainer.idx]);
        else if (trainer.kind === 'find') wrongs.push({ san: trainer.sol[trainer.ply][0] });
      } else if (ev.type === 'done') finishCard(ev);
    }

    function loadCard() {
      if (trainer) trainer.destroy();
      card = queue[i];
      slow = false; wrongs = []; done = false;
      resultEl.classList.add('hidden');
      btn('next').disabled = true;
      btn('hint').disabled = btn('reveal').disabled = false;
      $('#dCount', panel).textContent = `${i + 1} / ${queue.length}`;
      $('#dProg', panel).style.width = (i / queue.length) * 100 + '%';
      const isNew = SRS.isNew(card.id);
      const youTxt = card.you === 'both' ? t('both sides') : CC.colorName(card.you);
      $('#dType', panel).innerHTML = `<span class="tbadge t-${card.kind}">${card.kind === 'line' ? '♟ ' + t('Line') : '🎯 ' + t('Position')}</span><span class="side ${card.you}">${t('You play {color}', { color: youTxt })}</span>${isNew ? `<span class="pill new">${t('New')}</span>` : ''}`;
      $('#dTitle', panel).textContent = card.title;
      const prompt = card.kind === 'line'
        ? t("Play {color}'s moves from memory{lesson}. The opponent's moves are played for you.", { color: youTxt, lesson: card.lessonTitle ? ` (${esc(card.lessonTitle)})` : '' })
        : esc(stripMd(card.text)) || t('Find the best move.');
      $('#dText', panel).innerHTML = card.kind === 'line' ? prompt : md(card.text);
      const ctxWrap = $('#dCtxWrap', panel);
      if (card.kind === 'line' && card.text) { ctxWrap.classList.remove('hidden'); ctxWrap.open = false; $('#dCtx', panel).innerHTML = md(card.text); }
      else ctxWrap.classList.add('hidden');
      clock.classList.toggle('speed', !!S.speed);
      trainer = new Trainer(board, { mode: 'drill', onEvent, delay: 380 });
      trainer.start(Object.assign({}, card, { arrows: [], marks: {} }));
    }

    function stripMd(s) { return String(s || '').replace(/\*\*?/g, ''); }

    function finishCard(ev) {
      done = true;
      const res = SRS.record(card.id, Object.assign({}, ev, { slow }));
      results.push({ card, grade: res.grade, avgMs: ev.avgMs });
      Store.bump();
      if (res.grade === 'miss' && (requeued[card.id] || 0) < 2) {
        requeued[card.id] = (requeued[card.id] || 0) + 1;
        queue.splice(Math.min(queue.length, i + 3), 0, card);
      }
      const G = {
        auto: ['⚡ ' + t('Automatic'), 'good', t('Correct and fast ({s} s per move). Next review in {d} days.', { s: (ev.avgMs / 1000).toFixed(1), d: SRS.INTERVALS[res.state.box] })],
        slow: ['✓ ' + t('Correct'), 'warn', ev.hints ? t('You used a hint, so the card stays in its box.') : t('Right, but slow ({s} s per move). Aim for under {f} s to make it automatic.', { s: (ev.avgMs / 1000).toFixed(1), f: SRS.fastMs() / 1000 })],
        miss: ['✗ ' + t('Missed'), 'bad', plural(ev.mistakes, 'mistake') + '. ' + (requeued[card.id] ? t('The card goes back to box 0 and will come back again in this session.') : t('The card goes back to box 0.'))],
      }[res.grade];
      let detail = '';
      if (wrongs.length) {
        const seen = new Set();
        detail = `<div class="fixes"><b>${t('Moves to fix:')}</b>` + wrongs.filter((w) => { const k = w.san; if (seen.has(k)) return false; seen.add(k); return true; })
          .map((w) => `<div class="fix"><span class="san">${esc(w.san)}</span>${w.why ? ' — ' + esc(w.why) : ''}</div>`).join('') + '</div>';
      }
      const why = card.kind === 'find' && card.why ? `<div class="prose small">${md(ev.note && ev.note.startsWith(t('That works too!')) ? ev.note : card.why)}</div>` : '';
      resultEl.className = 'result show ' + G[1];
      resultEl.innerHTML = `<div class="grade">${G[0]}</div><div class="small">${G[2]}</div>${detail}${why}`;
      statusEl.className = 'status';
      btn('next').disabled = false;
      btn('hint').disabled = btn('reveal').disabled = true;
      btn('next').focus({ preventScroll: true });
    }

    function next() {
      i++;
      if (i >= queue.length) return summary();
      loadCard();
    }

    function summary() {
      clearInterval(tick);
      if (trainer) trainer.destroy();
      const n = (g) => results.filter((r) => r.grade === g).length;
      const timed = results.filter((r) => r.avgMs);
      const avg = timed.length ? timed.reduce((a, r) => a + r.avgMs, 0) / timed.length / 1000 : 0;
      Sound.play('end');
      board.set({ movable: null, arrows: [], marks: {} });
      panel.innerHTML = `
        <div class="card done-card">
          <div class="big">🎯</div>
          <h2>${t('Session complete')}</h2>
          <div class="sum-grid">
            <div><div class="v good">${n('auto')}</div><div class="small muted">⚡ ${t('automatic')}</div></div>
            <div><div class="v warn">${n('slow')}</div><div class="small muted">✓ ${t('correct')}</div></div>
            <div><div class="v bad">${n('miss')}</div><div class="small muted">✗ ${t('missed')}</div></div>
            <div><div class="v">${avg.toFixed(1)}s</div><div class="small muted">${t('avg / move')}</div></div>
          </div>
          <p class="muted small">${SRS.nextDueLabel(cards) ? t('Next cards due {when}.', { when: SRS.nextDueLabel(cards) }) : ''} ${t('Come back tomorrow: spaced repetition works through daily, short sessions.')}</p>
          <div class="row center">
            <a class="btn primary" href="#/drill" data-key="next">${t('Back to decks')}</a>
            <a class="btn" href="#/learn">${t('Learn something new')}</a>
          </div>
        </div>`;
    }

    tick = setInterval(() => {
      if (!trainer || done || trainer.finished) return;
      const tEl = clock.querySelector('.t'), barEl = clock.querySelector('.clock-bar div');
      if (!trainer.userTurn() || trainer.busy || !trainer.turnStart) { tEl.textContent = '…'; barEl.style.width = '0%'; return; }
      const ms = performance.now() - trainer.turnStart;
      tEl.textContent = (ms / 1000).toFixed(1) + 's';
      const limit = S.speed ? SPEED_LIMIT : SRS.fastMs();
      barEl.style.width = Math.min(100, (ms / limit) * 100) + '%';
      clock.classList.toggle('over', ms > limit);
      if (S.speed && ms > SPEED_LIMIT && !slow) {
        slow = true;
        setStatus('⏰ ' + t('Time! Too slow for an automatic answer. Finish the card; it will come back sooner.'), 'warn');
      }
    }, 100);

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'next') next();
      else if (a === 'hint' && trainer) trainer.hint();
      else if (a === 'reveal' && trainer) { trainer.hint(); trainer.hint(); trainer.mistakes++; }
    });

    loadCard();
    return () => { clearInterval(tick); if (trainer) trainer.destroy(); };
  }
})();
