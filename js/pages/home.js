/*
 * pages/home.js — Home dashboard, Learn (curriculum browser) and Library.
 */
(function () {
  'use strict';
  const { Store, esc, levelBadge, sideBadge, plural, page } = CC;

  const PRINCIPLES = [
    ['Before every move, ask what your opponent\'s last move threatens. Most blunders are answers to a question you never asked.', 'Kotov, Think Like a Grandmaster'],
    ['Checks, captures, threats: scan them in that order, for both sides, every move.', 'Classical calculation method'],
    ['A pawn chain is attacked at its base.', 'Nimzowitsch, My System'],
    ['Passed pawns must be blockaded, and the knight is the ideal blockader.', 'Nimzowitsch, My System'],
    ['Rooks belong behind passed pawns, your own and your opponent\'s.', 'Siegbert Tarrasch'],
    ['In the endgame the king is a fighting piece. Use it.', 'Capablanca, Chess Fundamentals'],
    ['Pawns are the soul of chess.', 'Philidor, L\'analyse des échecs (1749)'],
    ['When you see a good move, look for a better one.', 'Emanuel Lasker (attributed)'],
    ['Every position has imbalances. Plan around them rather than around move-by-move tricks.', 'Silman, How to Reassess Your Chess'],
    ['Don\'t hurry in won endgames. Improve your position fully before the decisive action.', 'Shereshevsky, Endgame Strategy'],
    ['Control the centre; you don\'t have to occupy it.', 'Réti, Modern Ideas in Chess'],
    ['The attack needs a reason: a lead in development, a weakened king or superior force at the point of attack.', 'Vuković, The Art of Attack'],
  ];

  function lessonProgress(trackId) {
    const ls = CCData.lessons.filter((l) => !trackId || l.track === trackId);
    const done = ls.filter((l) => Store.data.lessons[l.id] && Store.data.lessons[l.id].done).length;
    return { done, total: ls.length, pct: ls.length ? Math.round((done / ls.length) * 100) : 0 };
  }
  function nextLesson() {
    const d = Store.data.lessons;
    return CCData.lessons.find((l) => d[l.id] && !d[l.id].done && d[l.id].step > 0) || CCData.lessons.find((l) => !(d[l.id] && d[l.id].done)) || CCData.lessons[0];
  }

  // =================================================================== HOME
  page('', function Home(root) {
    const d = Store.data;
    const st = SRS.stats(CCData.cards);
    const nl = nextLesson();
    const streak = CC.dayStreak();
    const p = lessonProgress();
    const tip = PRINCIPLES[Math.floor(Date.now() / 864e5) % PRINCIPLES.length];
    const hour = new Date().getHours();
    const hello = hour < 12 ? t('Good morning') : hour < 19 ? t('Good afternoon') : t('Good evening');
    const sessionSize = Math.min(20, st.due + Math.min(st.fresh, d.settings.newPerSession));
    const started = d.lessons[nl.id] && d.lessons[nl.id].step;
    root.innerHTML = `
      <section class="hero">
        <div class="hero-text">
          <div class="eyebrow">${hello} 👋</div>
          <h1>${t('Train like a grandmaster.')}</h1>
          <p class="lead">${t('Deep opening repertoires, middlegame patterns and endgame technique, drilled with spaced repetition until the right move is automatic.')}</p>
          <div class="row">
            <a class="btn primary lg" href="#/drill/session/all">${sessionSize ? t("▶ Start today's drill · {n} cards", { n: sessionSize }) : t('▶ Drill: review ahead')}</a>
            <a class="btn lg" href="#/lesson/${nl.id}">📖 ${started ? t('Continue') : t('Next lesson')}: ${esc(nl.title)}</a>
          </div>
        </div>
        <div class="hero-board" id="heroBoard"></div>
      </section>

      <div class="stats">
        <div class="stat"><div class="ico">🔥</div><div><div class="v">${streak}</div><div class="l">${t('Day streak')}</div></div></div>
        <div class="stat"><div class="ico">🎯</div><div><div class="v">${st.due}</div><div class="l">${t('Cards due')}</div></div></div>
        <div class="stat"><div class="ico">🧠</div><div><div class="v">${st.mastered}<span class="of">/${st.total}</span></div><div class="l">${t('Automated')}</div></div></div>
        <div class="stat"><div class="ico">📘</div><div><div class="v">${p.done}<span class="of">/${p.total}</span></div><div class="l">${t('Lessons done')}</div></div></div>
        <div class="stat"><div class="ico">🧩</div><div><div class="v">${d.puzzles.rating}</div><div class="l">${t('Puzzle rating')}</div></div></div>
      </div>

      <h2 class="section-title">${t('Your curriculum')}</h2>
      <div class="track-grid">
        ${CCData.tracks.map((tk) => {
          const tp = lessonProgress(tk.id);
          return `<a class="card track-card track-${tk.id}" href="#/learn/${tk.id}">
            <div class="track-ico">${tk.icon}</div>
            <h3>${esc(tk.title)}</h3>
            <p class="muted small">${esc(tk.blurb)}</p>
            <div class="progress"><div style="width:${tp.pct}%"></div></div>
            <div class="small muted">${t('{a}/{b} lessons', { a: tp.done, b: tp.total })}</div>
          </a>`;
        }).join('')}
      </div>

      <div class="two-col">
        <a class="card feature" href="#/drill">
          <div class="feature-ico">🎯</div>
          <div><h3>${t('Drill mode')}</h3><p class="muted small">${t("Play the critical moves from memory, as White and as Black. Fast, correct answers move a card up a box; mistakes bring it straight back. That's how responses become automatic.")}</p></div>
        </a>
        <a class="card feature" href="#/play">
          <div class="feature-ico">🤖</div>
          <div><h3>${t('Play with a coach')}</h3><p class="muted small">${t('Every move graded with a technical explanation, plus live threat alerts so you learn to stop blunders as they happen.')}</p></div>
        </a>
      </div>

      <div class="card quote"><div class="quote-mark">“</div><div><div class="quote-text">${esc(t(tip[0]))}</div><div class="small muted">— ${esc(t(tip[1]))}</div></div></div>`;

    const hb = new BoardView(CC.$('#heroBoard', root), {});
    const demo = new Chess();
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'.split(' ').forEach((m) => demo.move(m));
    hb.set({ chess: demo, showCoords: false, lastMove: ['a7', 'a6'], arrows: [['c1', 'e3', 'green'], ['f2', 'f3', 'green'], ['d1', 'd2', 'blue']] });
  });

  // ================================================================== LEARN
  page('learn', function Learn(root, [trackId]) {
    const track = CCData.tracks.find((x) => x.id === trackId) || CCData.tracks[0];
    const d = Store.data.lessons;
    root.innerHTML = `
      <div class="page-head">
        <h1>${t('Learn')}</h1>
        <p class="muted">${t('Technical lessons with the strategic reasoning behind every move. Finished lessons feed their lines and exercises into your drills.')} <a href="#/drill">${t('Go to Drill')} →</a></p>
      </div>
      <div class="tabs">${CCData.tracks.map((tk) => `<a class="tab ${tk.id === track.id ? 'on' : ''}" href="#/learn/${tk.id}">${tk.icon} ${esc(tk.title)} <span class="count">${lessonProgress(tk.id).done}/${lessonProgress(tk.id).total}</span></a>`).join('')}</div>
      <p class="track-blurb">${esc(track.blurb)}</p>
      ${track.chapters.map((c) => `
        <div class="chapter-head"><h2>${esc(c.title)}</h2><span class="muted small">${plural(c.lessons.length, 'lesson')}</span></div>
        <div class="lesson-grid">
          ${c.lessons.map((l) => {
            const st = d[l.id] || {};
            const steps = l.steps.length;
            const pct = st.done ? 100 : Math.round(((st.step || 0) / steps) * 100);
            return `<a class="card lesson-card ${st.done ? 'done' : ''}" href="#/lesson/${l.id}">
              <div class="lc-top">${l.eco ? `<span class="eco">${esc(l.eco)}</span>` : ''}${levelBadge(l.level || 1)}${st.done ? `<span class="done-badge">✓ ${t('Done')}</span>` : ''}</div>
              <h3>${esc(l.title)}</h3>
              <p class="small muted">${esc(l.summary)}</p>
              <div class="lc-foot">${sideBadge(l.side)}<span class="small muted">${plural(steps, 'step')}</span></div>
              <div class="progress thin"><div style="width:${pct}%"></div></div>
            </a>`;
          }).join('')}
        </div>`).join('')}`;
  });

  // ================================================================ LIBRARY
  page('library', function Library(root) {
    const cites = {};
    for (const l of CCData.lessons) for (const r of l.refs || []) (cites[r] = cites[r] || []).push(l);
    const item = (kind, id, r) => {
      const key = `${kind}:${id}`;
      const ls = cites[key] || [];
      return `<div class="card lib-item">
        <div class="lib-ico">${kind === 'book' ? '📕' : '♟'}</div>
        <div>
          <h3>${esc(r.title)}</h3>
          <div class="small muted">${kind === 'book' ? esc(r.author) : esc(r.event)} · ${r.year}</div>
          <p class="small">${esc(r.note)}</p>
          ${ls.length ? `<div class="small">${t('Cited in:')} ${ls.map((l) => `<a href="#/lesson/${l.id}">${esc(l.title)}</a>`).join(', ')}</div>` : ''}
        </div></div>`;
    };
    const L = CCData.library;
    root.innerHTML = `
      <div class="page-head"><h1>${t('Library')}</h1><p class="muted">${t("The books and games the lessons are built on. A grandmaster's education is the classics: study the games, then read the books.")}</p></div>
      <h2 class="section-title">📚 ${t('Bibliography')}</h2>
      <div class="lib-grid">${Object.entries(L.books).sort((a, b) => a[1].year - b[1].year).map(([id, r]) => item('book', id, r)).join('')}</div>
      <h2 class="section-title">♟ ${t('Famous games & studies')}</h2>
      <div class="lib-grid">${Object.entries(L.games).sort((a, b) => a[1].year - b[1].year).map(([id, r]) => item('game', id, r)).join('')}</div>`;
  });
})();
