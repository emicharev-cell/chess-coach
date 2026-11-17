/*
 * lessons.js — the curriculum.
 * Step types:
 *   info     — explanation with a position, optional arrows/marks.
 *   click    — click the named square(s).
 *   stars    — move the lone piece to collect every star.
 *   move     — find the right move(s). `solution` alternates your move / opponent reply.
 *              Each entry can be a UCI string or an array of accepted alternatives.
 *              `mate: true` accepts any checkmating move.
 *   practice — play the position against the computer until `goal` ('mate' | 'promote').
 */
(function (global) {
  'use strict';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';

  const LESSONS = [
    // ---------------------------------------------------------------- Basics
    {
      id: 'board', chapter: 'The Basics', title: 'The Chessboard', icon: '♟',
      summary: 'Files, ranks and how to name every square.',
      steps: [
        { type: 'info', fen: EMPTY, marks: { e4: 'mark-blue' },
          text: 'Chess is played on a board of **64 squares** — 8 columns and 8 rows.\n\nThe columns are called **files** and are labelled **a** to **h**. The rows are called **ranks**, numbered **1** to **8**.\n\nEvery square has a name: file letter + rank number. The highlighted square is **e4**.' },
        { type: 'info', fen: START, marks: { h1: 'mark-green' },
          text: 'This is the starting position. White always moves first and starts on ranks 1–2; Black starts on ranks 7–8.\n\nRemember **"light on the right"**: the corner square at each player\'s bottom-right (h1 for White) is always a light square.' },
        { type: 'click', fen: EMPTY, targets: ['e4'], text: 'Your turn: click the square **e4**.' },
        { type: 'click', fen: EMPTY, targets: ['d5'], text: 'Now click **d5**.' },
        { type: 'click', fen: EMPTY, targets: ['a1'], text: 'Find **a1** — White\'s bottom-left corner.' },
        { type: 'click', fen: EMPTY, targets: ['h8'], text: 'And finally **h8**.' },
        { type: 'click', fen: EMPTY, targets: ['g3'], text: 'One more: **g3**. Read the file first (g), then count up the ranks (3).' },
      ],
    },
    {
      id: 'rook', chapter: 'The Basics', title: 'The Rook', icon: '♜',
      summary: 'Straight lines, as far as it likes.',
      steps: [
        { type: 'info', fen: '8/8/8/8/3R4/8/8/8 w - - 0 1', arrows: [['d4', 'd8'], ['d4', 'd1'], ['d4', 'a4'], ['d4', 'h4']],
          text: 'The **rook** moves any number of squares in a straight line — up, down, left or right along files and ranks.\n\nIt cannot jump over other pieces. A rook is worth about **5 pawns**.' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/R7 w - - 0 1', stars: ['a6', 'f6', 'f2'],
          text: 'Move the rook to collect all the stars ★.' },
        { type: 'stars', fen: '7R/8/8/8/8/8/8/8 w - - 0 1', stars: ['c8', 'c3', 'g3', 'g1'],
          text: 'Great! Collect these stars too — try to use as few moves as possible.' },
      ],
    },
    {
      id: 'bishop', chapter: 'The Basics', title: 'The Bishop', icon: '♝',
      summary: 'Diagonals only — and always the same colour.',
      steps: [
        { type: 'info', fen: '8/8/8/8/3B4/8/8/8 w - - 0 1', arrows: [['d4', 'h8'], ['d4', 'a7'], ['d4', 'a1'], ['d4', 'g1']],
          text: 'The **bishop** moves any number of squares **diagonally**.\n\nBecause it only moves diagonally, a bishop stays on the **same colour** for the whole game. Each side has a light-squared and a dark-squared bishop. Worth about **3 pawns**.' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', stars: ['e3', 'g5', 'd8'], text: 'Collect the stars with the bishop.' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/5B2 w - - 0 1', stars: ['b5', 'e8', 'h5'], text: 'Now with the light-squared bishop.' },
      ],
    },
    {
      id: 'queen', chapter: 'The Basics', title: 'The Queen', icon: '♛',
      summary: 'Rook + bishop combined: the most powerful piece.',
      steps: [
        { type: 'info', fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1',
          arrows: [['d4', 'd8'], ['d4', 'd1'], ['d4', 'a4'], ['d4', 'h4'], ['d4', 'h8'], ['d4', 'a7'], ['d4', 'a1'], ['d4', 'g1']],
          text: 'The **queen** combines the rook and the bishop: any number of squares in any straight line or diagonal.\n\nShe is the strongest piece, worth about **9 pawns** — so don\'t lose her cheaply!' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', stars: ['d5', 'h5', 'h1', 'a8'], text: 'Collect all the stars with the queen.' },
      ],
    },
    {
      id: 'king', chapter: 'The Basics', title: 'The King', icon: '♚',
      summary: 'One square at a time — and never into danger.',
      steps: [
        { type: 'info', fen: '8/8/8/8/3K4/8/8/8 w - - 0 1', marks: { c3: 'mark-green', c4: 'mark-green', c5: 'mark-green', d3: 'mark-green', d5: 'mark-green', e3: 'mark-green', e4: 'mark-green', e5: 'mark-green' },
          text: 'The **king** moves exactly **one square** in any direction.\n\nIt is the most important piece: if your king is attacked and cannot escape — **checkmate** — you lose the game. A king may never move to a square where it would be attacked.' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', stars: ['e2', 'f3', 'g4', 'g5'], text: 'Walk the king to every star.' },
      ],
    },
    {
      id: 'knight', chapter: 'The Basics', title: 'The Knight', icon: '♞',
      summary: 'The L-shaped jumper.',
      steps: [
        { type: 'info', fen: '8/8/8/8/3N4/8/8/8 w - - 0 1',
          marks: { b3: 'mark-green', b5: 'mark-green', c2: 'mark-green', c6: 'mark-green', e2: 'mark-green', e6: 'mark-green', f3: 'mark-green', f5: 'mark-green' },
          text: 'The **knight** moves in an **L-shape**: two squares in one direction, then one square to the side.\n\nIt is the only piece that can **jump over** other pieces. A knight always lands on a square of the opposite colour. Worth about **3 pawns**.' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', stars: ['c3', 'd5', 'f6', 'h7'], text: 'Hop the knight to every star.' },
        { type: 'stars', fen: '8/8/8/8/8/8/8/6N1 w - - 0 1', stars: ['e2', 'c3', 'b5', 'd6'], text: 'Knights take practice. Collect these stars too.' },
      ],
    },
    {
      id: 'pawn', chapter: 'The Basics', title: 'The Pawn', icon: '♙',
      summary: 'Small but brave: moving, capturing and promoting.',
      steps: [
        { type: 'info', fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', marks: { e3: 'mark-green', e4: 'mark-green' },
          text: 'The **pawn** moves **straight forward one square**. On its very first move it may advance **two squares**.\n\nPawns never move backwards. Each is worth **1 point** — but there are eight of them, and they shape the whole game.' },
        { type: 'stars', fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', stars: ['e4', 'e5', 'e6'], text: 'March the pawn to collect the stars. Use the two-square first move!' },
        { type: 'info', fen: '8/8/8/3n1b2/4P3/8/8/8 w - - 0 1', arrows: [['e4', 'd5', 'red'], ['e4', 'f5', 'red']],
          text: 'Pawns **capture diagonally** — one square forward to the left or right. They cannot capture straight ahead.' },
        { type: 'move', fen: '4k3/8/8/3n1p2/4P3/8/8/4K3 w - - 0 1', solution: ['e4d5'],
          text: 'Your pawn can capture two pieces. Capture the more valuable one!', success: 'Right — a knight (3) is worth more than a pawn (1).',
          wrong: 'That isn\'t the best capture — compare what each piece is worth.' },
        { type: 'move', fen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1', solution: ['e7e8'],
          text: 'When a pawn reaches the far side it **promotes** — it becomes a queen, rook, bishop or knight. Almost always you pick a queen.\n\nPush the pawn and promote it!', success: 'A brand new queen!' },
      ],
    },
    // ----------------------------------------------------------------- Rules
    {
      id: 'special', chapter: 'Rules of the Game', title: 'Special Moves', icon: '♖',
      summary: 'Castling and en passant.',
      steps: [
        { type: 'info', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', arrows: [['e1', 'g1'], ['h1', 'f1', 'blue'], ['e1', 'c1'], ['a1', 'd1', 'blue']],
          text: '**Castling** moves the king two squares toward a rook, and the rook jumps to the other side of the king. It tucks the king into safety and activates the rook.\n\nYou may castle only if:\n• neither the king nor that rook has moved yet\n• there are no pieces between them\n• the king is not in check, and does not pass through or land on an attacked square.' },
        { type: 'move', fen: 'rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 0 1', solution: ['e1g1'],
          text: 'Castle **kingside** (short castling): move your king two squares to the right.', success: 'Castled! Your king is safe and the rook joins the game.' },
        { type: 'move', fen: 'rnbqkbnr/pppppppp/8/8/3P4/2N1B3/PPPQPPPP/R3KBNR w KQkq - 0 1', solution: ['e1c1'],
          text: 'Now castle **queenside** (long castling): the king moves two squares to the left.', success: 'Perfect. Queenside castling is called "O-O-O".' },
        { type: 'info', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', arrows: [['e5', 'd6']], marks: { d5: 'mark-red' },
          text: '**En passant** ("in passing"): if an enemy pawn advances two squares and lands right beside your pawn, you may capture it as if it had moved only one square.\n\nYou must do it **immediately** on your next move, or the chance is gone.' },
        { type: 'move', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', solution: ['e5d6'],
          text: 'Black has just played d7–d5. Capture **en passant** with your e5 pawn!', success: 'The d5 pawn disappears — that\'s en passant.' },
      ],
    },
    {
      id: 'check', chapter: 'Rules of the Game', title: 'Check & Checkmate', icon: '♔',
      summary: 'How games are won — and drawn.',
      steps: [
        { type: 'info', fen: '4k3/8/8/8/8/8/8/r3K3 w - - 0 1', arrows: [['a1', 'e1', 'red']],
          text: 'When a king is attacked, it is in **check**. You **must** get out of check immediately, in one of three ways:\n\n1. **Capture** the attacking piece\n2. **Block** the attack with another piece\n3. **Move** the king to a safe square' },
        { type: 'move', fen: '4k3/8/8/8/8/1N6/8/r3K3 w - - 0 1', solution: ['b3a1'],
          text: 'Your king is in check from the rook. Get out of check by **capturing** the attacker!', success: 'The best defence is capturing the attacker — and you won a rook!',
          wrong: 'That gets you out of check, but you can do better — capture the rook!' },
        { type: 'move', fen: '4r1k1/8/8/8/8/8/3P1P2/3QKB2 w - - 0 1', solution: ['f1e2'], wrong: 'Block with the bishop — blocking with the queen just loses her to Rxe2.',
          text: 'Check down the e-file! Your king is boxed in by its own pieces. **Block** the check with your bishop.', success: 'Blocked! The bishop shields the king.' },
        { type: 'move', fen: '4k3/8/8/8/8/8/8/r3K3 w - - 0 1', solution: [['e1d2', 'e1e2', 'e1f2']],
          text: 'No capture, no block. **Move your king** out of the line of fire.', success: 'Safe! Off the first rank and out of check.' },
        { type: 'info', fen: '3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', arrows: [['d8', 'g8', 'red']],
          text: '**Checkmate** — the king is in check and there is **no way out**. This is how a game is won.\n\nHere Black\'s king is trapped behind its own pawns: a classic **back-rank mate**.' },
        { type: 'move', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solution: ['a1a8'], mate: true,
          text: 'Deliver **checkmate in one move**.', success: 'Checkmate! Back-rank mates win countless games.' },
        { type: 'info', fen: 'k7/8/1Q6/8/8/8/8/7K b - - 0 1', marks: { a8: 'mark-blue' },
          text: '**Stalemate**: the side to move has **no legal moves** but is **not** in check. The game is a **draw**!\n\nHere Black\'s king is not attacked, but every square around it is. Be careful not to stalemate your opponent when you are winning.' },
        { type: 'info', fen: START,
          text: 'Other ways a game ends in a **draw**:\n\n• **Agreement** between the players\n• **Threefold repetition** — the same position occurs three times\n• **50-move rule** — 50 moves each with no capture or pawn move\n• **Insufficient material** — e.g. king vs king, or king + bishop vs king' },
      ],
    },
    {
      id: 'values', chapter: 'Rules of the Game', title: 'Piece Values & Trades', icon: '⚖',
      summary: 'Count material and make good trades.',
      steps: [
        { type: 'info', fen: '8/8/8/8/8/8/8/8 w - - 0 1',
          text: 'Pieces have approximate values, measured in pawns:\n\n♟ Pawn = **1**\n♞ Knight = **3**\n♝ Bishop = **3**\n♜ Rook = **5**\n♛ Queen = **9**\n♚ King = priceless\n\nUse them to judge trades. Giving a knight (3) for a rook (5) — "winning the exchange" — is good. Giving a queen for a bishop is usually terrible.' },
        { type: 'move', fen: '4k3/8/8/1r3p2/3N4/8/8/4K3 w - - 0 1', solution: ['d4b5'],
          text: 'Your knight can capture a pawn or a rook. Which is better?', success: 'Correct — always look for the most valuable capture (when it\'s safe).' },
        { type: 'info', fen: '4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1', arrows: [['f3', 'e5', 'red'], ['d6', 'e5', 'blue']],
          text: 'But watch out! Before capturing, check whether the piece is **defended**.\n\nHere Nxe5 grabs a pawn, but Black recaptures with the d6 pawn — you\'d lose a knight (3) for a pawn (1).' },
        { type: 'move', fen: '4k3/8/3p4/4p3/7n/5N2/8/4K3 w - - 0 1', solution: ['f3h4'], wrong: 'Is that piece defended? Look for the free one.',
          text: 'One black piece is **undefended** (hanging). Capture the free piece, not the defended pawn.', success: 'A free knight! Always ask: "Is it defended?"' },
      ],
    },
    // -------------------------------------------------------------- Strategy
    {
      id: 'opening', chapter: 'Strategy', title: 'Opening Principles', icon: '🏁',
      summary: 'Centre, development, king safety.',
      steps: [
        { type: 'info', fen: START, marks: { d4: 'mark-green', e4: 'mark-green', d5: 'mark-green', e5: 'mark-green' },
          text: 'Good openings follow a few simple principles:\n\n1. **Control the centre** (the green squares).\n2. **Develop** your knights and bishops quickly.\n3. **Castle** early to keep your king safe.\n4. Don\'t move the same piece twice, and don\'t bring the queen out too early.' },
        { type: 'move', fen: START, solution: [['e2e4', 'd2d4']],
          text: 'Start by claiming the centre with a pawn. Push your **king\'s pawn** or **queen\'s pawn** two squares.', success: 'A central pawn opens lines for your queen and bishop.' },
        { type: 'move', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', solution: ['g1f3'],
          text: 'After 1.e4 e5, develop a **knight** toward the centre — ideally with a threat. Which knight move attacks Black\'s e5 pawn?', success: 'Nf3 develops and attacks e5. Knights belong near the centre: "a knight on the rim is dim".' },
        { type: 'move', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', solution: [['f1c4', 'f1b5']],
          text: 'Black defended with Nc6. Now develop your **light-squared bishop** to an active square.', success: 'Both Bc4 (Italian Game) and Bb5 (Ruy López) are top-level choices.' },
        { type: 'move', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', solution: ['e1g1'],
          text: 'Knight and bishop are out, and the path is clear. Complete step 3: **get your king safe**.', success: 'Castled by move 4 — textbook!' },
        { type: 'info', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w kq - 1 6',
          text: 'Look at White: centre pawns, two pieces developed, king castled. Next White would develop the queenside (Nc3 or Nbd2, Be3 or Bg5) and connect the rooks.\n\nAfter about 10 moves, ask yourself: **are all my pieces out, and is my king safe?**' },
      ],
    },
    {
      id: 'thinking', chapter: 'Strategy', title: 'How to Think', icon: '🧠',
      summary: 'A checklist for every move.',
      steps: [
        { type: 'info', fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', arrows: [['h5', 'f7', 'red'], ['c4', 'f7', 'red']],
          text: 'Before every move, ask **"What does my opponent want?"**\n\nHere White threatens **Qxf7#** — checkmate! The f7 square is attacked by the queen *and* the bishop, and defended only by the king. Black must defend (for example with ...g6 or ...Qe7).' },
        { type: 'move', fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', solution: [['g7g6', 'd8e7', 'd8f6', 'g8h6']],
          text: 'Now you are Black, in the same position. Stop the mate threat on f7!', success: 'Threat parried. Always check your opponent\'s threats first.',
          wrong: 'Does that stop Qxf7#? Defend f7 or block the queen.' },
        { type: 'info', fen: START,
          text: 'Then look for your own chances using **CCT** — in this order:\n\n**C**hecks — can I give a check?\n**C**aptures — can I win material?\n**T**hreats — can I attack something?\n\nFinally, a **blunder check**: after my move, is any of my pieces left undefended?' },
      ],
    },
    // --------------------------------------------------------------- Tactics
    {
      id: 'fork', chapter: 'Tactics', title: 'The Fork', icon: '🍴',
      summary: 'Attack two things at once.',
      steps: [
        { type: 'info', fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', arrows: [['c7', 'e8', 'red'], ['c7', 'a8', 'red']],
          text: 'A **fork** is a single piece attacking **two or more** enemy pieces at once. The opponent can only save one!\n\nKnights are fork specialists: here the knight checks the king and attacks the rook at the same time.' },
        { type: 'move', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', solution: ['b5c7', 'e8d7', 'c7a8'],
          text: 'Find the knight fork, then collect your prize.', success: 'Fork, then capture. You won a whole rook!' },
        { type: 'move', fen: '4k3/8/3n1n2/8/4P3/8/8/2B1K3 w - - 0 1', solution: ['e4e5', 'd6f5', 'e5f6'],
          text: 'Even a humble **pawn** can fork. Attack both knights at once!', success: 'Pawn forks are deadly: the pawn is worth far less than either knight.' },
        { type: 'move', fen: '6k1/6pp/8/r7/8/8/5PPP/3Q2K1 w - - 0 1', solution: ['d1d8', 'g8f7', 'd8a5'],
          text: 'A **queen fork**: give check and attack the loose rook at the same time.', success: 'Check + attack = fork. The rook falls.' },
      ],
    },
    {
      id: 'pin', chapter: 'Tactics', title: 'Pins & Skewers', icon: '📌',
      summary: 'Attacks through a piece along a line.',
      steps: [
        { type: 'info', fen: '4k3/1p6/2n5/1B6/8/8/8/4K3 b - - 0 1', arrows: [['b5', 'e8', 'red']],
          text: 'A **pin**: a piece cannot (or should not) move because a more valuable piece stands behind it.\n\nThe knight on c6 is **pinned** to the king — moving it would expose the king to check, which is illegal.' },
        { type: 'move', fen: '4k3/1p6/2n5/1B6/3P4/8/8/4K3 w - - 0 1', solution: ['d4d5', 'e8d7', 'd5c6'],
          text: 'The knight is pinned and can\'t run away. **Attack it** with a pawn!', success: 'Pile up on a pinned piece — it can\'t escape.' },
        { type: 'info', fen: '3q4/8/8/3k4/8/8/8/3R2K1 b - - 0 1', arrows: [['d1', 'd5', 'red'], ['d5', 'd8', 'orange']],
          text: 'A **skewer** is a pin in reverse: the **more valuable** piece is in front. When it moves out of the attack, the piece behind it is captured.' },
        { type: 'move', fen: '3q4/8/8/3k4/8/8/8/R5K1 w - - 0 1', solution: ['a1d1', 'd5e4', 'd1d8'],
          text: 'King and queen on the same file... **Skewer** them!', success: 'The king had to step aside and the queen was lost.' },
      ],
    },
    {
      id: 'discovered', chapter: 'Tactics', title: 'Discovered Attacks', icon: '💥',
      summary: 'Move one piece, unleash another.',
      steps: [
        { type: 'info', fen: '4q1k1/8/8/8/4N3/8/8/4R1K1 w - - 0 1', arrows: [['e1', 'e8', 'orange']],
          text: 'A **discovered attack** happens when one piece moves out of the way and reveals an attack by the piece behind it.\n\nThe rook on e1 is aiming at the queen on e8 — only the knight is in the way. If the knight moves **with a threat of its own**, Black faces two problems at once.' },
        { type: 'move', fen: '4q1k1/8/8/8/4N3/8/8/4R1K1 w - - 0 1', solution: ['e4f6', 'g8g7', 'e1e8'],
          text: 'Move the knight **with check**, uncovering the rook\'s attack on the queen.', success: 'Discovered attack! Black had to answer the check and lost the queen.' },
      ],
    },
    // ------------------------------------------------------------ Checkmates
    {
      id: 'mates', chapter: 'Checkmate Patterns', title: 'Basic Checkmates', icon: '👑',
      summary: 'Back rank, ladder and queen mates.',
      steps: [
        { type: 'move', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solution: ['d1d8'], mate: true,
          text: '**Back-rank mate**: a king trapped behind its own pawns can be mated on the back rank. Find it!', success: 'Checkmate. Tip: in your own games, a little "luft" (like h3) prevents this.' },
        { type: 'info', fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', arrows: [['a7', 'h7', 'blue']],
          text: 'The **ladder** (or "lawnmower") mate: two rooks take turns. One rook cuts off a rank, the other gives check on the next rank — the king is pushed to the edge and mated.' },
        { type: 'move', fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', solution: ['b1b8'], mate: true,
          text: 'The rook on a7 cuts the king off. Finish the ladder!', success: 'Ladder mate!' },
        { type: 'move', fen: 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1', solution: ['h2h8'], mate: true,
          text: '**Queen + king**: the king covers escape squares while the queen gives the final check. Mate in one!', success: 'The king supports, the queen delivers.' },
        { type: 'move', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: ['g5f7'], mate: true,
          text: '**Smothered mate**: the king is surrounded by its own pieces. A knight finishes the job.', success: 'Smothered! Only a knight can do that.' },
        { type: 'practice', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', goal: 'mate',
          text: '**Practice:** checkmate the computer with **king and queen**.\n\nMethod: use the queen to box the king in (stay a knight\'s move away from it), shrink the box, then bring your king up to help. **Beware of stalemate!**' },
      ],
    },
    // -------------------------------------------------------------- Endgames
    {
      id: 'endgame', chapter: 'Endgames', title: 'King & Pawn Endgames', icon: '🏆',
      summary: 'Opposition and promoting the pawn.',
      steps: [
        { type: 'info', fen: '8/8/4k3/8/4K3/8/4P3/8 b - - 0 1', marks: { e4: 'mark-blue', e6: 'mark-blue' },
          text: 'In the endgame the **king becomes a fighter** — march it toward the action!\n\n**The opposition**: when the kings stand face to face with one square between them, the side that **does not** have to move "has the opposition" — the other king must give way.' },
        { type: 'move', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', solution: ['e3e4'],
          text: 'Take the **opposition**: move your king straight in front of Black\'s king, with exactly one square between them.', success: 'Now Black must step aside and your king advances.' },
        { type: 'info', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', marks: { e6: 'mark-green' },
          text: 'Key rule: a king on the **6th rank in front of its pawn** wins (except with a rook pawn), no matter who is to move.\n\nUse the opposition and your king to escort the pawn to promotion.' },
        { type: 'practice', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', goal: 'promote',
          text: '**Practice:** promote the pawn against the computer — without allowing stalemate or losing the pawn.\n\nHint: if your pawn can\'t advance safely, use your king to take the opposition.' },
      ],
    },
  ];

  global.LESSONS = LESSONS;
})(window);
