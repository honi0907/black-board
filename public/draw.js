const DEFAULT_COLORS = ['#ffffff', '#ef4444', '#3b82f6'];
const COLOR_STORAGE_KEY = 'blackboard-pen-colors';
const SIZES = [3, 6, 12];

function loadColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || 'null');
    if (!Array.isArray(saved) || saved.length !== 3) return [...DEFAULT_COLORS];
    return saved.map((c, i) => (
      /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : DEFAULT_COLORS[i]
    ));
  } catch {
    return [...DEFAULT_COLORS];
  }
}

function saveColors() {
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(COLORS));
}

let COLORS = loadColors();

let drawCanvas = null;
let drawCtx = null;
let drawBoardWrap = null;
let strokes = [];
let currentTool = 'move';
let colorIndex = 0;
let sizeIndex = 1;
let activeStroke = null;
let activePointerId = null;
let eraserDragging = false;
let drawSocket = null;

function resizeDrawCanvas() {
  if (!drawCanvas || !drawCtx) return;
  const board = document.getElementById('board');
  const dpr = window.devicePixelRatio || 1;
  const w = board.offsetWidth;
  const h = board.offsetHeight;

  drawCanvas.style.width = `${w}px`;
  drawCanvas.style.height = `${h}px`;
  drawCanvas.width = Math.floor(w * dpr);
  drawCanvas.height = Math.floor(h * dpr);
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawAllStrokes();
}

function drawStrokeOnCtx(ctx, stroke) {
  if (!stroke.points || stroke.points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.width;

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function redrawAllStrokes() {
  if (!drawCtx || !drawCanvas) return;
  const board = document.getElementById('board');
  drawCtx.clearRect(0, 0, board.offsetWidth, board.offsetHeight);
  strokes.forEach((s) => drawStrokeOnCtx(drawCtx, s));
}

function addStroke(stroke) {
  if (strokes.some((s) => s.id === stroke.id)) return;
  strokes.push(stroke);
  redrawAllStrokes();
}

function removeStroke(id) {
  const before = strokes.length;
  strokes = strokes.filter((s) => s.id !== id);
  if (strokes.length !== before) redrawAllStrokes();
}

function hasStrokes() {
  return strokes.length > 0;
}

function clearStrokes() {
  strokes = [];
  redrawAllStrokes();
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function findStrokeAt(x, y) {
  const padding = SIZES[sizeIndex] + 6;
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    const stroke = strokes[i];
    if (stroke.tool === 'eraser' || !stroke.points || stroke.points.length < 2) continue;
    const threshold = (stroke.width || 4) / 2 + padding;
    for (let j = 1; j < stroke.points.length; j += 1) {
      const [x0, y0] = stroke.points[j - 1];
      const [x1, y1] = stroke.points[j];
      if (distPointToSegment(x, y, x0, y0, x1, y1) <= threshold) return stroke;
    }
  }
  return null;
}

function eraseStrokeAtPoint(x, y) {
  const stroke = findStrokeAt(x, y);
  if (!stroke || !drawSocket) return;
  removeStroke(stroke.id);
  drawSocket.emit('board:delete', { id: stroke.id });
}

function getCanvasPoint(e) {
  const rect = drawCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function updateToolUI() {
  document.querySelectorAll('[data-draw-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.drawTool === currentTool);
  });

  document.querySelectorAll('.color-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === colorIndex);
    dot.style.background = COLORS[i];
    dot.disabled = currentTool === 'eraser';
    dot.style.opacity = currentTool === 'eraser' ? '0.35' : '1';
  });

  document.querySelectorAll('.size-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === sizeIndex);
  });

  const colorPalette = document.getElementById('color-palette');
  colorPalette?.classList.toggle('disabled', currentTool === 'eraser');

  if (drawCanvas) {
    const drawing = currentTool === 'pen' || currentTool === 'eraser';
    drawCanvas.classList.toggle('drawing-mode', drawing);
    drawBoardWrap?.classList.toggle('draw-mode', drawing);
    if (drawing) {
      drawCanvas.style.cursor = currentTool === 'eraser' ? 'pointer' : 'crosshair';
    } else {
      drawCanvas.style.cursor = '';
    }
  }
}

function setTool(tool) {
  currentTool = tool;
  updateToolUI();
}

function finishStroke() {
  if (!activeStroke || !drawSocket) {
    activeStroke = null;
    activePointerId = null;
    return;
  }

  if (activeStroke.points.length >= 2) {
    drawSocket.emit('board:stroke', {
      tool: activeStroke.tool,
      color: activeStroke.color,
      width: activeStroke.width,
      points: activeStroke.points,
    });
  }
  activeStroke = null;
  activePointerId = null;
}

function onDrawPointerDown(e) {
  if (currentTool !== 'pen' && currentTool !== 'eraser') return;
  if (e.button !== 0) return;

  e.preventDefault();
  e.stopPropagation();
  drawCanvas.setPointerCapture(e.pointerId);
  activePointerId = e.pointerId;

  const p = getCanvasPoint(e);

  if (currentTool === 'eraser') {
    eraserDragging = true;
    eraseStrokeAtPoint(p.x, p.y);
    return;
  }

  activeStroke = {
    tool: currentTool,
    color: COLORS[colorIndex],
    width: SIZES[sizeIndex],
    points: [[p.x, p.y]],
  };
}

function onDrawPointerMove(e) {
  if (currentTool === 'eraser') {
    if (!eraserDragging || e.pointerId !== activePointerId) return;
    e.preventDefault();
    const p = getCanvasPoint(e);
    eraseStrokeAtPoint(p.x, p.y);
    return;
  }

  if (!activeStroke || e.pointerId !== activePointerId) return;

  e.preventDefault();
  const p = getCanvasPoint(e);
  const pts = activeStroke.points;
  pts.push([p.x, p.y]);

  const x0 = pts[pts.length - 2][0];
  const y0 = pts[pts.length - 2][1];

  drawCtx.beginPath();
  drawCtx.moveTo(x0, y0);
  drawCtx.lineTo(p.x, p.y);
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.lineWidth = activeStroke.width;
  drawCtx.globalCompositeOperation = 'source-over';
  drawCtx.strokeStyle = activeStroke.color;
  drawCtx.stroke();
}

function onDrawPointerUp(e) {
  if (currentTool === 'eraser') {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    eraserDragging = false;
    activePointerId = null;
    try {
      drawCanvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    return;
  }

  if (!activeStroke || e.pointerId !== activePointerId) return;
  e.preventDefault();
  try {
    drawCanvas.releasePointerCapture(e.pointerId);
  } catch {
    // ignore
  }
  finishStroke();
}

function openColorPicker(index) {
  if (currentTool === 'eraser') return;
  const picker = document.getElementById('color-picker');
  if (!picker) return;

  picker.value = COLORS[index];
  picker.dataset.slot = String(index);
  picker.click();
}

function setupDrawToolbar() {
  document.querySelectorAll('[data-draw-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.drawTool));
  });

  document.querySelectorAll('.color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      if (dot.dataset.skipClick) return;
      colorIndex = Number(dot.dataset.i);
      updateToolUI();
    });

    dot.addEventListener('dblclick', (e) => {
      e.preventDefault();
      dot.dataset.skipClick = '1';
      setTimeout(() => {
        delete dot.dataset.skipClick;
      }, 300);
      const index = Number(dot.dataset.i);
      colorIndex = index;
      updateToolUI();
      openColorPicker(index);
    });
  });

  const picker = document.getElementById('color-picker');
  if (picker) {
    picker.addEventListener('input', () => {
      const index = Number(picker.dataset.slot);
      if (Number.isNaN(index)) return;
      COLORS[index] = picker.value.toLowerCase();
      colorIndex = index;
      saveColors();
      updateToolUI();
    });
  }

  document.querySelectorAll('.size-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      sizeIndex = Number(dot.dataset.i);
      updateToolUI();
    });
  });

  updateToolUI();
}

function initDrawing(socket) {
  drawSocket = socket;
  drawBoardWrap = document.getElementById('board-wrap');
  drawCanvas = document.getElementById('draw-canvas');
  if (!drawCanvas) return;

  drawCtx = drawCanvas.getContext('2d');
  if (!drawCtx) return;

  if (!drawCanvas.dataset.ready) {
    drawCanvas.dataset.ready = '1';
    drawCanvas.addEventListener('pointerdown', onDrawPointerDown);
    drawCanvas.addEventListener('pointermove', onDrawPointerMove);
    drawCanvas.addEventListener('pointerup', onDrawPointerUp);
    drawCanvas.addEventListener('pointercancel', onDrawPointerUp);
    setupDrawToolbar();
    window.addEventListener('resize', resizeDrawCanvas);

    const board = document.getElementById('board');
    if (window.ResizeObserver && board) {
      new ResizeObserver(() => resizeDrawCanvas()).observe(board);
    }
  }

  resizeDrawCanvas();
}

function setSocket(socket) {
  drawSocket = socket;
}

window.drawModule = {
  initDrawing,
  setSocket,
  addStroke,
  removeStroke,
  clearStrokes,
  hasStrokes,
  loadStrokesFromHistory(items) {
    clearStrokes();
    items.filter((i) => i.type === 'stroke').forEach(addStroke);
  },
};
