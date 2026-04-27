// ============================================================
// ESTADO GLOBAL
// ============================================================
var simData = {
  processes: []
};

var schedState = {
  timeline      : [],
  currentStep   : 0,
  isRunning     : false,
  stepPaused    : false,
  metrics       : {},
  firstResponse : {}
};

// ============================================================
// RENDER TABLA
// ============================================================
function renderTabla() {
  var tbody = document.querySelector("#tabla-procesos tbody");
  tbody.innerHTML = "";
  simData.processes.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>P' + p.pid + '</td>' +
      '<td><input type="number" class="arrival"  value="' + p.arrival  + '" min="0"></td>' +
      '<td><input type="number" class="burst"    value="' + p.burst    + '" min="1"></td>' +
      '<td><input type="number" class="priority" value="' + p.priority + '" min="1"></td>' +
      '<td><button class="btn-remove-row">X</button></td>';
    tbody.appendChild(tr);
  });
}

// ============================================================
// SYNC TABLA → SIMDATA
// ============================================================
function syncFromTabla() {
  var rows = document.querySelectorAll("#tabla-procesos tbody tr");
  simData.processes = [];
  rows.forEach(function(tr, index) {
    simData.processes.push({
      pid:      index + 1,
      arrival:  parseInt(tr.querySelector(".arrival").value)  || 0,
      burst:    parseInt(tr.querySelector(".burst").value)    || 0,
      priority: parseInt(tr.querySelector(".priority").value) || 0
    });
  });
}

// ============================================================
// AGREGAR / ELIMINAR PROCESO
// ============================================================
document.getElementById("btn-add-proceso").addEventListener("click", function() {
  syncFromTabla();
  var nextPID = simData.processes.length > 0
    ? simData.processes[simData.processes.length - 1].pid + 1
    : 1;
  simData.processes.push({ pid: nextPID, arrival: 0, burst: 0, priority: 0 });
  renderTabla();
});

document.querySelector("#tabla-procesos tbody").addEventListener("click", function(e) {
  if (e.target.classList.contains("btn-remove-row")) {
    var index = e.target.closest("tr").rowIndex - 1;
    simData.processes.splice(index, 1);
    simData.processes.forEach(function(p, i) { p.pid = i + 1; });
    renderTabla();
  }
});

// ============================================================
// VALIDACION POR CELDA
// ============================================================
document.querySelector("#tabla-procesos tbody").addEventListener("change", function(e) {
  var input = e.target;
  if (!input.matches("input[type='number']")) return;
  validateCell(input);
  syncFromTabla();
});

function validateCell(input) {
  var val = parseInt(input.value);
  var min = input.classList.contains("arrival") ? 0 : 1;
  if (isNaN(val) || val < min) {
    alert("Valor inválido en campo '" + input.className + "'. Debe ser >= " + min + ".");
    input.value = min;
  }
}

// ============================================================
// VALIDACION GLOBAL
// ============================================================
function validateSimData() {
  if (simData.processes.length === 0) {
    alert("No hay procesos definidos.");
    return false;
  }

  var errors = [];
  simData.processes.forEach(function(p) {
    if (p.arrival < 0)  errors.push("P" + p.pid + ": Arrival no puede ser negativo.");
    if (p.burst < 1)    errors.push("P" + p.pid + ": Burst debe ser >= 1.");
    if (p.priority < 1) errors.push("P" + p.pid + ": Priority debe ser >= 1.");
  });

  if (errors.length > 0) {
    alert("Errores que impiden ejecutar:\n\n" + errors.join("\n"));
    return false;
  }

  return true;
}

// ============================================================
// UTILIDADES
// ============================================================
function copyProcesses() {
  return simData.processes.map(function(p) {
    return {
      pid:       p.pid,
      arrival:   p.arrival,
      burst:     p.burst,
      remaining: p.burst,
      priority:  p.priority
    };
  });
}

// ============================================================
// ALGORITMOS
// ============================================================
function runPriorityNPAging(procs, agingRate) {
  var order     = document.getElementById("priority-order").value;
  var timeline  = [];
  var time      = 0;
  var remaining = procs.slice().map(function(p) {
    return Object.assign({}, p, { effectivePriority: p.priority, waitTime: 0 });
  });

  while (remaining.length > 0) {
    var available = remaining.filter(function(p) { return p.arrival <= time; });
    if (available.length === 0) { time++; continue; }

    // Aplicar aging a procesos en espera
    available.forEach(function(p) {
      p.waitTime++;
      if (order === "asc") {
        // Menor número = mayor prioridad, aging reduce el número
        p.effectivePriority = Math.max(0, p.priority - Math.floor(p.waitTime / agingRate));
      } else {
        // Mayor número = mayor prioridad, aging incrementa el número
        p.effectivePriority = p.priority + Math.floor(p.waitTime / agingRate);
      }
    });

    available.sort(function(a, b) {
      var cmp = order === "asc"
        ? a.effectivePriority - b.effectivePriority
        : b.effectivePriority - a.effectivePriority;
      return cmp || a.arrival - b.arrival;
    });

    var p = available[0];
    timeline.push({ pid: p.pid, start: time, end: time + p.remaining });
    time += p.remaining;
    p.remaining = 0;
    remaining.splice(remaining.indexOf(p), 1);
  }
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
    var m        = metrics[p.pid] || {};
    m.completion = m.completion || 0;
    m.turnaround = m.completion - p.arrival;
    m.waiting    = m.turnaround - p.burst;
    m.response   = (firstResponse[p.pid] || 0) - p.arrival;
    metrics[p.pid] = m;
  });

  return { metrics: metrics, firstResponse: firstResponse };
}

// ============================================================
// RENDER TABLA DE METRICAS
// ============================================================
function renderMetricsTable(metrics, procs, upToStep, timeline) {
  var tbody = document.getElementById("metrics-body");
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
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="completion">' + ct  + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="turnaround">' + tat + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="waiting">'    + wt  + '</td>' +
      '<td class="'+(done?"has-value":"")+'" data-pid="'+p.pid+'" data-type="response">'   + rt  + '</td>';
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

  var activeTab = document.querySelector(".tab-panel.active");

  if (activeTab.id === "tab-caso1") {
    simData.processes = [
      { pid: 1, arrival: 0, burst: 5, priority: 2 },
      { pid: 2, arrival: 1, burst: 3, priority: 1 },
      { pid: 3, arrival: 2, burst: 8, priority: 3 },
      { pid: 4, arrival: 4, burst: 6, priority: 2 }
    ];
  } else if (activeTab.id === "tab-caso2") {
    simData.processes = [
      { pid: 1, arrival: 0, burst: 8, priority: 3 },
      { pid: 2, arrival: 1, burst: 4, priority: 1 },
      { pid: 3, arrival: 2, burst: 9, priority: 4 },
      { pid: 4, arrival: 3, burst: 5, priority: 2 }
    ];
  } else if (activeTab.id === "tab-caso3") {
    simData.processes = [
      { pid: 1, arrival: 0, burst: 6, priority: 1 },
      { pid: 2, arrival: 2, burst: 4, priority: 3 },
      { pid: 3, arrival: 4, burst: 2, priority: 2 },
      { pid: 4, arrival: 6, burst: 8, priority: 1 }
    ];
  } else {
    syncFromTabla();
  }

  startSched();
});

function startSched() {
  if (!validateSimData()) return;
  var procs    = copyProcesses();
  var timeline = runPriorityNPAging(procs, 1);
  var result   = calcMetrics(timeline, simData.processes);

  schedState.timeline      = timeline;
  schedState.currentStep   = 0;
  schedState.isRunning     = true;
  schedState.stepPaused    = false;
  schedState.metrics       = result.metrics;
  schedState.firstResponse = result.firstResponse;

  document.getElementById("btn-run-sched").textContent  = "↺ Reset";
  document.getElementById("btn-run-sched").classList.add("running");
  document.getElementById("btn-next-step").disabled     = false;
  document.getElementById("btn-reset-sched").disabled   = false;

  initCanvases();
  runStep();
}

function resetSched() {
  schedState.timeline      = [];
  schedState.currentStep   = 0;
  schedState.isRunning     = false;
  schedState.stepPaused    = false;
  schedState.metrics       = {};

  document.getElementById("btn-run-sched").textContent  = "▶ Correr";
  document.getElementById("btn-run-sched").classList.remove("running");
  document.getElementById("btn-next-step").textContent  = "⏸ Pausar";
  document.getElementById("btn-next-step").disabled     = true;
  document.getElementById("btn-reset-sched").disabled   = true;
  document.getElementById("avg-turnaround").textContent = "-";
  document.getElementById("avg-waiting").textContent    = "-";
  document.getElementById("avg-response").textContent   = "-";
  document.getElementById("cpu-utilization").textContent = "-";
  document.getElementById("metrics-body").innerHTML     = "";

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
