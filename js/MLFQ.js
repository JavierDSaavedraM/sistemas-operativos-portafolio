document.addEventListener("DOMContentLoaded", function() {
    initMLFQConfig();
});

// ── Agregar proceso ─────────────────────────────────
document.getElementById("btn-add-proceso").addEventListener("click", function() {
  syncFromTabla();
  var nextPID = simData.processes.length > 0
    ? simData.processes[simData.processes.length - 1].pid + 1
    : 1;
  simData.processes.push({ pid: nextPID, arrival: 0, burst: 0});
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

// ── Validacion individual al cambiar celda ───────────────────
document.querySelector("#tabla-procesos tbody").addEventListener("change", function(e) {
  var input = e.target;
  if (!input.matches("input[type='number']")) return;
  validateCell(input);
  syncFromTabla();
});
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

// ALGORITHM RUNNER
// ── Estructura para algoritmos ──────────────────────────────────────────
var simData = {
  processes: [],
};

// ── Estructura para MLFQ ──────────────────────────────────────────
var MLFQ_AGING_INTERVAL = 10;
var mlfqConfig = { queues: [] };

// ── Render ──────────────────────────────────────────
// Unica funcion que escribe en la tabla HTML
function renderTabla() {
  var tbody = document.querySelector("#tabla-procesos tbody");
  tbody.innerHTML = "";
  simData.processes.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td> P' + p.pid    + '</td>' +
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
      burst:    parseInt(tr.querySelector(".burst").value)    || 0,
    });
  });
}


// ============================================================
// ESTADO GLOBAL
// ============================================================
var schedState = {
  timeline       : [],
  currentStep    : 0,
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
      priority : p.priority,
    };
  });
}


function validateCell(input) {
  var val   = parseInt(input.value);
  var field = input.className;
  var min   = field === "arrival" ? 0 : 1;


  if (isNaN(val) || val < min) {
    alert("Valor inválido en campo '" + field + "'. Debe ser >= " + min + ".");
    input.value = min;
  }
}

// ── Validacion global antes de correr algoritmo ──────────────
function validateSimData() {
  if (simData.processes.length === 0) {
    alert("No hay procesos definidos.");
    return false;
  }

  var warnings = [];
  var errors   = [];

  simData.processes.forEach(function(p) {
    if (p.arrival < 0)    errors.push("P" + p.pid + ": Arrival no puede ser negativo.");
    if (p.burst < 1)      errors.push("P" + p.pid + ": Burst debe ser diferente a 0>= 1.");
  });

  if (errors.length > 0) {
    alert("Errores que impiden ejecutar:\n\n" + errors.join("\n"));
    return false;
  }

  if (warnings.length > 0) {
    return confirm("Advertencias (valores en default):\n\n" + warnings.join("\n") + "\n\n¿Continuar de todas formas?");
  }

  return true;
}
// ============================================================
// ALGORITMO 
// ============================================================
function runMLFQ(procs) {

  var numQueues = mlfqConfig.queues.length;
  var agingInterval = MLFQ_AGING_INTERVAL;
  var timeline = [];
  var time = 0;

  var processes = procs.map(function(p) {
    return {
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      remaining: p.burst,
      priority: p.priority || 0,
      queueLevel: 0,
      waitTime: 0,
      lastRunTime: p.arrival
    };
  });

  var queues = [];
  for (var q = 0; q < numQueues; q++) queues.push([]);

  var finished = [];
  var notArrived = processes.slice().sort((a,b)=>a.arrival-b.arrival);

  while (notArrived.length > 0 || queues.some(q=>q.length > 0)) {

    // Admitir procesos
    notArrived = notArrived.filter(function(p) {
      if (p.arrival <= time) {
        p.queueLevel = 0;
        queues[0].push(p);
        return false;
      }
      return true;
    });

    // Buscar cola activa
    var activeQueue = queues.findIndex(q => q.length > 0);

    if (activeQueue === -1) {
      time++;
      continue;
    }

    var qConfig = mlfqConfig.queues[activeQueue];
    var queue = queues[activeQueue];
    var selected = selectProcess(queue, qConfig.algorithm, time);

    if (!selected) {
      time++;
      continue;
    }

    var runTime;
    if (qConfig.algorithm === "rr") {
      runTime = Math.min(qConfig.quantum, selected.remaining);
    } else if (qConfig.algorithm === "srtf" || qConfig.algorithm === "priority_p") {
      runTime = 1;
    } else {
      runTime = selected.remaining;
    }

    timeline.push({
      pid: selected.pid,
      start: time,
      end: time + runTime,
      queue: activeQueue
    });

    selected.remaining -= runTime;
    time += runTime;

    // remover de cola
    queues[activeQueue] = queue.filter(p => p !== selected);

    if (selected.remaining > 0) {
      if (qConfig.algorithm === "rr" && runTime === qConfig.quantum && activeQueue < numQueues - 1) {
        selected.queueLevel++;
        queues[activeQueue + 1].push(selected);
      } else {
        queues[activeQueue].push(selected);
      }
    }
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
    var m         = metrics[p.pid] || {};
    m.completion  = m.completion || 0;
    m.turnaround  = m.completion - p.arrival;
    m.waiting     = m.turnaround - p.burst;
    m.response    = (firstResponse[p.pid] || 0) - p.arrival;
    metrics[p.pid] = m;
  });

  return { metrics: metrics, firstResponse: firstResponse };
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
      { pid:1, arrival: 0, burst: 10}, 
      { pid:2, arrival: 1, burst: 5},
      { pid:3, arrival: 2, burst: 8}
    ];
    mlfqConfig.queues = [
      { algorithm: "fcfs", quantum: 0 },
      { algorithm: "sjf", quantum: 0 },
      { algorithm: "rr", quantum: 5 }
    ];
  }
  else if (activeTab.id == "tab-caso2"){ 
    simData.processes = [ 
      { pid:1, arrival: 0, burst: 6}, 
      { pid:2, arrival: 0, burst: 4}, 
      { pid:3, arrival: 1, burst: 7}, 
      { pid:4, arrival: 2, burst: 3}];
    mlfqConfig.queues = [
      { algorithm: "rr", quantum: 2 },
      { algorithm: "rr", quantum: 7 },
      { algorithm: "hrrn", quantum: 0 }
    ];
  }
  else if (activeTab.id == "tab-caso3"){ 
    simData.processes = [ 
      { pid:1, arrival: 0, burst: 3}, 
      { pid:2, arrival: 1, burst: 5}, 
      { pid:3, arrival: 2, burst: 7}, 
      { pid:4, arrival: 2, burst: 4},
      { pid:5, arrival: 3, burst: 6}
    ];
    mlfqConfig.queues = [
      { algorithm: "rr", quantum: 6 },
      { algorithm: "srtf", quantum: 0 },
      { algorithm: "hrrn", quantum: 0 }
    ];
  }
  else if (activeTab.id == "tab-caso4"){ 
    simData.processes = [ 
      { pid:1, arrival: 0, burst: 8}, 
      { pid:2, arrival: 1, burst: 4}, 
      { pid:3, arrival: 2, burst: 6}, 
      { pid:4, arrival: 3, burst: 3},
      { pid:5, arrival: 4, burst: 5}
    ];
    mlfqConfig.queues = [
      { algorithm: "hrrn", quantum: 0},
      { algorithm: "rr", quantum: 3 },
      { algorithm: "srtf", quantum: 0 }
    ];
  }
  else if (activeTab.id == "tab-caso5"){ 
    simData.processes = [ 
      { pid:1, arrival: 0, burst: 7}, 
      { pid:2, arrival: 1, burst: 3}, 
      { pid:3, arrival: 1, burst: 8}, 
      { pid:4, arrival: 2, burst: 5},
      { pid:5, arrival: 3, burst: 4}
    ];
    mlfqConfig.queues = [
      { algorithm: "hrrn", quantum: 0},
      { algorithm: "rr", quantum: 7 },
      { algorithm: "sjf", quantum: 0 },
    ];
  }
  else {
    syncFromTabla()
    readMLFQConfig();
  }
  if (simData.processes.length === 0) {
    alert("No hay procesos en simData.");
    return;
  }
  startSched();
});

function startSched() {
  if (!validateSimData()) return;
  var procs = copyProcesses();
  var timeline = runMLFQ(procs); 
  var result = calcMetrics(timeline, simData.processes);

  schedState.timeline       = timeline;
  schedState.currentStep    = 0;
  schedState.isRunning      = true;
  schedState.stepPaused     = false;
  schedState.metrics        = result.metrics;
  schedState.firstResponse  = result.firstResponse;

  document.getElementById("btn-run-sched").textContent    = "↺ Reset";
  document.getElementById("btn-run-sched").classList.add("running");
  document.getElementById("btn-next-step").disabled       = false;
  document.getElementById("btn-reset-sched").disabled     = false;

  initCanvases();
  runStep();
}

function resetSched() {
  schedState.timeline       = [];
  schedState.currentStep    = 0;
  schedState.isRunning      = false;
  schedState.stepPaused     = false;
  schedState.metrics        = {};

  document.getElementById("btn-run-sched").textContent    = "▶ Correr";
  document.getElementById("btn-run-sched").classList.remove("running");
  document.getElementById("btn-next-step").textContent    = "⏸ Pausar";
  document.getElementById("btn-next-step").disabled       = true;
  document.getElementById("btn-reset-sched").disabled     = true;
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


function initMLFQConfig() {
  var algSelect = document.getElementById("queue-algorithm");
  if (algSelect) {
    algSelect.addEventListener("change", function() {
      var cfg = document.getElementById("mlfq-config");
      var qg  = document.getElementById("quantum-group");
      if (this.value === "mlfq") {
        cfg.classList.remove("hidden");
        qg.classList.add("hidden");
        if (mlfqConfig.queues.length === 0) {
          addMLFQRow({ algorithm: "rr", quantum: 2 });
          addMLFQRow({ algorithm: "rr", quantum: 4 });
          addMLFQRow({ algorithm: "fcfs", quantum: 8 });
        }
      } else {
        cfg.classList.add("hidden");
      }
    });
  }

  var addBtn = document.getElementById("btn-add-queue");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
      var rows = document.querySelectorAll("#mlfq-tbody tr");
      if (rows.length >= 5) {
        alert("Máximo 5 colas permitidas.");
        return;
      }
      addMLFQRow({ algorithm: "rr", quantum: 2 });
    });
  }

  var mlfqTbody = document.getElementById("mlfq-tbody");
  if (mlfqTbody) {
    mlfqTbody.addEventListener("click", function(e) {
      if (e.target.classList.contains("btn-remove-queue")) {
        var rows = document.querySelectorAll("#mlfq-tbody tr");
        if (rows.length <= 1) {
          alert("Debe haber al menos una cola.");
          return;
        }
        e.target.closest("tr").remove();
        updateMLFQPriorityBadges();
      }
    });

    mlfqTbody.addEventListener("change", function(e) {
      if (e.target.classList.contains("mlfq-alg")) {
        var row    = e.target.closest("tr");
        var qGroup = row.querySelector(".mlfq-quantum-group");
        qGroup.style.display = e.target.value === "rr" ? "" : "none";
      }
    });
  }
}

function updateMLFQPriorityBadges() {
  var rows = document.querySelectorAll("#mlfq-tbody tr");
  var total = rows.length;

  rows.forEach(function(row, i) {
    // Actualizar numero de cola
    row.cells[0].textContent = i + 1;

    var badge = row.querySelector(".queue-priority-badge");
    if (!badge) return;

    if (i === 0) {
      badge.className   = "queue-priority-badge priority-high";
      badge.textContent = "Mayor prioridad";
    } else if (i === total - 1) {
      badge.className   = "queue-priority-badge priority-low";
      badge.textContent = "Menor prioridad";
    } else {
      badge.className   = "queue-priority-badge priority-mid";
      badge.textContent = "Prioridad " + (i + 1);
    }
  });
}
function addMLFQRow(config) {
  var tbody = document.getElementById("mlfq-tbody");
  var index = tbody.querySelectorAll("tr").length;
  var isRR  = config.algorithm === "rr";

  var tr = document.createElement("tr");
  tr.innerHTML =
    '<td>' + (index + 1) + '</td>' +
    '<td>' +
    '<select class="mlfq-alg">' +
    '<option value="fcfs"'       + (config.algorithm === "fcfs"       ? " selected" : "") + '>FCFS</option>'        +
    '<option value="sjf"'        + (config.algorithm === "sjf"        ? " selected" : "") + '>SJF</option>'         +
    '<option value="hrrn"'       + (config.algorithm === "hrrn"       ? " selected" : "") + '>HRRN</option>'        +
    '<option value="rr"'         + (config.algorithm === "rr"         ? " selected" : "") + '>Round Robin</option>' +
    '<option value="srtf"'       + (config.algorithm === "srtf"       ? " selected" : "") + '>SRTF</option>'        +
    '<option value="priority_p"' + (config.algorithm === "priority_p" ? " selected" : "") + '>Priority</option>'    +
    '</select>' +
    '</td>' +
    '<td>' +
    '<div class="mlfq-quantum-group" style="' + (!isRR ? "display:none" : "") + '">' +
    '<input type="number" class="mlfq-quantum" min="1" value="' + (config.quantum || 2) + '">' +
    '</div>' +
    '</td>' +
    '<td><span class="queue-priority-badge" id="mlfq-badge-' + index + '"></span></td>' +
    '<td><button class="btn-remove-queue">X</button></td>';

  tbody.appendChild(tr);
  updateMLFQPriorityBadges();
}

function renderMLFQQueues(num) {
  var list = document.getElementById("mlfq-queues-list");
  if (!list) return;

  // Preservar configuracion existente
  var existing = mlfqConfig.queues.slice();
  mlfqConfig.queues = [];

  list.innerHTML = "";

  for (var i = 0; i < num; i++) {
    var prev = existing[i] || { algorithm: "rr", quantum: Math.pow(2, i + 1) };
    mlfqConfig.queues.push({ algorithm: prev.algorithm, quantum: prev.quantum });

    var row = document.createElement("div");
    row.className   = "mlfq-queue-row";
    row.setAttribute("data-queue", i);

    var isHighest = i === 0;
    var isLowest  = i === num - 1;
    var priority  = isHighest ? "Mayor prioridad" : isLowest ? "Menor prioridad" : "Prioridad " + (i + 1);

    row.innerHTML =
      '<label>Cola ' + (i + 1) + '</label>' +
      '<select class="mlfq-alg" data-queue="' + i + '">' +
      '<option value="fcfs"'       + (prev.algorithm === "fcfs"       ? " selected" : "") + '>FCFS</option>'       +
      '<option value="sjf"'        + (prev.algorithm === "sjf"        ? " selected" : "") + '>SJF</option>'        +
      '<option value="hrrn"'       + (prev.algorithm === "hrrn"       ? " selected" : "") + '>HRRN</option>'       +
      '<option value="rr"'         + (prev.algorithm === "rr"         ? " selected" : "") + '>Round Robin</option>'+
      '<option value="srtf"'       + (prev.algorithm === "srtf"       ? " selected" : "") + '>SRTF</option>'       +
      '<option value="priority_p"' + (prev.algorithm === "priority_p" ? " selected" : "") + '>Priority</option>'   +
      '</select>' +
      '<div class="mlfq-quantum-group" id="mlfq-qg-' + i + '" style="' + (prev.algorithm !== "rr" ? "display:none" : "") + '">' +
      '<label>Q:</label>' +
      '<input type="number" class="mlfq-quantum" data-queue="' + i + '" min="1" value="' + prev.quantum + '">' +
      '</div>' +
      '<span class="mlfq-queue-priority">' + priority + '</span>';

    list.appendChild(row);

    // Listener para mostrar/ocultar quantum
    row.querySelector(".mlfq-alg").addEventListener("change", function() {
      var qIdx    = parseInt(this.getAttribute("data-queue"));
      var qGroup  = document.getElementById("mlfq-qg-" + qIdx);
      var isRR    = this.value === "rr";
      qGroup.style.display = isRR ? "flex" : "none";
      mlfqConfig.queues[qIdx].algorithm = this.value;
    });

    row.querySelector(".mlfq-quantum").addEventListener("change", function() {
      var qIdx = parseInt(this.getAttribute("data-queue"));
      mlfqConfig.queues[qIdx].quantum = parseInt(this.value) || 2;
    });
  }
}

function readMLFQConfig() {
  mlfqConfig.queues = [];
  var rows = document.querySelectorAll("#mlfq-tbody tr");

  if (rows.length === 0) {
    // fallback default
    mlfqConfig.queues = [
      { algorithm: "rr", quantum: 2 },
      { algorithm: "rr", quantum: 4 },
      { algorithm: "fcfs", quantum: 8 }
    ];
    return;
  }

  rows.forEach(function(row) {
    var alg = row.querySelector(".mlfq-alg").value;
    var qInput = row.querySelector(".mlfq-quantum");
    var quantum = qInput ? parseInt(qInput.value) || 2 : 2;

    mlfqConfig.queues.push({
      algorithm: alg,
      quantum: quantum
    });
  });
}


// ============================================================
// SELECCIONAR PROCESO SEGUN ALGORITMO DE LA COLA
// ============================================================
function selectProcess(queue, algorithm, time) {
  if (queue.length === 0) return null;

  var available = queue.filter(function(p) { return p.arrival <= time; });
  if (available.length === 0) return null;

  if (algorithm === "fcfs") {
    available.sort(function(a, b) { return a.arrival - b.arrival || a.pid - b.pid; });
  } else if (algorithm === "sjf" || algorithm === "srtf") {
    available.sort(function(a, b) { return a.remaining - b.remaining || a.arrival - b.arrival; });
  } else if (algorithm === "hrrn") {
    available.sort(function(a, b) {
      var hrA = ((time - a.arrival) + a.burst) / a.burst;
      var hrB = ((time - b.arrival) + b.burst) / b.burst;
      return hrB - hrA;
    });
  } else if (algorithm === "rr") {
    // Regla 2: si prioridad igual usar RR (orden de llegada a la cola)
    return available[0];
  } else if (algorithm === "priority_p") {
    available.sort(function(a, b) { return a.priority - b.priority || a.arrival - b.arrival; });
  }

  return available[0];
}
