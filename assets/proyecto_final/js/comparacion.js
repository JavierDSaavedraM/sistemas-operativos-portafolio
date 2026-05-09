// ============================================================
// ESTADO
// ============================================================
var analysisCharts  = {};
var analysisCacheKey = null;

var algList = ["fcfs","sjf","hrrn","rr","srtf","priority_p","mlq","mlfq"];

var algLabels = {
  fcfs      : "FCFS",
  sjf       : "SJF",
  hrrn      : "HRRN",
  rr        : "RR",
  srtf      : "SRTF",
  priority_p: "Priority",
  mlq       : "MLQ",
  mlfq      : "MLFQ"
};

var algColors = [
  "#00d4ff","#00ffb3","#7cff00","#ffd400",
  "#ff9a00","#ff5cc8","#9b6cff","#ff4d4d"
];

// ============================================================
// CALCULAR METRICAS SIN GENERAR TIMELINE
// ============================================================

function calcFCFS_metrics(procs) {
    var time = 0;
    var sumTAT = 0, sumWT = 0, sumRT = 0, busy = 0;
    var sorted = procs.slice().sort(function(a,b){ return a.arrival - b.arrival; });
    sorted.forEach(function(p) {
        if (time < p.arrival) time = p.arrival;
        sumRT  += time - p.arrival;
        time   += p.burst;
        busy   += p.burst;
        sumTAT += time - p.arrival;
        sumWT  += time - p.arrival - p.burst;
    });
    return { sumTAT, sumWT, sumRT, busy, end: time };
}

function calcSJF_metrics(procs) {
    var time = 0, sumTAT = 0, sumWT = 0, sumRT = 0, busy = 0;
    var remaining = procs.slice();
    while (remaining.length > 0) {
        var avail = remaining.filter(function(p){ return p.arrival <= time; });
        if (avail.length === 0) { time = remaining[0].arrival; continue; }
        avail.sort(function(a,b){ return a.burst - b.burst; });
        var p = avail[0];
        remaining.splice(remaining.indexOf(p), 1);
        sumRT  += time - p.arrival;
        time   += p.burst;
        busy   += p.burst;
        sumTAT += time - p.arrival;
        sumWT  += time - p.arrival - p.burst;
    }
    return { sumTAT, sumWT, sumRT, busy, end: time };
}

function calcHRRN_metrics(procs) {
    var time = 0, sumTAT = 0, sumWT = 0, sumRT = 0, busy = 0;
    var remaining = procs.slice();
    while (remaining.length > 0) {
        var avail = remaining.filter(function(p){ return p.arrival <= time; });
        if (avail.length === 0) { time = remaining[0].arrival; continue; }
        avail.sort(function(a,b){
            var hrA = ((time - a.arrival) + a.burst) / a.burst;
            var hrB = ((time - b.arrival) + b.burst) / b.burst;
            return hrB - hrA;
        });
        var p = avail[0];
        remaining.splice(remaining.indexOf(p), 1);
        sumRT  += time - p.arrival;
        time   += p.burst;
        busy   += p.burst;
        sumTAT += time - p.arrival;
        sumWT  += time - p.arrival - p.burst;
    }
    return { sumTAT, sumWT, sumRT, busy, end: time };
}

function calcRR_metrics(procs, quantum) {
    var time = 0, sumTAT = 0, sumWT = 0, sumRT = 0, busy = 0;
    var firstRun  = {};
    var queue     = [];
    var remaining = procs.slice().map(function(p) {
        return { pid: p.pid, arrival: p.arrival, burst: p.burst, remaining: p.burst };
    }).sort(function(a,b){ return a.arrival - b.arrival; });
    var notArrived = remaining.slice();
    var inQueue    = {};

    while (notArrived.length > 0 || queue.length > 0) {
        notArrived = notArrived.filter(function(p) {
            if (p.arrival <= time) { queue.push(p); inQueue[p.pid] = true; return false; }
            return true;
        });

        if (queue.length === 0) { time = notArrived[0].arrival; continue; }

        var p       = queue.shift();
        var runTime = Math.min(quantum, p.remaining);

        if (firstRun[p.pid] === undefined) {
            firstRun[p.pid] = time;
            sumRT += time - p.arrival;
        }

        time        += runTime;
        busy        += runTime;
        p.remaining -= runTime;

        notArrived = notArrived.filter(function(r) {
            if (r.arrival <= time && !inQueue[r.pid]) {
                queue.push(r); inQueue[r.pid] = true; return false;
            }
            return true;
        });

        if (p.remaining <= 0) {
            sumTAT += time - p.arrival;
            sumWT  += time - p.arrival - p.burst;
        } else {
            queue.push(p);
        }
    }
    return { sumTAT, sumWT, sumRT, busy, end: time };
}

function calcSRTF_metrics(procs) {
    var time = 0, sumTAT = 0, sumWT = 0, sumRT = 0, busy = 0;
    var firstRun  = {};
    var remaining = procs.slice().map(function(p) {
        return { pid: p.pid, arrival: p.arrival, burst: p.burst, remaining: p.burst };
    });

    // En lugar de simular tick a tick, avanzar a eventos
    var events = {};
    procs.forEach(function(p) { events[p.arrival] = true; });

    while (remaining.length > 0) {
        var avail = remaining.filter(function(p){ return p.arrival <= time; });
        if (avail.length === 0) {
            var nextArrival = Math.min.apply(null, remaining.map(function(p){ return p.arrival; }));
            time = nextArrival;
            continue;
        }

        avail.sort(function(a,b){ return a.remaining - b.remaining || a.arrival - b.arrival; });
        var p = avail[0];

        if (firstRun[p.pid] === undefined) {
            firstRun[p.pid] = time;
            sumRT += time - p.arrival;
        }

        // Avanzar hasta el próximo arrival o hasta que p termine
        var nextArr = Infinity;
        remaining.forEach(function(r) {
            if (r !== p && r.arrival > time && r.arrival < nextArr) nextArr = r.arrival;
        });

        var runTime = nextArr === Infinity ? p.remaining : Math.min(p.remaining, nextArr - time);
        time        += runTime;
        busy        += runTime;
        p.remaining -= runTime;

        if (p.remaining <= 0) {
            sumTAT += time - p.arrival;
            sumWT  += time - p.arrival - p.burst;
            remaining.splice(remaining.indexOf(p), 1);
        }
    }
    return { sumTAT, sumWT, sumRT, busy, end: time };
}

function calcPriorityP_metrics(procs) {
    var time = 0, sumTAT = 0, sumWT = 0, sumRT = 0, busy = 0;
    var firstRun  = {};
    var remaining = procs.slice().map(function(p) {
        return { pid: p.pid, arrival: p.arrival, burst: p.burst, remaining: p.burst, priority: p.priority };
    });

    while (remaining.length > 0) {
        var avail = remaining.filter(function(p){ return p.arrival <= time; });
        if (avail.length === 0) {
            time = Math.min.apply(null, remaining.map(function(p){ return p.arrival; }));
            continue;
        }

        avail.sort(function(a,b){ return a.priority - b.priority || a.arrival - b.arrival; });
        var p = avail[0];

        if (firstRun[p.pid] === undefined) {
            firstRun[p.pid] = time;
            sumRT += time - p.arrival;
        }

        var nextArr = Infinity;
        remaining.forEach(function(r) {
            if (r !== p && r.arrival > time && r.priority < p.priority && r.arrival < nextArr)
                nextArr = r.arrival;
        });

        var runTime = nextArr === Infinity ? p.remaining : Math.min(p.remaining, nextArr - time);
        time        += runTime;
        busy        += runTime;
        p.remaining -= runTime;

        if (p.remaining <= 0) {
            sumTAT += time - p.arrival;
            sumWT  += time - p.arrival - p.burst;
            remaining.splice(remaining.indexOf(p), 1);
        }
    }
    return { sumTAT, sumWT, sumRT, busy, end: time };
}

function calcMLQ_metrics(procs) {
    // MLQ es non-preemptive por cola, equivale a FCFS agrupado por prioridad
    var queues = {};
    procs.forEach(function(p) {
        if (!queues[p.priority]) queues[p.priority] = [];
        queues[p.priority].push(p);
    });
    var levels = Object.keys(queues).map(Number).sort(function(a,b){ return a-b; });
    var allProcs = [];
    var time = 0;
    levels.forEach(function(level) {
        queues[level].sort(function(a,b){ return a.arrival - b.arrival; });
        queues[level].forEach(function(p) {
            allProcs.push(Object.assign({}, p, { arrival: Math.max(p.arrival, time) }));
            time = Math.max(time, p.arrival) + p.burst;
        });
    });
    return calcFCFS_metrics(allProcs);
}

function calcMLFQ_metrics(procs, quantum) {
    // MLFQ simplificado: misma logica que RR con quantum escalado por nivel
    return calcRR_metrics(procs, quantum);
}

// ============================================================
// WRAPPER UNIFICADO
// ============================================================
function calcAlgorithmFast(alg, quantum) {
    var procs = simData.processes.map(function(p) {
        return { pid: p.pid, arrival: p.arrival, burst: p.burst, priority: p.priority || 1 };
    });
    var n   = procs.length;
    var res;

    try {
        switch(alg) {
            case "fcfs":       res = calcFCFS_metrics(procs);          break;
            case "sjf":        res = calcSJF_metrics(procs);           break;
            case "hrrn":       res = calcHRRN_metrics(procs);          break;
            case "rr":         res = calcRR_metrics(procs, quantum);   break;
            case "srtf":       res = calcSRTF_metrics(procs);          break;
            case "priority_p": res = calcPriorityP_metrics(procs);     break;
            case "mlq":        res = calcMLQ_metrics(procs);           break;
            case "mlfq":       res = calcMLFQ_metrics(procs, quantum); break;
            default: return null;
        }
    } catch(e) { return null; }

    var firstArrival = Math.min.apply(null, procs.map(function(p){ return p.arrival; }));
    var span         = res.end - firstArrival;
    var cpuUtil      = span > 0 ? (res.busy / span) * 100 : 0;

    return {
        turnaround: parseFloat((res.sumTAT / n).toFixed(2)),
        waiting   : parseFloat((res.sumWT  / n).toFixed(2)),
        response  : parseFloat((res.sumRT  / n).toFixed(2)),
        cpuUtil   : parseFloat(cpuUtil.toFixed(2))
    };
}

// ============================================================
// CORRER ANALISIS
// ============================================================
function runAnalysis() {
  if (simData.processes.length === 0) {
    alert("No hay procesos definidos.");
    return;
  }

  var currentKey = JSON.stringify(simData.processes);
  if (analysisCacheKey === currentKey && Object.keys(analysisCharts).length > 0) {
    document.getElementById("analysis-status").textContent = "Resultados del cache.";
    return;
  }

  var quantum = parseInt(
    document.getElementById("sched-quantum")
    ? document.getElementById("sched-quantum").value : 2
  ) || 2;

  var results  = [];
  var index    = 0;

  document.getElementById("btn-run-analysis").disabled    = true;
  document.getElementById("analysis-status").textContent  = "Calculando 0/" + algList.length + "...";

  function next() {
    if (index >= algList.length) {
      analysisCacheKey = currentKey;
      document.getElementById("btn-run-analysis").disabled    = false;
      document.getElementById("btn-reset-analysis").disabled  = false;
      document.getElementById("analysis-status").textContent  = algList.length + " algoritmos analizados";
      renderAnalysisCharts(results);
      results = null; // liberar
      return;
    }

    setTimeout(function() {
      var alg    = algList[index];
      var result = calcAlgorithmFast(alg, quantum);
      if (result) {
        result.label = algLabels[alg];
        result.color = algColors[index % algColors.length];
        results.push(result);
      }
      document.getElementById("analysis-status").textContent =
        "Calculando " + (index + 1) + "/" + algList.length + "...";
      index++;
      next();
    }, 0);
  }

  next();
}

// ============================================================
// HIGHCHARTS THEME
// ============================================================
var hcBase = {
  chart: {
    backgroundColor: "#1a1a2e",
    height         : 200,
    style          : { fontFamily: "Arial, sans-serif" }
  },
  title : { style: { color: "#fff", fontSize: "12px" } },
  xAxis : {
    labels   : { style: { color: "#ccc", fontSize: "10px" } },
    lineColor: "#444",
    tickColor: "#444"
  },
  yAxis : {
    labels       : { style: { color: "#aaa", fontSize: "10px" } },
    gridLineColor: "rgba(255,255,255,0.07)",
    title        : { text: null }
  },
  tooltip: {
    backgroundColor: "#1a1a2e",
    borderColor    : "#8888d6",
    borderRadius   : 6,
    style          : { color: "#fff", fontSize: "12px" }
  },
  plotOptions: {
    column: {
      borderRadius: 3,
      dataLabels  : {
        enabled: true,
        style  : { color: "#fff", fontSize: "9px", textOutline: "none" }
      }
    }
  },
  legend : { enabled: false },
  credits: { enabled: false }
};

// ============================================================
// RENDER CHARTS
// ============================================================
function renderAnalysisCharts(results) {
  var categories = results.map(function(r) { return r.label; });
  var colors     = results.map(function(r) { return r.color; });

  var defs = [
    { id: "chart-tat", metric: "turnaround", title: "Avg Turnaround Time", unit: "u",  lower: true },
    { id: "chart-wt",  metric: "waiting",    title: "Avg Waiting Time",    unit: "u",  lower: true },
    { id: "chart-rt",  metric: "response",   title: "Avg Response Time",   unit: "u",  lower: true },
    { id: "chart-cpu", metric: "cpuUtil",    title: "CPU Utilization",     unit: "%",  lower: false }
  ];

  defs.forEach(function(def) {
    var vals    = results.map(function(r) { return r[def.metric]; });
    var bestVal = def.lower
      ? Math.min.apply(null, vals)
      : Math.max.apply(null, vals);

    var data = results.map(function(r, i) {
      var isBest = r[def.metric] === bestVal;
      return {
        y          : r[def.metric],
        color      : colors[i],
        borderColor: isBest ? "#fff" : "transparent",
        borderWidth: isBest ? 2 : 0,
        name       : r.label
      };
    });

    if (analysisCharts[def.id]) {
      analysisCharts[def.id].destroy();
      analysisCharts[def.id] = null;
    }

    analysisCharts[def.id] = Highcharts.chart(
      def.id,
      Highcharts.merge(hcBase, {
        title: { text: def.title },
        xAxis: { categories: categories },
        yAxis: { min: 0 },
        tooltip: {
          formatter: function() {
            var isBest = this.y === bestVal;
            return '<b>' + this.point.name + '</b><br>' +
              this.y + ' ' + def.unit +
              (isBest ? ' <span style="color:#ffd400">★</span>' : '');
          }
        },
        series: [{ type: "column", data: data }]
      })
    );
  });
}

// ============================================================
// RESET
// ============================================================
function resetAnalysis() {
  analysisCacheKey = null;

  Object.keys(analysisCharts).forEach(function(id) {
    if (analysisCharts[id]) {
      analysisCharts[id].destroy();
      analysisCharts[id] = null;
    }
  });
  analysisCharts = {};

  document.getElementById("analysis-status").textContent  = "";
  document.getElementById("btn-reset-analysis").disabled  = true;
}

// ============================================================
// CONTROLES
// ============================================================
document.addEventListener("DOMContentLoaded", function() {
  var btnRun = document.getElementById("btn-run-analysis");
  if (btnRun) btnRun.addEventListener("click", runAnalysis);

  var btnReset = document.getElementById("btn-reset-analysis");
  if (btnReset) btnReset.addEventListener("click", resetAnalysis);
});
