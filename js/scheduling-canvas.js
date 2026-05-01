// ── Codigo De TABS ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  var container = document.querySelector("#casos-quiz");
  if (!container) return;
  var buttons = container.querySelectorAll(".tab-btn");
  var panels = container.querySelectorAll(".tab-panel");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-tab");
      buttons.forEach(function (b) {
        b.classList.remove("active");
      });
      panels.forEach(function (p) {
        p.classList.remove("active");
      });
      btn.classList.add("active");
      container.querySelector("#" + target)
        .classList.add("active");
    });
  });

  if (buttons.length > 0) buttons[0].click();
});

// CANVAS SETUP ============================================================
var ganttCanvas   = null;
var ganttCtx      = null;
var queueCanvas   = null;
var queueCtx      = null;
var runningCanvas = null;
var runningCtx    = null;

var animState = {
  blockAnim : null,
  queueAnim : null
};

var GANTT_H  = 40;
var TICK_H   = 20;
var QUEUE_H  = 60;
var RUN_H    = 70;
var CHIP_W   = 60;
var CHIP_H   = 36;
var CHIP_GAP = 10;

function calcBlockW(timeline) {
  var container  = document.getElementById("gantt-scroll");
  var available  = container ? container.clientWidth - 20 : 600;
  var numBlocks  = timeline.length;
  var totalTime  = timeline.length > 0 ? timeline[timeline.length - 1].end : 1;

  // Si el tiempo total es grande, escalar por bloques
  if (totalTime > available) {
    var byBlocks = Math.floor(available / numBlocks);
    return Math.min(60, Math.max(30, byBlocks));
  }

  // Si el tiempo total cabe, escalar por unidades de tiempo
  var byTime = Math.floor(available / totalTime);
  return Math.min(60, Math.max(20, byTime));
}

function calcBlockWForBlock(block, timeline) {
  var container  = document.getElementById("gantt-scroll");
  var available  = container ? container.clientWidth - 20 : 600;
  var totalTime  = timeline[timeline.length - 1].end;
  var blockTime  = block.end - block.start;
  return Math.max(30, Math.floor((blockTime / totalTime) * available));
}

function initCanvases() {
  ganttCanvas   = document.getElementById("gantt-canvas");
  ganttCtx      = ganttCanvas.getContext("2d");
  queueCanvas   = document.getElementById("queue-canvas");
  queueCtx      = queueCanvas.getContext("2d");
  runningCanvas = document.getElementById("running-canvas");
  runningCtx    = runningCanvas.getContext("2d");
}

// ============================================================
// COLORES
// ============================================================
var pidColors = [
  "#00d4ff", // cyan
  "#00ffb3", // aqua green
  "#7cff00", // lime
  "#ffd400", // yellow
  "#ff9a00", // orange
  "#ff5cc8", // pink
  "#9b6cff", // purple
  "#ff4d4d"  // red
];
function getColor(pid) {
  return pidColors[(pid - 1) % pidColors.length];
}

// ============================================================
// UTILIDAD - roundRect
// ============================================================
function roundRect(ctx, x, y, w, h, r) {
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
// GANTT - dibujo estatico
// ============================================================
function drawGanttStatic(timeline, upToStep) {
  var visible   = timeline.slice(0, upToStep);
  var container = document.getElementById("gantt-scroll");
  var available = container ? container.clientWidth - 20 : 600;
  var totalTime = timeline.length > 0 ? timeline[timeline.length - 1].end : 1;

  // Calcular posicion x acumulada proporcionalmente
  var positions = [];
  var xCursor   = 0;
  timeline.forEach(function(block) {
    var w = Math.max(30, Math.floor(((block.end - block.start) / totalTime) * available));
    positions.push({ x: xCursor, w: w });
    xCursor += w;
  });

  ganttCanvas.width  = Math.max(xCursor + 10, 400);
  ganttCanvas.height = TICK_H + GANTT_H;
  ganttCtx.clearRect(0, 0, ganttCanvas.width, ganttCanvas.height);

  visible.forEach(function(block, i) {
    var pos   = positions[i];
    var color = getColor(block.pid);

    ganttCtx.fillStyle   = color;
    ganttCtx.strokeStyle = "#000";
    ganttCtx.lineWidth   = 2;
    ganttCtx.fillRect(pos.x, TICK_H, pos.w, GANTT_H);
    ganttCtx.strokeRect(pos.x, TICK_H, pos.w, GANTT_H);

    if (pos.w > 20) {
      ganttCtx.fillStyle    = "#000";
      ganttCtx.font         = "bold 13px Arial";
      ganttCtx.textAlign    = "center";
      ganttCtx.textBaseline = "middle";
      ganttCtx.fillText("P" + block.pid, pos.x + pos.w / 2, TICK_H + GANTT_H / 2);
    }

    ganttCtx.fillStyle    = "#fff";
    ganttCtx.font         = "11px Arial";
    ganttCtx.textAlign    = "left";
    ganttCtx.textBaseline = "top";
    ganttCtx.fillText(block.start, pos.x, 2);
  });

  if (visible.length > 0) {
    var last    = visible[visible.length - 1];
    var lastPos = positions[visible.length - 1];
    ganttCtx.fillStyle    = "#fff";
    ganttCtx.font         = "11px Arial";
    ganttCtx.textAlign    = "left";
    ganttCtx.textBaseline = "top";
    ganttCtx.fillText(last.end, lastPos.x + lastPos.w, 2);
  }
}

// ============================================================
// GANTT - animacion bloque creciendo
// ============================================================
function animateGanttBlock(timeline, upToStep, onComplete) {
  if (animState.blockAnim) {
    cancelAnimationFrame(animState.blockAnim);
    animState.blockAnim = null;
  }

  var container = document.getElementById("gantt-scroll");
  var available = container ? container.clientWidth - 20 : 600;
  var totalTime = timeline[timeline.length - 1].end;

  // Calcular posiciones proporcionales
  var positions = [];
  var xCursor   = 0;
  timeline.forEach(function(block) {
    var w = Math.max(30, Math.floor(((block.end - block.start) / totalTime) * available));
    positions.push({ x: xCursor, w: w });
    xCursor += w;
  });

  var pos       = positions[upToStep - 1];
  var block     = timeline[upToStep - 1];
  var targetW   = pos.w;
  var startX    = pos.x;
  var color     = getColor(block.pid);
  var startTime = null;
  var speed     = 2100 - parseInt(document.getElementById("sched-speed").value);
  var duration  = speed * 0.6;
  var prevStep  = upToStep - 1;

  function draw(ts) {
    if (!startTime) startTime = ts;
    var elapsed  = ts - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased    = 1 - Math.pow(1 - progress, 3);
    var currentW = targetW * eased;

    drawGanttStatic(timeline, prevStep);

    ganttCtx.fillStyle   = color;
    ganttCtx.strokeStyle = "#fff";
    ganttCtx.lineWidth   = 2;
    ganttCtx.fillRect(startX, TICK_H, currentW, GANTT_H);
    ganttCtx.strokeRect(startX, TICK_H, currentW, GANTT_H);

    if (currentW > 20) {
      ganttCtx.fillStyle    = "#000";
      ganttCtx.font         = "bold 13px Arial";
      ganttCtx.textAlign    = "center";
      ganttCtx.textBaseline = "middle";
      ganttCtx.fillText("P" + block.pid, startX + currentW / 2, TICK_H + GANTT_H / 2);
    }

    ganttCtx.fillStyle    = "#333";
    ganttCtx.font         = "11px Arial";
    ganttCtx.textAlign    = "left";
    ganttCtx.textBaseline = "top";
    ganttCtx.fillText(block.start, startX, 2);

    if (progress < 1) {
      animState.blockAnim = requestAnimationFrame(draw);
    } else {
      animState.blockAnim = null;
      drawGanttStatic(timeline, upToStep);
      if (onComplete) onComplete();
    }
  }

  animState.blockAnim = requestAnimationFrame(draw);
}

function renderGantt(timeline, upToStep, onComplete) {
  if (!ganttCanvas) return;
  if (upToStep === 0) {
    ganttCtx.clearRect(0, 0, ganttCanvas.width, ganttCanvas.height);
    if (onComplete) onComplete();
    return;
  }
  animateGanttBlock(timeline, upToStep, onComplete);
}

// ============================================================
// QUEUE CANVAS
// ============================================================
function renderQueues(timeline, step, procs) {
  if (!queueCanvas || !runningCanvas) return;

  var block = timeline[step - 1];
  if (!block) return;

  var usedBurst = {};
  timeline.slice(0, step).forEach(function(b) {
    usedBurst[b.pid] = (usedBurst[b.pid] || 0) + (b.end - b.start);
  });

  var readyProcs = procs.filter(function(p) {
    var used = usedBurst[p.pid] || 0;
    return p.arrival <= block.start && used < p.burst && p.pid !== block.pid;
  });

  animateQueue(readyProcs);
  renderRunning(block, procs, usedBurst);
}

function animateQueue(readyProcs) {
  if (animState.queueAnim) {
    cancelAnimationFrame(animState.queueAnim);
    animState.queueAnim = null;
  }

  queueCanvas.width  = Math.max(400, 50 + readyProcs.length * (CHIP_W + CHIP_GAP) + 20);
  queueCanvas.height = QUEUE_H;

  var startTime   = null;
  var speed       = 2100 - parseInt(document.getElementById("sched-speed").value);
  var duration    = speed * 0.6;
  var offsetStart = 20;
  var procs       = readyProcs.slice();

  function draw(ts) {
    if (!startTime) startTime = ts;
    var elapsed  = ts - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased    = 1 - Math.pow(1 - progress, 2);
    var offset   = offsetStart * (1 - eased);

    queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);

    queueCtx.fillStyle    = "#555";
    queueCtx.font         = "12px Arial";
    queueCtx.textAlign    = "left";
    queueCtx.textBaseline = "middle";
    queueCtx.fillText("→ CPU", 4, QUEUE_H / 2);

    if (procs.length === 0) {
      queueCtx.fillStyle    = "#999";
      queueCtx.font         = "italic 12px Arial";
      queueCtx.textAlign    = "center";
      queueCtx.textBaseline = "middle";
      queueCtx.fillText("Cola vacía", queueCanvas.width / 2, QUEUE_H / 2);
    } else {
      procs.forEach(function(p, i) {
        var x     = 50 + i * (CHIP_W + CHIP_GAP) + offset;
        var y     = (QUEUE_H - CHIP_H) / 2;
        var color = getColor(p.pid);

        queueCtx.shadowColor   = "rgba(0,0,0,0.2)";
        queueCtx.shadowBlur    = 4;
        queueCtx.shadowOffsetX = 2;
        queueCtx.shadowOffsetY = 2;

        queueCtx.fillStyle   = color;
        queueCtx.strokeStyle = "#000";
        queueCtx.lineWidth   = 2;
        roundRect(queueCtx, x, y, CHIP_W, CHIP_H, 6);
        queueCtx.fill();
        queueCtx.stroke();

        queueCtx.shadowColor   = "transparent";
        queueCtx.shadowBlur    = 0;
        queueCtx.shadowOffsetX = 0;
        queueCtx.shadowOffsetY = 0;

        queueCtx.fillStyle    = "#000";
        queueCtx.font         = "bold 13px Arial";
        queueCtx.textAlign    = "center";
        queueCtx.textBaseline = "middle";
        queueCtx.fillText("P" + p.pid, x + CHIP_W / 2, y + CHIP_H / 2);
      });
    }

    if (progress < 1) {
      animState.queueAnim = requestAnimationFrame(draw);
    } else {
      animState.queueAnim = null;
    }
  }

  animState.queueAnim = requestAnimationFrame(draw);
}

// ============================================================
// RUNNING CANVAS
// ============================================================
function renderRunning(block, procs, usedBurst) {
  runningCanvas.width  = 300;
  runningCanvas.height = RUN_H;

  var proc = procs.find(function(p) { return p.pid === block.pid; });
  if (!proc) return;

  var used  = usedBurst[block.pid] || 0;
  var pct   = used / proc.burst;
  var color = getColor(block.pid);

  runningCtx.clearRect(0, 0, runningCanvas.width, runningCanvas.height);

  runningCtx.fillStyle    = "#fff";
  runningCtx.font         = "bold 14px Arial";
  runningCtx.textAlign    = "left";
  runningCtx.textBaseline = "top";
  runningCtx.fillText("P" + block.pid + "  (t=" + block.start + " → " + block.end + ")", 8, 6);

  var barX = 8, barY = 28, barW = 284, barH = 22;

  runningCtx.fillStyle   = "#ddd";
  runningCtx.strokeStyle = "#000";
  runningCtx.lineWidth   = 2;
  roundRect(runningCtx, barX, barY, barW, barH, 5);
  runningCtx.fill();
  runningCtx.stroke();

  var fillW = barW * pct;
  if (fillW > 0) {
    runningCtx.fillStyle = color;
    roundRect(runningCtx, barX, barY, fillW, barH, 5);
    runningCtx.fill();
  }

  runningCtx.fillStyle    = "#000";
  runningCtx.font         = "12px Arial";
  runningCtx.textAlign    = "center";
  runningCtx.textBaseline = "middle";
  runningCtx.fillText(used + " / " + proc.burst + " burst", barX + barW / 2, barY + barH / 2);

  runningCtx.fillStyle    = "#555";
  runningCtx.font         = "11px Arial";
  runningCtx.textAlign    = "left";
  runningCtx.textBaseline = "top";
  runningCtx.fillText("Restante: " + (proc.burst - used), 8, 56);
}

// ============================================================
// RESET CANVAS
// ============================================================
function resetCanvases() {
  if (animState.blockAnim) {
    cancelAnimationFrame(animState.blockAnim);
    animState.blockAnim = null;
  }
  if (animState.queueAnim) {
    cancelAnimationFrame(animState.queueAnim);
    animState.queueAnim = null;
  }

  if (ganttCtx)   ganttCtx.clearRect(0, 0, ganttCanvas.width, ganttCanvas.height);
  if (queueCtx)   queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);
  if (runningCtx) runningCtx.clearRect(0, 0, runningCanvas.width, runningCanvas.height);
}
