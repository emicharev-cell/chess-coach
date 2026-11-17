/*
 * engine.js — a small but honest chess engine:
 * tapered piece-square evaluation, alpha-beta negamax with iterative deepening,
 * quiescence search, check extensions, killer moves, MVV-LVA ordering,
 * mop-up evaluation for converting won endgames, and a tiny opening book.
 */
(function (global) {
  'use strict';
  const { sqName } = global.Chess;

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;
  const INF = 1e9;

  // Piece-square tables from White's point of view, index 0 = a8 ... 63 = h1.
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const PASSED = [0, 10, 15, 25, 45, 75, 120, 0]; // by relative rank (endgame weighted)

  const pstIdx = (sq, white) => (white ? (7 - (sq >> 3)) * 8 + (sq & 7) : (sq >> 3) * 8 + (sq & 7));

  /** Static evaluation in centipawns from the side to move's point of view. */
  function evaluate(ch) {
    const b = ch.board;
    let score = 0, phase = 0, wk = -1, bk = -1;
    const mat = { w: 0, b: 0 }, bishops = { w: 0, b: 0 };
    const pawnFiles = { w: [], b: [] };
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p) continue;
      const white = p < 'a', t = p.toLowerCase();
      if (t === 'k') { if (white) wk = s; else bk = s; continue; }
      const sign = white ? 1 : -1;
      score += sign * (VAL[t] + PST[t][pstIdx(s, white)]);
      mat[white ? 'w' : 'b'] += VAL[t];
      if (t === 'p') pawnFiles[white ? 'w' : 'b'].push(s);
      else phase += t === 'q' ? 4 : t === 'r' ? 2 : 1;
      if (t === 'b') bishops[white ? 'w' : 'b']++;
    }
    const mg = Math.min(phase, 24) / 24, eg = 1 - mg;
    if (wk >= 0) score += PST.k[pstIdx(wk, true)] * mg + PST.ke[pstIdx(wk, true)] * eg;
    if (bk >= 0) score -= PST.k[pstIdx(bk, false)] * mg + PST.ke[pstIdx(bk, false)] * eg;
    if (bishops.w >= 2) score += 30;
    if (bishops.b >= 2) score -= 30;

    // Pawn structure: passed, doubled, isolated.
    for (const side of ['w', 'b']) {
      const mine = pawnFiles[side], theirs = pawnFiles[side === 'w' ? 'b' : 'w'];
      const sign = side === 'w' ? 1 : -1;
      const fileCount = new Array(8).fill(0);
      for (const s of mine) fileCount[s & 7]++;
      for (const s of mine) {
        const f = s & 7, r = s >> 3;
        const passed = !theirs.some((o) => Math.abs((o & 7) - f) <= 1 && (side === 'w' ? (o >> 3) > r : (o >> 3) < r));
        if (passed) {
          const rel = side === 'w' ? r : 7 - r;
          score += sign * PASSED[rel] * (0.4 + eg);
        }
        if ((f === 0 || !fileCount[f - 1]) && (f === 7 || !fileCount[f + 1])) score -= sign * 12;
      }
      for (let f = 0; f < 8; f++) if (fileCount[f] > 1) score -= sign * 15 * (fileCount[f] - 1);
    }

    // Mop-up: drive the lone/weaker king to the edge when clearly winning.
    if (wk >= 0 && bk >= 0) {
      const diff = mat.w - mat.b;
      if (Math.abs(diff) >= 300 && eg > 0.5) {
        const strong = diff > 0 ? wk : bk, weak = diff > 0 ? bk : wk;
        const wf = weak & 7, wr = weak >> 3;
        const centerDist = Math.max(3 - wf, wf - 4) + Math.max(3 - wr, wr - 4);
        const kingDist = Math.abs((strong & 7) - wf) + Math.abs((strong >> 3) - wr);
        const mop = (12 * centerDist + 5 * (14 - kingDist)) * eg;
        score += diff > 0 ? mop : -mop;
      }
    }
    score = Math.round(score);
    return ch.turn === 'w' ? score : -score;
  }

  function moveScore(m, killers, ply, pvKey) {
    if (pvKey && m.from + '-' + m.to + (m.promotion || '') === pvKey) return 1e7;
    let s = 0;
    if (m.captured) s += 100000 + VAL[m.captured.toLowerCase()] * 10 - VAL[m.piece.toLowerCase()] / 10;
    if (m.promotion) s += 90000 + VAL[m.promotion];
    const k = killers[ply];
    if (k && !m.captured && (k[0] === m.from * 64 + m.to || k[1] === m.from * 64 + m.to)) s += 50000;
    return s;
  }
  function order(moves, killers, ply, pvKey) {
    for (const m of moves) m._o = moveScore(m, killers, ply, pvKey);
    moves.sort((a, b) => b._o - a._o);
    return moves;
  }

  /**
   * Search the position. Options:
   *   depth   — max depth (default 4)
   *   timeMs  — soft time limit (iterative deepening stops when exceeded)
   *   exact   — compute exact score for every root move (slower; for analysis)
   *   noise   — random centipawns added to root moves (weaker, more human play)
   * Returns { move, score, depth, nodes, pv, root: [{move, score}] } — score from
   * the side to move's perspective.
   */
  function search(ch, opts) {
    opts = opts || {};
    const maxDepth = opts.depth || 4;
    const t0 = performance.now();
    const deadline = opts.timeMs ? t0 + opts.timeMs : Infinity;
    const noise = opts.noise || 0;
    const exact = !!opts.exact || noise > 0;
    let nodes = 0, stop = false;
    const killers = [];
    let pvTable = [];
    let rootDepth = 1;

    function timeUp() {
      if ((nodes & 1023) === 0 && performance.now() > deadline) stop = true;
      return stop;
    }

    function qs(alpha, beta, ply) {
      nodes++;
      if (timeUp()) return 0;
      const stand = evaluate(ch);
      if (ply > 30) return stand;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      const us = ch.turn;
      const moves = order(ch.pseudo(true), killers, ply, null);
      let best = stand;
      for (const m of moves) {
        // Delta pruning: skip captures that cannot possibly raise alpha.
        if (!m.promotion && stand + VAL[m.captured.toLowerCase()] + 200 < alpha) continue;
        ch.make(m);
        if (!ch.leftKingSafe(us)) { ch.unmake(); continue; }
        const sc = -qs(-beta, -alpha, ply + 1);
        ch.unmake();
        if (stop) return 0;
        if (sc > best) best = sc;
        if (sc >= beta) return sc;
        if (sc > alpha) alpha = sc;
      }
      return best;
    }

    function negamax(depth, alpha, beta, ply) {
      pvTable[ply] = [];
      const inCheck = ch.inCheck();
      if (inCheck && ply < rootDepth * 2 + 2) depth++;
      if (depth <= 0) return qs(alpha, beta, ply);
      nodes++;
      if (timeUp()) return 0;
      if (ch.halfmove >= 100) return 0;
      const us = ch.turn;
      const pvKey = opts._pv && opts._pv[ply] ? opts._pv[ply] : null;
      const moves = order(ch.pseudo(false), killers, ply, pvKey);
      let legal = 0, best = -INF;
      for (const m of moves) {
        ch.make(m);
        if (!ch.leftKingSafe(us)) { ch.unmake(); continue; }
        legal++;
        const sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
        ch.unmake();
        if (stop) return 0;
        if (sc > best) best = sc;
        if (sc > alpha) {
          alpha = sc;
          pvTable[ply] = [m].concat(pvTable[ply + 1] || []);
        }
        if (alpha >= beta) {
          if (!m.captured) {
            const k = killers[ply] || (killers[ply] = [0, 0]);
            const key = m.from * 64 + m.to;
            if (k[0] !== key) { k[1] = k[0]; k[0] = key; }
          }
          break;
        }
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      return best;
    }

    const rootUs = ch.turn;
    const rootMoves = [];
    for (const m of ch.pseudo(false)) {
      ch.make(m);
      if (ch.leftKingSafe(rootUs)) {
        const repeats = ch.repetition ? ch.repetition.filter((k) => k === ch.key()).length : 0;
        rootMoves.push({ m, score: 0, noise: noise ? (Math.random() * 2 - 1) * noise : 0, draw: repeats >= 2, pv: [] });
      }
      ch.unmake();
    }
    if (!rootMoves.length) return { move: null, score: ch.inCheck() ? -MATE : 0, depth: 0, nodes: 0, pv: [], root: [] };
    for (const r of rootMoves) r.score = moveScore(r.m, killers, 0, null) / 1000;
    rootMoves.sort((a, b) => b.score - a.score);

    let best = rootMoves[0], completedDepth = 0;
    for (let d = 1; d <= maxDepth; d++) {
      rootDepth = d;
      let alpha = -INF;
      const beta = INF;
      let iterBest = null;
      for (const r of rootMoves) r.partialTotal = -INF;
      for (const r of rootMoves) {
        let sc;
        if (r.draw) sc = 0;
        else {
          ch.make(r.m);
          opts._pv = [null].concat((r.pv || []).slice(1).map((x) => x.from + '-' + x.to + (x.promotion || '')));
          sc = -negamax(d - 1, exact ? -INF : -beta, exact ? INF : -alpha, 1);
          if (!stop) r.pv = [r.m].concat(pvTable[1] || []);
          ch.unmake();
        }
        if (stop) break;
        r.score = sc;
        r.total = sc + r.noise;
        r.partialTotal = r.total;
        if (!iterBest || r.total > iterBest.total) iterBest = r;
        if (!exact && sc > alpha) alpha = sc;
      }
      if (stop) {
        // Partial iteration: roll every root move back to the last completed depth so
        // scores stay comparable; switch best move only if a new one beat it at this depth.
        if (completedDepth > 0) {
          const prevBest = best;
          for (const r of rootMoves) { r.score = r.final; r.total = r.final + r.noise; r.pv = r.finalPv; }
          rootMoves.sort((a, b) => b.total - a.total);
          best = prevBest;
          if (iterBest && iterBest !== prevBest && iterBest.partialTotal > prevBest.partialTotal) best = iterBest;
          rootMoves.sort((a, b) => (b === best) - (a === best));
        }
        break;
      }
      completedDepth = d;
      for (const r of rootMoves) { r.final = r.score; r.finalPv = r.pv; }
      // Moves that failed low got upper bounds; keep order stable by score.
      rootMoves.sort((a, b) => b.total - a.total);
      best = rootMoves[0];
      if (Math.abs(best.score) > MATE - 500 && !noise) break; // forced mate found
      if (performance.now() - t0 > (deadline - t0) * 0.45) break; // next iteration won't finish
    }

    const decorate = (m) => {
      const list = ch.legal();
      return ch.decorate(m, list);
    };
    return {
      move: decorate(best.m),
      score: best.score,
      depth: completedDepth,
      nodes,
      timeMs: Math.round(performance.now() - t0),
      pv: (best.pv || [best.m]).map((m) => sqName(m.from) + sqName(m.to) + (m.promotion || '')),
      root: rootMoves.map((r) => ({ uci: sqName(r.m.from) + sqName(r.m.to) + (r.m.promotion || ''), m: r.m, score: r.score })),
    };
  }

  // --- Opening book & names -------------------------------------------------
  const BOOK = [
    'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6',
    'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O',
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6',
    'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6',
    'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4',
    'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5',
    'e4 e5 Nc3 Nf6 Nf3 Nc6',
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
    'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5',
    'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6',
    'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7',
    'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6',
    'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6',
    'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6',
    'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O',
    'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4',
    'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5',
    'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O',
    'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O',
    'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6',
    'd4 Nf6 Nf3 d5 Bf4 e6 e3 c5',
    'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
    'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4',
  ];
  const OPENINGS = [
    ['e4', "King's Pawn Opening"], ['d4', "Queen's Pawn Opening"], ['c4', 'English Opening'], ['Nf3', 'Réti Opening'],
    ['e4 e5', 'Open Game'], ['e4 e5 Nf3', "King's Knight Opening"], ['e4 e5 Nf3 Nc6', "King's Knight Opening"],
    ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game'], ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'Italian Game: Giuoco Piano'],
    ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'Italian Game: Two Knights Defence'], ['e4 e5 Nf3 Nc6 Bb5', 'Ruy López (Spanish Opening)'],
    ['e4 e5 Nf3 Nc6 d4', 'Scotch Game'], ['e4 e5 Nf3 Nc6 Nc3 Nf6', 'Four Knights Game'], ['e4 e5 Nf3 Nf6', 'Petrov Defence'],
    ['e4 e5 Nf3 d6', 'Philidor Defence'], ['e4 e5 f4', "King's Gambit"], ['e4 e5 Nc3', 'Vienna Game'],
    ['e4 e5 Bc4', "Bishop's Opening"], ['e4 e5 Qh5', 'Wayward Queen Attack'],
    ['e4 c5', 'Sicilian Defence'], ['e4 e6', 'French Defence'], ['e4 c6', 'Caro-Kann Defence'],
    ['e4 d5', 'Scandinavian Defence'], ['e4 Nf6', "Alekhine's Defence"], ['e4 d6', 'Pirc Defence'], ['e4 g6', 'Modern Defence'],
    ['d4 d5', 'Closed Game'], ['d4 d5 c4', "Queen's Gambit"], ['d4 d5 c4 e6', "Queen's Gambit Declined"],
    ['d4 d5 c4 dxc4', "Queen's Gambit Accepted"], ['d4 d5 c4 c6', 'Slav Defence'], ['d4 d5 Bf4', 'London System'],
    ['d4 Nf6', 'Indian Defence'], ['d4 Nf6 c4 g6', "King's Indian Defence"], ['d4 Nf6 c4 e6 Nc3 Bb4', 'Nimzo-Indian Defence'],
    ['d4 Nf6 Nf3 d5 Bf4', 'London System'], ['d4 Nf6 Bf4', 'London System'], ['d4 f5', 'Dutch Defence'],
  ];

  function sanLine(ch) {
    if (ch.startFen !== global.Chess.START_FEN) return null; // book only applies to normal games
    return ch.history.map((m) => m.san.replace(/[+#]/g, '')).join(' ');
  }

  function bookMove(ch) {
    const line = sanLine(ch);
    if (line === null) return null;
    const prefix = line ? line + ' ' : '';
    const cands = [];
    for (const l of BOOK) {
      if (l.startsWith(prefix) && l.length > prefix.length) {
        const next = l.slice(prefix.length).split(' ')[0];
        if (ch.findMove(next)) cands.push(next);
      }
    }
    if (!cands.length) return null;
    return cands[Math.floor(Math.random() * cands.length)];
  }

  function openingName(ch) {
    const line = sanLine(ch);
    if (!line) return null;
    let name = null;
    for (const [seq, n] of OPENINGS) if (line === seq || line.startsWith(seq + ' ')) {
      if (!name || seq.length >= name.len) name = { len: seq.length, n };
    }
    return name ? name.n : null;
  }

  const LEVELS = [
    { id: 1, name: 'Beginner', elo: '≈400', depth: 1, noise: 220, blunder: 0.22, book: false },
    { id: 2, name: 'Casual', elo: '≈800', depth: 2, noise: 90, blunder: 0.05, book: true },
    { id: 3, name: 'Club', elo: '≈1200', depth: 3, noise: 25, blunder: 0, book: true, timeMs: 2500 },
    { id: 4, name: 'Advanced', elo: '≈1600', depth: 8, noise: 0, blunder: 0, book: true, timeMs: 1500 },
  ];

  /** Choose a move for the computer at the given level. Returns UCI/SAN string. */
  function chooseMove(ch, levelId) {
    const L = LEVELS.find((l) => l.id === levelId) || LEVELS[1];
    if (L.book && ch.history.length < 12) {
      const bm = bookMove(ch);
      if (bm) return { move: bm, book: true, score: null };
    }
    if (L.blunder && Math.random() < L.blunder) {
      const list = ch.legal();
      const caps = list.filter((m) => m.captured);
      const pool = caps.length && Math.random() < 0.5 ? caps : list;
      const m = pool[Math.floor(Math.random() * pool.length)];
      return { move: sqName(m.from) + sqName(m.to) + (m.promotion || ''), book: false, score: null };
    }
    const res = search(ch, { depth: L.depth, noise: L.noise, timeMs: L.timeMs || 3000 });
    return { move: res.move.uci, book: false, score: res.score, result: res };
  }

  function formatScore(score) {
    if (score == null) return '';
    if (Math.abs(score) > MATE - 500) {
      const n = Math.ceil((MATE - Math.abs(score)) / 2);
      return (score > 0 ? '' : '-') + 'M' + n;
    }
    const v = score / 100;
    return (v > 0 ? '+' : '') + v.toFixed(1);
  }

  global.Engine = { search, evaluate, chooseMove, bookMove, openingName, formatScore, LEVELS, MATE, VAL };
})(typeof window !== 'undefined' ? window : globalThis);
