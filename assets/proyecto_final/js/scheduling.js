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
      remaining: p.burst,
      priority : p.priority,
      pages    : p.pages
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

function runSJF(procs) {
  var timeline  = [];
  var time      = 0;
  var remaining = procs.slice();
  while (remaining.length > 0) {
    var available = remaining.filter(function(p) { return p.arrival <= time; });
    if (available.length === 0) {
      remaining.sort(function(a, b) { return a.arrival - b.arrival; });
      time = remaining[0].arrival;
      available = [remaining[0]];
    }
    available.sort(function(a, b) { return a.burst - b.burst || a.arrival - b.arrival; });
    var p = available[0];
    remaining.splice(remaining.indexOf(p), 1);
    timeline.push({ pid: p.pid, start: time, end: time + p.burst });
    time += p.burst;
  }
  return timeline;
}

function runHRRN(procs) {
  var timeline  = [];
  var time      = 0;
  var remaining = procs.slice();
  while (remaining.length > 0) {
    var available = remaining.filter(function(p) { return p.arrival <= time; });
    if (available.length === 0) {
      remaining.sort(function(a, b) { return a.arrival - b.arrival; });
      time = remaining[0].arrival;
      available = [remaining[0]];
    }
    available.sort(function(a, b) {
      var hrA = ((time - a.arrival) + a.burst) / a.burst;
      var hrB = ((time - b.arrival) + b.burst) / b.burst;
      return hrB - hrA;
    });
    var p = available[0];
    remaining.splice(remaining.indexOf(p), 1);
    timeline.push({ pid: p.pid, start: time, end: time + p.burst });
    time += p.burst;
  }
  return timeline;
}

function runRR(procs, quantum) {
  var timeline  = [];
  var time      = 0;
  var queue     = [];
  var remaining = procs.slice().sort(function(a, b) { return a.arrival - b.arrival; });

  while (remaining.length > 0 || queue.length > 0) {
    remaining = remaining.filter(function(p) {
      if (p.arrival <= time) { queue.push(p); return false; }
      return true;
    });

    if (queue.length === 0) {
      time = remaining[0].arrival;
      continue;
    }

    var p       = queue.shift();
    var runTime = Math.min(quantum, p.remaining);
    timeline.push({ pid: p.pid, start: time, end: time + runTime });
    time        += runTime;
    p.remaining -= runTime;

    remaining = remaining.filter(function(r) {
      if (r.arrival <= time) { queue.push(r); return false; }
      return true;
    });

    if (p.remaining > 0) queue.push(p);
  }
  return timeline;
}

function runSRTF(procs) {
  var timeline  = [];
  var time      = 0;
  var remaining = procs.slice();

  while (remaining.length > 0) {
    var available = remaining.filter(function(p) { return p.arrival <= time; });
    if (available.length === 0) { time++; continue; }

    available.sort(function(a, b) { return a.remaining - b.remaining || a.arrival - b.arrival; });
    var p = available[0];

    if (timeline.length > 0 && timeline[timeline.length - 1].pid === p.pid) {
      timeline[timeline.length - 1].end++;
    } else {
      timeline.push({ pid: p.pid, start: time, end: time + 1 });
    }

    p.remaining--;
    time++;
    if (p.remaining === 0) remaining.splice(remaining.indexOf(p), 1);
  }
  return timeline;
}

function runPriorityP(procs) {
  var timeline  = [];
  var time      = 0;
  var remaining = procs.slice();

  while (remaining.length > 0) {
    var available = remaining.filter(function(p) { return p.arrival <= time; });
    if (available.length === 0) { time++; continue; }

    available.sort(function(a, b) { return a.priority - b.priority || a.arrival - b.arrival; });
    var p = available[0];

    if (timeline.length > 0 && timeline[timeline.length - 1].pid === p.pid) {
      timeline[timeline.length - 1].end++;
    } else {
      timeline.push({ pid: p.pid, start: time, end: time + 1 });
    }

    p.remaining--;
    time++;
    if (p.remaining === 0) remaining.splice(remaining.indexOf(p), 1);
  }
  return timeline;
}

function runMLQ(procs) {
  var queues  = {};
  procs.forEach(function(p) {
    if (!queues[p.priority]) queues[p.priority] = [];
    queues[p.priority].push(p);
  });
  var levels   = Object.keys(queues).map(Number).sort(function(a, b) { return a - b; });
  var timeline = [];
  var time     = 0;
  levels.forEach(function(level) {
    var fcfs = runFCFS(queues[level].map(function(p) {
      return Object.assign({}, p, { arrival: Math.max(p.arrival, time) });
    }));
    fcfs.forEach(function(block) {
      timeline.push(block);
      if (block.end > time) time = block.end;
    });
  });
  return timeline;
}

function runMLFQ(procs, quantum) {
  var timeline = [];
  var time     = 0;
  var q0       = procs.slice().sort(function(a, b) { return a.arrival - b.arrival; });
  var q1       = [];
  var q2       = [];

  while (q0.length > 0 || q1.length > 0 || q2.length > 0) {
    var source, qTime;
    if (q0.length > 0)      { source = q0; qTime = quantum; }
    else if (q1.length > 0) { source = q1; qTime = quantum * 2; }
    else                    { source = q2; qTime = Infinity; }

    var available = source.filter(function(p) { return p.arrival <= time; });
    if (available.length === 0) { time++; continue; }

    var p       = available[0];
    source.splice(source.indexOf(p), 1);
    var runTime = qTime === Infinity ? p.remaining : Math.min(qTime, p.remaining);
    timeline.push({ pid: p.pid, start: time, end: time + runTime });
    time        += runTime;
    p.remaining -= runTime;

    if (p.remaining > 0) {
      if      (source === q0) q1.push(p);
      else if (source === q1) q2.push(p);
      else                    q2.push(p);
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
document.getElementById("sched-algorithm").addEventListener("change", function() {
  var val    = this.value;
  var qGroup = document.getElementById("quantum-group");
  if (val === "rr" || val === "mlfq") {
    qGroup.classList.remove("hidden");
  } else {
    qGroup.classList.add("hidden");
  }
});

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
  if (simData.processes.length === 0) {
    alert("No hay procesos en simData.");
    return;
  }
  startSched();
});

function startSched() {
  if (!validateSimData()) return;
  var algorithm = document.getElementById("sched-algorithm").value;
  var quantum   = parseInt(document.getElementById("sched-quantum").value) || 2;
  var procs     = copyProcesses();
  var timeline;

  switch (algorithm) {
    case "fcfs":       timeline = runFCFS(procs);          break;
    case "sjf":        timeline = runSJF(procs);           break;
    case "hrrn":       timeline = runHRRN(procs);          break;
    case "rr":         timeline = runRR(procs, quantum);   break;
    case "srtf":       timeline = runSRTF(procs);          break;
    case "priority_p": timeline = runPriorityP(procs);     break;
    case "mlq":        timeline = runMLQ(procs);           break;
    case "mlfq":       timeline = runMLFQ(procs, quantum); break;
    default:           timeline = runFCFS(procs);
  }

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
  initStatesCanvas();
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
  var btn = document.getElementById("btn-start-states");
  if (btn) btn.textContent = "▶ Iniciar";

  resetCanvases();
  activeStates = {};
  if (statesCanvas) drawStatesStatic(null, null);
  var label = document.getElementById("current-pid-state");
  if (label) label.textContent = "Proceso: Ninguno";
  var tbody = document.getElementById("states-table-body");
  if (tbody) tbody.innerHTML = "";
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
    updateStatesDiagram(timeline, step, simData.processes);
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
