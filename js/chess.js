/*
 * chess.js — complete chess rules: move generation, legality, SAN, FEN,
 * check / mate / stalemate / draw detection.
 * Board: array of 64, index = rank * 8 + file (a1 = 0, h8 = 63).
 * Pieces: 'PNBRQK' (white) and 'pnbrqk' (black).
 */
(function (global) {
  'use strict';

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
  const sqIndex = (s) => (s.charCodeAt(0) - 97) + (parseInt(s[1], 10) - 1) * 8;
  const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const typeOf = (p) => p.toLowerCase();

  function buildTargets(offsets) {
    const t = [];
    for (let s = 0; s < 64; s++) {
      const f = s & 7, r = s >> 3, a = [];
      for (const [df, dr] of offsets) {
        const nf = f + df, nr = r + dr;
        if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) a.push(nr * 8 + nf);
      }
      t.push(a);
    }
    return t;
  }
  function buildRays(dirs) {
    const t = [];
    for (let s = 0; s < 64; s++) {
      const f = s & 7, r = s >> 3, rays = [];
      for (const [df, dr] of dirs) {
        const ray = [];
        let nf = f + df, nr = r + dr;
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) { ray.push(nr * 8 + nf); nf += df; nr += dr; }
        if (ray.length) rays.push(ray);
      }
      t.push(rays);
    }
    return t;
  }

  const KNIGHT_T = buildTargets([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
  const KING_T = buildTargets([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);
  const DIAG_R = buildRays([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  const ORTH_R = buildRays([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  const PROMOS = ['q', 'r', 'b', 'n'];

  class Chess {
    constructor(fen) { this.load(fen || START_FEN); }

    load(fen) {
      const parts = fen.trim().split(/\s+/);
      const b = new Array(64).fill(null);
      const rows = parts[0].split('/');
      if (rows.length !== 8) throw new Error('Invalid FEN: ' + fen);
      for (let r = 0; r < 8; r++) {
        let f = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') f += +ch;
          else {
            if (!'pnbrqkPNBRQK'.includes(ch) || f > 7) throw new Error('Invalid FEN: ' + fen);
            b[(7 - r) * 8 + f] = ch;
            f++;
          }
        }
      }
      this.board = b;
      this.turn = parts[1] === 'b' ? 'b' : 'w';
      const c = parts[2] || '-';
      this.castling = {
        K: c.includes('K') && b[4] === 'K' && b[7] === 'R',
        Q: c.includes('Q') && b[4] === 'K' && b[0] === 'R',
        k: c.includes('k') && b[60] === 'k' && b[63] === 'r',
        q: c.includes('q') && b[60] === 'k' && b[56] === 'r',
      };
      this.ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
      this.halfmove = parseInt(parts[4] || '0', 10) || 0;
      this.fullmove = parseInt(parts[5] || '1', 10) || 1;
      this.kings = { w: b.indexOf('K'), b: b.indexOf('k') };
      this.stack = [];
      this.history = [];
      this.startFen = this.fen();
      this.repetition = [this.key()];
    }

    clone() {
      const c = new Chess(this.startFen);
      for (const m of this.history) c.move(m.uci);
      return c;
    }

    key() {
      let s = '';
      for (let i = 0; i < 64; i++) s += this.board[i] || '.';
      return s + this.turn + this.castleStr() + this.ep;
    }

    castleStr() {
      const c = this.castling;
      const s = (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '');
      return s || '-';
    }

    fen() {
      const rows = [];
      for (let r = 7; r >= 0; r--) {
        let row = '', e = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[r * 8 + f];
          if (!p) e++;
          else { if (e) { row += e; e = 0; } row += p; }
        }
        if (e) row += e;
        rows.push(row);
      }
      return rows.join('/') + ' ' + this.turn + ' ' + this.castleStr() + ' ' +
        (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.halfmove + ' ' + this.fullmove;
    }

    get(sq) { return this.board[typeof sq === 'string' ? sqIndex(sq) : sq]; }

    attacked(sq, by) {
      const b = this.board, f = sq & 7;
      if (by === 'w') {
        if (sq >= 8) {
          if (f > 0 && b[sq - 9] === 'P') return true;
          if (f < 7 && b[sq - 7] === 'P') return true;
        }
      } else if (sq < 56) {
        if (f > 0 && b[sq + 7] === 'p') return true;
        if (f < 7 && b[sq + 9] === 'p') return true;
      }
      const w = by === 'w';
      const N = w ? 'N' : 'n', K = w ? 'K' : 'k', B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
      for (const t of KNIGHT_T[sq]) if (b[t] === N) return true;
      for (const t of KING_T[sq]) if (b[t] === K) return true;
      for (const ray of DIAG_R[sq]) for (const t of ray) { const p = b[t]; if (p) { if (p === B || p === Q) return true; break; } }
      for (const ray of ORTH_R[sq]) for (const t of ray) { const p = b[t]; if (p) { if (p === R || p === Q) return true; break; } }
      return false;
    }

    /** All squares (indices) of pieces of color `by` attacking `sq`. */
    attackers(sq, by) {
      const res = [];
      for (let s = 0; s < 64; s++) {
        const p = this.board[s];
        if (!p || colorOf(p) !== by) continue;
        const t = typeOf(p);
        if (t === 'p') {
          const f = s & 7;
          const targets = by === 'w' ? [f > 0 ? s + 7 : -1, f < 7 ? s + 9 : -1] : [f > 0 ? s - 9 : -1, f < 7 ? s - 7 : -1];
          if (targets.includes(sq)) res.push(s);
        } else if (t === 'n') { if (KNIGHT_T[s].includes(sq)) res.push(s); }
        else if (t === 'k') { if (KING_T[s].includes(sq)) res.push(s); }
        else {
          const rays = [];
          if (t === 'b' || t === 'q') rays.push(...DIAG_R[s]);
          if (t === 'r' || t === 'q') rays.push(...ORTH_R[s]);
          outer: for (const ray of rays) for (const x of ray) {
            if (x === sq) { res.push(s); break outer; }
            if (this.board[x]) break;
          }
        }
      }
      return res;
    }

    inCheck(color) {
      const c = color || this.turn;
      const k = this.kings[c];
      return k >= 0 && this.attacked(k, c === 'w' ? 'b' : 'w');
    }

    /** Pseudo-legal moves for side to move. capOnly: captures + promotions. */
    pseudo(capOnly) {
      const moves = [];
      const b = this.board, us = this.turn, them = us === 'w' ? 'b' : 'w';
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (!p || colorOf(p) !== us) continue;
        const t = typeOf(p);
        if (t === 'p') {
          const dir = us === 'w' ? 8 : -8;
          const startRank = us === 'w' ? 1 : 6;
          const promoRank = us === 'w' ? 7 : 0;
          const f = s & 7, one = s + dir;
          const promo = (one >> 3) === promoRank;
          if (b[one] == null) {
            if (promo) for (const pr of PROMOS) moves.push({ from: s, to: one, piece: p, captured: null, promotion: pr, flags: 'n' });
            else if (!capOnly) {
              moves.push({ from: s, to: one, piece: p, captured: null, promotion: null, flags: 'n' });
              if ((s >> 3) === startRank && b[one + dir] == null) moves.push({ from: s, to: one + dir, piece: p, captured: null, promotion: null, flags: 'b' });
            }
          }
          for (const df of [-1, 1]) {
            const nf = f + df;
            if (nf < 0 || nf > 7) continue;
            const to = one + df, q = b[to];
            if (q && colorOf(q) === them) {
              if (promo) for (const pr of PROMOS) moves.push({ from: s, to, piece: p, captured: q, promotion: pr, flags: 'n' });
              else moves.push({ from: s, to, piece: p, captured: q, promotion: null, flags: 'n' });
            } else if (to === this.ep && !q) {
              moves.push({ from: s, to, piece: p, captured: us === 'w' ? 'p' : 'P', promotion: null, flags: 'e' });
            }
          }
        } else if (t === 'n' || t === 'k') {
          for (const to of (t === 'n' ? KNIGHT_T : KING_T)[s]) {
            const q = b[to];
            if (!q) { if (!capOnly) moves.push({ from: s, to, piece: p, captured: null, promotion: null, flags: 'n' }); }
            else if (colorOf(q) === them) moves.push({ from: s, to, piece: p, captured: q, promotion: null, flags: 'n' });
          }
        } else {
          const rays = t === 'b' ? DIAG_R[s] : t === 'r' ? ORTH_R[s] : DIAG_R[s].concat(ORTH_R[s]);
          for (const ray of rays) {
            for (const to of ray) {
              const q = b[to];
              if (!q) { if (!capOnly) moves.push({ from: s, to, piece: p, captured: null, promotion: null, flags: 'n' }); }
              else { if (colorOf(q) === them) moves.push({ from: s, to, piece: p, captured: q, promotion: null, flags: 'n' }); break; }
            }
          }
        }
      }
      if (!capOnly) {
        const c = this.castling;
        if (us === 'w' && this.kings.w === 4) {
          if (c.K && !b[5] && !b[6] && b[7] === 'R' && !this.attacked(4, 'b') && !this.attacked(5, 'b') && !this.attacked(6, 'b'))
            moves.push({ from: 4, to: 6, piece: 'K', captured: null, promotion: null, flags: 'k' });
          if (c.Q && !b[1] && !b[2] && !b[3] && b[0] === 'R' && !this.attacked(4, 'b') && !this.attacked(3, 'b') && !this.attacked(2, 'b'))
            moves.push({ from: 4, to: 2, piece: 'K', captured: null, promotion: null, flags: 'q' });
        } else if (us === 'b' && this.kings.b === 60) {
          if (c.k && !b[61] && !b[62] && b[63] === 'r' && !this.attacked(60, 'w') && !this.attacked(61, 'w') && !this.attacked(62, 'w'))
            moves.push({ from: 60, to: 62, piece: 'k', captured: null, promotion: null, flags: 'k' });
          if (c.q && !b[57] && !b[58] && !b[59] && b[56] === 'r' && !this.attacked(60, 'w') && !this.attacked(59, 'w') && !this.attacked(58, 'w'))
            moves.push({ from: 60, to: 58, piece: 'k', captured: null, promotion: null, flags: 'q' });
        }
      }
      return moves;
    }

    make(m) {
      const b = this.board, us = this.turn, them = us === 'w' ? 'b' : 'w';
      const c = this.castling;
      this.stack.push({ m, K: c.K, Q: c.Q, k: c.k, q: c.q, ep: this.ep, half: this.halfmove, full: this.fullmove, kw: this.kings.w, kb: this.kings.b });
      const p = m.piece;
      b[m.to] = m.promotion ? (us === 'w' ? m.promotion.toUpperCase() : m.promotion) : p;
      b[m.from] = null;
      if (m.flags === 'e') b[us === 'w' ? m.to - 8 : m.to + 8] = null;
      else if (m.flags === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
      else if (m.flags === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
      if (p === 'K') { this.kings.w = m.to; c.K = c.Q = false; }
      else if (p === 'k') { this.kings.b = m.to; c.k = c.q = false; }
      for (const sq of [m.from, m.to]) {
        if (sq === 0) c.Q = false; else if (sq === 7) c.K = false;
        else if (sq === 56) c.q = false; else if (sq === 63) c.k = false;
      }
      this.ep = -1;
      if (m.flags === 'b') {
        const f = m.to & 7, enemyPawn = them === 'w' ? 'P' : 'p';
        if ((f > 0 && b[m.to - 1] === enemyPawn) || (f < 7 && b[m.to + 1] === enemyPawn)) this.ep = (m.from + m.to) >> 1;
      }
      this.halfmove = (p === 'P' || p === 'p' || m.captured) ? 0 : this.halfmove + 1;
      if (us === 'b') this.fullmove++;
      this.turn = them;
    }

    unmake() {
      const st = this.stack.pop();
      if (!st) return;
      const m = st.m, b = this.board;
      this.turn = this.turn === 'w' ? 'b' : 'w';
      const us = this.turn;
      b[m.from] = m.piece;
      if (m.flags === 'e') { b[m.to] = null; b[us === 'w' ? m.to - 8 : m.to + 8] = m.captured; }
      else b[m.to] = m.captured || null;
      if (m.flags === 'k') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = null; }
      else if (m.flags === 'q') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = null; }
      const c = this.castling;
      c.K = st.K; c.Q = st.Q; c.k = st.k; c.q = st.q;
      this.ep = st.ep; this.halfmove = st.half; this.fullmove = st.full;
      this.kings.w = st.kw; this.kings.b = st.kb;
    }

    /** After make(): was the move legal for `us` (the side that just moved)? */
    leftKingSafe(us) {
      const k = this.kings[us];
      return k < 0 || !this.attacked(k, this.turn);
    }

    legal(capOnly) {
      const res = [], us = this.turn;
      for (const m of this.pseudo(capOnly)) {
        this.make(m);
        if (this.leftKingSafe(us)) res.push(m);
        this.unmake();
      }
      return res;
    }

    san(m, list) {
      let s;
      if (m.flags === 'k') s = 'O-O';
      else if (m.flags === 'q') s = 'O-O-O';
      else {
        const t = typeOf(m.piece);
        if (t === 'p') {
          s = m.captured ? FILES[m.from & 7] + 'x' + sqName(m.to) : sqName(m.to);
          if (m.promotion) s += '=' + m.promotion.toUpperCase();
        } else {
          s = t.toUpperCase();
          const amb = (list || this.legal()).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          if (amb.length) {
            const sameFile = amb.some((o) => (o.from & 7) === (m.from & 7));
            const sameRank = amb.some((o) => (o.from >> 3) === (m.from >> 3));
            if (!sameFile) s += FILES[m.from & 7];
            else if (!sameRank) s += (m.from >> 3) + 1;
            else s += sqName(m.from);
          }
          if (m.captured) s += 'x';
          s += sqName(m.to);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }

    decorate(m, list) {
      return Object.assign({}, m, {
        fromSq: sqName(m.from),
        toSq: sqName(m.to),
        color: colorOf(m.piece),
        san: this.san(m, list),
        uci: sqName(m.from) + sqName(m.to) + (m.promotion || ''),
      });
    }

    /** Legal moves, decorated. opts.square limits to one origin square. */
    moves(opts) {
      opts = opts || {};
      const list = this.legal();
      let out = list;
      if (opts.square != null) {
        const s = typeof opts.square === 'string' ? sqIndex(opts.square) : opts.square;
        out = list.filter((m) => m.from === s);
      }
      return out.map((m) => this.decorate(m, list));
    }

    findMove(input, list) {
      list = list || this.legal();
      let from, to, pr;
      if (typeof input === 'string') {
        const str = input.trim();
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(str)) {
          from = sqIndex(str.slice(0, 2)); to = sqIndex(str.slice(2, 4)); pr = str[4] || null;
        } else {
          const clean = (x) => x.replace(/[+#!?]/g, '').replace(/0/g, 'O');
          return list.find((x) => clean(this.san(x, list)) === clean(str)) || null;
        }
      } else {
        from = typeof input.from === 'string' ? sqIndex(input.from) : input.from;
        to = typeof input.to === 'string' ? sqIndex(input.to) : input.to;
        pr = input.promotion || null;
      }
      return list.find((x) => x.from === from && x.to === to && (x.promotion || null) === (pr || (x.promotion ? 'q' : null))) || null;
    }

    /** Play a move given as UCI ('e2e4'), SAN ('Nf3') or {from,to,promotion}. */
    move(input) {
      const list = this.legal();
      const m = this.findMove(input, list);
      if (!m) return null;
      const dec = this.decorate(m, list);
      this.make(m);
      this.history.push(dec);
      this.repetition.push(this.key());
      return dec;
    }

    undo() {
      if (!this.history.length) return null;
      this.unmake();
      this.repetition.pop();
      return this.history.pop();
    }

    isCheckmate() { return this.inCheck() && this.legal().length === 0; }
    isStalemate() { return !this.inCheck() && this.legal().length === 0; }
    isInsufficientMaterial() {
      const pcs = [];
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (p && typeOf(p) !== 'k') pcs.push({ t: typeOf(p), sq: i });
      }
      if (pcs.length === 0) return true;
      if (pcs.length === 1 && (pcs[0].t === 'n' || pcs[0].t === 'b')) return true;
      if (pcs.every((x) => x.t === 'b')) {
        const colors = new Set(pcs.map((x) => ((x.sq & 7) + (x.sq >> 3)) % 2));
        return colors.size === 1;
      }
      return false;
    }
    isThreefold() {
      const k = this.repetition[this.repetition.length - 1];
      return this.repetition.filter((x) => x === k).length >= 3;
    }
    isFiftyMove() { return this.halfmove >= 100; }
    isDraw() { return this.isFiftyMove() || this.isStalemate() || this.isInsufficientMaterial() || this.isThreefold(); }
    isGameOver() { return this.legal().length === 0 || this.isDraw(); }

    /** Human readable result reason, or null if game continues. */
    result() {
      if (this.isCheckmate()) return { winner: this.turn === 'w' ? 'b' : 'w', reason: 'checkmate' };
      if (this.isStalemate()) return { winner: null, reason: 'stalemate' };
      if (this.isInsufficientMaterial()) return { winner: null, reason: 'insufficient material' };
      if (this.isThreefold()) return { winner: null, reason: 'threefold repetition' };
      if (this.isFiftyMove()) return { winner: null, reason: 'the 50-move rule' };
      return null;
    }
  }

  Chess.START_FEN = START_FEN;
  Chess.sqName = sqName;
  Chess.sqIndex = sqIndex;
  Chess.colorOf = colorOf;
  Chess.typeOf = typeOf;
  Chess.PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

  global.Chess = Chess;
})(typeof window !== 'undefined' ? window : globalThis);
