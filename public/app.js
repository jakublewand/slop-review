import { Chess } from './vendor/chess.js';

const $ = (selector) => document.querySelector(selector);

const demoPgn = `[Event "Demo Review"]
[Site "Local"]
[Date "2026.06.11"]
[Round "-"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5
7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5
13. Nc3 b4 14. Nb1 Bb7 15. Nbd2 exd4 16. Nxd4 Re8 17. Nf5 Bf8
18. Nc4 d5 19. Ncd6 Bxd6 20. Nxd6 Qc7 21. Nxe8 Rxe8 22. exd5 1-0`;

const state = {
  review: null,
  games: [],
  currentPly: 0,
  orientation: 'white',
  selectedSquare: null,
  coachIndex: 0,
  coachMode: 'move',
  reviewStarted: false,
  showBest: false,
  showSetup: true,
  retry: null,
  variation: null,
  evalResult: null,
  variationEvalPending: false,
  animation: null,
  drawings: {},
  pendingDraw: null,
  drag: null,
  suppressNextBoardClick: false,
  audioContext: null,
  isReviewing: false,
  annotations: JSON.parse(localStorage.getItem('local-review-annotations') || '{}'),
};

init();

async function init() {
  bindEvents();
  $('#pgnInput')?.remove();
  await loadDefaultEngine();
  render();
  setStatus('Ready');
}

function bindEvents() {
  $('#runReviewBtn').addEventListener('click', handleReviewAction);
  $('#bestMoveBtn').addEventListener('click', showBestMove);
  $('#explainBtn').addEventListener('click', explainCurrentMove);
  $('#newGameBtn').addEventListener('click', () => {
    if (state.reviewStarted) {
      state.reviewStarted = false;
      state.showSetup = false;
    } else {
      state.showSetup = !state.showSetup;
    }
    state.coachMode = 'move';
    state.retry = null;
    state.variation = null;
    render();
  });
  $('#goStartBtn').addEventListener('click', goToStart);
  $('#prevMoveBtn').addEventListener('click', goToPrevious);
  $('#nextMoveBtn').addEventListener('click', goToNext);
  $('#goEndBtn').addEventListener('click', goToEnd);
  $('#flipBoardBtn').addEventListener('click', () => {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    renderBoard();
  });
  const board = $('#board');
  board.addEventListener('click', onBoardClick);
  board.addEventListener('contextmenu', (event) => event.preventDefault());
  board.addEventListener('pointerdown', onBoardPointerDown);
  board.addEventListener('pointermove', onBoardPointerMove);
  board.addEventListener('pointerup', onBoardPointerUp);
  board.addEventListener('pointercancel', cancelPieceDrag);
  $('#evalGraph').addEventListener('click', onGraphClick);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', drawGraph);
}

async function loadDefaultEngine() {
  try {
    const response = await fetch('/api/default-engine');
    const data = await response.json();
    if (!data.exists) setStatus('Bundled Stockfish engine was not found');
  } catch {
    setStatus('Could not read bundled engine status');
  }
}

async function loadGamesFromPgn() {
  const pgn = getPgnText();
  if (!pgn.trim()) {
    setStatus('Paste or upload a PGN first');
    return;
  }
  const response = await postJson('/api/games', { pgn });
  state.games = response.games || [];
  renderImportTab();
  setStatus(`${state.games.length} game${state.games.length === 1 ? '' : 's'} loaded`);
}

async function runReview() {
  const pgn = getPgnText();
  if (!pgn.trim()) {
    setStatus('Paste or upload a PGN first');
    state.showSetup = true;
    render();
    return;
  }

  const button = $('#runReviewBtn');
  state.isReviewing = true;
  renderReviewActionButton();
  renderIcons();
  button.disabled = true;
  setStatus('Reviewing with Stockfish...');
  try {
    const review = await postJson('/api/review', {
      pgn,
      gameIndex: Number($('#gameSelect')?.value || 0),
      config: getEngineConfig(),
    });
    state.review = review;
    state.currentPly = review.keyMoments?.[0]?.ply || 0;
    state.coachIndex = 0;
    state.coachMode = 'move';
    state.reviewStarted = false;
    state.showBest = false;
    state.showSetup = false;
    state.retry = null;
    state.variation = null;
    state.evalResult = null;
    state.drawings = {};
    state.animation = null;
    render();
    setStatus('Review complete');
  } catch (error) {
    setStatus(error.message);
  } finally {
    state.isReviewing = false;
    renderReviewActionButton();
    renderIcons();
  }
}

function handleReviewAction() {
  if (!state.review || state.showSetup) {
    runReview();
    return;
  }

  if (!state.reviewStarted) {
    startCoachReview();
    return;
  }

  const nextIndex = nextKeyMomentIndex();
  if (nextIndex >= 0) setCoachIndex(nextIndex);
}

function startCoachReview() {
  state.reviewStarted = true;
  state.coachMode = 'move';
  state.retry = null;
  state.variation = null;
  state.evalResult = null;
  const firstMoment = state.review?.keyMoments?.[0];
  if (firstMoment) {
    state.coachIndex = 0;
    state.currentPly = firstMoment.ply;
  }
  render();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Request failed');
  return data;
}

function getEngineConfig() {
  return {
    timeMs: Number($('#timeMs').value),
    multiPv: Number($('#multiPv').value),
    threads: Number($('#threads').value),
    hashMb: Number($('#hashMb').value),
  };
}

function getPgnText() {
  return $('#pgnInput')?.value || localStorage.getItem('local-review-pgn') || '';
}

function render() {
  const hasReview = state.review && !state.showSetup;
  document.body.dataset.reviewed = hasReview ? 'true' : 'false';
  document.body.dataset.reviewPhase = !hasReview ? 'setup' : state.reviewStarted ? 'coach' : 'summary';
  document.body.dataset.lineMode = state.variation ? 'variation' : 'main';
  renderHeader();
  renderBoard();
  renderTransport();
  renderCoachActions();
  renderReviewActionButton();
  renderScoreCards();
  renderReviewPanel();
  renderMoveList();
  drawGraph();
  renderIcons();
}

function renderHeader() {
  const subtitle = $('#gameSubtitle');
  $('#whiteName').textContent = state.review?.game.white || 'White';
  $('#blackName').textContent = state.review?.game.black || 'Black';
  $('#whiteScore').textContent = state.review ? `Precision ${state.review.players.white.precision}` : 'Precision -';
  $('#blackScore').textContent = state.review ? `Precision ${state.review.players.black.precision}` : 'Precision -';
  if (!state.review) {
    if (subtitle) subtitle.textContent = 'Load a PGN and review it locally.';
    return;
  }
  const game = state.review.game;
  if (subtitle) subtitle.textContent = `${game.white} vs ${game.black} ${game.result} ${game.date || ''}`.trim();
}

function renderTransport() {
  const current = state.variation ? state.variation.currentIndex : state.currentPly;
  const max = state.variation ? state.variation.moves.length : maxPly();
  $('#goStartBtn').disabled = !state.review || current === 0;
  $('#prevMoveBtn').disabled = !state.review || current === 0;
  $('#nextMoveBtn').disabled = !state.review || current >= max;
  $('#goEndBtn').disabled = !state.review || current >= max;
}

function goToStart() {
  if (state.variation) {
    setVariationIndex(0);
    return;
  }
  setPly(0);
}

function goToPrevious() {
  if (state.variation) {
    setVariationIndex(Math.max(0, state.variation.currentIndex - 1));
    return;
  }
  setPly(Math.max(0, state.currentPly - 1));
}

function goToNext() {
  if (state.variation) {
    setVariationIndex(Math.min(state.variation.moves.length, state.variation.currentIndex + 1));
    return;
  }
  setPly(Math.min(maxPly(), state.currentPly + 1));
}

function goToEnd() {
  if (state.variation) {
    setVariationIndex(state.variation.moves.length);
    return;
  }
  setPly(maxPly());
}

function renderReviewActionButton() {
  const button = $('#runReviewBtn');
  if (!button) return;

  if (state.isReviewing) {
    button.disabled = true;
    button.title = 'Reviewing game';
    button.innerHTML = '<i data-lucide="loader-circle"></i><span>Reviewing...</span>';
    return;
  }

  if (!state.review || state.showSetup) {
    button.disabled = false;
    button.title = 'Analyze game';
    button.innerHTML = '<i data-lucide="sparkles"></i><span>Analyze Game</span>';
    return;
  }

  if (!state.reviewStarted) {
    button.disabled = false;
    button.title = 'Start coach review';
    button.innerHTML = '<i data-lucide="play"></i><span>Start Review</span>';
    return;
  }

  const nextIndex = nextKeyMomentIndex();
  const hasNext = nextIndex >= 0;
  button.disabled = !hasNext;
  button.title = hasNext ? 'Go to next key move' : 'No more key moves';
  button.innerHTML = hasNext
    ? '<i data-lucide="arrow-right"></i><span>Next</span>'
    : '<i data-lucide="check"></i><span>Review complete</span>';
}

function renderCoachActions() {
  const actions = document.querySelector('.coach-actions');
  const bestButton = $('#bestMoveBtn');
  const explainButton = $('#explainBtn');
  if (!actions || !bestButton || !explainButton) return;

  const phase = document.body.dataset.reviewPhase || 'setup';
  const isCoach = phase === 'coach';
  actions.dataset.mode = phase;
  bestButton.hidden = !isCoach;
  explainButton.hidden = !isCoach;

  const move = currentReviewedMove();
  bestButton.disabled = !isCoach || !move?.best;
  explainButton.disabled = !isCoach || !move;
  bestButton.classList.toggle('active', state.coachMode === 'best');
  explainButton.classList.toggle('active', state.coachMode === 'explain');
}

function renderBoard() {
  const board = $('#board');
  const chess = new Chess();
  chess.load(activeFen());
  const lastMove = activeDisplayMove();
  const lastMoveInfo = lastMove ? state.review?.classificationInfo?.[lastMove.classification] : null;
  const selected = activeSelectedSquare();
  const legalTargets = selected ? legalMovesFrom(chess, selected).map((move) => move.to) : [];
  const drawings = currentDrawings();

  board.innerHTML = '';
  for (const square of orientedSquares()) {
    const piece = chess.get(square);
    const isLight = (fileIndex(square[0]) + Number(square[1])) % 2 === 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `square ${isLight ? 'light' : 'dark'}`;
    button.dataset.square = square;
    if (square[0] === (state.orientation === 'white' ? 'a' : 'h')) {
      button.classList.add('rank-coord');
      button.dataset.rank = square[1];
    }
    if (square[1] === (state.orientation === 'white' ? '1' : '8')) {
      button.classList.add('file-coord');
      button.dataset.file = square[0];
    }
    if (selected === square) button.classList.add('selected');
    if (legalTargets.includes(square)) button.classList.add('legal');
    if (drawings.squares.includes(square)) button.classList.add('draw-highlight');
    if (lastMove?.from === square) button.classList.add('last-from');
    if (lastMove?.to === square) button.classList.add('last-to');
    if (piece) {
      const img = document.createElement('img');
      img.className = 'piece-img';
      img.alt = `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}`;
      img.draggable = false;
      img.src = `/pieces/${piece.color}${piece.type.toUpperCase()}.svg`;
      const animation = animationForSquare(square);
      if (animation) {
        img.classList.add('piece-animate');
        img.style.setProperty('--move-x', `${animation.x}%`);
        img.style.setProperty('--move-y', `${animation.y}%`);
      }
      button.append(img);
    }
    if (lastMove?.to === square && lastMoveInfo) {
      const marker = document.createElement('span');
      marker.className = 'move-quality';
      marker.style.setProperty('--mark-color', lastMoveInfo.color);
      marker.textContent = lastMoveInfo.mark || lastMove.classificationLabel || '';
      button.append(marker);
    }
    board.append(button);
  }
  board.append(boardOverlay(drawings));
  armAnimationClear();

  const position = currentPosition();
  $('#positionLabel').textContent = state.retry
    ? 'Retry'
    : state.variation
      ? variationLabel()
      : position.label;
  $('#turnLabel').textContent = `${chess.turn() === 'w' ? 'White' : 'Black'} to move`;
  renderEval(chess);
}

function renderEval(chess) {
  const point = state.review?.graph[state.currentPly];
  const variationMove = state.variation?.currentIndex > 0
    ? state.variation.moves[state.variation.currentIndex - 1]
    : null;
  const liveVariationEval = state.variation && state.evalResult?.fen === activeFen()
    ? state.evalResult.lines?.[0]?.whiteCp
    : null;
  const cp = state.retry
    ? null
    : state.variation
      ? liveVariationEval ?? variationMove?.whiteCp ?? state.variation.line?.whiteCp ?? null
      : point?.eval ?? 0;
  const display = cp === null ? 'live' : formatEval(cp);
  $('#evalPill').textContent = display;
  const winShare = cp === null ? 50 : 100 / (1 + Math.exp(-(Math.max(-900, Math.min(900, cp)) / 240)));
  $('#evalBarFill').style.height = `${Math.max(3, Math.min(97, winShare))}%`;
  if (chess.isCheckmate()) $('#evalPill').textContent = 'mate';
}

function orientedSquares() {
  const files = state.orientation === 'white' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const ranks = state.orientation === 'white' ? ['8', '7', '6', '5', '4', '3', '2', '1'] : ['1', '2', '3', '4', '5', '6', '7', '8'];
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

function fileIndex(file) {
  return file.charCodeAt(0) - 97;
}

function activeFen() {
  if (state.retry) return state.retry.fen;
  if (state.variation) return variationFen();
  return currentPosition().fen;
}

function variationFen(variation = state.variation) {
  if (!variation) return currentPosition().fen;
  if (variation.currentIndex <= 0 || !variation.moves.length) return variation.baseFen;
  return variation.moves[variation.currentIndex - 1]?.afterFen || variation.baseFen;
}

function variationLabel() {
  if (!state.variation) return 'Variation';
  const max = state.variation.moves.length;
  const current = state.variation.currentIndex;
  const prefix = state.variation.source === 'best' ? 'Best line' : 'Line';
  return max ? `${prefix} ${current}/${max}` : prefix;
}

function activeDisplayMove() {
  if (state.retry) return null;
  if (state.variation) {
    if (state.variation.currentIndex <= 0) return null;
    return state.variation.moves[state.variation.currentIndex - 1] || null;
  }
  return state.currentPly > 0 ? state.review?.moves[state.currentPly - 1] || null : null;
}

function boardOverlay(drawings) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'board-overlay');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');

  const arrows = [...drawings.arrows];
  arrows.forEach((arrow, index) => {
    const start = squareCenter(arrow.from);
    const end = squareCenter(arrow.to);
    if (!start || !end) return;
    const markerId = `arrow-head-${index}`;
    const color = arrow.color || '#f3d650';
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="${markerId}" markerWidth="3.1" markerHeight="3.1" refX="2.65" refY="1.55" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L3.1,1.55 L0,3.1 Z" fill="${escapeHtml(color)}"></path>
      </marker>
    `;
    svg.append(defs);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', end.x);
    line.setAttribute('y2', end.y);
    line.setAttribute('stroke', color);
    line.setAttribute('marker-end', `url(#${markerId})`);
    line.setAttribute('class', `board-arrow ${arrow.className || ''}`.trim());
    svg.append(line);
  });

  return svg;
}

function squareCenter(square) {
  const point = squareGridPoint(square);
  if (!point) return null;
  return {
    x: ((point.col + 0.5) / 8) * 100,
    y: ((point.row + 0.5) / 8) * 100,
  };
}

function squareGridPoint(square) {
  const index = orientedSquares().indexOf(square);
  if (index < 0) return null;
  return {
    col: index % 8,
    row: Math.floor(index / 8),
  };
}

function animationForSquare(square) {
  const animation = state.animation;
  if (!animation || animation.target !== square) return null;
  const start = squareGridPoint(animation.from);
  const end = squareGridPoint(animation.to);
  if (!start || !end) return null;
  return {
    x: (start.col - end.col) * 100,
    y: (start.row - end.row) * 100,
  };
}

function armAnimationClear() {
  if (!state.animation || state.animation.armed) return;
  const id = state.animation.id;
  state.animation.armed = true;
  window.setTimeout(() => {
    if (state.animation?.id === id) state.animation = null;
  }, 220);
}

function currentPosition() {
  return state.review?.positions[state.currentPly] || {
    ply: 0,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    label: 'Start',
  };
}

function activeSelectedSquare() {
  return state.retry?.selected || state.variation?.selected || state.selectedSquare;
}

function legalMovesFrom(chess, square) {
  try {
    return chess.moves({ square, verbose: true });
  } catch {
    return [];
  }
}

function onBoardClick(event) {
  if (event.button !== 0) return;
  if (state.suppressNextBoardClick) {
    state.suppressNextBoardClick = false;
    return;
  }
  const square = event.target.closest('.square')?.dataset.square;
  if (!square) return;
  const clearedArrows = clearCurrentArrows();
  if (state.retry) {
    handleRetryClick(square);
    return;
  }
  if (state.variation) {
    handleVariationClick(square);
    return;
  }
  if (!state.review || state.showSetup) return;

  const chess = new Chess();
  chess.load(currentPosition().fen);
  const piece = chess.get(square);
  if (!piece && clearedArrows) renderBoard();
  if (piece?.color !== chess.turn()) {
    if (clearedArrows) renderBoard();
    return;
  }
  ensureVariation(true, {
    source: 'manual',
    title: 'Explore line',
    basePly: state.currentPly,
    baseFen: currentPosition().fen,
  });
  handleVariationClick(square);
}

function handleRetryClick(square) {
  const chess = new Chess();
  chess.load(state.retry.fen);
  const selected = state.retry.selected;
  const piece = chess.get(square);

  if (!selected) {
    if (piece?.color === chess.turn()) {
      state.retry.selected = square;
      state.retry.message = '';
    }
    render();
    return;
  }

  if (selected === square) {
    state.retry.selected = null;
    render();
    return;
  }

  if (!playRetryMove(selected, square)) {
    state.retry.selected = piece?.color === chess.turn() ? square : null;
    render();
  }
}

function handleVariationClick(square) {
  const chess = new Chess();
  chess.load(variationFen());
  const selected = state.variation.selected;
  const piece = chess.get(square);

  if (!selected) {
    if (piece?.color === chess.turn()) state.variation.selected = square;
    render();
    return;
  }

  if (selected === square) {
    state.variation.selected = null;
    render();
    return;
  }

  if (!playVariationMove(selected, square)) {
    state.variation.selected = piece?.color === chess.turn() ? square : null;
    render();
  }
}

function chooseLegalMove(chess, from, to) {
  const legal = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
  if (!legal.length) return null;
  const picked = legal.find((move) => move.promotion === 'q') || legal[0];
  return chess.move({ from, to, promotion: picked.promotion });
}

function playRetryMove(from, to) {
  const chess = new Chess();
  chess.load(state.retry.fen);
  const move = chooseLegalMove(chess, from, to);
  if (!move) return false;

  const uci = `${move.from}${move.to}${move.promotion || ''}`;
  if (uci === state.retry.targetUci) {
    state.retry.fen = chess.fen();
    state.retry.done = true;
    state.retry.message = `${move.san} is the engine move.`;
    state.animation = animationForMove(move.from, move.to, move.to, 'retry');
    playMoveSound();
  } else {
    state.retry.message = `${move.san} is legal, but Stockfish prefers ${state.retry.targetSan || state.retry.targetUci}.`;
  }
  state.retry.selected = null;
  render();
  return true;
}

function playVariationMove(from, to) {
  const chess = new Chess();
  chess.load(variationFen());
  const beforeFen = chess.fen();
  const move = chooseLegalMove(chess, from, to);
  if (!move) return false;

  const moveObject = variationMoveFromPlayed(move, beforeFen, chess.fen());
  const keptMoves = state.variation.moves.slice(0, state.variation.currentIndex);
  state.variation.moves = [...keptMoves, moveObject];
  state.variation.currentIndex = state.variation.moves.length;
  state.variation.fen = moveObject.afterFen;
  state.variation.selected = null;
  state.evalResult = null;
  state.animation = animationForMove(moveObject.from, moveObject.to, moveObject.to, 'variation');
  playMoveSound();
  render();
  evaluateVariationPosition();
  return true;
}

function playBoardMove(from, to) {
  if (state.retry) return playRetryMove(from, to);
  if (!state.review || state.showSetup) return false;
  if (!state.variation) {
    ensureVariation(true, {
      source: 'manual',
      title: 'Explore line',
      basePly: state.currentPly,
      baseFen: currentPosition().fen,
    });
  }
  return playVariationMove(from, to);
}

function onBoardPointerDown(event) {
  const square = event.target.closest('.square')?.dataset.square;
  if (!square) return;
  if (event.button === 2) {
    event.preventDefault();
    state.pendingDraw = { square };
    return;
  }
  if (event.button !== 0) return;
  beginPieceDrag(event, square);
}

function onBoardPointerMove(event) {
  const drag = state.drag;
  if (!drag) return;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.active && distance > 5) startPieceDrag(event);
  if (drag.active) {
    event.preventDefault();
    moveDragGhost(event);
  }
}

function onBoardPointerUp(event) {
  if (event.button === 0 && state.drag) {
    finishPieceDrag(event);
    return;
  }
  if (event.button !== 2 || !state.pendingDraw) return;
  const square = event.target.closest('.square')?.dataset.square;
  const from = state.pendingDraw.square;
  state.pendingDraw = null;
  if (!square) return;
  event.preventDefault();
  toggleDrawing(from, square);
  renderBoard();
}

function beginPieceDrag(event, square) {
  const chess = new Chess();
  chess.load(activeFen());
  const piece = chess.get(square);
  if (!piece || piece.color !== chess.turn()) return;

  state.drag = {
    from: square,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    pieceSrc: `/pieces/${piece.color}${piece.type.toUpperCase()}.svg`,
    pointerId: event.pointerId,
    ghost: null,
  };
}

function startPieceDrag(event) {
  const drag = state.drag;
  if (!drag || drag.active) return;
  drag.active = true;
  clearCurrentArrows();
  const ghost = document.createElement('img');
  ghost.className = 'piece-drag-ghost';
  ghost.src = drag.pieceSrc;
  ghost.alt = '';
  document.body.append(ghost);
  drag.ghost = ghost;
  $('#board')?.classList.add('dragging-piece');
  document.querySelector(`[data-square="${drag.from}"]`)?.classList.add('drag-source');
  moveDragGhost(event);
  try {
    $('#board')?.setPointerCapture(drag.pointerId);
  } catch {
    // Pointer capture can fail in some synthetic browser runs.
  }
}

function moveDragGhost(event) {
  const ghost = state.drag?.ghost;
  if (!ghost) return;
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
}

function finishPieceDrag(event) {
  const drag = state.drag;
  if (!drag) return;
  const wasActive = drag.active;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.square')?.dataset.square;
  cleanupPieceDrag();
  if (!wasActive) return;

  event.preventDefault();
  state.suppressNextBoardClick = true;
  window.setTimeout(() => {
    state.suppressNextBoardClick = false;
  }, 80);
  if (target && target !== drag.from) {
    const moved = playBoardMove(drag.from, target);
    if (!moved) renderBoard();
  } else {
    renderBoard();
  }
}

function cancelPieceDrag() {
  if (!state.drag) return;
  cleanupPieceDrag();
  renderBoard();
}

function cleanupPieceDrag() {
  const drag = state.drag;
  if (!drag) return;
  drag.ghost?.remove();
  $('#board')?.classList.remove('dragging-piece');
  document.querySelector(`[data-square="${drag.from}"]`)?.classList.remove('drag-source');
  try {
    $('#board')?.releasePointerCapture(drag.pointerId);
  } catch {
    // Ignore release failures after cancellation.
  }
  state.drag = null;
}

function onKeydown(event) {
  if (isTypingTarget(event.target)) return;
  if (event.key === 'Escape') {
    state.selectedSquare = null;
    if (state.variation) state.variation.selected = null;
    if (state.retry) state.retry.selected = null;
    render();
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const key = drawingKey();
    if (state.drawings[key]) {
      delete state.drawings[key];
      renderBoard();
    }
  }
}

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '');
}

function toggleDrawing(from, to) {
  const drawings = currentDrawings(true);
  if (from === to) {
    drawings.squares = drawings.squares.includes(from)
      ? drawings.squares.filter((square) => square !== from)
      : [...drawings.squares, from];
    return;
  }

  const existing = drawings.arrows.find((arrow) => arrow.from === from && arrow.to === to);
  if (existing) {
    drawings.arrows = drawings.arrows.filter((arrow) => arrow !== existing);
    return;
  }
  drawings.arrows = [...drawings.arrows, { from, to, color: '#f3d650' }];
}

function clearCurrentArrows() {
  const drawings = currentDrawings();
  if (!drawings.arrows.length) return false;
  currentDrawings(true).arrows = [];
  return true;
}

function currentDrawings(create = false) {
  const key = drawingKey();
  if (!state.drawings[key] && create) {
    state.drawings[key] = { squares: [], arrows: [] };
  }
  return state.drawings[key] || { squares: [], arrows: [] };
}

function drawingKey() {
  if (state.variation) {
    return `variation-${state.variation.basePly}-${state.variation.source}-${state.variation.currentIndex}`;
  }
  return `main-${state.currentPly}`;
}

function variationMoveFromPlayed(move, beforeFen, afterFen) {
  const fullMove = Number(beforeFen.split(/\s+/)[5] || 1);
  const uci = `${move.from}${move.to}${move.promotion || ''}`;
  const candidate = activeEngineLines().find((line) => line.uci === uci);
  const classification = candidate?.classification || 'good';
  const info = state.review.classificationInfo[classification] || state.review.classificationInfo.good;
  return {
    index: state.variation.moves.length,
    color: move.color,
    moveNumber: fullMove,
    san: move.san,
    normalizedSan: normalizeSan(move.san),
    uci,
    from: move.from,
    to: move.to,
    promotion: move.promotion || '',
    flags: move.flags,
    captured: move.captured || '',
    beforeFen,
    afterFen,
    whiteCp: candidate?.whiteCp ?? null,
    classification,
    classificationLabel: info.label,
    classificationColor: info.color,
    coach: candidate?.coach || `${move.san} starts a manual branch. Compare it with the engine candidates below.`,
  };
}

function renderScoreCards() {
  const shell = $('#scoreCards');
  if (!state.review) {
    shell.innerHTML = emptyNotice('Run a review to see precision, classifications, and game rating.');
    return;
  }
  const { white, black } = state.review.players;
  shell.innerHTML = [
    playerCard('White', state.review.game.white, white),
    playerCard('Black', state.review.game.black, black),
  ].join('');
}

function playerCard(side, name, data) {
  return `
    <article class="score-card">
      <h3>${escapeHtml(side)} - ${escapeHtml(name)}</h3>
      <div class="metric-row">
        ${metric('Precision', `${data.precision}`)}
        ${metric('Rating', `${data.rating}`)}
        ${metric('ACPL', `${data.acpl}`)}
        ${metric('Rated', `${data.ratedMoves || data.moves}`)}
      </div>
      <div class="stage-row">
        ${stagePill('Opening', data.stages.opening)}
        ${stagePill('Middle', data.stages.middlegame)}
        ${stagePill('Endgame', data.stages.endgame)}
      </div>
      <div class="class-grid">
        ${classificationPills(data.classifications)}
      </div>
    </article>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function stagePill(label, value) {
  return `<span class="stage-pill">${label}: ${value ?? '-'}</span>`;
}

function classificationPills(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const info = state.review.classificationInfo[key];
      return `<span class="class-pill"><span class="mark-badge" style="--mark-color:${info.color}">${escapeHtml(info.mark || '')}</span>${escapeHtml(info.label)} ${count}</span>`;
    })
    .join('');
}

function renderImportTab() {
  const content = $('#tabContent');
  const pgn = getPgnText() || demoPgn;
  content.innerHTML = `
    <div class="panel-block setup-card">
      <div class="setup-heading">
        <span class="eyebrow">PGN setup</span>
        <h3>Review a game</h3>
      </div>
      <div class="file-row">
        <label>
          <span>PGN file</span>
          <input id="pgnFile" type="file" accept=".pgn,.txt">
        </label>
        <button id="loadGamesBtn" class="command secondary"><i data-lucide="list-plus"></i><span>Load</span></button>
      </div>
      <textarea id="pgnInput" spellcheck="false" placeholder="Paste PGN">${escapeHtml(pgn)}</textarea>
      <div class="select-row">
        <label>
          <span>Game</span>
          <select id="gameSelect">
            ${gameOptions()}
          </select>
        </label>
        <button id="useDemoBtn" class="command"><i data-lucide="file-check-2"></i><span>Demo</span></button>
      </div>
      <p class="muted setup-note">Paste PGN, load the games, then start the review.</p>
    </div>
  `;
  $('#pgnInput').addEventListener('input', (event) => {
    localStorage.setItem('local-review-pgn', event.target.value);
  });
  $('#pgnFile').addEventListener('change', onPgnFile);
  $('#loadGamesBtn').addEventListener('click', loadGamesFromPgn);
  $('#useDemoBtn').addEventListener('click', () => {
    $('#pgnInput').value = demoPgn;
    localStorage.setItem('local-review-pgn', demoPgn);
    loadGamesFromPgn();
  });
  const select = $('#gameSelect');
  if (select) select.value = String(Math.min(Number(select.value || 0), state.games.length - 1));
  renderIcons();
}

function gameOptions() {
  if (!state.games.length) return '<option value="0">First PGN game</option>';
  return state.games.map((game) => `<option value="${game.index}">${escapeHtml(game.title)} (${game.moveCount} moves)</option>`).join('');
}

function onPgnFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('#pgnInput').value = String(reader.result || '');
    localStorage.setItem('local-review-pgn', $('#pgnInput').value);
    loadGamesFromPgn();
  };
  reader.readAsText(file);
}

function renderReviewPanel() {
  const content = $('#tabContent');
  if (!state.review || state.showSetup) {
    renderImportTab();
    return;
  }
  if (!state.reviewStarted) {
    content.innerHTML = `
      <div class="review-coach overview-coach">
        <div class="coach-bubble">You played some nice moves in that tough game. Let us look at a good tactical find you had.</div>
      </div>
      ${reviewSummary()}
    `;
    return;
  }
  content.innerHTML = `
    <div class="review-coach">
      <div class="coach-bubble">${currentCoachMessage()}</div>
    </div>
    <div class="line-panel">
      ${lineList(activeEngineLines()) || '<p class="muted">No engine candidates for this move yet.</p>'}
    </div>
    ${variationCard()}
  `;
  bindLinePanel();
}

function currentReviewedMove() {
  if (!state.review || state.currentPly <= 0) return null;
  return state.review.moves[state.currentPly - 1] || null;
}

function currentKeyMoment() {
  if (!state.review) return null;
  return state.review.keyMoments.find((moment) => moment.ply === state.currentPly) || null;
}

function currentCoachMessage() {
  if (state.variation) return variationCoachMessage();
  const move = currentReviewedMove();
  const moment = currentKeyMoment();
  if (!move) return escapeHtml('You played some nice moves in that tough game. Let us look at a good tactical find you had.');

  const info = state.review.classificationInfo[move.classification] || {};
  if (state.coachMode === 'best' && move.best) {
    return `${classificationBadge('best')}${escapeHtml(`${move.best.san || move.best.uci} was the best move`)}`;
  }
  if (state.coachMode === 'explain') {
    return `${classificationBadge(move.classification)}${escapeHtml(move.coach || info.description || `${move.san} is ${articleFor(info.label)} ${info.label?.toLowerCase()}.`)}`;
  }
  return `${classificationBadge(move.classification)}${escapeHtml(moment?.text || `${move.san} is ${articleFor(info.label)} ${info.label?.toLowerCase() || 'review move'}.`)}`;
}

function classificationBadge(key) {
  const info = state.review?.classificationInfo?.[key];
  if (!info) return '';
  return `<span class="coach-mark" style="--mark-color:${info.color}">${escapeHtml(info.mark || '')}</span>`;
}

function variationCoachMessage() {
  const variation = state.variation;
  if (!variation) return '';
  const activeMove = variation.currentIndex > 0 ? variation.moves[variation.currentIndex - 1] : null;
  if (!activeMove) {
    const lead = variation.source === 'best' ? 'This is the position before the engine recommendation.' : 'Explore from this position.';
    return `${classificationBadge(variation.line?.classification || 'best')}${escapeHtml(variation.line?.coach || lead)}`;
  }
  return `${classificationBadge(activeMove.classification)}${escapeHtml(activeMove.coach || `${activeMove.san} belongs to this alternate line.`)}`;
}

function activeEngineLines() {
  if (state.evalResult?.lines?.length && (!state.variation || state.evalResult.fen === activeFen())) {
    return state.evalResult.lines;
  }
  const move = currentReviewedMove();
  return move?.alternatives || [];
}

function bindLinePanel() {
  $('#tabContent').querySelectorAll('.line-item').forEach((button) => {
    button.addEventListener('click', () => {
      const line = activeEngineLines()[Number(button.dataset.lineIndex)];
      if (!line) return;
      const move = currentReviewedMove();
      const baseFen = state.evalResult?.fen || move?.beforeFen || currentPosition().fen;
      const basePly = move ? Math.max(0, move.ply - 1) : state.currentPly;
      state.coachMode = line.classification === 'best' ? 'best' : 'move';
      startLineVariation(line, {
        source: line.classification === 'best' ? 'best' : 'engine',
        title: `${line.classificationLabel} line`,
        basePly,
        baseFen,
        startIndex: line.moves?.length ? 1 : 0,
      });
      render();
    });
  });
  $('#tabContent').querySelectorAll('.variation-chip').forEach((button) => {
    button.addEventListener('click', () => setVariationIndex(Number(button.dataset.variationIndex)));
  });
  $('#undoVariationBtn')?.addEventListener('click', undoVariation);
  $('#resetVariationBtn')?.addEventListener('click', () => {
    state.variation = null;
    state.evalResult = null;
    state.coachMode = 'move';
    render();
  });
  $('#evaluateBtn')?.addEventListener('click', evaluateVariationPosition);
}

function showBestMove() {
  const move = currentReviewedMove();
  if (!move?.best) return;
  if (state.coachMode === 'best' && state.variation?.source === 'best') {
    state.coachMode = 'move';
    state.variation = null;
    render();
    return;
  }
  state.coachMode = 'best';
  state.retry = null;
  startLineVariation(move.best, {
    source: 'best',
    title: 'Best line',
    basePly: Math.max(0, move.ply - 1),
    baseFen: move.beforeFen,
    startIndex: move.best.moves?.length ? 1 : 0,
  });
  render();
}

function explainCurrentMove() {
  if (!currentReviewedMove()) return;
  state.coachMode = state.coachMode === 'explain' ? 'move' : 'explain';
  state.retry = null;
  render();
}

function articleFor(label) {
  return /^[aeiou]/i.test(label || '') ? 'an' : 'a';
}

function reviewSummary() {
  const { white, black } = state.review.players;
  const whiteName = state.review.game.white;
  const blackName = state.review.game.black;
  const opening = state.review.opening;
  return `
    <div class="review-summary">
      <div class="opening-summary">
        <span>Opening</span>
        <strong>${escapeHtml([opening?.eco, opening?.name].filter(Boolean).join(' ') || 'Unclassified Opening')}</strong>
      </div>
      <div class="players-summary">
        <div class="summary-label">Players</div>
        <div class="summary-name">${escapeHtml(whiteName)}</div>
        <div></div>
        <div class="summary-name">${escapeHtml(blackName)}</div>
        <div class="summary-label">Accuracy</div>
        <div class="summary-value">${white.precision}</div>
        <div></div>
        <div class="summary-value dark">${black.precision}</div>
      </div>
      <div class="classification-table">
        ${classificationSummaryRows(white, black)}
      </div>
      <div class="stage-summary">
        <div class="stage-row-summary">
          <div>Game Rating</div>
          <div class="summary-value">${white.rating}</div>
          <div></div>
          <div class="summary-value dark">${black.rating}</div>
        </div>
        ${stageSummaryRow('Opening', white.stages.opening, black.stages.opening)}
        ${stageSummaryRow('Middlegame', white.stages.middlegame, black.stages.middlegame)}
        ${stageSummaryRow('Endgame', white.stages.endgame, black.stages.endgame)}
      </div>
    </div>
  `;
}

function classificationSummaryRows(white, black) {
  const order = ['brilliant', 'great', 'book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  return order.map((key) => {
    const info = state.review.classificationInfo[key];
    return `
      <div class="class-row">
        <div>${escapeHtml(info.label)}</div>
        <div class="class-count" style="color:${info.color}">${white.classifications[key] || 0}</div>
        <span class="mark-badge" style="--mark-color:${info.color}">${escapeHtml(info.mark || '')}</span>
        <div class="class-count" style="color:${info.color}">${black.classifications[key] || 0}</div>
      </div>
    `;
  }).join('');
}

function stageSummaryRow(label, whiteValue, blackValue) {
  return `
    <div class="stage-row-summary">
      <div>${escapeHtml(label)}</div>
      <div class="summary-value">${whiteValue ?? '-'}</div>
      <div></div>
      <div class="summary-value dark">${blackValue ?? '-'}</div>
    </div>
  `;
}

function setCoachIndex(index) {
  const moments = state.review?.keyMoments || [];
  if (!moments.length) return;
  state.coachIndex = Math.max(0, Math.min(moments.length - 1, index));
  state.coachMode = 'move';
  const moment = moments[state.coachIndex];
  if (moment) setPly(moment.ply);
  state.retry = null;
  state.showBest = false;
  render();
}

function nextKeyMomentIndex() {
  const moments = state.review?.keyMoments || [];
  if (!moments.length) return -1;
  return moments.findIndex((moment) => moment.ply > state.currentPly);
}

function startRetry(move) {
  state.retry = {
    moveIndex: move.index,
    fen: move.beforeFen,
    targetUci: move.best.uci,
    targetSan: move.best.san,
    selected: null,
    message: `Find ${move.best.san || move.best.uci}.`,
    done: false,
  };
  state.variation = null;
  state.currentPly = Math.max(0, move.ply - 1);
  render();
}

function momentItem(item, index) {
  const active = index === state.coachIndex ? ' active' : '';
  const info = state.review.classificationInfo[item.classification] || {};
  return `
    <button class="moment-item${active}" data-index="${index}">
      <span class="mark-badge" style="--mark-color:${info.color || '#667085'}">${escapeHtml(info.mark || '')}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="muted">${item.moveNumber}${item.color === 'w' ? '.' : '...'} ${escapeHtml(item.san)}</span>
    </button>
  `;
}

function lineList(lines = []) {
  if (!lines.length) return '';
  return `
    <div class="line-list">
      ${lines.map((line, index) => `
        <button class="line-item${activeLineIndex() === index ? ' active' : ''}" data-line-index="${index}" title="Show this line">
          <span class="mark-badge mini" style="--mark-color:${line.classificationColor || '#75b843'}">${escapeHtml(line.classificationLabel ? state.review.classificationInfo[line.classification]?.mark || '' : '')}</span>
          <strong>${index + 1}. ${escapeHtml(line.san || line.uci || '-')} <span class="muted">${formatEval(line.whiteCp)}</span></strong>
          <span>${escapeHtml(line.sanLine || '')}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function activeLineIndex() {
  if (!state.variation?.line) return -1;
  return activeEngineLines().findIndex((line) => line.uciLine?.join(' ') === state.variation.line.uciLine?.join(' '));
}

function variationCard() {
  if (!state.variation) return '';
  const moves = state.variation.moves;
  return `
    <div class="variation-card">
      <div class="variation-head">
        <span>${escapeHtml(state.variation.title || 'Line')}</span>
        <strong>${state.variation.currentIndex}/${moves.length}</strong>
      </div>
      <div class="variation-moves">
        ${moves.length ? moves.map((move, index) => variationMoveChip(move, index)).join('') : '<span class="muted">Move pieces on the board.</span>'}
      </div>
      <div class="inline-actions variation-actions">
        <button id="evaluateBtn" class="icon-button" title="Evaluate position" aria-label="Evaluate position"><i data-lucide="cpu"></i></button>
        <button id="undoVariationBtn" class="icon-button" title="Undo line move" aria-label="Undo line move" ${moves.length ? '' : 'disabled'}><i data-lucide="undo-2"></i></button>
        <button id="resetVariationBtn" class="icon-button" title="Close line" aria-label="Close line"><i data-lucide="x"></i></button>
      </div>
    </div>
  `;
}

function variationMoveChip(move, index) {
  const active = state.variation.currentIndex === index + 1 ? ' active' : '';
  const info = state.review.classificationInfo[move.classification] || state.review.classificationInfo.best;
  const prefix = move.color === 'w' ? `${move.moveNumber}.` : `${move.moveNumber}...`;
  return `
    <button class="variation-chip${active}" data-variation-index="${index + 1}" title="${escapeHtml(move.coach || '')}">
      <span>${prefix}</span>
      <span class="mark-badge mini" style="--mark-color:${info.color}">${escapeHtml(info.mark || '')}</span>
      <strong>${escapeHtml(move.san)}</strong>
    </button>
  `;
}

function renderAnalysisTab() {
  const content = $('#tabContent');
  if (!state.review) {
    content.innerHTML = emptyNotice('Run a review before self-analysis.');
    return;
  }
  const move = state.currentPly > 0 ? state.review.moves[state.currentPly - 1] : null;
  const annotationKey = `ply-${state.currentPly}`;
  content.innerHTML = `
    <div class="analysis-grid">
      <div class="panel-block">
        <h3>Engine lines</h3>
        ${lineList(state.evalResult?.lines || move?.alternatives || []) || '<p class="muted">No lines yet.</p>'}
        <div class="inline-actions">
          <button id="evaluateBtn" class="command secondary"><i data-lucide="cpu"></i><span>Evaluate</span></button>
          <button id="startVariationBtn" class="command"><i data-lucide="git-branch"></i><span>Variation</span></button>
          <button id="undoVariationBtn" class="icon-button" title="Undo variation" aria-label="Undo variation"><i data-lucide="undo-2"></i></button>
          <button id="resetVariationBtn" class="icon-button" title="Reset variation" aria-label="Reset variation"><i data-lucide="x"></i></button>
        </div>
      </div>
      <div class="panel-block">
        <h3>Annotation</h3>
        <textarea id="annotationInput" class="annotation-box" spellcheck="true">${escapeHtml(state.annotations[annotationKey] || '')}</textarea>
      </div>
    </div>
    <div class="panel-block">
      <h3>Variation line</h3>
      <p class="muted">${state.variation?.moves?.length ? escapeHtml(state.variation.moves.map((move) => move.san).join(' ')) : 'Start a variation, then play moves on the board.'}</p>
    </div>
  `;
  $('#evaluateBtn').addEventListener('click', evaluateCurrentPosition);
  $('#startVariationBtn').addEventListener('click', () => {
    ensureVariation(true);
    render();
  });
  $('#undoVariationBtn').disabled = !state.variation?.moves.length;
  $('#undoVariationBtn').addEventListener('click', undoVariation);
  $('#resetVariationBtn').disabled = !state.variation;
  $('#resetVariationBtn').addEventListener('click', () => {
    state.variation = null;
    state.evalResult = null;
    render();
  });
  $('#annotationInput').addEventListener('input', (event) => {
    state.annotations[annotationKey] = event.target.value;
    localStorage.setItem('local-review-annotations', JSON.stringify(state.annotations));
  });
}

function ensureVariation(force = false, options = {}) {
  if (state.variation && !force) return;
  state.retry = null;
  const basePly = Number.isFinite(options.basePly) ? options.basePly : state.currentPly;
  const baseFen = options.baseFen || currentPosition().fen;
  state.variation = {
    source: options.source || 'manual',
    title: options.title || 'Explore line',
    basePly,
    baseFen,
    fen: baseFen,
    moves: [],
    currentIndex: 0,
    selected: null,
    line: options.line || null,
  };
}

function undoVariation() {
  if (!state.variation?.moves.length) return;
  const oldIndex = state.variation.currentIndex;
  const moves = state.variation.moves.slice(0, -1);
  state.variation.moves = moves;
  state.variation.currentIndex = Math.min(oldIndex, moves.length);
  state.variation.fen = variationFen();
  state.evalResult = null;
  state.animation = null;
  render();
}

async function evaluateVariationPosition() {
  if (!state.review) return;
  const requestFen = activeFen();
  state.variationEvalPending = true;
  setStatus('Evaluating position...');
  try {
    const result = await postJson('/api/evaluate', {
      fen: requestFen,
      config: getEngineConfig(),
    });
    if (requestFen === activeFen()) {
      state.evalResult = result;
      applyVariationEvaluation(result);
      setStatus('Position evaluated');
      render();
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    state.variationEvalPending = false;
  }
}

const evaluateCurrentPosition = evaluateVariationPosition;

function applyVariationEvaluation(result) {
  if (!state.variation || state.variation.currentIndex <= 0) return;
  const score = result.lines?.[0]?.whiteCp;
  if (!Number.isFinite(Number(score))) return;
  const activeMove = state.variation.moves[state.variation.currentIndex - 1];
  if (!activeMove) return;
  activeMove.whiteCp = score;
  if (state.variation.source === 'manual') {
    activeMove.coach = `${activeMove.san} reaches a position Stockfish evaluates at ${formatEval(score)}.`;
  }
}

function startLineVariation(line, options = {}) {
  const visibleLines = activeEngineLines();
  const moves = (line.moves || []).map((move, index) => ({
    ...move,
    index,
    whiteCp: index === 0 ? line.whiteCp : move.whiteCp ?? line.whiteCp,
  }));
  ensureVariation(true, {
    ...options,
    line,
  });
  state.variation.moves = moves;
  state.variation.currentIndex = Math.max(0, Math.min(options.startIndex ?? 0, moves.length));
  state.variation.fen = variationFen();
  state.variation.line = line;
  state.variation.selected = null;
  state.evalResult = {
    fen: options.baseFen || state.variation.baseFen,
    lines: visibleLines.length ? visibleLines : [line],
  };
  const activeMove = state.variation.currentIndex > 0 ? state.variation.moves[state.variation.currentIndex - 1] : null;
  state.animation = activeMove ? animationForMove(activeMove.from, activeMove.to, activeMove.to, 'variation') : null;
}

function renderMoveList() {
  const list = $('#moveList');
  const count = $('#moveCount');
  if (!state.review) {
    count.textContent = '0 plies';
    list.innerHTML = '';
    return;
  }
  count.textContent = `${state.review.moves.length} plies`;
  const rows = [];
  for (let i = 0; i < state.review.moves.length; i += 2) {
    const white = state.review.moves[i];
    const black = state.review.moves[i + 1];
    rows.push(`<div class="move-num">${white.moveNumber}.</div>`);
    rows.push(moveButton(white));
    rows.push(black ? moveButton(black) : '<div></div>');
  }
  list.innerHTML = rows.join('');
  list.querySelectorAll('.move-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.retry = null;
      state.variation = null;
      setPly(Number(button.dataset.ply));
    });
  });
}

function moveButton(move) {
  const info = state.review.classificationInfo[move.classification];
  const active = state.currentPly === move.ply ? ' active' : '';
  return `
    <button class="move-button${active}" data-ply="${move.ply}" title="${escapeHtml(`${move.classificationLabel}: ${info.description}`)}">
      <span class="mark-badge mini" style="--mark-color:${info.color}">${escapeHtml(info.mark || '')}</span>${escapeHtml(move.san)}
    </button>
  `;
}

function drawGraph() {
  const canvas = $('#evalGraph');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#fbfcfd';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const points = state.review?.graph || [{ ply: 0, eval: 0 }];
  const pad = 18;
  const width = rect.width - pad * 2;
  const height = rect.height - pad * 2;
  const zeroY = pad + height / 2;

  ctx.strokeStyle = '#d8dee8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, zeroY);
  ctx.lineTo(pad + width, zeroY);
  ctx.stroke();

  if (points.length < 2) {
    ctx.fillStyle = '#667085';
    ctx.fillText('Run review', pad, zeroY - 6);
    return;
  }

  const xFor = (index) => pad + (index / (points.length - 1)) * width;
  const yFor = (cp) => {
    const clamped = Math.max(-900, Math.min(900, cp));
    return pad + height / 2 - (clamped / 900) * (height / 2);
  };

  ctx.strokeStyle = '#2f6fbb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.eval);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((point, index) => {
    const move = state.review.moves[index - 1];
    const color = move ? state.review.classificationInfo[move.classification].color : '#667085';
    ctx.fillStyle = index === state.currentPly ? '#111827' : color;
    ctx.beginPath();
    ctx.arc(xFor(index), yFor(point.eval), index === state.currentPly ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function onGraphClick(event) {
  if (!state.review) return;
  const rect = $('#evalGraph').getBoundingClientRect();
  const pad = 18;
  const usable = rect.width - pad * 2;
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - pad) / usable));
  setPly(Math.round(ratio * maxPly()));
}

function setPly(ply) {
  const previousPly = state.currentPly;
  const nextPly = Math.max(0, Math.min(maxPly(), ply));
  state.currentPly = nextPly;
  state.coachMode = 'move';
  state.selectedSquare = null;
  state.retry = null;
  state.variation = null;
  state.evalResult = null;
  state.animation = mainAnimation(previousPly, nextPly);
  if (state.animation) playMoveSound();
  render();
}

function setVariationIndex(index) {
  if (!state.variation) return;
  const previousIndex = state.variation.currentIndex;
  const nextIndex = Math.max(0, Math.min(state.variation.moves.length, index));
  state.variation.currentIndex = nextIndex;
  state.variation.fen = variationFen();
  state.variation.selected = null;
  state.evalResult = null;
  state.animation = variationAnimation(previousIndex, nextIndex);
  if (state.animation) playMoveSound();
  render();
  evaluateVariationPosition();
}

function mainAnimation(previousPly, nextPly) {
  if (Math.abs(previousPly - nextPly) !== 1) return null;
  if (nextPly > previousPly) {
    const move = state.review?.moves[nextPly - 1];
    return move ? animationForMove(move.from, move.to, move.to, 'main') : null;
  }
  const move = state.review?.moves[previousPly - 1];
  return move ? animationForMove(move.to, move.from, move.from, 'main') : null;
}

function variationAnimation(previousIndex, nextIndex) {
  if (!state.variation || Math.abs(previousIndex - nextIndex) !== 1) return null;
  if (nextIndex > previousIndex) {
    const move = state.variation.moves[nextIndex - 1];
    return move ? animationForMove(move.from, move.to, move.to, 'variation') : null;
  }
  const move = state.variation.moves[previousIndex - 1];
  return move ? animationForMove(move.to, move.from, move.from, 'variation') : null;
}

function animationForMove(from, to, target, context) {
  return {
    id: `${context}-${from}-${to}-${target}-${Date.now()}`,
    from,
    to,
    target,
    armed: false,
  };
}

function playMoveSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    state.audioContext ||= new AudioContextClass();
    const ctx = state.audioContext;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const tap = ctx.createOscillator();
    const body = ctx.createOscillator();

    tap.type = 'triangle';
    tap.frequency.setValueAtTime(520, now);
    tap.frequency.exponentialRampToValueAtTime(240, now + 0.045);

    body.type = 'sine';
    body.frequency.setValueAtTime(130, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

    tap.connect(gain);
    body.connect(gain);
    gain.connect(ctx.destination);
    tap.start(now);
    body.start(now);
    tap.stop(now + 0.08);
    body.stop(now + 0.08);
  } catch {
    // Audio is best-effort; browsers may block it before a user gesture.
  }
}

function maxPly() {
  return state.review?.moves.length || 0;
}

function formatEval(cp) {
  if (cp === null || cp === undefined || !Number.isFinite(Number(cp))) return 'live';
  if (Math.abs(cp) >= 90000) return cp > 0 ? 'M+' : 'M-';
  const pawns = cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function normalizeSan(san) {
  return String(san || '')
    .replace(/[+#?!]+/g, '')
    .replace(/^0-0-0$/i, 'O-O-O')
    .replace(/^0-0$/i, 'O-O');
}

function badge(label, color, mark = '') {
  return `<span class="badge" style="background:${color}">${mark ? `<span>${escapeHtml(mark)}</span>` : ''}${escapeHtml(label)}</span>`;
}

function emptyNotice(text) {
  return `<div class="panel-block"><p class="muted">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(message) {
  $('#statusText').textContent = message;
}

function renderIcons() {
  window.lucide?.createIcons({
    attrs: {
      'aria-hidden': 'true',
    },
  });
}
