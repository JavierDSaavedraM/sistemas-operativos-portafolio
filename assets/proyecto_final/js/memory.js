// ============================================================
// ESTADO GLOBAL DE MEMORIA
// ============================================================
var memState = {
  frames      : [],
  pageFaults  : 0,
  isRunning   : false,
  currentStep : 0,
  timeline    : []
};

var replaceState = {
  references  : [],
  frames      : [],
  step        : 0,
  faults      : 0,
  hits        : 0,
  history     : [],
  isRunning   : false,
  stepPaused  : false,
  fifoQueue   : [],
  lruOrder    : [],
  clockPtr    : 0,
  refBits     : []
};

// Canvas
var memCanvas  = null;
var memCtx     = null;

var FRAME_W   = 80;
var FRAME_H   = 50;
var FRAME_GAP = 8;
var COLS      = 4;

// ============================================================
// INIT
// ============================================================
function initTabs(containerSelector) {
  var container = document.querySelector(containerSelector);
  if (!container) return;

  var buttons = container.querySelectorAll(".tab-btn");
  var panels  = container.querySelectorAll(".tab-panel");

  buttons.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var target = btn.getAttribute("data-tab");

      buttons.forEach(function(b) { b.classList.remove("active"); });
      panels.forEach(function(p)  { p.classList.remove("active"); });

      btn.classList.add("active");
      container.querySelector("#" + target).classList.add("active");
    });
  });

  if (buttons.length > 0) buttons[0].click();
}
function initMemoryCanvases() {
  memCanvas = document.getElementById("mem-canvas");
  memCtx    = memCanvas ? memCanvas.getContext("2d") : null;
  initReplaceCanvas();
}

document.addEventListener("DOMContentLoaded", function() {
  initTabs("#memory-tabs");
  initMemoryCanvases();
  initMemoryControls();
});

// ============================================================
// CONTROLES
// ============================================================
function initMemoryControls() {
  var btnRun = document.getElementById("btn-run-memory");
  if (btnRun) {
    btnRun.addEventListener("click", function() {
      if (memState.isRunning) resetMemory();
      else startMemory();
    });
  }

  var btnReset = document.getElementById("btn-reset-memory");
  if (btnReset) btnReset.addEventListener("click", resetMemory);

  var btnRunReplace = document.getElementById("btn-run-replace");
  if (btnRunReplace) {
    btnRunReplace.addEventListener("click", function() {
      if (replaceState.isRunning) resetReplace();
      else startReplace();
    });
  }

  var btnResetReplace = document.getElementById("btn-reset-replace");
  if (btnResetReplace) btnResetReplace.addEventListener("click", resetReplace);

  var speedSlider = document.getElementById("replace-speed");
  if (speedSlider) {
    speedSlider.addEventListener("input", function() {
      document.getElementById("replace-speed-label").textContent = this.value + "ms";
    });
  }

  var pidSelect = document.getElementById("mem-pid-select");
  if (pidSelect) {
    pidSelect.addEventListener("change", function() {
      renderPageTable(parseInt(this.value));
    });
  }
}

// ============================================================
// MEMORIA PRINCIPAL
// ============================================================
function startMemory() {
  if (schedState.timeline.length === 0) {
    alert("Primero corre un algoritmo en Scheduling.");
    return;
  }

  memState.frames      = new Array(simData.memory.frames).fill(null);
  memState.pageFaults  = 0;
  memState.isRunning   = true;
  memState.currentStep = 0;
  memState.timeline    = [];

  document.getElementById("btn-run-memory").textContent = "↺ Reset";
  document.getElementById("btn-reset-memory").disabled  = false;

  generateMemoryTimeline();
  runMemoryStep();
}

function generateMemoryTimeline() {
  var frames    = new Array(simData.memory.frames).fill(null);
  var fifoQueue = [];
  var refs      = buildReferenceString();

  memState.timeline = [];
  refs.forEach(function(page) {
    var hit     = frames.indexOf(page) !== -1;
    if (!hit) {
      memState.pageFaults++;
      var freeIdx = frames.indexOf(null);
      if (freeIdx !== -1) {
        frames[freeIdx] = page;
        fifoQueue.push(freeIdx);
      } else {
        var ri     = fifoQueue.shift();
        frames[ri] = page;
        fifoQueue.push(ri);
      }
    }

    memState.timeline.push({
      frames : frames.map(function(f) { return f !== null ? Object.assign({}, parsePage(f)) : null; }),
      page   : page,
      fault  : !hit
    });
  });
}

function parsePage(pageNum) {
  return {
    pid  : Math.floor(pageNum / 100),
    page : pageNum % 100,
    label: "P" + Math.floor(pageNum / 100) + "-" + (pageNum % 100)
  };
}

function runMemoryStep() {
  var speed = 2100 - parseInt(document.getElementById("sched-speed").value);

  function nextStep() {
    if (memState.currentStep >= memState.timeline.length) {
      document.getElementById("btn-run-memory").textContent = "✓ Terminado";
      return;
    }

    var snap = memState.timeline[memState.currentStep];
    memState.currentStep++;
    memState.frames = snap.frames;

    renderMemoryCanvas(snap);
    updateMemSummary();
    updatePidSelect();

    setTimeout(nextStep, speed);
  }

  nextStep();
}

function updateMemoryFromSched(timeline, step) {
  if (!memState.isRunning) return;
  if (memState.currentStep >= memState.timeline.length) return;

  var snap = memState.timeline[memState.currentStep];
  if (!snap) return;
  memState.currentStep++;
  memState.frames = snap.frames;

  renderMemoryCanvas(snap);
  updateMemSummary();
  updatePidSelect();
}

// ============================================================
// RENDER MEMORIA CANVAS
// ============================================================
function renderMemoryCanvas(snap) {
  if (!memCanvas || !memCtx) return;

  var occupied = snap.frames.filter(function(f) { return f !== null; });
  var rows     = Math.ceil(occupied.length / COLS);

  memCanvas.width  = COLS * (FRAME_W + FRAME_GAP) + FRAME_GAP;
  memCanvas.height = Math.max(rows * (FRAME_H + FRAME_GAP) + FRAME_GAP, 60);

  memCtx.clearRect(0, 0, memCanvas.width, memCanvas.height);

  var col = 0, row = 0;
  snap.frames.forEach(function(f, idx) {
    if (!f) return;

    var x     = FRAME_GAP + col * (FRAME_W + FRAME_GAP);
    var y     = FRAME_GAP + row * (FRAME_H + FRAME_GAP);
    var color = getColor(f.pid);
    var isNew = snap.fault && f.label === pageLabel(snap.page);

    if (isNew) {
      memCtx.shadowColor   = "rgba(0,0,0,0.3)";
      memCtx.shadowBlur    = 8;
      memCtx.shadowOffsetX = 2;
      memCtx.shadowOffsetY = 2;
    }

    memCtx.fillStyle   = color;
    memCtx.strokeStyle = isNew ? "#e63" : "#000";
    memCtx.lineWidth   = isNew ? 3 : 1.5;
    roundRect(memCtx, x, y, FRAME_W, FRAME_H, 5);
    memCtx.fill();
    memCtx.stroke();

    memCtx.shadowColor = "transparent";
    memCtx.shadowBlur  = 0;

    memCtx.fillStyle    = "#000";
    memCtx.font         = "bold 12px Arial";
    memCtx.textAlign    = "center";
    memCtx.textBaseline = "middle";
    memCtx.fillText(f.label, x + FRAME_W / 2, y + FRAME_H / 2);

    memCtx.fillStyle    = "#555";
    memCtx.font         = "9px Arial";
    memCtx.textAlign    = "left";
    memCtx.textBaseline = "top";
    memCtx.fillText("F" + idx, x + 3, y + 2);

    col++;
    if (col >= COLS) { col = 0; row++; }
  });
}

// ============================================================
// SUMMARY Y TABLA DE PAGINAS
// ============================================================
function updateMemSummary() {
  var total = simData.memory.frames;
  var used  = memState.frames.filter(function(f) { return f !== null; }).length;
  var free  = total - used;

  document.getElementById("mem-used").textContent         = used;
  document.getElementById("mem-free").textContent         = free;
  document.getElementById("mem-fragmentation").textContent = "0 KB";
  document.getElementById("mem-page-faults").textContent  = memState.pageFaults;
  document.getElementById("mem-status").textContent       = "Frames libres: " + free + " / " + total;
}

function updatePidSelect() {
  var select = document.getElementById("mem-pid-select");
  if (!select) return;
  var current = select.value;
  select.innerHTML = '<option value="">-- Seleccionar --</option>';
  simData.processes.forEach(function(p) {
    var opt = document.createElement("option");
    opt.value       = p.pid;
    opt.textContent = "P" + p.pid;
    select.appendChild(opt);
  });
  if (current) {
    select.value = current;
    renderPageTable(parseInt(current));
  }
}

function renderPageTable(pid) {
  var tbody = document.getElementById("mem-page-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!pid) return;

  var proc = simData.processes.find(function(p) { return p.pid === pid; });
  if (!proc) return;

  for (var page = 0; page < proc.pages; page++) {
    var frameIdx = -1;
    memState.frames.forEach(function(f, i) {
      if (f && f.pid === pid && f.page === page) frameIdx = i;
    });

    var valid = frameIdx !== -1;
    var tr    = document.createElement("tr");
    tr.innerHTML =
      '<td>' + page + '</td>' +
      '<td>' + (valid ? "F" + frameIdx : "-") + '</td>' +
      '<td><span class="valid-bit ' + (valid ? "valid" : "invalid") + '">' + (valid ? "1" : "0") + '</span></td>' +
      '<td>0</td>';
    tbody.appendChild(tr);
  }
}

// ============================================================
// RESET MEMORIA
// ============================================================
function resetMemory() {
  memState.frames      = [];
  memState.pageFaults  = 0;
  memState.isRunning   = false;
  memState.currentStep = 0;
  memState.timeline    = [];

  document.getElementById("btn-run-memory").textContent   = "▶ Correr";
  document.getElementById("btn-reset-memory").disabled    = true;
  document.getElementById("mem-used").textContent         = "-";
  document.getElementById("mem-free").textContent         = "-";
  document.getElementById("mem-fragmentation").textContent = "-";
  document.getElementById("mem-page-faults").textContent  = "0";
  document.getElementById("mem-status").textContent       = "Frames libres: - / -";
  document.getElementById("mem-page-table-body").innerHTML = "";

  if (memCtx) memCtx.clearRect(0, 0, memCanvas.width, memCanvas.height);
}

// ============================================================
// REFERENCIAS
// ============================================================
function buildReferenceString() {
  var refs    = [];
  var visited = {};

  schedState.timeline.forEach(function(block) {
    var proc = simData.processes.find(function(p) { return p.pid === block.pid; });
    if (!proc) return;

    var pid      = block.pid;
    var numPages = proc.pages;

    if (!visited[pid]) visited[pid] = 0;

    // Acceder paginas en patron ciclico con solapamiento
    // esto crea working sets que diferencian los algoritmos
    var count = Math.max(2, Math.ceil(numPages * 0.75));
    for (var a = 0; a < count; a++) {
      var pageIdx = (visited[pid] + a) % numPages;
      refs.push(pid * 100 + pageIdx);
    }

    // Avanzar el puntero por la mitad para crear solapamiento
    visited[pid] = (visited[pid] + Math.ceil(count / 2)) % numPages;
  });

  return refs;
}

function pageLabel(page) {
  var pid = Math.floor(page / 100);
  var pg  = page % 100;
  return "P" + pid + "-" + pg;
}

// ============================================================
// ALGORITMOS DE REEMPLAZO
// ============================================================
function generateReplaceHistory(algorithm, references, numFrames) {
  var frames   = new Array(numFrames).fill(null);
  var history  = [];
  var fifo     = [];
  var lruOrder = [];
  var clockPtr = 0;
  var refBits  = new Array(numFrames).fill(0);

  references.forEach(function(page, i) {
    var hit         = frames.indexOf(page) !== -1;
    var fault       = !hit;
    var replaced    = null;
    var replacedIdx = null;

    if (!hit) {
      var freeIdx = frames.indexOf(null);
      if (freeIdx !== -1) {
        frames[freeIdx] = page;
        replacedIdx     = freeIdx;
        if (algorithm === "fifo")                            fifo.push(freeIdx);
        if (algorithm === "lru")                             lruOrder.push(page);
        if (algorithm === "clock" || algorithm === "second") refBits[freeIdx] = 1;
      } else {
        var ri;
        if (algorithm === "fifo") {
          ri          = fifo.shift();
          replaced    = frames[ri];
          frames[ri]  = page;
          fifo.push(ri);
        } else if (algorithm === "lru") {
          var lruPage = lruOrder.shift();
          ri          = frames.indexOf(lruPage);
          replaced    = frames[ri];
          frames[ri]  = page;
          lruOrder.push(page);
        } else if (algorithm === "optimal") {
          var future   = references.slice(i + 1);
          var farthest = -1;
          ri = 0;
          frames.forEach(function(f, idx) {
            var nextUse = future.indexOf(f);
            if (nextUse === -1) nextUse = Infinity;
            if (nextUse > farthest) { farthest = nextUse; ri = idx; }
          });
          replaced   = frames[ri];
          frames[ri] = page;
        } else if (algorithm === "clock") {
          while (refBits[clockPtr] === 1) {
            refBits[clockPtr] = 0;
            clockPtr = (clockPtr + 1) % numFrames;
          }
          ri          = clockPtr;
          replaced    = frames[ri];
          frames[ri]  = page;
          refBits[ri] = 1;
          clockPtr    = (clockPtr + 1) % numFrames;
        } else if (algorithm === "second") {
          while (refBits[clockPtr] === 1) {
            refBits[clockPtr] = 0;
            clockPtr = (clockPtr + 1) % numFrames;
          }
          ri          = clockPtr;
          replaced    = frames[ri];
          frames[ri]  = page;
          refBits[ri] = 0;
          clockPtr    = (clockPtr + 1) % numFrames;
        }
        replacedIdx = ri;
      }
    } else {
      replacedIdx = frames.indexOf(page);
      if (algorithm === "lru") {
        var idx = lruOrder.indexOf(page);
        if (idx !== -1) lruOrder.splice(idx, 1);
        lruOrder.push(page);
      }
      if (algorithm === "clock" || algorithm === "second") {
        var fi = frames.indexOf(page);
        if (fi !== -1) refBits[fi] = 1;
      }
    }

    history.push({
      page        : page,
      frames      : frames.slice(),
      fault       : fault,
      replaced    : replaced,
      replacedIdx : replacedIdx,
      refBits     : refBits.slice(),
      references  : references,
      refIdx      : i,
      label       : pageLabel(page)
    });
  });

  return history;
}

// ============================================================
// INICIAR REEMPLAZO
// ============================================================
function startReplace() {
  if (schedState.timeline.length === 0) {
    alert("Primero corre un algoritmo en Scheduling.");
    return;
  }

  var algorithm  = document.getElementById("replace-algorithm").value;
  var numFrames  = simData.memory.frames;
  var references = buildReferenceString();

  replaceState.references = references;
  replaceState.frames     = new Array(numFrames).fill(null);
  replaceState.step       = 0;
  replaceState.faults     = 0;
  replaceState.hits       = 0;
  replaceState.history    = generateReplaceHistory(algorithm, references, numFrames);
  replaceState.isRunning  = true;
  replaceState.stepPaused = false;

  document.getElementById("btn-run-replace").textContent = "↺ Reset";
  document.getElementById("btn-reset-replace").disabled  = false;

  initReplaceCanvas();
  runReplaceStep();
}

// ============================================================
// PASO AUTOMATICO REEMPLAZO
// ============================================================
function runReplaceStep() {
  replaceState.stepPaused = false;

  function nextStep() {
    if (replaceState.stepPaused) return;
    if (replaceState.step >= replaceState.history.length) {
      document.getElementById("btn-run-replace").textContent = "✓ Terminado";
      document.getElementById("btn-run-replace").disabled    = true;
      updateReplaceSummary();
      return;
    }

    var snap  = replaceState.history[replaceState.step];
    var speed = parseInt(document.getElementById("replace-speed").value);

    if (snap.fault) replaceState.faults++;
    else            replaceState.hits++;

    updateReplaceSummary();
    replaceState.step++;

    renderReplaceStep(snap, function() {
      setTimeout(nextStep, speed * 0.2);
    });
  }

  nextStep();
}

function updateReplaceSummary() {
  var total = replaceState.faults + replaceState.hits;
  var rate  = total > 0 ? ((replaceState.faults / total) * 100).toFixed(1) + "%" : "-";
  document.getElementById("replace-faults").textContent = replaceState.faults;
  document.getElementById("replace-hits").textContent   = replaceState.hits;
  document.getElementById("replace-rate").textContent   = rate;
}

// ============================================================
// RESET REEMPLAZO
// ============================================================
function resetReplace() {
  replaceState.references = [];
  replaceState.frames     = [];
  replaceState.step       = 0;
  replaceState.faults     = 0;
  replaceState.hits       = 0;
  replaceState.history    = [];
  replaceState.isRunning  = false;
  replaceState.stepPaused = false;

  document.getElementById("btn-run-replace").textContent = "▶ Correr";
  document.getElementById("btn-run-replace").disabled    = false;
  document.getElementById("btn-reset-replace").disabled  = true;
  document.getElementById("replace-faults").textContent  = "0";
  document.getElementById("replace-hits").textContent    = "0";
  document.getElementById("replace-rate").textContent    = "-";

  resetReplaceCanvas();
}
