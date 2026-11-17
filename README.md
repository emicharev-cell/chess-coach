# ♞ Chess Coach

An app that teaches you chess from zero: interactive lessons, puzzles that adapt to your level, and a computer opponent with a built-in coach that explains your mistakes while you play.

**Play it:** https://emicharev-cell.github.io/chess-coach/

No install, no build step, no dependencies. It's plain HTML, CSS and JavaScript, so you can also just open `index.html` in a browser.

## Features

### 📘 Learn: 17 interactive lessons
| Chapter | Lessons |
|---|---|
| The Basics | The chessboard, rook, bishop, queen, king, knight, pawn |
| Rules of the Game | Castling & en passant, check / checkmate / stalemate, piece values & safe captures |
| Strategy | Opening principles, how to think (threats + Checks-Captures-Threats) |
| Tactics | Forks, pins & skewers, discovered attacks |
| Checkmate Patterns | Back rank, ladder, queen + king, smothered mate, plus practice mating the computer |
| Endgames | Opposition, king & pawn, plus practice promoting against the computer |

Lessons mix explanations, "click the square" drills, star-collecting exercises for each piece, find-the-move challenges and live practice positions against the engine.

### 🧩 Puzzles
19 hand-checked tactics (mates in 1 and 2, forks, pins, skewers, discovered attacks, a pawn breakthrough, and Morphy's Opera Game). You get an Elo-style puzzle rating and a streak, and the next puzzle is picked to match your rating. If you find a different winning move, the engine checks it and accepts it.

### 🤖 Play vs the coach
- Four strengths: Beginner (≈400), Casual (≈800), Club (≈1200), Advanced (≈1600)
- **Coach mode** rates every move (Best / Good / Inaccuracy / Mistake / Blunder) and explains *why*, e.g. "Your opponent can answer Nxa6, winning your bishop. Better was Nc3."
- **Threat alerts** warn you when one of your pieces is hanging or mate is threatened
- Opening names, evaluation bar, hints, undo, captured material, and an end-of-game summary

Progress (lessons, puzzle rating, game record) is saved in your browser's `localStorage`.

## Under the hood

| File | What it does |
|---|---|
| `js/chess.js` | Full rules engine: legal move generation (castling, en passant, promotion), SAN, FEN, mate/stalemate/draw detection. Verified with standard perft node counts. |
| `js/engine.js` | Alpha-beta search with iterative deepening, quiescence search, check extensions, killer moves, a tapered piece-square evaluation with pawn structure and mop-up, a small opening book and opening names. |
| `js/board.js` | Interactive board: drag & drop or click-to-move, legal-move hints, arrows, highlights, promotion picker, original SVG piece set. |
| `js/lessons.js` | The curriculum (data). |
| `js/puzzles.js` | The puzzle set (data). |
| `js/app.js` | Pages, routing, coaching logic, progress tracking. |

## Run locally

```bash
python -m http.server 8000
```
Then open http://localhost:8000, or just double-click `index.html`.
