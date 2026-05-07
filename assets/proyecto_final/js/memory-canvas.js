// ============================================================
// CANVAS SETUP
// ============================================================
var replaceCanvas = null;
var replaceCtx    = null;

var FRAME_W   = 80;
var FRAME_H   = 50;
var FRAME_GAP = 8;
var REF_H     = 40;
var PADDING   = 20;

var replaceAnimState = {
  anim    : null,
  phase   : null,   // 'fault-out' | 'fault-in' | 'hit' | null
  progress: 0
};

function initReplaceCanvas() {
  replaceCanvas = document.getElementById("replace-canvas");
  if (!replaceCanvas) return;
  replaceCtx = replaceCanvas.getContext("2d");
}

function resetReplaceCanvas() {
  if (replaceAnimState.anim) {
    cancelAnimationFrame(replaceAnimState.anim);
    replaceAnimState.anim = null;
  }
  replaceAnimState.phase    = null;
  replaceAnimState.progress = 0;
  if (replaceCtx) replaceCtx.clearRect(0, 0, replaceCanvas.width, replaceCanvas.height);
}

// ============================================================
// UTILIDAD
// ============================================================
function roundRectReplace(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================================
// DIBUJO ESTATICO
// ============================================================
function drawReplaceStatic(frames, references, currentRefIdx, replacedIdx, phase, animProgress) {
  if (!replaceCanvas || !replaceCtx) return;

  var numFrames  = frames.length;
  var numRefs    = references.length;
  var totalW     = PADDING * 2 + numFrames * (FRAME_W + FRAME_GAP) - FRAME_GAP;
  var totalH     = PADDING + REF_H + PADDING + FRAME_H + PADDING;

  replaceCanvas.width  = Math.max(totalW, 400);
  replaceCanvas.height = totalH;
  replaceCtx.clearRect(0, 0, replaceCanvas.width, replaceCanvas.height);

  // ── Referencias encima ──────────────────────────────────
  var refStartX = PADDING;
  var refY      = PADDING;

  // Mostrar ventana de referencias centrada en la actual
  var windowSize = numFrames + 2;
  var startRef   = Math.max(0, currentRefIdx - Math.floor(windowSize / 2));
  var endRef     = Math.min(numRefs, startRef + windowSize);

  for (var ri = startRef; ri < endRef; ri++) {
    var relIdx = ri - startRef;
    var rx     = refStartX + relIdx * (FRAME_W + FRAME_GAP);
    var isCurrent = ri === currentRefIdx;

    // Fondo referencia
    replaceCtx.fillStyle   = isCurrent ? "#ffd400" : "#333";
    replaceCtx.strokeStyle = isCurrent ? "#ff9a00" : "#555";
    replaceCtx.lineWidth   = isCurrent ? 2 : 1;
    roundRectReplace(replaceCtx, rx, refY, FRAME_W, REF_H - 8, 6);
    replaceCtx.fill();
    replaceCtx.stroke();

    // Número de referencia
    replaceCtx.fillStyle    = isCurrent ? "#000" : "#aaa";
    replaceCtx.font         = isCurrent ? "bold 16px Arial" : "14px Arial";
    replaceCtx.textAlign    = "center";
    replaceCtx.textBaseline = "middle";
    replaceCtx.fillText(pageLabel(references[ri]), rx + FRAME_W / 2, refY + (REF_H - 8) / 2);

    // Flecha apuntando al frame area si es current
    if (isCurrent) {
      replaceCtx.fillStyle = "#ffd400";
      replaceCtx.beginPath();
      var arrowX = rx + FRAME_W / 2;
      var arrowY = refY + REF_H - 8;
      replaceCtx.moveTo(arrowX - 8, arrowY);
      replaceCtx.lineTo(arrowX + 8, arrowY);
      replaceCtx.lineTo(arrowX, arrowY + 10);
      replaceCtx.closePath();
      replaceCtx.fill();
    }
  }

  // ── Frames ──────────────────────────────────────────────
  var framesY = PADDING + REF_H + PADDING;

  frames.forEach(function(page, i) {
    var fx      = PADDING + i * (FRAME_W + FRAME_GAP);
    var isEmpty = page === null;
    var isReplaced = i === replacedIdx;

    var bgColor, borderColor, textColor, offsetY;
    offsetY = 0;

    if (isReplaced && phase === "fault-out") {
      // Saliendo: rojo, se mueve hacia abajo
      bgColor     = "#ff4d4d";
      borderColor = "#cc0000";
      textColor   = "#fff";
      offsetY     = animProgress * 20;
    } else if (isReplaced && phase === "fault-in") {
      // Entrando: verde, viene de arriba
      bgColor     = "#7cff00";
      borderColor = "#44aa00";
      textColor   = "#000";
      offsetY     = (1 - animProgress) * -20;
    } else if (isReplaced && phase === "hit") {
      // Hit: resaltar en amarillo brevemente
      bgColor     = "#ffd400";
      borderColor = "#ff9a00";
      textColor   = "#000";
    } else if (isEmpty) {
      bgColor     = "#222";
      borderColor = "#444";
      textColor   = "#666";
    } else {
      bgColor     = "#1a1a2e";
      borderColor = "#555";
      textColor   = "#fff";
    }

    // Sombra si activo
    if (isReplaced && phase) {
      replaceCtx.shadowColor   = isReplaced && phase === "fault-out" ? "rgba(255,77,77,0.5)" : "rgba(124,255,0,0.5)";
      replaceCtx.shadowBlur    = 12;
      replaceCtx.shadowOffsetX = 0;
      replaceCtx.shadowOffsetY = 0;
    }

    replaceCtx.fillStyle   = bgColor;
    replaceCtx.strokeStyle = borderColor;
    replaceCtx.lineWidth   = isReplaced && phase ? 3 : 1.5;
    roundRectReplace(replaceCtx, fx, framesY + offsetY, FRAME_W, FRAME_H, 8);
    replaceCtx.fill();
    replaceCtx.stroke();

    replaceCtx.shadowColor = "transparent";
    replaceCtx.shadowBlur  = 0;

    // Frame index
    replaceCtx.fillStyle    = "#555";
    replaceCtx.font         = "9px Arial";
    replaceCtx.textAlign    = "left";
    replaceCtx.textBaseline = "top";
    replaceCtx.fillText("F" + i, fx + 4, framesY + offsetY + 3);

    // Contenido del frame
    replaceCtx.fillStyle    = textColor;
    replaceCtx.font         = isEmpty ? "12px Arial" : "bold 18px Arial";
    replaceCtx.textAlign    = "center";
    replaceCtx.textBaseline = "middle";
    replaceCtx.fillText(
      isEmpty ? "libre" : pageLabel(page),
      fx + FRAME_W / 2,
      framesY + offsetY + FRAME_H / 2
    );
  });
}

// ============================================================
// ANIMACION DE REEMPLAZO
// ============================================================
function animateReplace(frames, references, currentRefIdx, replacedIdx, isFault, onComplete) {
  if (replaceAnimState.anim) {
    cancelAnimationFrame(replaceAnimState.anim);
    replaceAnimState.anim = null;
  }

  if (!isFault) {
    // Hit: resaltar brevemente y terminar
    var hitStart = null;
    var hitDuration = 300;

    function drawHit(ts) {
      if (!hitStart) hitStart = ts;
      var progress = Math.min((ts - hitStart) / hitDuration, 1);
      drawReplaceStatic(frames, references, currentRefIdx, replacedIdx, "hit", progress);
      if (progress < 1) {
        replaceAnimState.anim = requestAnimationFrame(drawHit);
      } else {
        replaceAnimState.anim = null;
        drawReplaceStatic(frames, references, currentRefIdx, null, null, 0);
        if (onComplete) onComplete();
      }
    }
    replaceAnimState.anim = requestAnimationFrame(drawHit);
    return;
  }

  // Page fault: fase out → fase in
  var speed       = parseInt(document.getElementById("replace-speed").value);
  var duration    = speed * 0.4;
  var startTime   = null;
  var framesCopy  = frames.slice();

  // Fase out
  function drawOut(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    drawReplaceStatic(framesCopy, references, currentRefIdx, replacedIdx, "fault-out", progress);

    if (progress < 1) {
      replaceAnimState.anim = requestAnimationFrame(drawOut);
    } else {
      replaceAnimState.anim = null;
      startTime = null;
      replaceAnimState.anim = requestAnimationFrame(drawIn);
    }
  }

  // Fase in
  function drawIn(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    drawReplaceStatic(frames, references, currentRefIdx, replacedIdx, "fault-in", progress);

    if (progress < 1) {
      replaceAnimState.anim = requestAnimationFrame(drawIn);
    } else {
      replaceAnimState.anim = null;
      drawReplaceStatic(frames, references, currentRefIdx, null, null, 0);
      if (onComplete) onComplete();
    }
  }

  replaceAnimState.anim = requestAnimationFrame(drawOut);
}

// ============================================================
// RENDER SECUENCIA DE REFERENCIAS
// ============================================================
function renderReplaceStep(stepData, onComplete) {
  animateReplace(
    stepData.frames,
    stepData.references,
    stepData.refIdx,
    stepData.replacedIdx,
    stepData.fault,
    onComplete
  );
}
