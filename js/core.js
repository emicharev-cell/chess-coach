/*
 * core.js — shared app infrastructure: storage, helpers, router, shell (nav + settings).
 * Pages register themselves with CC.page(name, fn) and are mounted into #app.
 */
(function (global) {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ------------------------------------------------------------------ storage
  const Store = (() => {
    const KEY = 'chess-coach-v2';
    const defaults = () => ({
      lessons: {},
      srs: {},
      puzzles: { solved: {}, failed: {}, rating: 1200, streak: 0, best: 0 },
      games: { played: 0, won: 0, lost: 0, drawn: 0 },
      activity: {},
      settings: { level: 3, color: 'w', coach: true, sound: true, theme: null, board: 'brown', newPerSession: 8, speed: false },
    });
    let data = defaults();
    const merge = (saved) => { for (const k of Object.keys(data)) if (saved && saved[k]) data[k] = Object.assign(data[k], saved[k]); };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) merge(JSON.parse(raw));
      else {
        const old = JSON.parse(localStorage.getItem('chess-coach-v1') || 'null'); // migrate v1
        if (old) merge({ puzzles: old.puzzles, games: old.games, settings: Object.assign({}, old.settings, { level: 3 }) });
      }
    } catch (_) { /* storage unavailable */ }
    return {
      get data() { return data; },
      save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* ignore */ } },
      reset() { const s = data.settings; data = defaults(); data.settings = s; this.save(); },
      /** Record training activity for today (drives the daily streak). */
      bump(n) {
        const d = today();
        data.activity[d] = (data.activity[d] || 0) + (n || 1);
        this.save();
      },
    };
  })();

  function today(offset) {
    const d = new Date(Date.now() - (offset || 0) * 864e5);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayStreak() {
    const a = Store.data.activity;
    let n = 0, i = a[today()] ? 0 : 1;
    while (a[today(i)]) { n++; i++; }
    return n;
  }

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Tiny markdown: paragraphs, **bold**, *italic*, bullet lines starting with • or "- ", numbered lines. */
  function md(text) {
    if (!text) return '';
    return esc(text).split(/\n\n+/).map((p) => {
      const lines = p.split('\n');
      const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
      if (lines.every((l) => /^(•|- )/.test(l))) return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^(•|- )\s*/, ''))}</li>`).join('') + '</ul>';
      if (lines.every((l) => /^\d+\.\s/.test(l))) return '<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s*/, ''))}</li>`).join('') + '</ol>';
      return '<p>' + inline(lines.join('<br>')) + '</p>';
    }).join('');
  }
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const colorName = (c) => (c === 'w' ? t('White') : t('Black'));
  const LEVELS = { 1: 'Club', 2: 'Advanced', 3: 'Expert' };
  const levelBadge = (n) => `<span class="lvl lvl${n}" title="${t('{lvl} level', { lvl: t(LEVELS[n]) })}">${'●'.repeat(n)}${'○'.repeat(3 - n)} ${t(LEVELS[n])}</span>`;
  const sideBadge = (s) => s === 'w' ? `<span class="side w" title="${t('Learn as White')}">♔ ${t('White')}</span>`
    : s === 'b' ? `<span class="side b" title="${t('Learn as Black')}">♚ ${t('Black')}</span>`
      : `<span class="side both" title="${t('Both colours')}">♔♚ ${t('Both')}</span>`;
  /** plural(3, 'lesson') -> "3 lessons" / "3 lecciones" (keys: 'lesson' and 'lessons'). */
  const plural = (n, w) => `${n} ${t(n === 1 ? w : (w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's'))}`;

  function refsHtml(refs) {
    const items = (refs || []).map(CCData.ref).filter(Boolean);
    if (!items.length) return '';
    return `<div class="refs"><h4>📚 ${t('References')}</h4>${items.map((r) => `
      <div class="ref"><span class="ref-ico">${r.kind === 'book' ? '📕' : '♟'}</span><div>
        <b>${esc(r.title)}</b> <span class="muted">— ${r.kind === 'book' ? esc(r.author) + ', ' + r.year : esc(r.event) + ', ' + r.year}</span>
        <div class="small muted">${esc(r.note)}</div></div></div>`).join('')}</div>`;
  }

  /** Standard two-column training layout: board on the left, panel on the right. */
  function trainingLayout(root) {
    root.innerHTML = `
      <div class="train">
        <div class="board-col">
          <div class="board-row"><div class="evalbar hidden"><div class="white"></div><div class="label"></div></div><div class="board-holder"></div></div>
        </div>
        <div class="panel"></div>
      </div>`;
    return { holder: $('.board-holder', root), panel: $('.panel', root), evalbar: $('.evalbar', root) };
  }

  // ------------------------------------------------------------------ router
  const pages = {};
  let cleanup = null;
  const app = () => $('#app');
  function page(name, fn) { pages[name] = fn; }
  function route() {
    if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = parts[0] || '';
    const view = pages[name] || pages[''];
    const root = app();
    root.innerHTML = '';
    root.className = 'page page-' + (name || 'home');
    const navName = { lesson: 'learn' }[name] || name;
    $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === navName));
    cleanup = view(root, parts.slice(1).map(decodeURIComponent)) || null;
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ shell
  function applySettings() {
    const s = Store.data.settings;
    if (s.theme) document.documentElement.dataset.theme = s.theme; else delete document.documentElement.dataset.theme;
    document.documentElement.dataset.board = s.board || 'brown';
    Sound.enabled = s.sound;
    $$('[data-set="sound"]').forEach((b) => { b.classList.toggle('off', !s.sound); b.title = s.sound ? t('Sound on') : t('Sound off'); });
    $$('[data-board]').forEach((b) => b.classList.toggle('on', b.dataset.board === s.board));
    $$('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === I18N.lang));
  }

  function initShell() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-set]');
      if (b) {
        const s = Store.data.settings;
        const k = b.dataset.set;
        if (k === 'theme') {
          const dark = s.theme ? s.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
          s.theme = dark ? 'light' : 'dark';
        } else if (k === 'sound') { s.sound = !s.sound; if (s.sound) setTimeout(() => Sound.play('move'), 0); }
        else if (k === 'reset') {
          if (!confirm(t('Reset all progress (lessons, drills, puzzle rating, game stats)? Settings are kept.'))) return;
          Store.reset(); route();
        }
        Store.save(); applySettings();
        return;
      }
      const lb = e.target.closest('[data-lang]');
      if (lb) { if (lb.dataset.lang !== I18N.lang) I18N.setLang(lb.dataset.lang); return; }
      const bt = e.target.closest('[data-board]');
      if (bt && bt.closest('.board-themes')) { Store.data.settings.board = bt.dataset.board; Store.save(); applySettings(); }
    });
    window.addEventListener('hashchange', route);
    // Keyboard: Enter / → advance where a primary "next" button exists.
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea,select')) return;
      if (e.key === 'Enter' && e.target.closest('button,a,summary')) return; // native activation already fires
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        const nb = $('[data-key="next"]:not([disabled]):not([hidden])');
        if (nb) { e.preventDefault(); nb.click(); }
      } else if (e.key === 'ArrowLeft') {
        const bb = $('[data-key="back"]:not([disabled]):not([hidden])');
        if (bb) { e.preventDefault(); bb.click(); }
      }
    });
    applySettings();
  }

  async function start() {
    I18N.apply();
    initShell();
    const root = app();
    root.innerHTML = `<div class="loading"><div class="spinner"></div>${t('Loading the curriculum…')}</div>`;
    try {
      await CCData.load();
    } catch (err) {
      const fileHint = location.protocol === 'file:'
        ? `<p>${t('You opened index.html directly from disk. Browsers block loading the lesson files that way. Start a tiny local server in the project folder instead:')}</p><pre>python -m http.server 8000</pre><p>${t('then open')} <a href="http://localhost:8000">http://localhost:8000</a>.</p>`
        : `<p>${t('Check the browser console, and validate your JSON with')} <a href="tools/validate.html">tools/validate.html</a>.</p>`;
      root.innerHTML = `<div class="card error-card"><h2>${t("Couldn't load the lesson data")}</h2><p class="muted">${esc(err.message)}</p>${fileHint}</div>`;
      console.error(err);
      return;
    }
    route();
  }

  global.CC = { Store, $, $$, esc, md, el, colorName, levelBadge, sideBadge, plural, refsHtml, trainingLayout, page, route, start, today, dayStreak, LEVELS };
})(window);
