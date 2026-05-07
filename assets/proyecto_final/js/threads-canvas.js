// ============================================================
// CANVAS SETUP
// ============================================================
var threadGanttCanvas = null;
var threadGanttCtx    = null;

var threadAnimState = {
  blockAnim: null
};

var T_GANTT_H = 30;
var T_TICK_H  = 20;
var T_LABEL_W = 80;

function initThreadCanvases() {
  threadGanttCanvas = document.getElementById("thread-gantt-canvas");
  if (!threadGanttCanvas) return;
  threadGanttCtx = threadGanttCanvas.getContext("2d");
}

function resetThreadCanvases() {
  if (threadAnimState.blockAnim) {
    cancelAnimationFrame(threadAnimState.blockAnim);
    threadAnimState.blockAnim = null;
  }
  if (threadGanttCtx) {
    threadGanttCtx.clearRect(0, 0, threadGanttCanvas.width, threadGanttCanvas.height);
  }
}

// ============================================================
// CALCULAR BLOCK WIDTH PROPORCIONAL
// ============================================================
function calcThreadBlockW(timeline) {
  var totalTime = timeline.length > 0 ? timeline[timeline.length - 1].end : 1;
  var container = document.getElementById("thread-gantt-scroll");
  var available = container ? container.clientWidth - T_LABEL_W - 20 : 500;
  var computed  = available / totalTime;
  return Math.min(60, Math.max(1, computed));
}

// ============================================================
// GANTT MULTICORE ESTATICO
// ============================================================
function drawThreadGanttStatic(timeline, upToStep) {
  if (!threadGanttCanvas || !threadGanttCtx) return;

  var numCores  = threadState.numCores;
  var bw        = calcThreadBlockW(timeline);
  var visible   = timeline.slice(0, upToStep);
  var totalTime = timeline.length > 0 ? timeline[timeline.length - 1].end : 0;

  threadGanttCanvas.width  = Math.max(T_LABEL_W + totalTime * bw + bw, 400);
  threadGanttCanvas.height = T_TICK_H + numCores * (T_GANTT_H + 2) + 10;

  threadGanttCtx.clearRect(0, 0, threadGanttCanvas.width, threadGanttCanvas.height);

  // Labels de cores
  for (var c = 0; c < numCores; c++) {
    var cy = T_TICK_H + c * (T_GANTT_H + 2) + T_GANTT_H / 2;
    threadGanttCtx.fillStyle    = "#333";
    threadGanttCtx.font         = "bold 11px Arial";
    threadGanttCtx.textAlign    = "right";
    threadGanttCtx.textBaseline = "middle";
    threadGanttCtx.fillText("Core " + c, T_LABEL_W - 6, cy);

    // Fondo de fila
    threadGanttCtx.fillStyle = c % 2 === 0 ? "#f9f9f9" : "#f0f0f0";
    threadGanttCtx.fillRect(T_LABEL_W, T_TICK_H + c * (T_GANTT_H + 2), totalTime * bw, T_GANTT_H);
  }

  // Bloques
  visible.forEach(function(block) {
    var isFork = block.isFork || false;
    console.log(block.label, "isFork:", block.isFork);
    var x     = T_LABEL_W + block.start * bw;
    var w     = (block.end - block.start) * bw;
    var y     = T_TICK_H + block.coreId * (T_GANTT_H + 2);
    var color = getThreadColor(block.pid, block.tid);

    threadGanttCtx.fillStyle   = color;
    threadGanttCtx.strokeStyle = "#000";
    threadGanttCtx.lineWidth   = 1;

    // Fork usa patron rayado, thread es solido
    if (block.isFork) {
      threadGanttCtx.fillRect(x, y, w, T_GANTT_H);
      threadGanttCtx.save();
      threadGanttCtx.beginPath();
      threadGanttCtx.rect(x, y, w, T_GANTT_H);
      threadGanttCtx.clip();
      threadGanttCtx.strokeStyle = "rgba(0,0,0,0.3)";
      threadGanttCtx.lineWidth   = 2;
      for (var d = -T_GANTT_H; d < w + T_GANTT_H; d += 6) {
        threadGanttCtx.beginPath();
        threadGanttCtx.moveTo(x + d, y);
        threadGanttCtx.lineTo(x + d + T_GANTT_H, y + T_GANTT_H);
        threadGanttCtx.stroke();
      }
      threadGanttCtx.restore();
      threadGanttCtx.strokeStyle = "#000";
      threadGanttCtx.lineWidth   = 1;
      threadGanttCtx.strokeRect(x, y, w, T_GANTT_H);
    } else {
      threadGanttCtx.fillRect(x, y, w, T_GANTT_H);
      threadGanttCtx.strokeRect(x, y, w, T_GANTT_H);
    }

    if (w > 24) {
      threadGanttCtx.fillStyle    = "#000";
      threadGanttCtx.font         = "10px Arial";
      threadGanttCtx.textAlign    = "center";
      threadGanttCtx.textBaseline = "middle";
      threadGanttCtx.fillText(block.label, x + w / 2, y + T_GANTT_H / 2);
    }
  });

  // Ticks de tiempo
  var ticks = new Set();
  visible.forEach(function(b) { ticks.add(b.start); ticks.add(b.end); });
  Array.from(ticks).sort(function(a, b) { return a - b; }).forEach(function(t) {
    var tx = T_LABEL_W + t * bw;
    threadGanttCtx.fillStyle    = "#555";
    threadGanttCtx.font         = "10px Arial";
    threadGanttCtx.textAlign    = "center";
    threadGanttCtx.textBaseline = "bottom";
    threadGanttCtx.fillText(parseFloat(t.toFixed(2)), tx, T_TICK_H - 2);

    threadGanttCtx.strokeStyle = "#ccc";
    threadGanttCtx.lineWidth   = 1;
    threadGanttCtx.beginPath();
    threadGanttCtx.moveTo(tx, T_TICK_H);
    threadGanttCtx.lineTo(tx, threadGanttCanvas.height);
    threadGanttCtx.stroke();
  });
}

// ============================================================
// ANIMACION GANTT MULTICORE
// ============================================================
function animateThreadBlock(timeline, upToStep, onComplete) {
  if (threadAnimState.blockAnim) {
    cancelAnimationFrame(threadAnimState.blockAnim);
    threadAnimState.blockAnim = null;
  }

  var block     = timeline[upToStep - 1];
  var bw        = calcThreadBlockW(timeline);
  var targetW   = (block.end - block.start) * bw;
  var startX    = T_LABEL_W + block.start * bw;
  var startY    = T_TICK_H + block.coreId * (T_GANTT_H + 2);
  var color     = getThreadColor(block.pid, block.tid);
  var startTime = null;
  var speed     = 2100 - parseInt(document.getElementById("thread-speed").value);
  var duration  = speed * 0.6;

  function draw(ts) {
    if (!startTime) startTime = ts;
    var elapsed  = ts - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased    = 1 - Math.pow(1 - progress, 3);
    var currentW = targetW * eased;

    drawThreadGanttStatic(timeline, upToStep - 1);

    threadGanttCtx.fillStyle   = color;
    threadGanttCtx.strokeStyle = "#2a2";
    threadGanttCtx.lineWidth   = 2;
    threadGanttCtx.fillRect(startX, startY, currentW, T_GANTT_H);
    threadGanttCtx.strokeRect(startX, startY, currentW, T_GANTT_H);

    if (currentW > 24) {
      threadGanttCtx.fillStyle    = "#000";
      threadGanttCtx.font         = "10px Arial";
      threadGanttCtx.textAlign    = "center";
      threadGanttCtx.textBaseline = "middle";
      threadGanttCtx.fillText(block.label, startX + currentW / 2, startY + T_GANTT_H / 2);
    }

    if (progress < 1) {
      threadAnimState.blockAnim = requestAnimationFrame(draw);
    } else {
      threadAnimState.blockAnim = null;
      drawThreadGanttStatic(timeline, upToStep);
      if (onComplete) onComplete();
    }
  }

  threadAnimState.blockAnim = requestAnimationFrame(draw);
}

function renderThreadGantt(timeline, upToStep, onComplete) {
  if (!threadGanttCanvas) return;
  if (upToStep === 0) {
    threadGanttCtx.clearRect(0, 0, threadGanttCanvas.width, threadGanttCanvas.height);
    if (onComplete) onComplete();
    return;
  }
  animateThreadBlock(timeline, upToStep, onComplete);
}
