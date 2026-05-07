var statesCanvas = null;
var statesCtx    = null;

var STATE_W = 90;
var STATE_H = 44;
var STATE_R = 8;

var stateNodes = {
  new:        { x: 60,  y: 120, label: "New",       color: "#aaaadd" },
  ready:      { x: 210, y: 120, label: "Ready",      color: "#80c8f0" },
  running:    { x: 370, y: 120, label: "Running",    color: "#80d0a0" },
  waiting:    { x: 370, y: 260, label: "Waiting",    color: "#f0c080" },
  terminated: { x: 530, y: 120, label: "Terminated", color: "#f08080" }
};

var stateTransitions = [
  { from: "new",     to: "ready",      label: "admitted",     curve:  0 },
  { from: "ready",   to: "running",    label: "dispatch",     curve: -1 },
  { from: "running", to: "ready",      label: "interrupt",    curve: -1 },
  { from: "running", to: "waiting",    label: "I/O wait",     curve:  0 },
  { from: "waiting", to: "ready",      label: "I/O complete", curve:  0 },
  { from: "running", to: "terminated", label: "exit",         curve:  0 }
];

var stateAnimAnim = null;
var activeStates  = {};
var statesPlaying = false;
var statesStep    = 0;
var statesTimeout = null;

// ============================================================
// INIT - se llama al cargar la pagina, siempre muestra el diagrama
// ============================================================
function initStatesCanvas() {
  statesCanvas = document.getElementById("states-canvas");
  if (!statesCanvas) return;
  statesCtx = statesCanvas.getContext("2d");

  // Tamaño responsivo al contenedor
  var container = document.getElementById("state-diagram");
  statesCanvas.width  = container ? container.clientWidth  || 620 : 620;
  statesCanvas.height = 340;

  drawStatesStatic(null, null);
}

// ============================================================
// DRAW STATIC
// ============================================================
function drawStatesStatic(highlightState, highlightTransition) {
  if (!statesCtx) return;
  statesCtx.clearRect(0, 0, statesCanvas.width, statesCanvas.height);

  stateTransitions.forEach(function(t) {
    var isActive = highlightTransition &&
      highlightTransition.from === t.from &&
      highlightTransition.to   === t.to;
    drawArrow(t, isActive ? highlightTransition.progress : 1, isActive);
  });

  Object.keys(stateNodes).forEach(function(key) {
    var node     = stateNodes[key];
    var isActive = highlightState === key;
    var hasPIDs  = activeStates && Object.values(activeStates).includes(key);
    drawNode(node, key, isActive, hasPIDs);
  });
}

// ============================================================
// DRAW NODE
// ============================================================
function drawNode(node, key, isActive, hasPIDs) {
  var x = node.x, y = node.y;

  if (isActive) {
    statesCtx.shadowColor   = "rgba(0,0,0,0.35)";
    statesCtx.shadowBlur    = 12;
    statesCtx.shadowOffsetX = 3;
    statesCtx.shadowOffsetY = 3;
  }

  statesCtx.fillStyle   = isActive ? darkenColor(node.color) : node.color;
  statesCtx.strokeStyle = isActive ? "#000" : "#555";
  statesCtx.lineWidth   = isActive ? 3 : 2;
  roundRectPath(statesCtx, x, y, STATE_W, STATE_H, STATE_R);
  statesCtx.fill();
  statesCtx.stroke();

  statesCtx.shadowColor   = "transparent";
  statesCtx.shadowBlur    = 0;
  statesCtx.shadowOffsetX = 0;
  statesCtx.shadowOffsetY = 0;

  statesCtx.fillStyle    = "#000";
  statesCtx.font         = "bold 13px Arial";
  statesCtx.textAlign    = "center";
  statesCtx.textBaseline = "middle";
  statesCtx.fillText(node.label, x + STATE_W / 2, y + STATE_H / 2);

  if (hasPIDs) {
    var pids = Object.keys(activeStates).filter(function(pid) {
      return activeStates[pid] === key;
    }).map(function(pid) { return "P" + pid; }).join(", ");
    statesCtx.fillStyle    = "#333";
    statesCtx.font         = "10px Arial";
    statesCtx.textAlign    = "center";
    statesCtx.textBaseline = "top";
    statesCtx.fillText(pids, x + STATE_W / 2, y + STATE_H + 3);
  }
}

// ============================================================
// DRAW ARROW
// ============================================================
function drawArrow(transition, progress, isActive) {
  var fromNode = stateNodes[transition.from];
  var toNode   = stateNodes[transition.to];
  var points   = getEdgePoints(fromNode, toNode, transition.curve);
  var px1 = points.x1, py1 = points.y1;
  var px2 = points.x2, py2 = points.y2;

  var cpx, cpy;
  if (transition.curve !== 0) {
    var mx  = (px1 + px2) / 2;
    var my  = (py1 + py2) / 2;
    var dx  = px2 - px1;
    var dy  = py2 - py1;
    var len = Math.sqrt(dx * dx + dy * dy);
    cpx = mx - (dy / len) * 40 * transition.curve;
    cpy = my + (dx / len) * 40 * transition.curve;
  }

  statesCtx.strokeStyle = isActive ? "#e63" : "#666";
  statesCtx.lineWidth   = isActive ? 2.5 : 1.5;
  statesCtx.setLineDash([]);

  statesCtx.beginPath();
  if (transition.curve !== 0) {
    var steps = 30;
    var limit = Math.floor(steps * progress);
    statesCtx.moveTo(px1, py1);
    for (var i = 1; i <= limit; i++) {
      var t  = i / steps;
      var bx = (1-t)*(1-t)*px1 + 2*(1-t)*t*cpx + t*t*px2;
      var by = (1-t)*(1-t)*py1 + 2*(1-t)*t*cpy + t*t*py2;
      statesCtx.lineTo(bx, by);
    }
  } else {
    statesCtx.moveTo(px1, py1);
    statesCtx.lineTo(px1 + (px2 - px1) * progress, py1 + (py2 - py1) * progress);
  }
  statesCtx.stroke();

  if (progress >= 1) {
    var angle;
    if (transition.curve !== 0) {
      var t2  = 0.98;
      var bx2 = (1-t2)*(1-t2)*px1 + 2*(1-t2)*t2*cpx + t2*t2*px2;
      var by2 = (1-t2)*(1-t2)*py1 + 2*(1-t2)*t2*cpy + t2*t2*py2;
      angle = Math.atan2(py2 - by2, px2 - bx2);
    } else {
      angle = Math.atan2(py2 - py1, px2 - px1);
    }
    drawArrowHead(px2, py2, angle, isActive ? "#e63" : "#666");

    var lx = transition.curve !== 0
      ? 0.25*px1 + 0.5*cpx + 0.25*px2
      : (px1 + px2) / 2;
    var ly = transition.curve !== 0
      ? 0.25*py1 + 0.5*cpy + 0.25*py2 - 8
      : (py1 + py2) / 2 - 10;

    statesCtx.fillStyle    = isActive ? "#e63" : "#555";
    statesCtx.font         = isActive ? "bold 10px Arial" : "10px Arial";
    statesCtx.textAlign    = "center";
    statesCtx.textBaseline = "bottom";
    statesCtx.fillText(transition.label, lx, ly);
  }
}

function drawArrowHead(x, y, angle, color) {
  var size = 8;
  statesCtx.fillStyle = color;
  statesCtx.beginPath();
  statesCtx.moveTo(x, y);
  statesCtx.lineTo(x - size * Math.cos(angle - Math.PI / 7), y - size * Math.sin(angle - Math.PI / 7));
  statesCtx.lineTo(x - size * Math.cos(angle + Math.PI / 7), y - size * Math.sin(angle + Math.PI / 7));
  statesCtx.closePath();
  statesCtx.fill();
}

function getEdgePoints(fromNode, toNode, curve) {
  var fx  = fromNode.x + STATE_W / 2;
  var fy  = fromNode.y + STATE_H / 2;
  var tx  = toNode.x   + STATE_W / 2;
  var ty  = toNode.y   + STATE_H / 2;
  var dx  = tx - fx;
  var dy  = ty - fy;
  var len = Math.sqrt(dx * dx + dy * dy);
  var off = curve !== 0 ? 10 * curve : 0;
  return {
    x1: fx + (dx / len) * (STATE_W / 2),
    y1: fy + (dy / len) * (STATE_H / 2) + off,
    x2: tx - (dx / len) * (STATE_W / 2),
    y2: ty - (dy / len) * (STATE_H / 2) + off
  };
}

// ============================================================
// ANIMACION
// ============================================================
function animateTransition(fromState, toState, onComplete) {
  if (stateAnimAnim) {
    cancelAnimationFrame(stateAnimAnim);
    stateAnimAnim = null;
  }
  var startTime = null;
  var duration  = 500;

  function draw(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    drawStatesStatic(toState, { from: fromState, to: toState, progress: progress });
    if (progress < 1) {
      stateAnimAnim = requestAnimationFrame(draw);
    } else {
      stateAnimAnim = null;
      if (onComplete) onComplete();
    }
  }
  stateAnimAnim = requestAnimationFrame(draw);
}

// ============================================================
// ACTUALIZAR DESDE SCHEDULING
// ============================================================
function updateStatesDiagram(timeline, step, procs) {
  if (!statesCanvas) initStatesCanvas();
  if (!statesCanvas) return;

  var block = timeline[step - 1];
  if (!block) return;

  var usedBurst = {};
  timeline.slice(0, step).forEach(function(b) {
    usedBurst[b.pid] = (usedBurst[b.pid] || 0) + (b.end - b.start);
  });

  var prevStates = Object.assign({}, activeStates);
  activeStates   = {};

  procs.forEach(function(p) {
    var used = usedBurst[p.pid] || 0;
    if (used >= p.burst)              activeStates[p.pid] = "terminated";
    else if (p.pid === block.pid)     activeStates[p.pid] = "running";
    else if (p.arrival <= block.start) activeStates[p.pid] = "ready";
    else                              activeStates[p.pid] = "new";
  });

  var prevState = prevStates[block.pid] || "new";
  var currState = activeStates[block.pid];

  var label = document.getElementById("current-pid-state");
  if (label) label.textContent = "P" + block.pid + " → " + currState;

  if (prevState !== currState) {
    animateTransition(prevState, currState, function() {
      drawStatesStatic(currState, null);
    });
  } else {
    drawStatesStatic(currState, null);
  }

  updateStatesTable(procs, usedBurst, block);
}

// ============================================================
// TABLA
// ============================================================
function updateStatesTable(procs, usedBurst, block) {
  var tbody = document.getElementById("states-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  procs.forEach(function(p) {
    var used  = usedBurst[p.pid] || 0;
    var state = used >= p.burst       ? "Terminated"
      : p.pid === block.pid   ? "Running"
      : p.arrival <= block.start ? "Ready"
      : "New";

    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>P' + p.pid + '</td>' +
      '<td><span class="state-badge state-' + state.toLowerCase() + '">' + state + '</span></td>';
    tbody.appendChild(tr);
  });
}

// ============================================================
// UTILIDADES
// ============================================================
function roundRectPath(ctx, x, y, w, h, r) {
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

function darkenColor(hex) {
  var r = Math.max(0, parseInt(hex.slice(1,3), 16) - 40);
  var g = Math.max(0, parseInt(hex.slice(3,5), 16) - 40);
  var b = Math.max(0, parseInt(hex.slice(5,7), 16) - 40);
  return "rgb(" + r + "," + g + "," + b + ")";
}

// ============================================================
// CONTROLES
// ============================================================
document.addEventListener("DOMContentLoaded", function() {
  initStatesCanvas();

  var btnStart = document.getElementById("btn-start-states");
  if (btnStart) {
    btnStart.addEventListener("click", function() {
      if (schedState.timeline.length === 0) {
        alert("Primero corre un algoritmo en Scheduling.");
        return;
      }
      if (statesPlaying) return;

      activeStates = {};
      statesStep   = 0;
      drawStatesStatic(null, null);
      document.getElementById("states-table-body").innerHTML = "";
      document.getElementById("current-pid-state").textContent = "Proceso: Ninguno";

      btnStart.textContent = "▶ Corriendo...";
      btnStart.disabled    = true;
      statesPlaying        = true;

      function playNext() {
        if (statesStep >= schedState.timeline.length) {
          btnStart.textContent = "▶ Iniciar";
          btnStart.disabled    = false;
          statesPlaying        = false;
          return;
        }
        statesStep++;
        updateStatesDiagram(schedState.timeline, statesStep, simData.processes);
        var speed = 2100 - parseInt(document.getElementById("sched-speed").value);
        statesTimeout = setTimeout(playNext, speed);
      }
      playNext();
    });
  }

  var btnReset = document.getElementById("btn-reset-states");
  if (btnReset) {
    btnReset.addEventListener("click", function() {
      if (statesTimeout) clearTimeout(statesTimeout);
      if (stateAnimAnim) {
        cancelAnimationFrame(stateAnimAnim);
        stateAnimAnim = null;
      }
      statesPlaying = false;
      statesStep    = 0;
      activeStates  = {};
      drawStatesStatic(null, null);
      document.getElementById("states-table-body").innerHTML   = "";
      document.getElementById("current-pid-state").textContent = "Proceso: Ninguno";
      document.getElementById("btn-start-states").textContent  = "▶ Iniciar";
      document.getElementById("btn-start-states").disabled     = false;
    });
  }
});
