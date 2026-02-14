/* ============================================================
   Valentina's Valentine Sparkle Card — Main Application
   ============================================================ */

(function () {
  'use strict';

  // ── Plate metadata ──────────────────────────────────────────
  const PLATES = [
    { id: 1, file: '001.png', title: 'Love at First Sight' },
    { id: 2, file: '002.png', title: 'Sunny Road Trip' },
    { id: 3, file: '003.png', title: 'Hot Tub Hangout' },
    { id: 4, file: '004.png', title: 'Starry Night Hug' },
    { id: 5, file: '008.png', title: 'Balcony Serenade' },
    { id: 6, file: '005.png', title: 'Bedtime Story' },
    { id: 7, file: '006.png', title: 'Venice Gondola' },
    { id: 8, file: '007.png', title: 'Movie Night' },
    { id: 9, file: '009.png', title: 'Rainbow Promise' },
    { id: 10, file: '010.png', title: 'Disco Dance Party' },
    { id: 11, file: '011.png', title: 'Happy Valentine' },
  ];

  const PRAISE = [
    'Daddy loves you so much, and Daddy is really proud of you, little girl.',
    'This drawing is beautiful, little girl — you made it with your own special magic.',
    'Daddy can see how much care you put into this, little girl. It makes Daddy\u2019s heart happy.',
    'You did an amazing job, little girl. Daddy\u2019s proud of how hard you worked.',
    'Daddy loves how you chose the colors, little girl — that\u2019s such a smart, creative choice.',
    'Wow, little girl\u2026 this is truly gorgeous. Daddy thinks you\u2019re such an artist.',
    'You\u2019re getting better and better, little girl, and Daddy is proud of you every time you try.',
    'Daddy loves you exactly as you are, little girl, and Daddy loves the things you create.',
    'Thank you for showing Daddy your drawing, little girl — Daddy feels lucky to see your imagination.',
    'This is a beautiful drawing, little girl, and Daddy is so proud of you.',
  ];

  const CANVAS_W = 500;
  const CANVAS_H = 600;
  const MAX_UNDO = 30;
  const MAX_PARTICLES = 200;
  const AUTOSAVE_MS = 2000;

  // ── DOM refs ────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const plateCanvas = $('#plate');
  const drawCanvas = $('#drawing');
  const glitterCanvas = $('#glitter');
  const canvasFrame = $('#canvas-frame');
  const canvasContainer = $('#canvas-container');

  const plateCtx = plateCanvas.getContext('2d', { willReadFrequently: true });
  const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
  const glitterCtx = glitterCanvas.getContext('2d');

  const btnBack = $('#btn-back');
  const btnMenu = $('#btn-menu');
  const pageNumber = $('#page-number');
  const plateTitle = $('#plate-title');
  const brushSizeInput = $('#brush-size');
  const sizeValue = $('#size-value');
  const brushHardnessInput = $('#brush-hardness');
  const hardnessControl = $('#hardness-control');
  const btnUndo = $('#btn-undo');
  const btnRedo = $('#btn-redo');
  const btnSeal = $('#btn-seal');

  const rewardOverlay = $('#reward-overlay');
  const rewardText = $('#reward-text');
  const rewardSparkles = $('#reward-sparkles');
  const rewardContinue = $('#reward-continue');
  const rewardDownload = $('#reward-download');

  const pagePicker = $('#page-picker');
  const pageGrid = $('#page-grid');
  const pickerClose = $('#picker-close');
  const btnDownloadAll = $('#btn-download-all');

  // ── State ───────────────────────────────────────────────────
  let currentPage = 1;
  let completedPages = new Set();
  let currentTool = 'brush';
  let currentColor = '#FF1493';
  let brushSize = 8;
  let brushHardness = 1; // 0 = soft airbrush, 1 = hard edge
  let dpr = Math.min(window.devicePixelRatio || 1, 3);

  // Drawing state
  let isDrawing = false;
  let lastPoint = null;
  let currentStroke = [];
  let currentPressures = [];

  // Undo/redo
  let undoStack = []; // per page: array of ImageData snapshots
  let redoStack = [];

  // Gesture state
  let activeTouches = new Map();
  let gestureMode = null; // null | 'draw' | 'pinch'
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  // Transform (zoom/pan)
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let pinchStartPanX = 0;
  let pinchStartPanY = 0;
  let pinchMidStart = { x: 0, y: 0 };

  // Glitter particles
  let particles = [];
  let glitterRAF = null;

  // Persistence
  let autosaveTimer = null;
  let plateImage = null; // current plate Image element

  // ── CanvasManager ───────────────────────────────────────────
  const CanvasManager = {
    resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      const containerRect = canvasContainer.getBoundingClientRect();
      const maxW = containerRect.width - 16;
      const maxH = containerRect.height - 16;

      const aspect = CANVAS_W / CANVAS_H;
      let w, h;
      if (maxW / maxH > aspect) {
        h = maxH;
        w = h * aspect;
      } else {
        w = maxW;
        h = w / aspect;
      }

      canvasFrame.style.width = w + 'px';
      canvasFrame.style.height = h + 'px';

      [plateCanvas, drawCanvas, glitterCanvas].forEach((c) => {
        c.width = CANVAS_W * dpr;
        c.height = CANVAS_H * dpr;
        c.style.width = '100%';
        c.style.height = '100%';
        const ctx = c.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      });

      this.applyTransform();
      PlateManager.renderCurrent();
      PersistenceManager.restoreDrawing();
    },

    applyTransform() {
      const t = `scale(${zoom}) translate(${panX}px, ${panY}px)`;
      canvasFrame.style.transform = t;
    },

    resetTransform() {
      zoom = 1;
      panX = 0;
      panY = 0;
      this.applyTransform();
    },

    // Convert page-space pointer coords to canvas coords
    pointerToCanvas(clientX, clientY) {
      const rect = canvasFrame.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
  };

  // ── PressureSystem ──────────────────────────────────────────
  const PressureSystem = {
    lastTime: 0,
    lastPos: null,

    get(e, pos) {
      // Use native pressure if available
      if (e.pressure && e.pressure > 0 && e.pressure < 1) {
        return e.pressure;
      }
      // Fallback: velocity-based pseudo-pressure
      const now = performance.now();
      if (!this.lastPos || !this.lastTime) {
        this.lastTime = now;
        this.lastPos = pos;
        return 0.5;
      }
      const dt = now - this.lastTime;
      const dx = pos.x - this.lastPos.x;
      const dy = pos.y - this.lastPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocity = dt > 0 ? dist / dt : 0;

      this.lastTime = now;
      this.lastPos = pos;

      // Slow = thick (high pressure), fast = thin (low pressure)
      const p = 1 - Math.min(velocity / 2, 1);
      return 0.2 + p * 0.6; // clamp [0.2, 0.8]
    },

    reset() {
      this.lastTime = 0;
      this.lastPos = null;
    },
  };

  // ── UndoManager ─────────────────────────────────────────────
  const UndoManager = {
    saveState() {
      const snapshot = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      undoStack.push(snapshot);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
      this.updateButtons();
    },

    undo() {
      if (undoStack.length === 0) return;
      const current = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      redoStack.push(current);
      const prev = undoStack.pop();
      drawCtx.putImageData(prev, 0, 0);
      this.updateButtons();
      PersistenceManager.scheduleSave();
    },

    redo() {
      if (redoStack.length === 0) return;
      const current = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      undoStack.push(current);
      const next = redoStack.pop();
      drawCtx.putImageData(next, 0, 0);
      this.updateButtons();
      PersistenceManager.scheduleSave();
    },

    clear() {
      undoStack = [];
      redoStack = [];
      this.updateButtons();
    },

    updateButtons() {
      btnUndo.disabled = undoStack.length === 0;
      btnRedo.disabled = redoStack.length === 0;
    },
  };

  // ── DrawingEngine ───────────────────────────────────────────
  // Smooth-point buffer: we keep a short window for averaging
  let smoothBuffer = [];
  const SMOOTH_WINDOW = 3; // average over last N raw points
  let lastSmoothed = null;
  let strokeDistance = 0; // accumulated distance for stamp spacing

  const DrawingEngine = {
    beginStroke(pos, pressure) {
      isDrawing = true;
      lastPoint = pos;
      lastSmoothed = pos;
      smoothBuffer = [pos];
      strokeDistance = 0;
      currentStroke = [pos];
      currentPressures = [pressure];
      UndoManager.saveState();

      // Initial dot so taps are visible
      if (currentTool === 'brush') {
        this.stampCircle(pos.x, pos.y, brushSize * (0.5 + pressure) * 0.5, pressure);
      }
    },

    continueStroke(pos, pressure) {
      if (!isDrawing || !lastPoint) return;

      // Smooth the incoming point by averaging recent raw points
      smoothBuffer.push(pos);
      if (smoothBuffer.length > SMOOTH_WINDOW) smoothBuffer.shift();
      const smoothed = {
        x: smoothBuffer.reduce((s, p) => s + p.x, 0) / smoothBuffer.length,
        y: smoothBuffer.reduce((s, p) => s + p.y, 0) / smoothBuffer.length,
      };

      currentStroke.push(smoothed);
      currentPressures.push(pressure);

      if (currentTool === 'brush') {
        this.drawBrushSmooth(smoothed, pressure);
      } else if (currentTool === 'eraser') {
        this.drawEraserSmooth(smoothed, pressure);
      } else if (currentTool === 'glitter') {
        this.drawGlitterStroke(smoothed, pressure);
      }

      lastSmoothed = smoothed;
      lastPoint = pos;
    },

    endStroke() {
      if (!isDrawing) return;
      isDrawing = false;
      lastPoint = null;
      lastSmoothed = null;
      smoothBuffer = [];
      strokeDistance = 0;
      currentStroke = [];
      currentPressures = [];
      PressureSystem.reset();
      PersistenceManager.scheduleSave();
    },

    // Stamp-based brush: draw filled circles along the curve for
    // perfectly smooth, gapless, consistent-opacity strokes.
    drawBrushSmooth(to, pressure) {
      const from = lastSmoothed;
      if (!from) return;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) return;

      const radius = brushSize * (0.5 + pressure) * 0.5;
      // Stamp spacing: fraction of radius for seamless coverage
      const spacing = Math.max(1, radius * 0.25);
      const steps = Math.ceil(dist / spacing);

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        // Interpolate pressure smoothly along segment
        const p = pressure; // already smoothed via PressureSystem
        const r = brushSize * (0.5 + p) * 0.5;
        this.stampCircle(x, y, r, p);
      }
    },

    stampCircle(x, y, radius, pressure) {
      const r = Math.max(0.5, radius);
      drawCtx.save();
      drawCtx.globalCompositeOperation = 'source-over';

      if (brushHardness >= 0.95) {
        // Hard brush — solid fill (original behavior)
        drawCtx.fillStyle = currentColor;
        drawCtx.globalAlpha = 0.75 + pressure * 0.25;
        drawCtx.beginPath();
        drawCtx.arc(x, y, r, 0, Math.PI * 2);
        drawCtx.fill();
      } else {
        // Soft brush — radial gradient for airbrush effect
        // hardness controls where the gradient starts fading
        const innerStop = brushHardness * 0.8;
        const alpha = 0.3 + pressure * 0.35 + brushHardness * 0.25;
        const grad = drawCtx.createRadialGradient(x, y, 0, x, y, r);
        const rgb = DrawingEngine.parseColor(currentColor);
        const c = rgb ? `${rgb.r},${rgb.g},${rgb.b}` : '255,20,147';
        grad.addColorStop(0, `rgba(${c},${alpha})`);
        grad.addColorStop(innerStop, `rgba(${c},${alpha * 0.7})`);
        grad.addColorStop(1, `rgba(${c},0)`);
        drawCtx.fillStyle = grad;
        drawCtx.globalAlpha = 1;
        drawCtx.beginPath();
        drawCtx.arc(x, y, r, 0, Math.PI * 2);
        drawCtx.fill();
      }

      drawCtx.restore();
    },

    drawEraserSmooth(to, pressure) {
      const from = lastSmoothed;
      if (!from) return;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) return;

      const radius = brushSize * 1.5 * (0.5 + pressure) * 0.5;
      const spacing = Math.max(1, radius * 0.25);
      const steps = Math.ceil(dist / spacing);

      drawCtx.save();
      drawCtx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        drawCtx.beginPath();
        drawCtx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
        drawCtx.fill();
      }
      drawCtx.restore();
    },

    drawGlitterStroke(pos, pressure) {
      // Spawn glitter particles along stroke
      const count = Math.ceil(3 * pressure);
      for (let i = 0; i < count; i++) {
        GlitterRenderer.spawn(
          pos.x + (Math.random() - 0.5) * brushSize * 2,
          pos.y + (Math.random() - 0.5) * brushSize * 2,
          currentColor,
          true // persistent
        );
      }
    },

    floodFill(startX, startY) {
      UndoManager.saveState();

      const w = drawCanvas.width;
      const h = drawCanvas.height;

      // Composite plate + drawing to detect boundaries
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      tempCtx.drawImage(plateCanvas, 0, 0);
      tempCtx.drawImage(drawCanvas, 0, 0);

      const imageData = tempCtx.getImageData(0, 0, w, h);
      const data = imageData.data;

      // Scale coordinates to pixel space
      const px = Math.round(startX * dpr);
      const py = Math.round(startY * dpr);

      if (px < 0 || px >= w || py < 0 || py >= h) return;

      const startIdx = (py * w + px) * 4;
      const startR = data[startIdx];
      const startG = data[startIdx + 1];
      const startB = data[startIdx + 2];
      const startA = data[startIdx + 3];

      // Parse fill color
      const fillRGB = this.parseColor(currentColor);
      if (!fillRGB) return;

      // Don't fill if clicking on same color
      if (
        Math.abs(startR - fillRGB.r) < 10 &&
        Math.abs(startG - fillRGB.g) < 10 &&
        Math.abs(startB - fillRGB.b) < 10 &&
        startA > 240
      ) return;

      const tolerance = 40;

      function colorMatch(idx) {
        return (
          Math.abs(data[idx] - startR) <= tolerance &&
          Math.abs(data[idx + 1] - startG) <= tolerance &&
          Math.abs(data[idx + 2] - startB) <= tolerance &&
          Math.abs(data[idx + 3] - startA) <= tolerance
        );
      }

      // Create output mask on the drawing canvas
      const drawData = drawCtx.getImageData(0, 0, w, h);
      const dd = drawData.data;

      const visited = new Uint8Array(w * h);
      const stack = [px, py];

      while (stack.length > 0) {
        const cy = stack.pop();
        const cx = stack.pop();

        // Scanline fill
        let left = cx;
        while (left > 0 && colorMatch(((cy * w) + left - 1) * 4) && !visited[cy * w + left - 1]) {
          left--;
        }
        let right = cx;
        while (right < w - 1 && colorMatch(((cy * w) + right + 1) * 4) && !visited[cy * w + right + 1]) {
          right++;
        }

        let checkUp = false;
        let checkDown = false;

        for (let x = left; x <= right; x++) {
          const pidx = cy * w + x;
          if (visited[pidx]) continue;
          visited[pidx] = 1;

          const didx = pidx * 4;
          dd[didx] = fillRGB.r;
          dd[didx + 1] = fillRGB.g;
          dd[didx + 2] = fillRGB.b;
          dd[didx + 3] = 255;

          // Check up
          if (cy > 0) {
            const upIdx = ((cy - 1) * w + x) * 4;
            if (colorMatch(upIdx) && !visited[(cy - 1) * w + x]) {
              if (!checkUp) {
                stack.push(x, cy - 1);
                checkUp = true;
              }
            } else {
              checkUp = false;
            }
          }

          // Check down
          if (cy < h - 1) {
            const downIdx = ((cy + 1) * w + x) * 4;
            if (colorMatch(downIdx) && !visited[(cy + 1) * w + x]) {
              if (!checkDown) {
                stack.push(x, cy + 1);
                checkDown = true;
              }
            } else {
              checkDown = false;
            }
          }
        }
      }

      drawCtx.putImageData(drawData, 0, 0);
      PersistenceManager.scheduleSave();
    },

    parseColor(hex) {
      const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if (!m) return null;
      return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    },
  };

  // ── GlitterRenderer ─────────────────────────────────────────
  const GlitterRenderer = {
    spawn(x, y, color, persistent) {
      if (particles.length >= MAX_PARTICLES) {
        // Replace oldest non-persistent or oldest
        const idx = particles.findIndex(p => !p.persistent);
        if (idx >= 0) particles.splice(idx, 1);
        else particles.shift();
      }

      const rgb = DrawingEngine.parseColor(color) || { r: 255, g: 215, b: 0 };
      particles.push({
        x, y,
        size: 1.5 + Math.random() * 3,
        opacity: 0.8 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.04,
        r: rgb.r, g: rgb.g, b: rgb.b,
        persistent,
        life: persistent ? Infinity : 2,
        age: 0,
      });

      if (!glitterRAF) this.startLoop();
    },

    startLoop() {
      let lastTime = performance.now();
      const loop = (now) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        glitterCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.age += dt;
          p.phase += p.speed;

          if (!p.persistent && p.age > p.life) {
            particles.splice(i, 1);
            continue;
          }

          // Twinkle: oscillate opacity
          const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(p.phase * 3 + now * 0.003));
          const alpha = p.opacity * twinkle;

          glitterCtx.save();
          glitterCtx.globalAlpha = alpha;
          glitterCtx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;

          // Draw sparkle: 4-pointed star
          const s = p.size * (0.8 + 0.4 * Math.sin(p.phase * 2));
          glitterCtx.translate(p.x, p.y);
          glitterCtx.rotate(p.phase);
          glitterCtx.beginPath();
          for (let j = 0; j < 4; j++) {
            const angle = (j / 4) * Math.PI * 2;
            const outerX = Math.cos(angle) * s;
            const outerY = Math.sin(angle) * s;
            const innerAngle = angle + Math.PI / 4;
            const innerX = Math.cos(innerAngle) * s * 0.3;
            const innerY = Math.sin(innerAngle) * s * 0.3;
            if (j === 0) glitterCtx.moveTo(outerX, outerY);
            else glitterCtx.lineTo(outerX, outerY);
            glitterCtx.lineTo(innerX, innerY);
          }
          glitterCtx.closePath();
          glitterCtx.fill();
          glitterCtx.restore();
        }

        if (particles.length > 0) {
          glitterRAF = requestAnimationFrame(loop);
        } else {
          glitterRAF = null;
        }
      };
      glitterRAF = requestAnimationFrame(loop);
    },

    clearAll() {
      particles = [];
      if (glitterRAF) {
        cancelAnimationFrame(glitterRAF);
        glitterRAF = null;
      }
      glitterCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    },

    getParticlesData() {
      return particles.filter(p => p.persistent).map(p => ({
        x: p.x, y: p.y, size: p.size,
        r: p.r, g: p.g, b: p.b,
        phase: p.phase, speed: p.speed,
      }));
    },

    restoreParticles(data) {
      this.clearAll();
      if (!data || !data.length) return;
      data.forEach(d => {
        particles.push({
          x: d.x, y: d.y,
          size: d.size,
          opacity: 0.8 + Math.random() * 0.2,
          phase: d.phase || Math.random() * Math.PI * 2,
          speed: d.speed || 0.03,
          r: d.r, g: d.g, b: d.b,
          persistent: true,
          life: Infinity,
          age: 0,
        });
      });
      if (particles.length > 0) this.startLoop();
    },
  };

  // ── GestureHandler ──────────────────────────────────────────
  const GestureHandler = {
    init() {
      // Listen on canvasFrame since plate sits on top with pointer-events:none
      const target = canvasFrame;

      target.addEventListener('pointerdown', this.onPointerDown.bind(this), { passive: false });
      target.addEventListener('pointermove', this.onPointerMove.bind(this), { passive: false });
      target.addEventListener('pointerup', this.onPointerUp.bind(this), { passive: false });
      target.addEventListener('pointercancel', this.onPointerUp.bind(this), { passive: false });

      // Prevent ALL default touch behavior on the entire app
      document.addEventListener('touchstart', (e) => {
        if (e.target.closest('#toolbar') || e.target.closest('#header') ||
            e.target.closest('#reward-overlay') || e.target.closest('#page-picker')) return;
        e.preventDefault();
      }, { passive: false });

      document.addEventListener('touchmove', (e) => {
        if (e.target.closest('#color-palette')) return; // allow palette scroll
        if (e.target.closest('#toolbar') || e.target.closest('#reward-overlay') ||
            e.target.closest('#page-picker')) return;
        e.preventDefault();
      }, { passive: false });

      document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
      document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    },

    onPointerDown(e) {
      e.preventDefault();
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activeTouches.size === 1) {
        gestureMode = 'draw';
        const pos = CanvasManager.pointerToCanvas(e.clientX, e.clientY);

        if (currentTool === 'fill') {
          DrawingEngine.floodFill(pos.x, pos.y);
        } else {
          const pressure = PressureSystem.get(e, pos);
          DrawingEngine.beginStroke(pos, pressure);
        }
      } else if (activeTouches.size === 2) {
        // Switch to pinch mode, cancel any draw
        if (isDrawing) {
          DrawingEngine.endStroke();
          // Undo the saveState from beginStroke since we're cancelling
          if (undoStack.length > 0) {
            const prev = undoStack.pop();
            drawCtx.putImageData(prev, 0, 0);
          }
        }
        gestureMode = 'pinch';
        const points = Array.from(activeTouches.values());
        pinchStartDist = this.distance(points[0], points[1]);
        pinchStartZoom = zoom;
        pinchStartPanX = panX;
        pinchStartPanY = panY;
        pinchMidStart = this.midpoint(points[0], points[1]);
      }
    },

    onPointerMove(e) {
      e.preventDefault();
      if (!activeTouches.has(e.pointerId)) return;
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (gestureMode === 'draw' && activeTouches.size === 1) {
        const pos = CanvasManager.pointerToCanvas(e.clientX, e.clientY);
        const pressure = PressureSystem.get(e, pos);
        DrawingEngine.continueStroke(pos, pressure);
      } else if (gestureMode === 'pinch' && activeTouches.size === 2) {
        const points = Array.from(activeTouches.values());
        const dist = this.distance(points[0], points[1]);
        const mid = this.midpoint(points[0], points[1]);

        const newZoom = Math.max(1, Math.min(5, pinchStartZoom * (dist / pinchStartDist)));
        zoom = newZoom;

        panX = pinchStartPanX + (mid.x - pinchMidStart.x) / zoom;
        panY = pinchStartPanY + (mid.y - pinchMidStart.y) / zoom;

        CanvasManager.applyTransform();
      }
    },

    onPointerUp(e) {
      e.preventDefault();
      const touchCount = activeTouches.size;
      activeTouches.delete(e.pointerId);

      if (gestureMode === 'draw') {
        DrawingEngine.endStroke();
      } else if (gestureMode === 'pinch' && activeTouches.size === 0) {
        // Two-finger tap = undo (if pinch distance was small)
        if (touchCount === 2 && Math.abs(zoom - pinchStartZoom) < 0.05) {
          UndoManager.undo();
        }
      }

      if (activeTouches.size === 0) {
        gestureMode = null;
      }
    },

    distance(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    },

    midpoint(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    },
  };

  // ── PlateManager ────────────────────────────────────────────
  const PlateManager = {
    imageCache: {},

    async loadPlate(pageNum) {
      const plate = PLATES[pageNum - 1];
      if (!plate) return null;

      if (this.imageCache[pageNum]) return this.imageCache[pageNum];

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.imageCache[pageNum] = img;
          resolve(img);
        };
        img.onerror = () => {
          console.warn('Failed to load plate:', plate.file);
          resolve(null);
        };
        img.src = `assets/plates/${plate.file}`;
      });
    },

    async renderCurrent() {
      const img = await this.loadPlate(currentPage);
      plateImage = img;
      plateCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      if (img) {
        // Draw plate image to fill canvas, maintaining aspect ratio
        const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (CANVAS_W - w) / 2;
        const y = (CANVAS_H - h) / 2;
        plateCtx.drawImage(img, x, y, w, h);
      } else {
        // Placeholder for missing plate
        plateCtx.fillStyle = '#FFF0F5';
        plateCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        plateCtx.strokeStyle = '#FFB6C1';
        plateCtx.lineWidth = 3;
        plateCtx.strokeRect(20, 20, CANVAS_W - 40, CANVAS_H - 40);
        plateCtx.fillStyle = '#FF69B4';
        plateCtx.font = 'bold 28px -apple-system, sans-serif';
        plateCtx.textAlign = 'center';
        plateCtx.fillText(PLATES[currentPage - 1].title, CANVAS_W / 2, CANVAS_H / 2 - 20);
        plateCtx.font = '18px -apple-system, sans-serif';
        plateCtx.fillText(`Plate ${currentPage}`, CANVAS_W / 2, CANVAS_H / 2 + 20);
      }

      this.updateHeader();
    },

    updateHeader() {
      const plate = PLATES[currentPage - 1];
      pageNumber.textContent = `${currentPage} / ${PLATES.length}`;
      plateTitle.textContent = plate.title;
    },

    preloadAll() {
      Promise.all(
        PLATES.map((_, i) => this.loadPlate(i + 1))
      );
    },

    async goToPage(pageNum) {
      if (pageNum < 1 || pageNum > PLATES.length) return;

      // Save current page
      PersistenceManager.saveDrawing();

      // Page flip animation
      canvasFrame.classList.add('page-flip');
      await new Promise(r => setTimeout(r, 300));

      currentPage = pageNum;
      CanvasManager.resetTransform();
      UndoManager.clear();

      // Clear and re-render
      drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      GlitterRenderer.clearAll();
      await this.renderCurrent();
      PersistenceManager.restoreDrawing();
      PersistenceManager.saveState();

      canvasFrame.classList.remove('page-flip');
    },
  };

  // ── PersistenceManager ──────────────────────────────────────
  const PersistenceManager = {
    saveState() {
      try {
        const state = {
          currentPage,
          completedPages: Array.from(completedPages),
        };
        localStorage.setItem('valentine_state', JSON.stringify(state));
      } catch (e) { /* quota exceeded — ignore */ }
    },

    restoreState() {
      try {
        const raw = localStorage.getItem('valentine_state');
        if (!raw) return;
        const state = JSON.parse(raw);
        currentPage = state.currentPage || 1;
        completedPages = new Set(state.completedPages || []);
      } catch (e) { /* corrupt data — ignore */ }
    },

    saveDrawing() {
      try {
        // Save drawing canvas as data URL
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = drawCanvas.width;
        tempCanvas.height = drawCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(drawCanvas, 0, 0);
        const dataURL = tempCanvas.toDataURL('image/png');
        localStorage.setItem(`valentine_draw_${currentPage}`, dataURL);

        // Save glitter particles
        const glitterData = GlitterRenderer.getParticlesData();
        if (glitterData.length > 0) {
          localStorage.setItem(`valentine_glitter_${currentPage}`, JSON.stringify(glitterData));
        }
      } catch (e) { /* quota exceeded */ }
    },

    restoreDrawing() {
      try {
        const dataURL = localStorage.getItem(`valentine_draw_${currentPage}`);
        if (dataURL) {
          const img = new Image();
          img.onload = () => {
            drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            drawCtx.drawImage(img, 0, 0);
            drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          };
          img.src = dataURL;
        }

        // Restore glitter
        const glitterRaw = localStorage.getItem(`valentine_glitter_${currentPage}`);
        if (glitterRaw) {
          GlitterRenderer.restoreParticles(JSON.parse(glitterRaw));
        }
      } catch (e) { /* corrupt data */ }
    },

    scheduleSave() {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        this.saveDrawing();
      }, AUTOSAVE_MS);
    },
  };

  // ── RewardSystem ────────────────────────────────────────────
  const RewardSystem = {
    sealPage() {
      const alreadySealed = completedPages.has(currentPage);
      if (!alreadySealed) {
        completedPages.add(currentPage);
        PersistenceManager.saveDrawing();
        PersistenceManager.saveState();
      }

      const isFinal = currentPage === PLATES.length;
      if (alreadySealed && !isFinal) {
        // Already sealed — just advance to next page
        PlateManager.goToPage(currentPage + 1);
        return;
      }

      this.showReward(isFinal);
    },

    showReward(isFinal) {
      const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];

      if (isFinal) {
        rewardText.innerHTML = `${praise}<br>All cards complete!<br>Happy Valentine's Day,<br>Valentina!`;
        rewardOverlay.classList.add('celebrating');
        rewardDownload.classList.remove('hidden');
        rewardContinue.textContent = 'View Cards';
      } else {
        rewardText.textContent = praise;
        rewardDownload.classList.add('hidden');
        rewardContinue.textContent = 'Next Page';
        rewardOverlay.classList.remove('celebrating');
      }

      rewardOverlay.classList.remove('hidden');
      this.spawnRewardParticles();
      this.spawnFloatingHearts();
    },

    hideReward() {
      rewardOverlay.classList.add('hidden');
      rewardOverlay.classList.remove('celebrating');
      rewardSparkles.innerHTML = '';
    },

    spawnRewardParticles() {
      rewardSparkles.innerHTML = '';
      const colors = ['#FF1493', '#FF69B4', '#FFD700', '#DA70D6', '#FF6347', '#ADFF2F'];
      for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        el.className = 'sparkle-particle';
        el.style.left = (30 + Math.random() * 40) + '%';
        el.style.top = (30 + Math.random() * 40) + '%';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDelay = (Math.random() * 0.5) + 's';
        el.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
        rewardSparkles.appendChild(el);
      }
    },

    spawnFloatingHearts() {
      const hearts = ['❤️', '💕', '💖', '💗', '✨', '⭐', '🌟'];
      for (let i = 0; i < 12; i++) {
        const el = document.createElement('div');
        el.className = 'float-heart';
        el.textContent = hearts[Math.floor(Math.random() * hearts.length)];
        el.style.left = (10 + Math.random() * 80) + '%';
        el.style.bottom = '-20px';
        el.style.animationDelay = (Math.random() * 1.5) + 's';
        el.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
        rewardSparkles.appendChild(el);
      }
    },
  };

  // ── ExportManager ───────────────────────────────────────────
  const ExportManager = {
    compositeCurrentPage() {
      const exportScale = Math.max(dpr, 2);
      const w = CANVAS_W * exportScale;
      const h = CANVAS_H * exportScale;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);

      // Draw plate
      ctx.drawImage(plateCanvas, 0, 0, w, h);
      // Draw user drawing
      ctx.drawImage(drawCanvas, 0, 0, w, h);
      // Draw glitter (snapshot)
      ctx.drawImage(glitterCanvas, 0, 0, w, h);

      // Valentine frame overlay
      ctx.strokeStyle = '#FF69B4';
      ctx.lineWidth = 8 * exportScale;
      this.drawHeartBorder(ctx, w, h, 6 * exportScale);

      return canvas;
    },

    drawHeartBorder(ctx, w, h, inset) {
      ctx.save();
      ctx.strokeStyle = '#FF69B4';
      ctx.lineWidth = 4;
      const r = 12;
      ctx.beginPath();
      ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, r);
      ctx.stroke();

      // Corner hearts
      const heartSize = 16;
      const positions = [
        [inset + 8, inset + 8],
        [w - inset - 8, inset + 8],
        [inset + 8, h - inset - 8],
        [w - inset - 8, h - inset - 8],
      ];
      ctx.fillStyle = '#FF69B4';
      positions.forEach(([cx, cy]) => {
        this.drawMiniHeart(ctx, cx, cy, heartSize);
      });
      ctx.restore();
    },

    drawMiniHeart(ctx, cx, cy, size) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(0, size * 0.3);
      ctx.bezierCurveTo(-size * 0.5, -size * 0.3, -size, size * 0.1, 0, size);
      ctx.bezierCurveTo(size, size * 0.1, size * 0.5, -size * 0.3, 0, size * 0.3);
      ctx.fill();
      ctx.restore();
    },

    async downloadPage() {
      const canvas = this.compositeCurrentPage();
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const title = PLATES[currentPage - 1].title.replace(/\s+/g, '_');
      const filename = `Valentina_${title}.png`;

      if (navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Valentine Card' });
            return;
          }
        } catch (e) { /* fall through to download */ }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    async downloadCollage() {
      const cols = 5;
      const rows = 2;
      const tileW = CANVAS_W * 2;
      const tileH = CANVAS_H * 2;
      const gap = 20;

      const totalW = cols * tileW + (cols + 1) * gap;
      const totalH = rows * tileH + (rows + 1) * gap + 80;

      const canvas = document.createElement('canvas');
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d');

      // Background
      const grad = ctx.createLinearGradient(0, 0, totalW, totalH);
      grad.addColorStop(0, '#FFB6C1');
      grad.addColorStop(0.5, '#FF69B4');
      grad.addColorStop(1, '#DDA0DD');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, totalW, totalH);

      // Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${48}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText("Valentina's Valentine Cards", totalW / 2, 55);

      // Save current page drawing first
      PersistenceManager.saveDrawing();

      // For each page, load and composite
      const savedPage = currentPage;
      for (let i = 0; i < PLATES.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gap + col * (tileW + gap);
        const y = 80 + gap + row * (tileH + gap);

        // Temporarily switch to page to composite
        currentPage = i + 1;
        await PlateManager.renderCurrent();
        PersistenceManager.restoreDrawing();

        // Wait for image to load
        await new Promise(r => setTimeout(r, 100));

        const tile = this.compositeCurrentPage();
        ctx.drawImage(tile, x, y, tileW, tileH);

        // Border around tile
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, tileW, tileH);
      }

      // Restore original page
      currentPage = savedPage;
      await PlateManager.renderCurrent();
      PersistenceManager.restoreDrawing();

      // Download
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Valentina_All_Valentine_Cards.png';
      a.click();
      URL.revokeObjectURL(url);
    },
  };

  // ── Page Picker ─────────────────────────────────────────────
  function buildPagePicker() {
    pageGrid.innerHTML = '';
    PLATES.forEach((plate, i) => {
      const num = i + 1;
      const div = document.createElement('div');
      div.className = 'page-thumb';
      if (num === currentPage) div.classList.add('current');
      if (completedPages.has(num)) div.classList.add('completed');

      div.innerHTML = `
        <span class="thumb-number">${num}</span>
        <span class="thumb-title">${plate.title}</span>
      `;

      div.addEventListener('click', () => {
        pagePicker.classList.add('hidden');
        PlateManager.goToPage(num);
      });

      pageGrid.appendChild(div);
    });

    // Show download-all button if all completed
    if (completedPages.size === PLATES.length) {
      btnDownloadAll.classList.remove('hidden');
    } else {
      btnDownloadAll.classList.add('hidden');
    }
  }

  // ── UI Wiring ───────────────────────────────────────────────
  function initUI() {
    // Color palette
    $$('.color-swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        $$('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        currentColor = swatch.dataset.color;
      });
    });

    // Tool buttons
    $$('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;

        // Show/hide size & hardness controls for relevant tools
        const sizeControl = $('#size-control');
        if (currentTool === 'fill') {
          sizeControl.style.display = 'none';
          hardnessControl.style.display = 'none';
        } else {
          sizeControl.style.display = 'flex';
          // Show hardness for brush and glitter, hide for eraser
          hardnessControl.style.display = (currentTool === 'eraser') ? 'none' : 'flex';
        }
      });
    });

    // Brush size
    brushSizeInput.addEventListener('input', () => {
      brushSize = parseInt(brushSizeInput.value);
      sizeValue.textContent = brushSize;
    });

    // Brush hardness
    brushHardnessInput.addEventListener('input', () => {
      brushHardness = parseInt(brushHardnessInput.value) / 100;
    });

    // Undo/redo
    btnUndo.addEventListener('click', () => UndoManager.undo());
    btnRedo.addEventListener('click', () => UndoManager.redo());

    // Seal
    btnSeal.addEventListener('click', () => RewardSystem.sealPage());

    // Reward overlay
    rewardContinue.addEventListener('click', () => {
      RewardSystem.hideReward();
      if (currentPage < PLATES.length) {
        PlateManager.goToPage(currentPage + 1);
      } else {
        // Final page — show page picker
        buildPagePicker();
        pagePicker.classList.remove('hidden');
      }
    });

    rewardDownload.addEventListener('click', () => {
      ExportManager.downloadPage();
    });

    // Header buttons
    btnBack.addEventListener('click', () => {
      if (currentPage > 1) PlateManager.goToPage(currentPage - 1);
    });

    btnMenu.addEventListener('click', () => {
      buildPagePicker();
      pagePicker.classList.remove('hidden');
    });

    // Page picker
    pickerClose.addEventListener('click', () => {
      pagePicker.classList.add('hidden');
    });

    btnDownloadAll.addEventListener('click', () => {
      pagePicker.classList.add('hidden');
      ExportManager.downloadCollage();
    });

    // Keyboard shortcuts (for desktop testing)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        UndoManager.undo();
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        UndoManager.redo();
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      PersistenceManager.saveDrawing();
      CanvasManager.resize();
    });

    UndoManager.updateButtons();
  }

  // ── IOSInstallHint (inline in page picker) ─────────────────
  const IOSInstallHint = {
    isIOS() {
      return /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
    },

    isStandalone() {
      return window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;
    },

    init() {
      if (!this.isIOS() || this.isStandalone()) return;
      const hint = $('#btn-install-app');
      if (hint) hint.classList.remove('hidden');
    },
  };

  // ── Boot ────────────────────────────────────────────────────
  async function init() {
    PersistenceManager.restoreState();
    CanvasManager.resize();
    GestureHandler.init();
    initUI();
    await PlateManager.renderCurrent();
    PersistenceManager.restoreDrawing();
    PlateManager.preloadAll();
    IOSInstallHint.init();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
