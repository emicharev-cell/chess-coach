/* tools/validate.js — validates data/*.json (see validate.html). */
(function () {
  'use strict';
  const out = document.getElementById('out');
  const sum = document.getElementById('sum');
  let counts;
  function row(item, level, detail) {
    counts[level]++;
    if (level === 'ok' && document.getElementById('onlyBad').checked) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item}</td><td class="${level}">${level.toUpperCase()}</td><td>${detail || ''}</td>`;
    out.appendChild(tr);
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const sameMove = (a, b) => a.from === b.from && a.to === b.to && (a.promotion || null) === (b.promotion || null);

  function playLine(ch, moves, where) {
    for (const m of moves) {
      if (!ch.move(m.san)) throw new Error(`${where}: illegal move "${m.san}" at ${ch.fen()}`);
    }
  }

  async function checkFind(where, obj, engine) {
    const ch = CCData.startPosition(obj);
    const sol = CCData.normSolution(obj.solution);
    const userSide = ch.turn;
    const notes = [];
    let warn = false;
    for (let i = 0; i < sol.length; i++) {
      const isUser = ch.turn === userSide;
      for (const alt of sol[i]) {
        if (!ch.findMove(alt)) throw new Error(`illegal solution move "${alt}" (ply ${i + 1}) at ${ch.fen()}`);
      }
      if (isUser && engine && obj.engine !== false) {
        await tick();
        const r = Engine.search(ch.clone(), { depth: 5, timeMs: 3000, exact: true });
        const best = r.root[0];
        const scores = sol[i].map((alt) => { const m = ch.findMove(alt); const e = r.root.find((x) => sameMove(x.m, m)); return [alt, e ? e.score : -Infinity]; });
        const top = r.root.slice(0, 5).map((x) => `${ch.san(x.m)} ${Engine.formatScore(x.score)}`).join(', ');
        const bestAlt = Math.max(...scores.map((s) => s[1]));
        const fmt = scores.map((s) => s[0] + ' ' + Engine.formatScore(s[1])).join(' / ');
        const mates = best.score > Engine.MATE - 500 && bestAlt > Engine.MATE - 500;
        if (bestAlt < best.score - 80 && !mates) { warn = true; notes.push(`<span class="warn">ply ${i + 1}: solution ${fmt} — engine prefers ${top}</span>`); }
        else notes.push(`ply ${i + 1}: ${fmt} · engine top: ${top}`);
        for (const [alt, sc] of scores) if (sol[i].length > 1 && sc < best.score - 80 && !(sc > Engine.MATE - 500)) { warn = true; notes.push(`<span class="warn">accepted alternative ${alt} is clearly weaker (${Engine.formatScore(sc)})</span>`); }
      }
      ch.move(sol[i][0]);
    }
    if (obj.wrong) {
      const t = CCData.startPosition(obj);
      for (const k of Object.keys(obj.wrong)) if (!t.findMove(k)) notes.push(`<span class="muted">note: "wrong" key ${k} is not legal at the first move (fine if it refers to a later ply)</span>`);
    }
    return { notes, mate: ch.isCheckmate(), warn };
  }

  async function run() {
    out.innerHTML = ''; counts = { ok: 0, warn: 0, err: 0 };
    sum.textContent = 'Running…';
    const engine = document.getElementById('eng').checked;
    try { await CCData.load(); } catch (e) { row('data load', 'err', e.message); sum.textContent = 'Failed to load data.'; return; }
    for (const l of CCData.lessons) {
      for (const r of l.refs || []) if (!CCData.ref(r)) row(`${l.id} refs`, 'err', `unknown reference "${r}"`);
      for (let i = 0; i < l.steps.length; i++) {
        const s = l.steps[i];
        const where = `${l.id} · step ${i + 1} (${s.type}${s.you ? ' ' + s.you : ''}) ${s.title ? '— ' + s.title : ''}`;
        try {
          const ch = CCData.startPosition(s);
          if (s.type === 'line') {
            const mv = CCData.parseMoves(s.moves);
            playLine(ch, mv, where);
            row(where, 'ok', `${mv.length} moves${ch.isCheckmate() ? ', ends in checkmate' : ''} → ${ch.fen()}`);
          } else if (s.type === 'find') {
            const r = await checkFind(where, s, engine);
            row(where, r.warn ? 'warn' : 'ok', (r.mate ? '<b>ends in checkmate</b> · ' : '') + r.notes.join('<br>'));
          } else if (s.type === 'quiz') {
            const n = s.options.filter((o) => o.correct).length;
            row(where, n === 1 ? 'ok' : 'err', n === 1 ? (ch.isCheckmate() ? 'position is checkmate' : '') : `${n} correct options (need exactly 1)`);
          } else if (s.type === 'play') {
            const ok = ['mate', 'promote', 'hold'].includes(s.goal);
            row(where, ok ? 'ok' : 'err', ok ? `goal ${s.goal}${s.moves ? ' in ' + s.moves : ''}, ${ch.turn === 'w' ? 'White' : 'Black'} to move, you: ${s.you || ch.turn}` : `unknown goal "${s.goal}"`);
          } else if (s.type === 'text') row(where, 'ok', ch.isCheckmate() ? 'position is checkmate' : ch.fen());
          else row(where, 'err', `unknown step type "${s.type}"`);
          for (const sq of Object.keys(s.marks || {})) if (!/^[a-h][1-8]$/.test(sq)) row(where, 'err', `bad mark square ${sq}`);
          for (const a of s.arrows || []) if (!/^[a-h][1-8]$/.test(a[0]) || !/^[a-h][1-8]$/.test(a[1])) row(where, 'err', `bad arrow ${a}`);
        } catch (e) { row(where, 'err', e.message); }
        await tick();
      }
    }
    for (const c of CCData.cards.filter((x) => !x.lessonId)) {
      const where = `drill card ${c.deck} · ${c.id}`;
      try {
        const r = await checkFind(where, c, engine);
        row(where, r.warn ? 'warn' : 'ok', (r.mate ? '<b>ends in checkmate</b> · ' : '') + r.notes.join('<br>'));
      } catch (e) { row(where, 'err', e.message); }
    }
    for (const p of CCData.puzzles) {
      const where = `puzzle ${p.id} — ${p.title}`;
      try {
        const ch = new Chess(p.fen);
        for (const m of p.solution) { const mv = Array.isArray(m) ? m[0] : m; if (!ch.move(mv)) throw new Error(`illegal ${mv} at ${ch.fen()}`); }
        row(where, 'ok', ch.isCheckmate() ? 'mate' : '');
      } catch (e) { row(where, 'err', e.message); }
    }
    const ids = new Set();
    for (const c of CCData.cards) { if (ids.has(c.id)) row('cards', 'err', `duplicate card id ${c.id}`); ids.add(c.id); }
    sum.innerHTML = `<span class="ok">${counts.ok} ok</span> · <span class="warn">${counts.warn} warnings</span> · <span class="err">${counts.err} errors</span> — ${CCData.lessons.length} lessons, ${CCData.cards.length} drill cards, ${CCData.puzzles.length} puzzles`;
    window.validationDone = counts;
  }
  document.getElementById('run').addEventListener('click', run);
  if (/[?&]auto/.test(location.search)) run();
})();
