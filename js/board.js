/*
 * board.js — interactive chessboard view (click-to-move and drag & drop),
 * legal-move dots, last-move / check highlights, arrows, promotion picker, move animation.
 */
(function (global) {
  'use strict';
  const { sqName, sqIndex, colorOf, typeOf } = global.Chess;
  // Pieces: the standard "cburnett" set used by Lichess (img/pieces, CC BY-SA 3.0, Colin M.L. Burnett).
  const pieceHtml = (color, type, extra) =>
    `<div class="piece ${color}${type.toUpperCase()}${extra ? ' ' + extra : ''}"></div>`;

  class BoardView {
    /**
     * opts.onMove({from,to,promotion}) — called for a user move attempt (legal per chess.moves).
     * opts.onSquareClick(sq)           — called for clicks when in 'click' mode.
     */
    constructor(container, opts) {
      this.opts = opts || {};
      this.orientation = 'w';
      this.chess = null;
      this.movable = null; // 'w' | 'b' | 'both' | null
      this.clickMode = false;
      this.selected = null;
      this.lastMove = null;
      this.arrows = [];
      this.marks = {}; // sq -> class
      this.stars = new Set();
      this.showCoords = true;

      this.wrap = document.createElement('div');
      this.wrap.className = 'board-wrap';
      this.el = document.createElement('div');
      this.el.className = 'board';
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'arrows');
      this.svg.setAttribute('viewBox', '0 0 100 100');
      this.promo = document.createElement('div');
      this.promo.className = 'promo hidden';
      this.wrap.append(this.el, this.svg, this.promo);
      container.appendChild(this.wrap);

      this.el.addEventListener('pointerdown', (e) => this.onDown(e));
      this.el.addEventListener('pointermove', (e) => this.onMoveDrag(e));
      this.el.addEventListener('pointerup', (e) => this.onUp(e));
      this.el.addEventListener('pointercancel', () => this.cancelDrag());
      this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    set(state) {
      Object.assign(this, state);
      this.render();
    }

    squareAt(e) {
      const r = this.el.getBoundingClientRect();
      const col = Math.floor(((e.clientX - r.left) / r.width) * 8);
      const row = Math.floor(((e.clientY - r.top) / r.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      const file = this.orientation === 'w' ? col : 7 - col;
      const rank = this.orientation === 'w' ? 7 - row : row;
      return rank * 8 + file;
    }

    canMovePiece(sq) {
      if (!this.chess || !this.movable) return false;
      const p = this.chess.board[sq];
      if (!p) return false;
      const c = colorOf(p);
      if (c !== this.chess.turn) return false;
      return this.movable === 'both' || this.movable === c;
    }

    legalTargets(from) {
      if (!this.chess) return [];
      return this.chess.legal().filter((m) => m.from === from);
    }

    onDown(e) {
      if (e.button && e.button !== 0) return;
      if (!this.promo.classList.contains('hidden')) return;
      const sq = this.squareAt(e);
      if (sq == null) return;
      if (this.clickMode) { if (this.opts.onSquareClick) this.opts.onSquareClick(sqName(sq)); return; }
      // Second click on a target square completes a click-move.
      if (this.selected != null && this.selected !== sq && this.legalTargets(this.selected).some((m) => m.to === sq)) {
        this.attempt(this.selected, sq);
        return;
      }
      if (this.canMovePiece(sq)) {
        e.preventDefault();
        this.selected = sq;
        this.render();
        this.drag = { from: sq, x: e.clientX, y: e.clientY, started: false, pointerId: e.pointerId };
        try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      } else {
        this.selected = null;
        this.render();
      }
    }

    onMoveDrag(e) {
      const d = this.drag;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        d.started = true;
        const pieceEl = this.el.querySelector(`[data-sq="${d.from}"] .piece`);
        if (pieceEl) pieceEl.classList.add('dragging-src');
        const ghost = document.createElement('div');
        const p = this.chess.board[d.from];
        ghost.className = 'piece ghost ' + colorOf(p) + typeOf(p).toUpperCase();
        const size = this.el.getBoundingClientRect().width / 8;
        ghost.style.width = ghost.style.height = size + 'px';
        document.body.appendChild(ghost);
        d.ghost = ghost;
        d.size = size;
      }
      d.ghost.style.left = e.clientX - d.size / 2 + 'px';
      d.ghost.style.top = e.clientY - d.size / 2 + 'px';
      const sq = this.squareAt(e);
      this.el.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
      if (sq != null) {
        const t = this.el.querySelector(`[data-sq="${sq}"]`);
        if (t) t.classList.add('drag-over');
      }
    }

    onUp(e) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      try { this.el.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (d.ghost) d.ghost.remove();
      const sq = this.squareAt(e);
      if (d.started) {
        if (sq != null && sq !== d.from && this.legalTargets(d.from).some((m) => m.to === sq)) {
          this.attempt(d.from, sq);
        } else {
          this.render();
        }
      }
    }

    cancelDrag() {
      if (this.drag && this.drag.ghost) this.drag.ghost.remove();
      this.drag = null;
      this.render();
    }

    attempt(from, to) {
      const ms = this.legalTargets(from).filter((m) => m.to === to);
      if (!ms.length) return;
      if (ms.some((m) => m.promotion)) {
        this.askPromotion(from, to, colorOf(this.chess.board[from]));
        return;
      }
      this.selected = null;
      if (this.opts.onMove) this.opts.onMove({ from: sqName(from), to: sqName(to) });
    }

    askPromotion(from, to, color) {
      this.promo.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'promo-title';
      title.textContent = t('Promote to:');
      this.promo.appendChild(title);
      const row = document.createElement('div');
      row.className = 'promo-row';
      for (const t of ['q', 'r', 'b', 'n']) {
        const btn = document.createElement('button');
        btn.className = 'promo-btn';
        btn.innerHTML = pieceHtml(color, t);
        btn.title = I18N.piece(t);
        btn.addEventListener('click', () => {
          this.promo.classList.add('hidden');
          this.selected = null;
          if (this.opts.onMove) this.opts.onMove({ from: sqName(from), to: sqName(to), promotion: t });
        });
        row.appendChild(btn);
      }
      const cancel = document.createElement('button');
      cancel.className = 'btn ghost small';
      cancel.textContent = t('Cancel');
      cancel.addEventListener('click', () => { this.promo.classList.add('hidden'); this.selected = null; this.render(); });
      this.promo.append(row, cancel);
      this.promo.classList.remove('hidden');
    }

    flash(sq, cls) {
      const i = typeof sq === 'string' ? sqIndex(sq) : sq;
      const el = this.el.querySelector(`[data-sq="${i}"]`);
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth; // restart animation
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 700);
    }

    render() {
      const ch = this.chess;
      const targets = new Map();
      if (this.selected != null && ch) for (const m of this.legalTargets(this.selected)) targets.set(m.to, !!m.captured);
      const checkSq = ch && ch.inCheck() ? ch.kings[ch.turn] : -1;
      const last = this.lastMove ? [sqIndex(this.lastMove[0]), sqIndex(this.lastMove[1])] : [];
      let html = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const file = this.orientation === 'w' ? col : 7 - col;
          const rank = this.orientation === 'w' ? 7 - row : row;
          const sq = rank * 8 + file;
          const name = sqName(sq);
          const light = (file + rank) % 2 === 1;
          const cls = ['sq', light ? 'light' : 'dark'];
          if (last.includes(sq)) cls.push('last');
          if (sq === this.selected) cls.push('selected');
          if (sq === checkSq) cls.push('check');
          if (this.marks[name]) cls.push(this.marks[name]);
          if (this.canMovePiece(sq) && !this.clickMode) cls.push('movable');
          let inner = '';
          const p = ch ? ch.board[sq] : null;
          if (p) inner += pieceHtml(colorOf(p), typeOf(p));
          if (this.stars.has(name)) inner += '<div class="star">★</div>';
          if (targets.has(sq)) inner += targets.get(sq) || p ? '<div class="cap-ring"></div>' : '<div class="dot"></div>';
          if (this.showCoords) {
            if (row === 7) inner += `<span class="coord file">${'abcdefgh'[file]}</span>`;
            if (col === 0) inner += `<span class="coord rank">${rank + 1}</span>`;
          }
          html += `<div class="${cls.join(' ')}" data-sq="${sq}">${inner}</div>`;
        }
      }
      this.el.innerHTML = html;
      this.drawArrows();
      if (this.animate) { this.slide(this.animate); this.animate = null; }
    }

    /** Slide the piece now on `to` from the `from` square (call via set({animate:[from,to]})). */
    slide([from, to]) {
      const a = this.center(from), b = this.center(to);
      const pc = this.el.querySelector(`[data-sq="${sqIndex(to)}"] .piece`);
      if (!pc) return;
      const size = this.el.getBoundingClientRect().width / 100;
      pc.style.transition = 'none';
      pc.style.transform = `translate(${(a[0] - b[0]) * size}px, ${(a[1] - b[1]) * size}px)`;
      pc.style.zIndex = 5;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        pc.style.transition = 'transform 160ms ease-out';
        pc.style.transform = '';
      }));
    }

    center(name) {
      const s = sqIndex(name);
      const file = s & 7, rank = s >> 3;
      const col = this.orientation === 'w' ? file : 7 - file;
      const row = this.orientation === 'w' ? 7 - rank : rank;
      return [col * 12.5 + 6.25, row * 12.5 + 6.25];
    }

    drawArrows() {
      const colors = { green: '#15781B', blue: '#2b6fd6', red: '#c8372d', orange: '#e08a14', yellow: '#d4a600' };
      let defs = '<defs>';
      for (const [k, c] of Object.entries(colors)) {
        defs += `<marker id="ah-${k}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="${c}"/></marker>`;
      }
      defs += '</defs>';
      let body = '';
      for (const a of this.arrows) {
        const [from, to, color = 'green'] = a;
        const [x1, y1] = this.center(from);
        const [x2, y2] = this.center(to);
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        const ex = x2 - (dx / len) * 4.2, ey = y2 - (dy / len) * 4.2;
        body += `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${colors[color] || color}" stroke-width="2.3" stroke-linecap="round" opacity="0.82" marker-end="url(#ah-${color})"/>`;
      }
      this.svg.innerHTML = defs + body;
    }
  }

  BoardView.pieceHtml = pieceHtml;
  global.BoardView = BoardView;
})(window);
