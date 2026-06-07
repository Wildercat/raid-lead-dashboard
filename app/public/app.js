const form = document.querySelector("#report-form");
const reportUrlInput = document.querySelector("#report-url");
const pullSelect = document.querySelector("#pull-select");
const statusEl = document.querySelector("#status");
const dashboardEl = document.querySelector("#dashboard");
const pullCache = new Map();
const nightCache = new Map();
let currentPullData = null;

const els = {
  summaryGrid: document.querySelector("#summary-grid"),
  nightSummaryGrid: document.querySelector("#night-summary-grid"),
  wipeFailures: document.querySelector("#wipe-failures"),
  deaths: document.querySelector("#deaths"),
  mistakes: document.querySelector("#mistakes"),
  echoSoaks: document.querySelector("#echo-soaks"),
  eruptionInterrupts: document.querySelector("#eruption-interrupts"),
  consumables: document.querySelector("#consumables"),
  nightMistakes: document.querySelector("#night-mistakes"),
  nightEchoSoaks: document.querySelector("#night-echo-soaks"),
  nightEruptionInterrupts: document.querySelector("#night-eruption-interrupts"),
  nightConsumables: document.querySelector("#night-consumables"),
  wipeCount: document.querySelector("#wipe-count"),
  deathCount: document.querySelector("#death-count"),
  mistakeCount: document.querySelector("#mistake-count"),
  soakCount: document.querySelector("#soak-count"),
  interruptCount: document.querySelector("#interrupt-count"),
  consumableCount: document.querySelector("#consumable-count"),
  nightMistakeCount: document.querySelector("#night-mistake-count"),
  nightSoakCount: document.querySelector("#night-soak-count"),
  nightInterruptCount: document.querySelector("#night-interrupt-count"),
  nightConsumableCount: document.querySelector("#night-consumable-count"),
};

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("is-active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("is-hidden"));
    button.classList.add("is-active");
    document.querySelector(`#${button.dataset.tab}-tab`).classList.remove("is-hidden");

    if (button.dataset.tab === "night") {
      await loadWholeNight(reportUrlInput.value.trim());
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  pullSelect.value = "latest";
  await analyze(reportUrlInput.value.trim(), "latest");
});

pullSelect.addEventListener("change", async () => {
  if (pullSelect.disabled) return;
  await analyze(reportUrlInput.value.trim(), pullSelect.value);
});

async function analyze(reportUrl, pullId = pullSelect.value || "latest") {
  statusEl.className = "status";
  statusEl.textContent = "Fetching pull events...";
  const cacheKey = pullCacheKey(reportUrl, pullId);
  if (pullCache.has(cacheKey)) {
    const cached = pullCache.get(cacheKey);
    renderDashboard(cached);
    statusEl.textContent = `${cached.report.title} - ${cached.fight.name}, pull ${cached.fight.id}`;
    dashboardEl.classList.remove("is-empty");
    return;
  }

  try {
    const payload = await fetchAnalysis({ reportUrl, pullId, scope: "pull" });

    pullCache.set(cacheKey, payload);
    pullCache.set(pullCacheKey(reportUrl, payload.fight.id), payload);
    renderDashboard(payload);
    statusEl.textContent = `${payload.report.title} - ${payload.fight.name}, pull ${payload.fight.id}`;
    dashboardEl.classList.remove("is-empty");
  } catch (error) {
    statusEl.className = "status error";
    statusEl.textContent = error.message;
  }
}

async function fetchAnalysis({ reportUrl, pullId = "latest", scope }) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportUrl, pullId, scope }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Analysis failed");
  return payload;
}

async function loadWholeNight(reportUrl) {
  if (!reportUrl || dashboardEl.classList.contains("is-empty")) return;
  const cacheKey = nightCacheKey(reportUrl);
  if (nightCache.has(cacheKey)) {
    renderNightDashboard(nightCache.get(cacheKey).wholeNight);
    return;
  }

  statusEl.className = "status";
  statusEl.textContent = "Fetching whole-night events...";

  try {
    const payload = await fetchAnalysis({ reportUrl, scope: "night" });
    nightCache.set(cacheKey, payload);
    renderNightDashboard(payload.wholeNight);
    statusEl.textContent = `${payload.report.title} - Belo'ren whole night`;
  } catch (error) {
    statusEl.className = "status error";
    statusEl.textContent = error.message;
  }
}

function renderDashboard(data) {
  const latest = data.latestWipe;
  const summary = data.summary;
  currentPullData = data;

  renderPullOptions(data.report.pulls || [], data.fight.id);

  els.summaryGrid.innerHTML = [
    metric("Duration", data.fight.duration),
    metric("Boss HP", `${Number(data.fight.bossPercentage).toFixed(1)}%`),
    metric("Deaths", summary.deathCount),
    metric("Mistakes", summary.likelyMistakeCount),
  ].join("");

  els.wipeCount.textContent = latest.wipeLevelFailures.length;
  els.deathCount.textContent = latest.deaths.length;
  els.mistakeCount.textContent = latest.likelyMistakes.length + latest.wipeLevelFailures.length;
  els.soakCount.textContent = latest.correctEchoSoakLeaderboard.length;
  els.interruptCount.textContent = latest.eruptionInterruptLeaderboard.length;
  els.consumableCount.textContent = latest.consumableLeaderboard.length;

  els.wipeFailures.innerHTML = renderWipeFailures(latest.wipeLevelFailures);
  els.deaths.innerHTML = renderDeaths(latest.deaths, latest.wipeLevelFailures);
  els.mistakes.innerHTML = renderMistakes(latest.likelyMistakes, latest.wipeLevelFailures);
  els.echoSoaks.innerHTML = renderEchoSoaks(latest.correctEchoSoakLeaderboard);
  els.eruptionInterrupts.innerHTML = renderEruptionInterrupts(latest.eruptionInterruptLeaderboard);
  els.consumables.innerHTML = renderConsumables(latest.consumableLeaderboard);

  const nightPayload = nightCache.get(nightCacheKey(reportUrlInput.value.trim()));
  if (nightPayload) renderNightDashboard(nightPayload.wholeNight);
  else renderNightPlaceholder();
}

function renderNightDashboard(night) {
  if (!night) {
    renderNightPlaceholder();
    return;
  }

  els.nightSummaryGrid.innerHTML = [
    metric("Pulls", night.pullCount),
    metric("Wipes", night.wipeCount),
    metric("Kills", night.killCount),
    metric("Mistake Players", night.mistakeLeaderboard.length),
    metric("Consumable Users", night.consumableLeaderboard.length),
  ].join("");

  els.nightMistakeCount.textContent = night.mistakeLeaderboard.length;
  els.nightSoakCount.textContent = night.correctEchoSoakLeaderboard.length;
  els.nightInterruptCount.textContent = night.eruptionInterruptLeaderboard.length;
  els.nightConsumableCount.textContent = night.consumableLeaderboard.length;

  els.nightMistakes.innerHTML = renderNightMistakes(night.mistakeLeaderboard);
  els.nightEchoSoaks.innerHTML = renderEchoSoaks(night.correctEchoSoakLeaderboard);
  els.nightEruptionInterrupts.innerHTML = renderEruptionInterrupts(night.eruptionInterruptLeaderboard);
  els.nightConsumables.innerHTML = renderConsumables(night.consumableLeaderboard);
}

function renderNightPlaceholder() {
  els.nightSummaryGrid.innerHTML = "";
  els.nightMistakeCount.textContent = 0;
  els.nightSoakCount.textContent = 0;
  els.nightInterruptCount.textContent = 0;
  els.nightConsumableCount.textContent = 0;
  els.nightMistakes.innerHTML = empty("Open the Whole Night tab to load night-wide mistakes.");
  els.nightEchoSoaks.innerHTML = empty("Open the Whole Night tab to load night-wide soaks.");
  els.nightEruptionInterrupts.innerHTML = empty("Open the Whole Night tab to load night-wide interrupts.");
  els.nightConsumables.innerHTML = empty("Open the Whole Night tab to load night-wide consumable usage.");
}

function renderPullOptions(pulls, selectedFightId) {
  const requested = pullSelect.value || "latest";
  pullSelect.innerHTML = [
    `<option value="latest">Latest wipe</option>`,
    ...pulls.map((pull) => {
      const status = pull.kill ? "Kill" : "Wipe";
      const hp = pull.kill ? "0.0%" : `${Number(pull.bossPercentage).toFixed(1)}%`;
      return `<option value="${pull.id}">Pull ${pull.id} - ${status} - ${hp} - ${escapeHtml(pull.duration)}</option>`;
    }),
  ].join("");

  pullSelect.value = requested === "latest" ? "latest" : String(selectedFightId);
  pullSelect.disabled = false;
}

function pullCacheKey(reportUrl, pullId) {
  return `${reportUrl}::${pullId || "latest"}`;
}

function nightCacheKey(reportUrl) {
  return `${reportUrl}::whole-night`;
}

function metric(label, value) {
  return `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><span class="metric-value">${escapeHtml(value)}</span></div>`;
}

function renderWipeFailures(rows) {
  if (!rows.length) return empty("No wipe-level failures detected for this pull.");
  return table(
    ["Time", "Mechanic", "Flag", "Severity", "Evidence"],
    rows.map((row) => [
      row.time,
      row.mechanic,
      row.label,
      pill(row.severity, row.severity),
      evidenceList(row.evidence),
    ]),
  );
}

function renderDeaths(rows, wipeFailures = []) {
  if (!rows.length) return empty("No deaths detected.");
  const items = [
    ...rows.map((row) => ({ type: "death", timestamp: row.timestamp, row })),
    ...wipeFailures.map((row) => ({ type: "wipeFailure", timestamp: row.timestamp, row })),
  ].sort((a, b) => a.timestamp - b.timestamp || (a.type === "wipeFailure" ? -1 : 1));

  return `<div class="death-list">${items
    .map((item) => (item.type === "wipeFailure" ? renderWipeFailureMarker(item.row) : renderDeathRow(item.row)))
    .join("")}</div>`;
}

function renderWipeFailureMarker(row) {
  return `<div class="death-marker">
    <span class="death-marker-time">${escapeHtml(row.time)}</span>
    <span class="death-marker-label">${escapeHtml(row.label)}</span>
    <span class="death-marker-detail">${escapeHtml(row.mechanic)}</span>
  </div>`;
}

function renderDeathRow(row) {
  const mistake = row.likelyMistake ? row.likelyMistake.label : "";
  const cause = row.directDeathCause
    ? `${escapeHtml(row.directDeathCause.abilityName)} (${formatNumber(row.directDeathCause.amount)})`
    : "";

  return `<article class="death-row">
    <details class="death-details">
      <summary class="death-main">
        <span class="death-time">${escapeHtml(row.time)}</span>
        <span class="death-player">${player(row.player)}</span>
        <span class="death-cause">${cause}</span>
        <span class="death-mistake">${mistake ? mistakePill(mistake) : ""}</span>
      </summary>
      <div class="damage-events">${row.finalDamageEvents
        .map(
          (event) =>
            `<span><strong>${escapeHtml(event.time)}</strong> ${escapeHtml(event.abilityName)} ${formatNumber(event.amount)}</span>`,
        )
        .join("")}</div>
    </details>
  </article>`;
}

function renderMistakes(rows, wipeFailures = []) {
  if (!rows.length && !wipeFailures.length) return empty("No mistakes detected by the current Beloren rules.");
  const items = [
    ...rows.map((row) => ({ type: "mistake", timestamp: row.timestamp, row })),
    ...wipeFailures.map((row) => ({ type: "wipeFailure", timestamp: row.timestamp, row })),
  ].sort((a, b) => a.timestamp - b.timestamp || (a.type === "wipeFailure" ? -1 : 1));

  return `<div class="mistake-list">${items
    .map((item) => (item.type === "wipeFailure" ? renderMistakeWipeFailure(item.row) : renderMistakeRow(item.row)))
    .join("")}</div>`;
}

function renderMistakeRow(row) {
  return `<div class="mistake-row">
    <span class="mistake-time">${escapeHtml(row.time)}</span>
    <span>${player(row.player)}</span>
    <span>${escapeHtml(row.mechanic)}</span>
    <span>${mistakePill(row.label)}</span>
    <span class="mistake-damage">${formatNumber(row.damageAmount)}</span>
  </div>`;
}

function renderMistakeWipeFailure(row) {
  return `<div class="mistake-marker" title="${wipeFailureTooltip(row)}">
    <span class="mistake-marker-time">${escapeHtml(row.time)}</span>
    <span class="mistake-marker-label">${escapeHtml(row.label)}</span>
    <span class="mistake-marker-detail">${escapeHtml(row.mechanic)}</span>
  </div>`;
}

function renderEchoSoaks(rows) {
  if (!rows.length) return empty("No correct Radiant Echoes soaks detected.");
  return table(
    ["Player", "Correct", "Light", "Void", "Wrong", "Deaths", "Survival"],
    rows.map((row) => [
      player(row.player),
      row.totalCorrectSoaks,
      row.lightSoaks,
      row.voidSoaks,
      row.wrongColorSoaks,
      row.deathsFromSoaks,
      row.survivalRate === null ? "" : `${Math.round(row.survivalRate * 100)}%`,
    ]),
  );
}

function renderEruptionInterrupts(rows) {
  if (!rows.length) return empty("No Light/Void Eruption interrupts detected.");
  return table(
    ["Player", "Total", "Light", "Void"],
    rows.map((row) => [
      player(row.player),
      row.totalInterrupts,
      row.lightEruptionInterrupts,
      row.voidEruptionInterrupts,
    ]),
  );
}

function renderConsumables(rows) {
  if (!rows.length) return empty("No healthstone or health potion usage detected.");
  return table(
    ["Player", "Total", "Stone", "Potion", "Healing", "Overheal"],
    rows.map((row) => [
      player(row.player),
      row.totalUses,
      row.healthstoneUses,
      row.healthPotionUses,
      formatNumber(row.healing),
      formatNumber(row.overheal),
    ]),
  );
}

function renderNightMistakes(rows) {
  if (!rows.length) return empty("No player mistakes detected by the current Beloren rules.");
  return `<div class="night-mistake-list">
    <div class="night-mistake-header">
      <span>Player</span>
      <span>Total</span>
      <span>Pulls</span>
    </div>
    ${rows.map(renderNightMistakeRow).join("")}
  </div>`;
}

function renderNightMistakeRow(row) {
  return `<article class="night-mistake-row">
    <details>
      <summary class="night-mistake-main">
        <span>${player(row.player)}</span>
        <span>${formatNumber(row.totalMistakes)}</span>
        <span>${formatNumber(row.pullCount)}</span>
      </summary>
      <div class="night-mistake-breakdown">
        ${table(
          ["Mistake", "Mechanic", "Count"],
          row.mistakes.map((mistake) => [mistakePill(mistake.label), escapeHtml(mistake.mechanic), mistake.count]),
        )}
      </div>
    </details>
  </article>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function player(value) {
  return `<strong class="${classColorClass(value?.class)}">${escapeHtml(value?.name || "")}</strong>`;
}

function classColorClass(className) {
  const normalized = String(className || "")
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
  return normalized ? `class-${normalized}` : "";
}

function pill(value, label) {
  return `<span class="pill ${escapeHtml(value)}">${escapeHtml(label)}</span>`;
}

function mistakePill(label) {
  const title = label === "Egg DoT" ? ` title="${escapeHtml("Stood in wrong color during egg phase")}"` : "";
  return `<span class="pill high"${title}>${escapeHtml(label)}</span>`;
}

function wipeFailureTooltip(row) {
  return escapeHtml(`${row.label}: ${row.mechanic}. Wipe-level failure.`);
}

function feather(value) {
  if (value === "light") return pill("light", "Light");
  if (value === "void") return pill("void", "Void");
  return pill("", value || "Unknown");
}

function evidenceList(items = []) {
  return `<div class="evidence-list">${items
    .map(
      (item) =>
        `<span>${escapeHtml(item.time)} ${escapeHtml(item.abilityName)} -> ${escapeHtml(item.target)} (${formatNumber(item.amount)})</span>`,
    )
    .join("")}</div>`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return number.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
