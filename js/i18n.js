/*
 * i18n.js — interface language (Spanish by default, English available).
 *   t('English text {x}', {x: 1})  -> translated string with variables filled in.
 * English strings are the keys; translations live in js/i18n-es.js.
 * Lesson content is translated separately: data/es/*.json (Spanish) and data/*.json (English).
 */
(function (global) {
  'use strict';
  const KEY = 'chess-coach-lang';
  let lang = 'es';
  try { lang = localStorage.getItem(KEY) || (navigator.language || 'es').slice(0, 2); } catch (_) { /* ignore */ }
  if (!['es', 'en'].includes(lang)) lang = 'es';
  const missing = new Set();

  const PIECES = {
    en: { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' },
    es: { k: 'rey', q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' },
  };
  const FEMININE = { q: true, r: true };

  function t(key, vars) {
    let s = key;
    if (lang !== 'en') {
      const d = I18N.dict[lang] || {};
      if (Object.prototype.hasOwnProperty.call(d, key)) s = d[key];
      else if (!missing.has(key)) { missing.add(key); if (global.console) console.warn('[i18n] missing:', key); }
    }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }

  const I18N = {
    dict: {},
    get lang() { return lang; },
    missing,
    setLang(l) {
      try { localStorage.setItem(KEY, l); } catch (_) { /* ignore */ }
      location.reload();
    },
    /** Piece name from a piece letter ('N', 'q'...). */
    piece(p) { return PIECES[lang][String(p).toLowerCase()]; },
    /** "a knight" / "un caballo", "una dama". */
    aPiece(p) {
      const n = this.piece(p);
      if (lang === 'es') return (FEMININE[String(p).toLowerCase()] ? 'una ' : 'un ') + n;
      return (/^[aeiou]/.test(n) ? 'an ' : 'a ') + n;
    },
    /** Folder holding the lesson JSON for the current language. */
    dataDir() { return lang === 'es' ? 'data/es/' : 'data/'; },
    /** Translate static markup: elements with data-i18n (text) / data-i18n-title (title). */
    apply(root) {
      (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
      (root || document).querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
      document.documentElement.lang = lang;
    },
  };
  global.I18N = I18N;
  global.t = t;
})(window);
