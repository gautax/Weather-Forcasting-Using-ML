const uploadForm = document.getElementById("uploadForm");
const csvFile = document.getElementById("csvFile");
const fileDrop = document.getElementById("fileDrop");
const fileDropTitle = document.getElementById("fileDropTitle");
const fileName = document.getElementById("fileName");
const forecastStart = document.getElementById("forecastStart");
const messageBox = document.getElementById("messageBox");
const resultsSection = document.getElementById("resultsSection");
const emptyResults = document.getElementById("emptyResults");
const resultsContent = document.getElementById("resultsContent");
const forecastTableBody = document.querySelector("#forecastTable tbody");
const downloadBtn = document.getElementById("downloadBtn");
const forecastContext = document.getElementById("forecastContext");
const runMeta = document.getElementById("runMeta");
const fileHelpText = document.getElementById("fileHelpText");
const predictBtn = document.getElementById("predictBtn");
const hourlyStrip = document.getElementById("hourlyStrip");
const rangeBadge = document.getElementById("rangeBadge");

const minTemp = document.getElementById("minTemp");
const maxTemp = document.getElementById("maxTemp");
const avgTemp = document.getElementById("avgTemp");
const trendInsight = document.getElementById("trendInsight");
const warmestInsight = document.getElementById("warmestInsight");
const coolestInsight = document.getElementById("coolestInsight");

const modeCards = document.querySelectorAll(".mode-card");
const modeInputs = document.querySelectorAll('input[name="inputMode"]');

let chartInstance = null;
let latestForecastRows = [];

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function getSelectedMode() {
  const checked = document.querySelector('input[name="inputMode"]:checked');
  return checked ? checked.value : "engineered";
}

function updateModeUI() {
  const selectedMode = getSelectedMode();

  modeCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.mode === selectedMode);
  });

  if (selectedMode === "raw") {
    csvFile.setAttribute("accept", ".csv,.xlsx,.xls");
    setText(fileHelpText, "Upload recent hourly station data. CSV, XLS, and XLSX are supported.");
  } else {
    csvFile.setAttribute("accept", ".csv");
    setText(fileHelpText, "Try models/sample_input.csv for the first engineered-input test.");
  }
}

function updateFileUI(file) {
  if (!file) {
    fileDrop.classList.remove("has-file");
    setText(fileDropTitle, "Drop a file here or browse");
    fileName?.classList.add("hidden");
    setText(fileName, "");
    return;
  }

  fileDrop.classList.add("has-file");
  setText(fileDropTitle, "File ready for prediction");
  setText(fileName, file.name);
  fileName?.classList.remove("hidden");
}

function showMessage(text, type = "success") {
  if (!messageBox) return;
  messageBox.classList.remove("hidden", "error", "success");
  messageBox.classList.add(type);
  setText(messageBox, text);
}

function setLoading(isLoading) {
  if (!predictBtn) return;
  predictBtn.classList.toggle("is-loading", isLoading);
  predictBtn.disabled = isLoading;
  setText(predictBtn.querySelector("span"), isLoading ? "Generating..." : "Generate Forecast");
  const icon = predictBtn.querySelector("i");
  if (icon) {
    icon.className = isLoading ? "fa-solid fa-spinner" : "fa-solid fa-bolt";
  }
}

function generateForecastTimes(rows, baseDatetime) {
  if (!baseDatetime) {
    return rows.map((row, index) => ({
      ...row,
      forecast_time: `t+${index + 1}`
    }));
  }

  const base = new Date(baseDatetime);

  return rows.map((row, index) => {
    const next = new Date(base);
    next.setHours(next.getHours() + index + 1);

    const year = next.getFullYear();
    const month = String(next.getMonth() + 1).padStart(2, "0");
    const day = String(next.getDate()).padStart(2, "0");
    const hours = String(next.getHours()).padStart(2, "0");
    const minutes = String(next.getMinutes()).padStart(2, "0");

    return {
      ...row,
      forecast_time: `${year}-${month}-${day} ${hours}:${minutes}`
    };
  });
}

function formatTemp(value) {
  return Number(value).toFixed(2);
}

function animateMetric(element, target) {
  if (!element) return;
  const start = Number(element.textContent) || 0;
  const end = Number(target);
  const duration = 650;
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (end - start) * eased;
    setText(element, formatTemp(value));

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function setRunMeta(inputMode, rows) {
  if (!runMeta) return;
  const generatedAt = new Date();
  const time = generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const source = inputMode === "raw" ? "raw station data" : "engineered model row";
  setText(runMeta, `Generated at ${time} from ${source} with ${rows.length} forecast points.`);
}

function buildTable(rows) {
  if (!forecastTableBody) return;
  forecastTableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.hour_ahead}</td>
      <td>${row.forecast_time}</td>
      <td>${formatTemp(row.predicted_temperature)}</td>
    `;
    forecastTableBody.appendChild(tr);
  });
}

function buildChart(rows) {
  const chartContainer = document.querySelector(".chart-container");
  const canvas = document.getElementById("forecastChart");

  if (typeof Chart === "undefined") {
    if (canvas) canvas.classList.add("hidden");
    if (chartContainer && !chartContainer.querySelector(".chart-fallback")) {
      chartContainer.insertAdjacentHTML("beforeend", `
        <div class="chart-fallback">
          Chart library is unavailable, but the forecast table and hourly rhythm are ready.
        </div>
      `);
    }
    return;
  }

  if (!canvas) return;
  canvas.classList.remove("hidden");
  chartContainer?.querySelector(".chart-fallback")?.remove();

  const ctx = canvas.getContext("2d");
  const labels = rows.map((row) => row.forecast_time);
  const values = rows.map((row) => Number(row.predicted_temperature));

  const gradient = ctx.createLinearGradient(0, 0, 0, 360);
  gradient.addColorStop(0, "rgba(0, 124, 137, 0.28)");
  gradient.addColorStop(1, "rgba(0, 124, 137, 0.02)");

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Predicted Temperature (\u00b0C)",
        data: values,
        borderColor: "#007c89",
        backgroundColor: gradient,
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#007c89",
        pointBorderWidth: 2,
        tension: 0.38,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => ` ${formatTemp(context.parsed.y)} \u00b0C`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#667485",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: "#667485",
            callback: (value) => `${value}\u00b0`
          },
          grid: { color: "rgba(22, 32, 42, 0.08)" }
        }
      }
    }
  });
}

function buildHourlyStrip(rows) {
  if (!hourlyStrip) return;
  const temps = rows.map((row) => Number(row.predicted_temperature));
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const spread = Math.max(max - min, 0.01);

  hourlyStrip.innerHTML = "";

  rows.forEach((row) => {
    const temp = Number(row.predicted_temperature);
    const intensity = (temp - min) / spread;
    const hue = 198 - intensity * 158;
    const height = 26 + intensity * 44;

    const chip = document.createElement("div");
    chip.className = "hour-chip";
    chip.title = `${row.forecast_time}: ${formatTemp(temp)} \u00b0C`;
    chip.innerHTML = `
      <span>+${row.hour_ahead}</span>
      <i class="heat-dot" style="height:${height}px;background:hsl(${hue}, 74%, 46%)"></i>
      <strong>${Math.round(temp)}\u00b0</strong>
    `;
    hourlyStrip.appendChild(chip);
  });
}

function updateInsights(rows) {
  const enriched = rows.map((row) => ({
    ...row,
    value: Number(row.predicted_temperature)
  }));

  const first = enriched[0].value;
  const last = enriched[enriched.length - 1].value;
  const change = last - first;
  const warmest = enriched.reduce((best, row) => row.value > best.value ? row : best, enriched[0]);
  const coolest = enriched.reduce((best, row) => row.value < best.value ? row : best, enriched[0]);
  const temps = enriched.map((row) => row.value);
  const range = Math.max(...temps) - Math.min(...temps);

  if (Math.abs(change) < 0.6) {
    setText(trendInsight, `Stable, ${formatTemp(change)} \u00b0C change`);
  } else if (change > 0) {
    setText(trendInsight, `Warming by ${formatTemp(change)} \u00b0C`);
  } else {
    setText(trendInsight, `Cooling by ${formatTemp(Math.abs(change))} \u00b0C`);
  }

  setText(warmestInsight, `${warmest.forecast_time} at ${formatTemp(warmest.value)} \u00b0C`);
  setText(coolestInsight, `${coolest.forecast_time} at ${formatTemp(coolest.value)} \u00b0C`);
  if (rangeBadge) {
    rangeBadge.innerHTML = `Range ${formatTemp(range)} &deg;C`;
  }
}

function buildCSV(rows) {
  const header = "hour_ahead,forecast_time,predicted_temperature\n";
  const body = rows
    .map((row) => `${row.hour_ahead},${row.forecast_time},${formatTemp(row.predicted_temperature)}`)
    .join("\n");
  return header + body;
}

function revealResults() {
  resultsSection?.classList.remove("empty-state");
  emptyResults?.classList.add("hidden");
  resultsContent?.classList.remove("hidden");
}

modeInputs.forEach((input) => {
  input.addEventListener("change", updateModeUI);
});

csvFile?.addEventListener("change", () => {
  updateFileUI(csvFile.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  fileDrop?.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  fileDrop?.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.remove("is-dragging");
  });
});

fileDrop?.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (!file) return;

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  csvFile.files = dataTransfer.files;
  updateFileUI(file);
});

downloadBtn?.addEventListener("click", () => {
  if (!latestForecastRows.length) return;

  const csvContent = buildCSV(latestForecastRows);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "forecast_next_24h.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

uploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!csvFile.files.length) {
    showMessage("Choose a data file first.", "error");
    return;
  }

  const inputMode = getSelectedMode();
  const formData = new FormData();
  formData.append("file", csvFile.files[0]);
  formData.append("input_mode", inputMode);

  setLoading(true);
  showMessage("Generating forecast...", "success");

  try {
    const response = await fetch("/predict", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!data.success) {
      showMessage(data.error || "Prediction failed.", "error");
      return;
    }

    let baseDatetime = null;

    if (inputMode === "raw" && data.base_timestamp) {
      baseDatetime = data.base_timestamp;
    } else if (forecastStart.value) {
      baseDatetime = forecastStart.value;
    }

    latestForecastRows = generateForecastTimes(data.forecast, baseDatetime);

    revealResults();
    animateMetric(minTemp, data.summary.min_temp);
    animateMetric(maxTemp, data.summary.max_temp);
    animateMetric(avgTemp, data.summary.avg_temp);
    buildTable(latestForecastRows);
    buildHourlyStrip(latestForecastRows);
    updateInsights(latestForecastRows);
    setRunMeta(inputMode, latestForecastRows);
    buildChart(latestForecastRows);

    if (baseDatetime) {
      setText(forecastContext, `Forecast generated from base datetime: ${String(baseDatetime).replace("T", " ")}`);
    } else {
      setText(forecastContext, "Forecast generated without a base datetime. Relative horizons are shown.");
    }

    showMessage("Forecast generated successfully.", "success");
  } catch (error) {
    showMessage(`Error: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
});

updateModeUI();
updateFileUI(null);
