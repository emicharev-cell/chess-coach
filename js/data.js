/*
 * data.js — loads the JSON curriculum (data/*.json) and turns it into
 * lessons, drill cards and a reference library. See docs/CONTENT_GUIDE.md.
 */
(function (global) {
  'use strict';
  const TRACK_FILES = ['openings', 'middlegame', 'endgames'];
  const tr = (s) => (global.t ? global.t(s) : s);
  const D = {
    tracks: [], lessons: [], lessonById: {}, cards: [], cardById: {}, decks: [], deckById: {},
    puzzles: [], library: { books: {}, games: {} }, loaded: false,
  };

  async function getJson(name) {
    const dir = global.CCData_DIR || (global.I18N ? I18N.dataDir() : 'data/');
    const res = await fetch(`${global.CCData_BASE || ''}${dir}${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${dir}${name}.json: HTTP ${res.status}`);
    try { return await res.json(); } catch (e) { throw new Error(`${dir}${name}.json: invalid JSON (${e.message})`); }
  }

  /** "e4 e5 Nf3" or ["e4", ["e5","why"], ...] -> [{san, why}] */
  function parseMoves(list) {
    if (!list) return [];
    if (typeof list === 'string') return list.trim().split(/\s+/).filter(Boolean).map((san) => ({ san }));
    return list.map((x) => (Array.isArray(x) ? { san: x[0], why: x[1] || '' } : typeof x === 'string' ? { san: x } : x));
  }

  /** Starting position for any step/card: `fen` (default: initial position) then `setup` moves. */
  function startPosition(obj) {
    const ch = new Chess(obj.fen || Chess.START_FEN);
    for (const m of parseMoves(obj.setup)) {
      if (!ch.move(m.san)) throw new Error(`illegal setup move "${m.san}" in ${obj._where || obj.id || 'step'}`);
    }
    return ch;
  }

  /** Normalise a solution list: each entry -> array of accepted SAN strings. */
  const normSolution = (sol) => (sol || []).map((x) => (Array.isArray(x) ? x : [x]));

  function cardFromStep(lesson, step, i, you) {
    const kind = step.type === 'line' ? 'line' : 'find';
    const ch = startPosition(step);
    const side = kind === 'line' ? you : ch.turn;
    let deck;
    if (lesson.track === 'openings') deck = side === 'w' ? 'rep-w' : 'rep-b';
    else deck = lesson.track;
    return {
      id: `${lesson.id}#${i}${step.type === 'line' && lesson.stepsBoth && lesson.stepsBoth[i] ? ':' + you : ''}`,
      deck, kind, you: side,
      title: step.title || lesson.title,
      lessonId: lesson.id, lessonTitle: lesson.title, stepIndex: i,
      fen: step.fen, setup: step.setup, text: step.text || '',
      moves: step.moves, solution: step.solution, why: step.why, wrong: step.wrong, engine: step.engine,
    };
  }

  function buildCards() {
    const cards = [];
    for (const l of D.lessons) {
      l.stepsBoth = {};
      l.steps.forEach((s, i) => {
        if (s.drill === false) return;
        if (s.type === 'find') cards.push(cardFromStep(l, s, i));
        if (s.type === 'line') {
          if (s.you === 'watch') return;
          if (s.you === 'both') {
            l.stepsBoth[i] = true;
            cards.push(cardFromStep(l, s, i, 'w'), cardFromStep(l, s, i, 'b'));
          } else cards.push(cardFromStep(l, s, i, s.you || 'w'));
        }
      });
    }
    return cards;
  }

  D.load = async function load() {
    if (D.loaded) return D;
    const [tracks, drills, puzzles, library] = await Promise.all([
      Promise.all(TRACK_FILES.map(getJson)), getJson('drills'), getJson('puzzles'), getJson('library'),
    ]);
    D.library = library;
    D.tracks = tracks;
    for (const t of tracks) {
      for (const c of t.chapters) {
        for (const l of c.lessons) {
          l.track = t.id; l.trackTitle = t.title; l.chapter = c.title; l.chapterId = c.id;
          l.steps.forEach((s, i) => { s._where = `${l.id} step ${i + 1}`; });
          D.lessons.push(l);
          D.lessonById[l.id] = l;
        }
      }
    }
    D.decks = [
      { id: 'rep-w', title: tr('Opening repertoire: White'), icon: '♔', blurb: tr('Every White line from the opening lessons. Play the main-line moves from memory.') },
      { id: 'rep-b', title: tr('Opening repertoire: Black'), icon: '♚', blurb: tr('Every Black line from the opening lessons, including the best replies to the main gambits.') },
      ...drills.decks.map((d) => ({ id: d.id, title: d.title, icon: d.icon, blurb: d.blurb })),
      { id: 'middlegame', title: tr('Middlegame patterns'), icon: '⚔️', blurb: tr('Tactical and strategic exercises from the middlegame lessons.') },
      { id: 'endgames', title: tr('Endgame technique'), icon: '♔', blurb: tr('Key squares, Réti, Lucena, Philidor and the rook skewer, until they are reflexes.') },
    ];
    D.cards = buildCards();
    for (const d of drills.decks) {
      for (const c of d.cards) {
        D.cards.push(Object.assign({ kind: c.moves ? 'line' : 'find', deck: d.id }, c, { you: c.you }));
      }
    }
    for (const c of D.cards) {
      if (!c.you) c.you = startPosition(c).turn;
      D.cardById[c.id] = c;
    }
    for (const d of D.decks) {
      d.cards = D.cards.filter((c) => c.deck === d.id);
      D.deckById[d.id] = d;
    }
    D.puzzles = puzzles.puzzles;
    D.loaded = true;
    return D;
  };

  D.parseMoves = parseMoves;
  D.startPosition = startPosition;
  D.normSolution = normSolution;
  /** Look up a "book:x" / "game:y" reference. */
  D.ref = (key) => {
    const [kind, id] = key.split(':');
    const item = (kind === 'book' ? D.library.books : D.library.games)[id];
    return item ? Object.assign({ kind, id, key }, item) : null;
  };
  global.CCData = D;
})(window);
