const form = document.querySelector("#report-form");
const reportUrlInput = document.querySelector("#report-url");
const pullSelect = document.querySelector("#pull-select");
const statusEl = document.querySelector("#status");
const statusTextEl = document.querySelector("#status-text");
const dashboardEl = document.querySelector("#dashboard");
const pullCache = new Map();
const nightCache = new Map();
let currentPullData = null;
let spellMap = {};
let livePollTimer = null;
let latestKnownFightId = null;
let activeTab = "latest";

const els = {
  summaryGrid: document.querySelector("#summary-grid"),
  nightSummaryGrid: document.querySelector("#night-summary-grid"),
  wipeFailures: document.querySelector("#wipe-failures"),
  deaths: document.querySelector("#deaths"),
  mistakes: document.querySelector("#mistakes"),
  echoSoaks: document.querySelector("#echo-soaks"),
  quillSoaks: document.querySelector("#quill-soaks"),
  eruptionInterrupts: document.querySelector("#eruption-interrupts"),
  consumables: document.querySelector("#consumables"),
  nightMistakes: document.querySelector("#night-mistakes"),
  nightEchoSoaks: document.querySelector("#night-echo-soaks"),
  nightQuillSoaks: document.querySelector("#night-quill-soaks"),
  nightEruptionInterrupts: document.querySelector("#night-eruption-interrupts"),
  nightConsumables: document.querySelector("#night-consumables"),
  liveLogControl: document.querySelector("#live-log-control"),
  liveScanToggle: document.querySelector("#live-scan-toggle"),
  liveLogLabel: document.querySelector("#live-log-label"),
  reportLink: document.querySelector("#report-link"),
  statusTabs: document.querySelector("#status-tabs"),
  dashboardControls: document.querySelector(".dashboard-controls"),
  wipeCount: document.querySelector("#wipe-count"),
  deathCount: document.querySelector("#death-count"),
  mistakeCount: document.querySelector("#mistake-count"),
  soakCount: document.querySelector("#soak-count"),
  quillCount: document.querySelector("#quill-count"),
  interruptCount: document.querySelector("#interrupt-count"),
  consumableCount: document.querySelector("#consumable-count"),
  nightMistakeCount: document.querySelector("#night-mistake-count"),
  nightSoakCount: document.querySelector("#night-soak-count"),
  nightQuillCount: document.querySelector("#night-quill-count"),
  nightInterruptCount: document.querySelector("#night-interrupt-count"),
  nightConsumableCount: document.querySelector("#night-consumable-count"),
};

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", async () => {
    setActiveTab(button.dataset.tab);

    if (button.dataset.tab === "night") {
      await loadWholeNight(reportUrlInput.value.trim());
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  pullSelect.value = "latest";
  setActiveTab("latest");
  await analyze(reportUrlInput.value.trim(), "latest");
});

pullSelect.addEventListener("change", async () => {
  if (pullSelect.disabled) return;
  await analyze(reportUrlInput.value.trim(), pullSelect.value);
});

els.liveScanToggle.addEventListener("change", () => {
  updateScanLabel();
  updateLivePolling();
});

async function analyze(reportUrl, pullId = pullSelect.value || "latest") {
  setStatus("Fetching pull events...", { loading: true });
  const cacheKey = pullCacheKey(reportUrl, pullId);
  if (pullCache.has(cacheKey)) {
    const cached = pullCache.get(cacheKey);
    renderDashboard(cached);
    setStatus(cached.report.title);
    dashboardEl.classList.remove("is-empty");
    els.statusTabs.classList.remove("is-hidden");
    els.liveLogControl.classList.remove("is-hidden");
    return;
  }

  try {
    const payload = await fetchAnalysis({ reportUrl, pullId, scope: "pull" });

    pullCache.set(cacheKey, payload);
    pullCache.set(pullCacheKey(reportUrl, payload.fight.id), payload);
    renderDashboard(payload);
    setStatus(payload.report.title);
    dashboardEl.classList.remove("is-empty");
    els.statusTabs.classList.remove("is-hidden");
    els.liveLogControl.classList.remove("is-hidden");
  } catch (error) {
    setStatus(error.message, { error: true });
  }
}

async function fetchAnalysis({ reportUrl, pullId = "latest", scope, fresh = false }) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportUrl, pullId, scope, fresh }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Analysis failed");
  return payload;
}

async function loadWholeNight(reportUrl) {
  if (!reportUrl || dashboardEl.classList.contains("is-empty")) return;
  const cacheKey = nightCacheKey(reportUrl);
  if (nightCache.has(cacheKey)) {
    const cached = nightCache.get(cacheKey);
    renderNightDashboard(cached.wholeNight);
    setStatus(cached.report.title);
    return;
  }

  setStatus("Fetching whole-night events...", { loading: true });

  try {
    const payload = await fetchAnalysis({ reportUrl, scope: "night" });
    spellMap = payload.spells || spellMap;
    nightCache.set(cacheKey, payload);
    renderNightDashboard(payload.wholeNight);
    setStatus(payload.report.title);
  } catch (error) {
    setStatus(error.message, { error: true });
  }
}

function updateLiveState(data) {
  latestKnownFightId = Math.max(latestKnownFightId || 0, data.fight.id);
  updateScanLabel();
  updateLivePolling();
}

function updateLivePolling() {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }

  if (!currentPullData || !els.liveScanToggle.checked) return;

  livePollTimer = setInterval(scanForNewPull, 30000);
}

function updateScanLabel() {
  els.liveLogLabel.textContent = els.liveScanToggle.checked
    ? "Scanning for new pulls every 30s"
    : "Scan for new pulls";
}

async function scanForNewPull() {
  if (!currentPullData || pullSelect.value !== "latest" || !els.liveScanToggle.checked) return;

  try {
    const reportUrl = reportUrlInput.value.trim();
    const payload = await fetchAnalysis({ reportUrl, pullId: "latest", scope: "pull", fresh: true });
    if (payload.fight.id > (latestKnownFightId || 0)) {
      pullCache.set(pullCacheKey(reportUrl, "latest"), payload);
      pullCache.set(pullCacheKey(reportUrl, payload.fight.id), payload);
      renderDashboard(payload);
      setStatus(payload.report.title);
    } else {
      updateLiveState(payload);
    }
  } catch (error) {
    setStatus(`Live scan failed: ${error.message}`, { error: true });
  }
}

function setStatus(message, { loading = false, error = false } = {}) {
  statusTextEl.textContent = message;
  statusEl.classList.toggle("is-loading", loading);
  statusEl.classList.toggle("error", error);
}

function setActiveTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("is-hidden"));
  document.querySelector(`#${tabName}-tab`).classList.remove("is-hidden");
  els.dashboardControls.classList.toggle("is-hidden", tabName === "night");
}

function renderDashboard(data) {
  const latest = data.latestWipe;
  const summary = data.summary;
  currentPullData = data;
  spellMap = data.spells || spellMap;
  els.reportLink.href = reportUrlForFight(data.report.code, data.fight.id);
  updateLiveState(data);

  renderPullOptions(data.report.pulls || [], data.fight.id);

  els.summaryGrid.innerHTML = [
    metric("Duration", data.fight.duration),
    metric("Boss HP", `${Number(data.fight.bossPercentage).toFixed(1)}%`),
    metric("Deaths", summary.deathCount),
  ].join("");

  els.wipeCount.textContent = latest.wipeLevelFailures.length;
  els.deathCount.textContent = latest.deaths.length;
  els.mistakeCount.textContent = latest.likelyMistakes.length + latest.wipeLevelFailures.length;
  els.soakCount.textContent = latest.correctEchoSoakLeaderboard.length;
  els.quillCount.textContent = latest.correctQuillSoakLeaderboard.length;
  els.interruptCount.textContent = latest.eruptionInterruptLeaderboard.length;
  els.consumableCount.textContent = latest.consumableLeaderboard.length;

  els.wipeFailures.innerHTML = renderWipeFailures(latest.wipeLevelFailures);
  els.deaths.innerHTML = renderDeaths(latest.deaths, latest.wipeLevelFailures);
  els.mistakes.innerHTML = renderMistakes(latest.likelyMistakes, latest.wipeLevelFailures);
  els.echoSoaks.innerHTML = renderEchoSoaks(latest.correctEchoSoakLeaderboard);
  els.quillSoaks.innerHTML = renderQuillSoaks(latest.correctQuillSoakLeaderboard);
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
    metric("Mistake Players", night.mistakeLeaderboard.length),
    metric("Consumable Users", night.consumableLeaderboard.length),
  ].join("");

  els.nightMistakeCount.textContent = night.mistakeLeaderboard.length;
  els.nightSoakCount.textContent = night.correctEchoSoakLeaderboard.length;
  els.nightQuillCount.textContent = night.correctQuillSoakLeaderboard.length;
  els.nightInterruptCount.textContent = night.eruptionInterruptLeaderboard.length;
  els.nightConsumableCount.textContent = night.consumableLeaderboard.length;

  els.nightMistakes.innerHTML = renderNightMistakes(night.mistakeLeaderboard);
  els.nightEchoSoaks.innerHTML = renderEchoSoaks(night.correctEchoSoakLeaderboard);
  els.nightQuillSoaks.innerHTML = renderQuillSoaks(night.correctQuillSoakLeaderboard);
  els.nightEruptionInterrupts.innerHTML = renderEruptionInterrupts(night.eruptionInterruptLeaderboard);
  els.nightConsumables.innerHTML = renderConsumables(night.consumableLeaderboard);
}

function renderNightPlaceholder() {
  els.nightSummaryGrid.innerHTML = "";
  els.nightMistakeCount.textContent = 0;
  els.nightSoakCount.textContent = 0;
  els.nightQuillCount.textContent = 0;
  els.nightInterruptCount.textContent = 0;
  els.nightConsumableCount.textContent = 0;
  els.nightMistakes.innerHTML = empty("Loading night-wide mistakes.");
  els.nightEchoSoaks.innerHTML = empty("Loading night-wide soaks.");
  els.nightQuillSoaks.innerHTML = empty("Loading night-wide quill soaks.");
  els.nightEruptionInterrupts.innerHTML = empty("Loading night-wide interrupts.");
  els.nightConsumables.innerHTML = empty("Loading night-wide consumable usage.");
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

function reportUrlForFight(reportCode, fightId) {
  return `https://www.warcraftlogs.com/reports/${encodeURIComponent(reportCode)}?fight=${encodeURIComponent(fightId)}&type=summary`;
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
    ? `${spell(row.directDeathCause.abilityId, row.directDeathCause.abilityName)} (${formatNumber(row.directDeathCause.amount)})`
    : "";

  return `<article class="death-row">
    <details class="death-details">
      <summary class="death-main">
        <span class="death-order">#${row.order}</span>
        <span class="death-time">${escapeHtml(row.time)}</span>
        <span class="death-player">${player(row.player)}</span>
        <span class="death-cause">${cause}</span>
        <span class="death-mistake">${mistake ? mistakePill(mistake) : ""}</span>
      </summary>
      <div class="damage-events">${row.finalDamageEvents
        .map(
          (event) =>
            `<span class="damage-event"><strong class="damage-time">${escapeHtml(event.time)}</strong> ${spell(event.abilityId, event.abilityName)} <span class="damage-amount">${formatNumber(event.amount)}</span></span>`,
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
    <span>${spell(row.abilityId, row.abilityName)}</span>
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
  return leaderboardBars(
    rows,
    "totalCorrectSoaks",
    (row) => [
      `Light ${formatNumber(row.lightSoaks)}`,
      `Void ${formatNumber(row.voidSoaks)}`,
      `Immune ${formatNumber(row.immunitySoaks)}`,
      `Wrong ${formatNumber(row.wrongColorSoaks)}`,
    ],
  );
}

function renderQuillSoaks(rows) {
  if (!rows.length) return empty("No solo correct-color quill soaks detected.");
  return leaderboardBars(
    rows,
    "totalCorrectQuills",
    (row) => [
      `Light ${formatNumber(row.lightQuills)}`,
      `Void ${formatNumber(row.voidQuills)}`,
      `Multi ${formatNumber(row.multiHitQuills)}`,
    ],
  );
}

function renderEruptionInterrupts(rows) {
  if (!rows.length) return empty("No Light/Void Eruption interrupts detected.");
  return leaderboardBars(
    rows,
    "totalInterrupts",
    (row) => [
      `Light ${formatNumber(row.lightEruptionInterrupts)}`,
      `Void ${formatNumber(row.voidEruptionInterrupts)}`,
    ],
  );
}

function renderConsumables(rows) {
  if (!rows.length) return empty("No healthstone or health potion usage detected.");
  return leaderboardBars(
    rows,
    "totalUses",
    (row) => [
      `Stone ${formatNumber(row.healthstoneUses)}`,
      `Potion ${formatNumber(row.healthPotionUses)}`,
      `Heal ${formatNumber(row.healing)}`,
    ],
  );
}

function renderNightMistakes(rows) {
  if (!rows.length) return empty("No player mistakes detected by the current Beloren rules.");
  const max = Math.max(...rows.map((row) => row.totalMistakes), 1);
  return `<div class="night-mistake-list">
    <div class="night-mistake-header">
      <span>Player</span>
      <span>Total</span>
      <span>Pulls</span>
    </div>
    ${rows.map((row) => renderNightMistakeRow(row, max)).join("")}
  </div>`;
}

function renderNightMistakeRow(row, max) {
  const width = Math.max(4, Math.round((row.totalMistakes / max) * 100));
  return `<article class="night-mistake-row">
    <details>
      <summary class="night-mistake-main">
        <span>${player(row.player)}</span>
        <span class="bar-cell"><span class="bar-track"><span class="bar-fill ${classColorClass(row.player.class)}" style="width:${width}%"></span></span><strong>${formatNumber(row.totalMistakes)}</strong></span>
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

function leaderboardBars(rows, primaryKey, detailsForRow) {
  const max = Math.max(...rows.map((row) => Number(row[primaryKey] || 0)), 1);
  return `<div class="bar-list">${rows
    .map((row) => {
      const value = Number(row[primaryKey] || 0);
      const width = value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
      return `<div class="bar-row">
        <span class="bar-player">${player(row.player)}</span>
        <span class="bar-visual"><span class="bar-track"><span class="bar-fill ${classColorClass(row.player.class)}" style="width:${width}%"></span></span></span>
        <span class="bar-value">${formatNumber(value)}</span>
        <span class="bar-details">${detailsForRow(row).map(escapeHtml).join(" | ")}</span>
      </div>`;
    })
    .join("")}</div>`;
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
        `<span>${escapeHtml(item.time)} ${spell(item.abilityId, item.abilityName)} -> ${escapeHtml(item.target)} (${formatNumber(item.amount)})</span>`,
    )
    .join("")}</div>`;
}

function spell(abilityId, fallbackName) {
  const id = Number(abilityId || 0);
  const meta = spellMap[id] || {};
  const name = meta.name || fallbackName || `Ability ${id}`;
  const icon = meta.icon ? `https://wow.zamimg.com/images/wow/icons/small/${escapeHtml(meta.icon)}` : "";
  const iconHtml = icon ? `<img class="spell-icon" src="${icon}" alt="" loading="lazy" />` : "";
  if (!id) return escapeHtml(name);
  return `<a class="spell-link" href="https://www.wowhead.com/spell=${id}" data-wowhead="spell=${id}" target="_blank" rel="noreferrer">${iconHtml}<span>${escapeHtml(name)}</span></a>`;
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
