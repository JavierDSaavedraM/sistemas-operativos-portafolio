// ============================================================
// ESTADO GLOBAL DE THREADS
// ============================================================
var threadState = {
  processes  : [],   // procesos con threads generados
  cores      : [],   // [{ id, currentThread }]
  timeline   : [],   // [{ coreId, threadId, pid, start, end }]
  currentStep: 0,
  isRunning  : false,
  stepPaused : false,
  numCores   : 2,
  metrics: {}
};

// ============================================================
// GENERACION DE THREADS Y FORKS
// ============================================================
function generateThreadsAndForks() {
  threadState.processes = [];
  var nextPID = Math.max.apply(null, simData.processes.map(function(p) { return p.pid; })) + 1;

  simData.processes.forEach(function(p) {
    var numThreads  = p.pages || 1;
    var burstThread = Math.round((p.burst / numThreads) * 100) / 100;

    if (p.type === "fork") {
      // Proceso original
      var original = {
        pid     : p.pid,
        label   : "P" + p.pid,
        type    : "process",
        arrival : p.arrival,
        burst   : p.burst,
        priority: p.priority,
        memory  : { frames: [], pageSize: simData.memory ? simData.memory.pageSize : 4 },
        threads : []
      };
      for (var t = 0; t < numThreads; t++) {
        original.threads.push({
          id       : t + 1,
          label    : "P" + p.pid + "-T" + (t + 1),
          burst    : burstThread,
          remaining: burstThread,
          arrival  : p.arrival,
          state    : "new",
          core     : null
        });
      }
      threadState.processes.push(original);

      // Proceso fork - PID nuevo, memoria separada
      var fork = {
        pid     : nextPID,
        label   : "F" + p.pid + "-" + nextPID,
        type    : "fork",
        arrival : p.arrival,
        burst   : p.burst,
        priority: p.priority,
        memory  : { frames: [], pageSize: simData.memory ? simData.memory.pageSize : 4 },
        threads : []
      };
      for (var tf = 0; tf < numThreads; tf++) {
        fork.threads.push({
          id       : tf + 1,
          label    : "P" + nextPID + "-T" + (tf + 1),
          burst    : burstThread,
          remaining: burstThread,
          arrival  : p.arrival,
          state    : "new",
          core     : null
        });
      }
      threadState.processes.push(fork);
      nextPID++;

    } else {
      // Thread normal - comparte memoria del proceso padre
      var proc = {
        pid     : p.pid,
        label   : "P" + p.pid,
        type    : "thread",
        arrival : p.arrival,
        burst   : p.burst,
        priority: p.priority,
        memory  : null,   // comparte memoria del padre
        threads : []
      };
      for (var th = 0; th < numThreads; th++) {
        proc.threads.push({
          id       : th + 1,
          label    : "P" + p.pid + "-T" + (th + 1),
          burst    : burstThread,
          remaining: burstThread,
          arrival  : p.arrival,
          state    : "new",
          core     : null
        });
      }
      threadState.processes.push(proc);
    }
  });
}

// ============================================================
// SCHEDULER MULTICORE
// Adapta el algoritmo seleccionado para distribuir threads entre cores
// ============================================================
function runMulticoreScheduler() {
  var numCores  = threadState.numCores;
  var algorithm = document.getElementById("thread-algorithm") 
    ? document.getElementById("thread-algorithm").value 
    : "fcfs";

  // Flatten todos los threads de todos los procesos
  var allThreads = [];
  threadState.processes.forEach(function(proc) {
    proc.threads.forEach(function(t) {
      allThreads.push({
        pid      : proc.pid,
        tid      : t.id,
        label    : t.label,
        arrival  : proc.arrival,
        burst    : t.burst,
        remaining: t.burst,
        priority : proc.priority,
        isFork   : proc.type === "fork",  // agregar esto
        state    : "new"
      });
    });
  });

  var timeline  = [];
  var time      = 0;
  var cores     = new Array(numCores).fill(null).map(function(_, i) {
    return { id: i, free: true, freeAt: 0 };
  });
  var remaining = allThreads.slice();
  var quantum   = parseInt(document.getElementById("thread-quantum") 
    ? document.getElementById("thread-quantum").value 
    : 2) || 2;

  var maxTime = allThreads.reduce(function(acc, t) { return acc + t.burst; }, 0)
    + Math.max.apply(null, allThreads.map(function(t) { return t.arrival; })) + 1;

  while (remaining.length > 0 && time <= maxTime) {
    // Liberar cores que terminaron
    cores.forEach(function(core) {
      if (!core.free && core.freeAt <= time) core.free = true;
    });

    var freeCores = cores.filter(function(c) { return c.free; });
    if (freeCores.length === 0) { time++; continue; }

    var available = remaining.filter(function(t) { return t.arrival <= time; });
    if (available.length === 0) { time++; continue; }

    // Ordenar según algoritmo
    if (algorithm === "fcfs") {
      available.sort(function(a, b) { return a.arrival - b.arrival || a.pid - b.pid; });
    } else if (algorithm === "sjf" || algorithm === "srtf") {
      available.sort(function(a, b) { return a.remaining - b.remaining; });
    } else if (algorithm === "priority") {
      available.sort(function(a, b) { return a.priority - b.priority || a.arrival - b.arrival; });
    } else if (algorithm === "rr") {
      // Round robin - tomar en orden
      available.sort(function(a, b) { return a.arrival - b.arrival; });
    }

    // Asignar threads disponibles a cores libres
    var assigned = 0;
    freeCores.forEach(function(core) {
      if (assigned >= available.length) return;
      var t = available[assigned];
      assigned++;

      var runTime = algorithm === "rr"
        ? Math.min(quantum, t.remaining)
        : t.remaining;

      timeline.push({
        coreId  : core.id,
        pid     : t.pid,
        tid     : t.tid,
        label   : t.label,
        isFork  : t.isFork,  
        start   : time,
        end     : time + runTime
      });

      t.remaining -= runTime;
      core.free    = false;
      core.freeAt  = time + runTime;

      if (t.remaining <= 0) {
        remaining.splice(remaining.indexOf(t), 1);
      }
    });

    // Avanzar tiempo al siguiente evento
    var nextEvent = Math.min.apply(null, cores.map(function(c) { return c.freeAt; }));
    time = nextEvent;
  }

  return timeline;
}

// ============================================================
// INICIAR SIMULACION
// ============================================================
function startThreads() {
  if (simData.processes.length === 0) {
    alert("No hay procesos en simData.");
    return;
  }

  var rawCores = parseInt(document.getElementById("thread-cores").value) || 2;
  if (rawCores > 10) {
    alert("Máximo 10 cores permitidos. Se usarán 10.");
  }
  threadState.numCores = Math.min(10, Math.max(1, rawCores));
  document.getElementById("thread-cores").value = threadState.numCores;

  generateThreadsAndForks();

  var timeline = runMulticoreScheduler();
  threadState.metrics = calcThreadMetrics(timeline);
  threadState.timeline    = timeline;
  threadState.currentStep = 0;
  threadState.isRunning   = true;
  threadState.stepPaused  = false;
  threadState.cores       = new Array(threadState.numCores).fill(null).map(function(_, i) {
    return { id: i, currentThread: null };
  });

  document.getElementById("btn-run-threads").textContent  = "↺ Reset";
  document.getElementById("btn-run-threads").classList.add("running");
  document.getElementById("btn-pause-threads").disabled   = false;
  document.getElementById("btn-reset-threads").disabled   = false;

  initThreadCanvases();
  runThreadStep();
}

function resetThreads() {
  threadState.processes   = [];
  threadState.cores       = [];
  threadState.timeline    = [];
  threadState.currentStep = 0;
  threadState.isRunning   = false;
  threadState.stepPaused  = false;

  document.getElementById("btn-run-threads").textContent  = "▶ Correr";
  document.getElementById("btn-run-threads").classList.remove("running");
  document.getElementById("btn-pause-threads").textContent = "⏸ Pausar";
  document.getElementById("btn-pause-threads").disabled   = true;
  document.getElementById("btn-reset-threads").disabled   = true;
  document.getElementById("thread-metrics-body").innerHTML = "";
  document.getElementById("t-avg-turnaround").textContent  = "-";
  document.getElementById("t-avg-waiting").textContent     = "-";
  document.getElementById("t-avg-response").textContent    = "-";

  var tbody = document.getElementById("thread-table-body");
  if (tbody) tbody.innerHTML = "";

  resetThreadCanvases();
}

// ============================================================
// PASO AUTOMATICO
// ============================================================
function runThreadStep() {
  document.getElementById("btn-pause-threads").textContent = "⏸ Pausar";
  threadState.stepPaused = false;

  function nextStep() {
    if (threadState.stepPaused) return;
    if (threadState.currentStep >= threadState.timeline.length) {
      document.getElementById("btn-pause-threads").textContent = "✓ Terminado";
      document.getElementById("btn-pause-threads").disabled    = true;
      return;
    }

    threadState.currentStep++;
    var step     = threadState.currentStep;
    var timeline = threadState.timeline;
    var speed    = 2100 - parseInt(document.getElementById("thread-speed").value);

    // Actualizar estado de cores
    var block = timeline[step - 1];
    threadState.cores[block.coreId].currentThread = block;

    updateCoresGrid(timeline, step);
    renderThreadMetricsTable(timeline, step);
    renderThreadGantt(timeline, step, function() {
      setTimeout(nextStep, speed * 0.4);
    });
  }

  nextStep();
}

// ============================================================
// RENDER TABLA DE THREADS
// ============================================================


function updateCoresGrid(timeline, step) {
  var block = timeline[step - 1];
  if (!block) return;

  // Calcular qué corre en cada core en este instante
  var active = {};
  timeline.slice(0, step).forEach(function(b) {
    if (b.start <= block.start && b.end > block.start) {
      active[b.coreId] = b;
    }
  });

  threadState.cores.forEach(function(core) {
    var el = document.getElementById("core-box-" + core.id);
    if (!el) return;
    var running = active[core.id];
    if (running) {
      el.style.background = getThreadColor(running.pid, running.tid);
      el.querySelector(".core-label").textContent = running.label;
      el.querySelector(".core-status").textContent = "t=" + parseFloat(running.start.toFixed(2)) + "→" + parseFloat(running.end.toFixed(2));
    } else {
      el.style.background = "#eee";
      el.querySelector(".core-label").textContent = "Idle";
      el.querySelector(".core-status").textContent = "";
    }
  });
}

// ============================================================
// CONTROLES
// ============================================================
document.addEventListener("DOMContentLoaded", function() {
  initMLFQConfig();
  var btnRun = document.getElementById("btn-run-threads");
  if (btnRun) {
    btnRun.addEventListener("click", function() {
      if (threadState.isRunning) { resetThreads(); return; }
      startThreads();
    });
  }

  var btnPause = document.getElementById("btn-pause-threads");
  if (btnPause) {
    btnPause.addEventListener("click", function() {
      if (!threadState.isRunning) return;
      if (!threadState.stepPaused) {
        threadState.stepPaused = true;
        if (threadAnimState && threadAnimState.blockAnim) {
          cancelAnimationFrame(threadAnimState.blockAnim);
          threadAnimState.blockAnim = null;
        }
        btnPause.textContent = "▶ Continuar";
      } else {
        runThreadStep();
      }
    });
  }

  var btnReset = document.getElementById("btn-reset-threads");
  if (btnReset) {
    btnReset.addEventListener("click", resetThreads);
  }

  var speedSlider = document.getElementById("thread-speed");
  if (speedSlider) {
    speedSlider.addEventListener("input", function() {
      document.getElementById("thread-speed-label").textContent = (2100 - parseInt(this.value)) + "ms";
    });
  }

  var coresInput = document.getElementById("thread-cores");
  if (coresInput) {
    coresInput.addEventListener("change", function() {
      renderCoresGrid(parseInt(this.value) || 2);
    });
    renderCoresGrid(2);
  }
var threadTooltip = document.getElementById("thread-tooltip");

document.getElementById("thread-metrics-body").addEventListener("mouseover", function(e) {
    var td = e.target.closest("td.has-value");
    if (!td) return;

    var key  = td.getAttribute("data-key");
    var type = td.getAttribute("data-type");
    var m    = threadState.metrics[key];
    if (!m) return;

    var html = "";
    if (type === "completion") {
        html = "<strong>Completion Time</strong><br>Último instante en CPU<br>= <strong>" + m.completion + "</strong>";
    } else if (type === "turnaround") {
        html = "<strong>Turnaround Time</strong><br>CT - Arrival<br>= " + m.completion + " - " + m.arrival + " = <strong>" + m.turnaround + "</strong>";
    } else if (type === "waiting") {
        html = "<strong>Waiting Time</strong><br>TAT - Burst<br>= " + m.turnaround + " - " + m.burst.toFixed(2) + " = <strong>" + m.waiting + "</strong>";
    } else if (type === "response") {
        html = "<strong>Response Time</strong><br>Primera vez en CPU - Arrival<br>= " + (m.response + m.arrival) + " - " + m.arrival + " = <strong>" + m.response + "</strong>";
    }

    threadTooltip.innerHTML = html;
    threadTooltip.classList.remove("hidden");
});

document.getElementById("thread-metrics-body").addEventListener("mousemove", function(e) {
    threadTooltip.style.left = (e.clientX + 14) + "px";
    threadTooltip.style.top  = (e.clientY - 10) + "px";
});

document.getElementById("thread-metrics-body").addEventListener("mouseout", function(e) {
    if (!e.target.closest("td.has-value")) threadTooltip.classList.add("hidden");
});

});

function renderCoresGrid(numCores) {
  var grid = document.getElementById("cores-grid");
  if (!grid) return;
  grid.innerHTML = "";
  for (var i = 0; i < numCores; i++) {
    var div = document.createElement("div");
    div.className = "core-box";
    div.id        = "core-box-" + i;
    div.innerHTML =
      '<div class="core-title">Core ' + i + '</div>' +
      '<div class="core-label">Idle</div>' +
      '<div class="core-status"></div>';
    grid.appendChild(div);
  }
}

// ============================================================
// COLOR POR THREAD
// ============================================================
var threadColors = [
  "#00d4f0","#33e0f5","#66ebf8",
  "#00ffb3","#33ffc2","#66ffd1",
  "#7cff00","#99ff33","#b3ff66",
  "#ffd400","#ffe033","#ffeb66",
  "#ff9a00","#ffad33","#ffc066",
  "#ff5cc8","#ff85d6","#ffade3"
];

function getThreadColor(pid, tid) {
  var base = (pid - 1) * 3;
  var idx  = (base + (tid - 1)) % threadColors.length;
  return threadColors[idx];
}

function calcThreadMetrics(timeline) {
  var metrics       = {};
  var firstResponse = {};

  timeline.forEach(function(block) {
    var key = block.pid + "-" + block.tid;
    if (!firstResponse[key]) firstResponse[key] = block.start;
    if (!metrics[key])       metrics[key] = {};
    metrics[key].completion = block.end;
    metrics[key].pid        = block.pid;
    metrics[key].tid        = block.tid;
    metrics[key].label      = block.label;
    metrics[key].isFork     = block.isFork;
  });

  threadState.processes.forEach(function(proc) {
    proc.threads.forEach(function(t) {
      var key = proc.pid + "-" + t.id;
      var m   = metrics[key] || {};
      m.completion = m.completion || 0;
      m.turnaround = m.completion - proc.arrival;
      m.waiting    = m.turnaround  - t.burst;
      m.response   = (firstResponse[key] || 0) - proc.arrival;
      m.burst      = t.burst;
      m.arrival    = proc.arrival;
      metrics[key] = m;
    });
  });

  return metrics;
}

function renderThreadMetricsTable(timeline, upToStep) {
  var tbody = document.getElementById("thread-metrics-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  var usedBurst = {};
  timeline.slice(0, upToStep).forEach(function(b) {
    var key = b.pid + "-" + b.tid;
    usedBurst[key] = (usedBurst[key] || 0) + (b.end - b.start);
  });

  threadState.processes.forEach(function(proc) {
    proc.threads.forEach(function(t) {
      var key  = proc.pid + "-" + t.id;
      var used = usedBurst[key] || 0;
      var done = used >= t.burst;
      var m    = threadState.metrics[key] || {};

      function fmt(n) { return parseFloat(n.toFixed(2)); }

      var ct  = done ? fmt(m.completion) : "-";
      var tat = done ? fmt(m.turnaround) : "-";
      var wt  = done ? fmt(m.waiting)    : "-";
      var rt  = done ? fmt(m.response)   : "-";

      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + t.label + '</td>' +
        '<td><span class="type-badge type-' + proc.type + '">' + proc.type + '</span></td>' +
        '<td>' + proc.arrival + '</td>' +
        '<td>' + t.burst.toFixed(2) + '</td>' +
        '<td class="'+(done?"has-value":"")+'" data-key="'+key+'" data-type="completion">'  + ct  + '</td>' +
        '<td class="'+(done?"has-value":"")+'" data-key="'+key+'" data-type="turnaround">'  + tat + '</td>' +
        '<td class="'+(done?"has-value":"")+'" data-key="'+key+'" data-type="waiting">'     + wt  + '</td>' +
        '<td class="'+(done?"has-value":"")+'" data-key="'+key+'" data-type="response">'    + rt  + '</td>';
      tbody.appendChild(tr);
    });
  });

  renderThreadSummary(timeline, upToStep);
}

function renderThreadSummary(timeline, upToStep) {
  var usedBurst = {};
  timeline.slice(0, upToStep).forEach(function(b) {
    var key = b.pid + "-" + b.tid;
    usedBurst[key] = (usedBurst[key] || 0) + (b.end - b.start);
  });

  var done = [];
  threadState.processes.forEach(function(proc) {
    proc.threads.forEach(function(t) {
      var key  = proc.pid + "-" + t.id;
      var used = usedBurst[key] || 0;
      if (used >= t.burst) done.push(key);
    });
  });

  if (done.length === 0) return;

  var sumTAT = 0, sumWT = 0, sumRT = 0;
  done.forEach(function(key) {
    var m = threadState.metrics[key];
    if (!m) return;
    sumTAT += m.turnaround;
    sumWT  += m.waiting;
    sumRT  += m.response;
  });

  document.getElementById("t-avg-turnaround").textContent = (sumTAT / done.length).toFixed(2);
  document.getElementById("t-avg-waiting").textContent    = (sumWT  / done.length).toFixed(2);
  document.getElementById("t-avg-response").textContent   = (sumRT  / done.length).toFixed(2);
}

// ============================================================
// MLFQ CONFIG
// ============================================================
var MLFQ_AGING_INTERVAL = 10;
var mlfqConfig = { queues: [] };

function initMLFQConfig() {
    var algSelect = document.getElementById("sched-algorithm");
    if (algSelect) {
        algSelect.addEventListener("change", function() {
            var cfg = document.getElementById("mlfq-config");
            var qg  = document.getElementById("quantum-group");
            if (this.value === "mlfq") {
                cfg.classList.remove("hidden");
                qg.classList.add("hidden");
                if (mlfqConfig.queues.length === 0) {
                    addMLFQRow({ algorithm: "rr",   quantum: 2 });
                    addMLFQRow({ algorithm: "rr",   quantum: 4 });
                    addMLFQRow({ algorithm: "fcfs",  quantum: 8 });
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

    document.getElementById("mlfq-tbody").addEventListener("click", function(e) {
        if (e.target.classList.contains("btn-remove-queue")) {
            var rows = document.querySelectorAll("#mlfq-tbody tr");
            if (rows.length <= 1) {
                alert("Debe haber al menos una cola.");
                return;
            }
            e.target.closest("tr").remove();
            updateMLFQBadges();
        }
    });

    document.getElementById("mlfq-tbody").addEventListener("change", function(e) {
        if (e.target.classList.contains("mlfq-alg")) {
            var row    = e.target.closest("tr");
            var qGroup = row.querySelector(".mlfq-qg");
            qGroup.style.display = e.target.value === "rr" ? "" : "none";
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
            '<div class="mlfq-qg" style="' + (!isRR ? "display:none" : "") + '">' +
                '<input type="number" class="mlfq-quantum" min="1" value="' + (config.quantum || 2) + '">' +
            '</div>' +
        '</td>' +
        '<td><span class="queue-priority-badge"></span></td>' +
        '<td><button class="btn-remove-queue">X</button></td>';

    tbody.appendChild(tr);
    updateMLFQBadges();
}

function updateMLFQBadges() {
    var rows  = document.querySelectorAll("#mlfq-tbody tr");
    var total = rows.length;
    rows.forEach(function(row, i) {
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

function readMLFQConfig() {
    mlfqConfig.queues = [];
    var rows = document.querySelectorAll("#mlfq-tbody tr");
    rows.forEach(function(row) {
        var alg    = row.querySelector(".mlfq-alg").value;
        var qInput = row.querySelector(".mlfq-quantum");
        var quantum = qInput ? parseInt(qInput.value) || 2 : 2;
        mlfqConfig.queues.push({ algorithm: alg, quantum: quantum });
    });
}
