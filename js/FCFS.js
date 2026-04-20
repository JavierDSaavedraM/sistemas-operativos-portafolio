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

var BLOCK_W  = 36;
var GANTT_H  = 40;
var TICK_H   = 20;
var QUEUE_H  = 60;
var RUN_H    = 70;
var CHIP_W   = 60;
var CHIP_H   = 36;
var CHIP_GAP = 10;

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
  "#b7b7e0","#f0c080","#80d0a0","#f08080",
  "#80c8f0","#d0a0f0","#f0e080","#a0d0c0"
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
  var totalTime = visible.length > 0 ? visible[visible.length - 1].end : 0;

  ganttCanvas.width  = Math.max(totalTime * BLOCK_W + BLOCK_W, 400);
  ganttCanvas.height = TICK_H + GANTT_H;

  ganttCtx.clearRect(0, 0, ganttCanvas.width, ganttCanvas.height);

  visible.forEach(function(block) {
    var x     = block.start * BLOCK_W;
    var w     = (block.end - block.start) * BLOCK_W;
    var color = getColor(block.pid);

    ganttCtx.fillStyle   = color;
    ganttCtx.strokeStyle = "#000";
    ganttCtx.lineWidth   = 2;
    ganttCtx.fillRect(x, TICK_H, w, GANTT_H);
    ganttCtx.strokeRect(x, TICK_H, w, GANTT_H);

    ganttCtx.fillStyle    = "#000";
    ganttCtx.font         = "bold 13px Arial";
    ganttCtx.textAlign    = "center";
    ganttCtx.textBaseline = "middle";
    ganttCtx.fillText("P" + block.pid, x + w / 2, TICK_H + GANTT_H / 2);

    ganttCtx.fillStyle    = "#333";
    ganttCtx.font         = "11px Arial";
    ganttCtx.textAlign    = "left";
    ganttCtx.textBaseline = "top";
    ganttCtx.fillText(block.start, x, 2);
  });

  if (visible.length > 0) {
    var last = visible[visible.length - 1];
    ganttCtx.fillStyle    = "#333";
    ganttCtx.font         = "11px Arial";
    ganttCtx.textAlign    = "left";
    ganttCtx.textBaseline = "top";
    ganttCtx.fillText(last.end, last.end * BLOCK_W, 2);
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

  var block     = timeline[upToStep - 1];
  var targetW   = (block.end - block.start) * BLOCK_W;
  var startX    = block.start * BLOCK_W;
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
    ganttCtx.strokeStyle = "#2a2";
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

  runningCtx.fillStyle    = "#000";
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


// ALGORITHM RUNNER
// ── Estructura para algoritmos ──────────────────────────────────────────
var simData = {
  processes: [],
};

// ── Render ──────────────────────────────────────────
// Unica funcion que escribe en la tabla HTML
function renderTabla() {
  var tbody = document.querySelector("#tabla-procesos tbody");
  tbody.innerHTML = "";
  simData.processes.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input type="number" class="pid"      value="' + p.pid      + '" readonly></td>' +
      '<td><input type="number" class="arrival"  value="' + p.arrival  + '"></td>' +
      '<td><input type="number" class="burst"    value="' + p.burst    + '"></td>' +
      '<td><button class="btn-remove-row">X</button></td>';
    tbody.appendChild(tr);
  });
}

// ── Sincronizar tabla → simData ─────────────────────
// Lee la tabla y actualiza simData.processes
function syncFromTabla() {
  var rows = document.querySelectorAll("#tabla-procesos tbody tr");
  simData.processes = [];
  rows.forEach(function(tr, index) {
    simData.processes.push({
      pid:      index + 1,
      arrival:  parseInt(tr.querySelector(".arrival").value)  || 0,
      burst:    parseInt(tr.querySelector(".burst").value)    || 1,
    });
  });
}

// ── Agregar proceso ─────────────────────────────────
document.getElementById("btn-add-proceso").addEventListener("click", function() {
  syncFromTabla();
  var nextPID = simData.processes.length > 0
    ? simData.processes[simData.processes.length - 1].pid + 1
    : 1;
  simData.processes.push({ pid: nextPID, arrival: 0, burst: 1});
  renderTabla();
});

// ── Eliminar proceso ────────────────────────────────
document.querySelector("#tabla-procesos tbody").addEventListener("click", function(e) {
  if (e.target.classList.contains("btn-remove-row")) {
    var index = e.target.closest("tr").rowIndex - 1;
    simData.processes.splice(index, 1);
    // Reasignar PIDs
    simData.processes.forEach(function(p, i) { p.pid = i + 1; });
    renderTabla();
  }
});

// ============================================================
// ESTADO GLOBAL
// ============================================================
var schedState = {
  timeline       : [],
  currentStep    : 0,
  contextChanges : 0,
  isRunning      : false,
  stepPaused     : false,
  metrics        : {},
  firstResponse  : {}
};

// ============================================================
// UTILIDADES
// ============================================================
function copyProcesses() {
  return simData.processes.map(function(p) {
    return {
      pid      : p.pid,
      arrival  : p.arrival,
      burst    : p.burst,
    };
  });
}

// ============================================================
// ALGORITMOS
// ============================================================
function runFCFS(procs) {
  var timeline = [];
  var time     = 0;
  var sorted   = procs.slice().sort(function(a, b) {
    return a.arrival - b.arrival || a.pid - b.pid;
  });
  sorted.forEach(function(p) {
    if (time < p.arrival) time = p.arrival;
    timeline.push({ pid: p.pid, start: time, end: time + p.burst });
    time += p.burst;
  });
  return timeline;
}

// ============================================================
// METRICAS
// ============================================================
function calcMetrics(timeline, procs) {
  var metrics       = {};
  var firstResponse = {};

  timeline.forEach(function(block) {
    if (!firstResponse[block.pid]) firstResponse[block.pid] = block.start;
    if (!metrics[block.pid]) metrics[block.pid] = {};
    metrics[block.pid].completion = block.end;
  });

  procs.forEach(function(p) {
    var m         = metrics[p.pid] || {};
    m.completion  = m.completion || 0;
    m.turnaround  = m.completion - p.arrival;
    m.waiting     = m.turnaround - p.burst;
    m.response    = (firstResponse[p.pid] || 0) - p.arrival;
    metrics[p.pid] = m;
  });

  return { metrics: metrics, firstResponse: firstResponse };
}

function countContextChanges(timeline) {
  var count = 0;
  for (var i = 1; i < timeline.length; i++) {
    if (timeline[i].pid !== timeline[i - 1].pid) count++;
  }
  return count;
}

// ============================================================
// RENDER TABLA DE METRICAS
// ============================================================
function renderMetricsTable(metrics, procs, upToStep, timeline) {
  var tbody     = document.getElementById("metrics-body");
  tbody.innerHTML = "";

  var usedBurst = {};
  timeline.slice(0, upToStep).forEach(function(b) {
    usedBurst[b.pid] = (usedBurst[b.pid] || 0) + (b.end - b.start);
  });

  procs.forEach(function(p) {
    var done = (usedBurst[p.pid] || 0) >= p.burst;
    var m    = metrics[p.pid] || {};
    var ct   = done ? m.completion : "-";
    var tat  = done ? m.turnaround : "-";
    var wt   = done ? m.waiting    : "-";
    var rt   = done ? m.response   : "-";

    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>P' + p.pid + '</td>' +
      '<td>' + p.arrival + '</td>' +
      '<td>' + p.burst   + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="completion">'  + ct  + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="turnaround">'  + tat + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="waiting">'     + wt  + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="response">'    + rt  + '</td>';
    tbody.appendChild(tr);
  });
}

// ============================================================
// RENDER SUMMARY
// ============================================================
function renderSummary(metrics, procs, timeline, currentStep) {
  var usedBurst = {};
  timeline.slice(0, currentStep).forEach(function(b) {
    usedBurst[b.pid] = (usedBurst[b.pid] || 0) + (b.end - b.start);
  });

  var done = procs.filter(function(p) { return (usedBurst[p.pid] || 0) >= p.burst; });
  if (done.length === 0) return;

  var sumTAT = 0, sumWT = 0, sumRT = 0;
  done.forEach(function(p) {
    sumTAT += metrics[p.pid].turnaround;
    sumWT  += metrics[p.pid].waiting;
    sumRT  += metrics[p.pid].response;
  });

  var lastBlock    = timeline[currentStep - 1];
  var totalTime    = lastBlock ? lastBlock.end : 1;
  var firstArrival = Math.min.apply(null, procs.map(function(p) { return p.arrival; }));
  var busyTime     = timeline.slice(0, currentStep).reduce(function(acc, b) {
    return acc + (b.end - b.start);
  }, 0);
  var span    = totalTime - firstArrival;
  var cpuUtil = span > 0 ? ((busyTime / span) * 100).toFixed(1) : "0.0";

  document.getElementById("avg-turnaround").textContent  = (sumTAT / done.length).toFixed(2);
  document.getElementById("avg-waiting").textContent     = (sumWT  / done.length).toFixed(2);
  document.getElementById("avg-response").textContent    = (sumRT  / done.length).toFixed(2);
  document.getElementById("cpu-utilization").textContent = cpuUtil + "%";
}

// ============================================================
// TOOLTIP
// ============================================================
var tooltip = document.getElementById("metrics-tooltip");

document.getElementById("metrics-body").addEventListener("mouseover", function(e) {
  var td = e.target.closest("td.has-value");
  if (!td) return;

  var pid  = parseInt(td.getAttribute("data-pid"));
  var type = td.getAttribute("data-type");
  var proc = simData.processes.find(function(p) { return p.pid === pid; });
  var m    = schedState.metrics[pid];
  if (!proc || !m) return;

  var html = "";
  if (type === "completion") {
    html = "<strong>Completion Time</strong><br>Último instante en que P" + pid + " usó CPU<br>= <strong>" + m.completion + "</strong>";
  } else if (type === "turnaround") {
    html = "<strong>Turnaround Time</strong><br>CT - Arrival<br>= " + m.completion + " - " + proc.arrival + " = <strong>" + m.turnaround + "</strong>";
  } else if (type === "waiting") {
    html = "<strong>Waiting Time</strong><br>TAT - Burst<br>= " + m.turnaround + " - " + proc.burst + " = <strong>" + m.waiting + "</strong>";
  } else if (type === "response") {
    html = "<strong>Response Time</strong><br>Primera vez en CPU - Arrival<br>= " + (m.response + proc.arrival) + " - " + proc.arrival + " = <strong>" + m.response + "</strong>";
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove("hidden");
});

document.getElementById("metrics-body").addEventListener("mousemove", function(e) {
  tooltip.style.left = (e.clientX + 14) + "px";
  tooltip.style.top  = (e.clientY - 10) + "px";
});

document.getElementById("metrics-body").addEventListener("mouseout", function(e) {
  if (!e.target.closest("td.has-value")) tooltip.classList.add("hidden");
});

// ============================================================
// CONTROLES
// ============================================================
document.getElementById("sched-speed").addEventListener("input", function() {
  document.getElementById("sched-speed-label").textContent = (2100 - parseInt(this.value)) + "ms";
});

// ============================================================
// CORRER / RESET
// ============================================================
document.getElementById("btn-run-sched").addEventListener("click", function() {
  if (schedState.isRunning) {
    resetSched();
    return;
  }
  const activeTab = document.querySelector(".tab-panel.active");
  if (activeTab.id == "tab-caso1"){ 
    simData.processes = [ 
      { pid:1, arrival: 0, burst: 5}, 
      { pid:2, arrival: 2, burst: 4},
      { pid:3, arrival: 4, burst: 2}];
  }
  else if (activeTab.id == "tab-caso2"){ 
    simData.processes = [ 
      { pid:1, arrival: 0, burst: 3}, 
      { pid:2, arrival: 0, burst: 2}, 
      { pid:3, arrival: 1, burst: 4}, 
      { pid:4, arrival: 3, burst: 2}];
  }
  else {
    syncFromTabla()
  }
  if (simData.processes.length === 0) {
    alert("No hay procesos en simData.");
    return;
  }
  startSched();
});

function startSched() {
  var procs = copyProcesses();
  var timeline = runFCFS(procs); 
  var result = calcMetrics(timeline, simData.processes);

  schedState.timeline       = timeline;
  schedState.currentStep    = 0;
  schedState.contextChanges = countContextChanges(timeline);
  schedState.isRunning      = true;
  schedState.stepPaused     = false;
  schedState.metrics        = result.metrics;
  schedState.firstResponse  = result.firstResponse;

  document.getElementById("btn-run-sched").textContent    = "↺ Reset";
  document.getElementById("btn-run-sched").classList.add("running");
  document.getElementById("btn-next-step").disabled       = false;
  document.getElementById("btn-reset-sched").disabled     = false;
  document.getElementById("context-count").textContent    = schedState.contextChanges;

  initCanvases();
  runStep();
}

function resetSched() {
  schedState.timeline       = [];
  schedState.currentStep    = 0;
  schedState.contextChanges = 0;
  schedState.isRunning      = false;
  schedState.stepPaused     = false;
  schedState.metrics        = {};

  document.getElementById("btn-run-sched").textContent    = "▶ Correr";
  document.getElementById("btn-run-sched").classList.remove("running");
  document.getElementById("btn-next-step").textContent    = "⏸ Pausar";
  document.getElementById("btn-next-step").disabled       = true;
  document.getElementById("btn-reset-sched").disabled     = true;
  document.getElementById("context-count").textContent    = "0";
  document.getElementById("avg-turnaround").textContent   = "-";
  document.getElementById("avg-waiting").textContent      = "-";
  document.getElementById("avg-response").textContent     = "-";
  document.getElementById("cpu-utilization").textContent  = "-";
  document.getElementById("metrics-body").innerHTML       = "";

  resetCanvases();
}

// ============================================================
// PASO AUTOMATICO
// ============================================================
function runStep() {
  document.getElementById("btn-next-step").textContent = "⏸ Pausar";
  schedState.stepPaused = false;

  function nextStep() {
    if (schedState.stepPaused) return;
    if (schedState.currentStep >= schedState.timeline.length) {
      document.getElementById("btn-next-step").textContent = "✓ Terminado";
      document.getElementById("btn-next-step").disabled    = true;
      return;
    }

    schedState.currentStep++;
    var step     = schedState.currentStep;
    var timeline = schedState.timeline;
    var speed    = 2100 - parseInt(document.getElementById("sched-speed").value);

    renderQueues(timeline, step, simData.processes);
    renderMetricsTable(schedState.metrics, simData.processes, step, timeline);
    renderSummary(schedState.metrics, simData.processes, timeline, step);
    renderGantt(timeline, step, function() {
      setTimeout(nextStep, speed * 0.4);
    });
  }

  nextStep();
}

document.getElementById("btn-next-step").addEventListener("click", function() {
  if (!schedState.isRunning) return;

  if (!schedState.stepPaused) {
    schedState.stepPaused = true;
    if (animState.blockAnim) {
      cancelAnimationFrame(animState.blockAnim);
      animState.blockAnim = null;
    }
    document.getElementById("btn-next-step").textContent = "▶ Continuar";
  } else {
    runStep();
  }
});

document.getElementById("btn-reset-sched").addEventListener("click", function() {
  resetSched();
});

