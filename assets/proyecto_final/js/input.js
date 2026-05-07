// Anclar el elemento html con la funcion funcion de las tabs
document.addEventListener("DOMContentLoaded", function () {
  var container = document.querySelector("#input-datos");
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

  var coresInput = document.getElementById("thread-cores");
  if (coresInput) {
    coresInput.addEventListener("change", function() {
      var val = parseInt(this.value);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 10) {
        alert("Máximo 10 cores permitidos.");
        val = 10;
      }
      this.value = val;
      renderCoresGrid(val);
    });
    renderCoresGrid(2);
  }
});


// ── Estructura para algoritmos ──────────────────────────────────────────
var simData = {
  processes: [],
  memory: { total: 64, pageSize: 4, frames: 16 },
  scheduling: { algorithm: "fcfs", quantum: 2 },
  replacement: { algorithm: "fifo", references: [] }
};

// ── Render ──────────────────────────────────────────
// Unica funcion que escribe en la tabla HTML
function renderTabla() {
  var tbody = document.querySelector("#tabla-procesos tbody");
  tbody.innerHTML = "";
  simData.processes.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>P' + p.pid + '</td>' +
      '<td><input type="number" class="arrival"  value="' + p.arrival  + '"></td>' +
      '<td><input type="number" class="burst"    value="' + p.burst    + '"></td>' +
      '<td><input type="number" class="priority" value="' + p.priority + '"></td>' +
      '<td><input type="number" class="pages"    value="' + p.pages    + '"></td>' +
      '<td><select class="proc-type"><option value="thread">T</option><option value="fork">F</option></select></td>' +
      '<td><button class="btn-remove-row">X</button></td>';
    tbody.appendChild(tr);
    // Restaurar valor del select despues de insertar
    tr.querySelector(".proc-type").value = p.type || "thread";
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
      priority: parseInt(tr.querySelector(".priority").value) || 0,
      pages:    parseInt(tr.querySelector(".pages").value)    || 0,
      type: tr.querySelector(".proc-type").value || "thread"
    });
  });
}

// ── Agregar proceso ─────────────────────────────────
document.getElementById("btn-add-proceso").addEventListener("click", function() {
  syncFromTabla();
  var nextPID = simData.processes.length > 0
    ? simData.processes[simData.processes.length - 1].pid + 1
    : 1;
  simData.processes.push({ pid: nextPID, arrival: 0, burst: 0, priority: 0, pages: 0, type: "thread" });
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
  if (input.matches("input[type='number']")) {
    validateCell(input);
  }
  syncFromTabla();
});

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
    if (p.burst === 1)    warnings.push("P" + p.pid + ": Burst en valor default (1).");
    if (p.priority === 1) warnings.push("P" + p.pid + ": Priority en valor default (1).");
    if (p.pages === 1)    warnings.push("P" + p.pid + ": Pages en valor default (1).");
    if (p.arrival < 0)    errors.push("P" + p.pid + ": Arrival no puede ser negativo.");
    if (p.burst < 1)      errors.push("P" + p.pid + ": Burst debe ser >= 1.");
    if (p.priority < 1)   errors.push("P" + p.pid + ": Priority debe ser >= 1.");
    if (p.pages < 1)      errors.push("P" + p.pid + ": Pages debe ser >= 1.");
  });

  if (simData.memory.total < 1)    errors.push("Memoria total debe ser >= 1.");
  if (simData.memory.pageSize < 1) errors.push("Tamaño de página debe ser >= 1.");
  if (simData.memory.frames < 1)   errors.push("Número de frames debe ser >= 1.");
  if (simData.memory.frames * simData.memory.pageSize > simData.memory.total) {
    errors.push("Frames × PageSize (" + (simData.memory.frames * simData.memory.pageSize) + ") excede memoria total (" + simData.memory.total + ").");
  }

  if (errors.length > 0) {
    alert("Errores que impiden ejecutar:\n\n" + errors.join("\n"));
    return false;
  }

  if (warnings.length > 0) {
    return confirm("Advertencias (valores en default):\n\n" + warnings.join("\n") + "\n\n¿Continuar de todas formas?");
  }

  return true;
}

// ── Carga desde archivo de procesos ─────────────────
document.getElementById("file-procesos").addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    parseProcesos(e.target.result);
    renderTabla();
    showStatus("status-procesos");
  };
  reader.readAsText(file);
});

function parseProcesos(text) {
  simData.processes = [];
  var lines = text.trim().split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "" || line.toLowerCase().startsWith("pid")) continue;
    var parts = line.split(",");
    if (parts.length < 5) continue;
    simData.processes.push({
      pid:      parseInt(parts[0]),
      arrival:  parseInt(parts[1]),
      burst:    parseInt(parts[2]),
      priority: parseInt(parts[3]),
      pages:    parseInt(parts[4]),
      type:     parts[5] ? parts[5].trim() : "thread"
    });
  }
}
// Mostrar carga exitosa de archivos
function showStatus(id) {
  var el = document.getElementById(id);
  el.classList.remove("hidden");
  setTimeout(function() {
    el.classList.add("hidden");
  }, 3000);
}

// ── Carga desde archivo de memoria ──────────────────
document.getElementById("file-memoria").addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    parseMemoria(e.target.result);
    renderMemoria();
    showStatus("status-memoria");
  };
  reader.readAsText(file);
});

function parseMemoria(text) {
  var lines = text.trim().split("\n");
  lines.forEach(function(line) {
    line = line.trim();
    var parts = line.split("=");
    if (parts.length < 2) return;
    var key = parts[0].trim().toLowerCase();
    var val = parseInt(parts[1].trim());
    if      (key === "memoria")  simData.memory.total    = val;
    else if (key === "pagesize") simData.memory.pageSize = val;
    else if (key === "frames")   simData.memory.frames   = val;
  });
}

// ── Render memoria ───────────────────────────────────
// Actualiza los inputs de la tab de memoria con simData
function renderMemoria() {
  document.querySelector(".mem-total").value    = simData.memory.total;
  document.querySelector(".mem-pagesize").value = simData.memory.pageSize;
  document.querySelector(".mem-frames").value   = simData.memory.frames;
}

// ── Edicion manual de memoria ────────────────────────
document.getElementById("form-memoria").addEventListener("change", function() {
  simData.memory.total    = parseInt(document.querySelector(".mem-total").value)    || 64;
  simData.memory.pageSize = parseInt(document.querySelector(".mem-pagesize").value) || 4;
  simData.memory.frames   = parseInt(document.querySelector(".mem-frames").value)   || 16;
});
