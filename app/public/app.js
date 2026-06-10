const form = document.querySelector("#report-form");
const reportUrlInput = document.querySelector("#report-url");
const pullSelect = document.querySelector("#pull-select");
const statusEl = document.querySelector("#status");
const statusTextEl = document.querySelector("#status-text");
const dashboardEl = document.querySelector("#dashboard");
const pullCache = new Map();
const nightCache = new Map();
const allProgCache = new Map();
let currentPullData = null;
let spellMap = {};
let livePollTimer = null;
let latestKnownFightId = null;
let activeTab = "latest";
let ignoreImmunitySoaks = false;
let liveScanStartedAt = null;
let liveScanTimedOut = false;
const ALL_PROG_GUILD_ID = 811453;
const LAST_REPORT_URL_KEY = "beloren-dashboard:last-report-url";
const LIVE_SCAN_INTERVAL_MS = 30000;
const LIVE_SCAN_TIMEOUT_MS = 3 * 60 * 60 * 1000;

const els = {
  summaryGrid: document.querySelector("#summary-grid"),
  nightSummaryGrid: document.querySelector("#night-summary-grid"),
  allProgSummaryGrid: document.querySelector("#all-prog-summary-grid"),
  wipeFailures: document.querySelector("#wipe-failures"),
  deaths: document.querySelector("#deaths"),
  mistakes: document.querySelector("#mistakes"),
  echoSoaks: document.querySelector("#echo-soaks"),
  quillSoaks: document.querySelector("#quill-soaks"),
  eruptionInterrupts: document.querySelector("#eruption-interrupts"),
  eggDamage: document.querySelector("#egg-damage"),
  consumables: document.querySelector("#consumables"),
  nightMistakes: document.querySelector("#night-mistakes"),
  nightEchoSoaks: document.querySelector("#night-echo-soaks"),
  nightQuillSoaks: document.querySelector("#night-quill-soaks"),
  nightEruptionInterrupts: document.querySelector("#night-eruption-interrupts"),
  nightEggDamage: document.querySelector("#night-egg-damage"),
  nightConsumables: document.querySelector("#night-consumables"),
  allProgMistakes: document.querySelector("#all-prog-mistakes"),
  allProgEchoSoaks: document.querySelector("#all-prog-echo-soaks"),
  allProgQuillSoaks: document.querySelector("#all-prog-quill-soaks"),
  allProgEruptionInterrupts: document.querySelector("#all-prog-eruption-interrupts"),
  allProgEggDamage: document.querySelector("#all-prog-egg-damage"),
  allProgConsumables: document.querySelector("#all-prog-consumables"),
  liveLogControl: document.querySelector("#live-log-control"),
  liveScanToggle: document.querySelector("#live-scan-toggle"),
  liveLogLabel: document.querySelector("#live-log-label"),
  forceScanButton: document.querySelector("#force-scan-button"),
  reportLink: document.querySelector("#report-link"),
  statusTabs: document.querySelector("#status-tabs"),
  allProgTabButton: document.querySelector("#all-prog-tab-button"),
  dashboardControls: document.querySelector(".dashboard-controls"),
  wipeCount: document.querySelector("#wipe-count"),
  deathCount: document.querySelector("#death-count"),
  mistakeCount: document.querySelector("#mistake-count"),
  soakCount: document.querySelector("#soak-count"),
  quillCount: document.querySelector("#quill-count"),
  interruptCount: document.querySelector("#interrupt-count"),
  eggDamageCount: document.querySelector("#egg-damage-count"),
  consumableCount: document.querySelector("#consumable-count"),
  nightMistakeCount: document.querySelector("#night-mistake-count"),
  nightSoakCount: document.querySelector("#night-soak-count"),
  nightQuillCount: document.querySelector("#night-quill-count"),
  nightInterruptCount: document.querySelector("#night-interrupt-count"),
  nightEggDamageCount: document.querySelector("#night-egg-damage-count"),
  nightConsumableCount: document.querySelector("#night-consumable-count"),
  allProgMistakeCount: document.querySelector("#all-prog-mistake-count"),
  allProgSoakCount: document.querySelector("#all-prog-soak-count"),
  allProgQuillCount: document.querySelector("#all-prog-quill-count"),
  allProgInterruptCount: document.querySelector("#all-prog-interrupt-count"),
  allProgEggDamageCount: document.querySelector("#all-prog-egg-damage-count"),
  allProgConsumableCount: document.querySelector("#all-prog-consumable-count"),
};

const lastReportUrl = localStorage.getItem(LAST_REPORT_URL_KEY);
if (lastReportUrl) reportUrlInput.value = lastReportUrl;
setStatus(lastReportUrl ? "Ready." : "Paste a Warcraft Logs report URL to start.");

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", async () => {
    setActiveTab(button.dataset.tab);

    if (button.dataset.tab === "night") {
      await loadWholeNight(reportUrlInput.value.trim());
    } else if (button.dataset.tab === "all-prog") {
      await loadAllProg(reportUrlInput.value.trim());
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  pullSelect.value = "latest";
  setActiveTab("latest");
  const reportUrl = reportUrlInput.value.trim();
  if (reportUrl) localStorage.setItem(LAST_REPORT_URL_KEY, reportUrl);
  await analyze(reportUrl, "latest");
});

pullSelect.addEventListener("change", async () => {
  if (pullSelect.disabled) return;
  await analyze(reportUrlInput.value.trim(), pullSelect.value);
});

els.liveScanToggle.addEventListener("change", () => {
  if (els.liveScanToggle.checked) {
    liveScanStartedAt = Date.now();
    liveScanTimedOut = false;
  } else {
    liveScanStartedAt = null;
    liveScanTimedOut = false;
  }
  updateScanLabel();
  updateLivePolling();
});

els.forceScanButton.addEventListener("click", async () => {
  await scanForNewPull({ forced: true });
});

document.querySelectorAll(".ignore-immunity-toggle").forEach((toggle) => {
  toggle.addEventListener("change", () => {
    ignoreImmunitySoaks = toggle.checked;
    syncImmunityToggles();
    renderEchoLeaderboardSections();
  });
});

async function analyze(reportUrl, pullId = pullSelect.value || "latest") {
  if (!reportUrl) {
    setStatus("Paste a Warcraft Logs report URL to start.");
    return;
  }
  setStatus("Fetching wipe events...", { loading: true });
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

async function loadAllProg(reportUrl) {
  if (!reportUrl || dashboardEl.classList.contains("is-empty") || els.allProgTabButton.classList.contains("is-hidden")) return;
  const cacheKey = allProgCacheKey(reportUrl);
  if (allProgCache.has(cacheKey)) {
    const cached = allProgCache.get(cacheKey);
    renderAllProgDashboard(cached.allProg);
    setStatus(cached.report.title);
    return;
  }

  setStatus("Fetching all-prog data...", { loading: true });

  try {
    const payload = await fetchAnalysis({ reportUrl, scope: "prog" });
    spellMap = payload.spells || spellMap;
    allProgCache.set(cacheKey, payload);
    renderAllProgDashboard(payload.allProg);
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

  if (!currentPullData || !els.liveScanToggle.checked || liveScanTimedOut) return;

  livePollTimer = setInterval(scanForNewPull, LIVE_SCAN_INTERVAL_MS);
}

function updateScanLabel() {
  if (liveScanTimedOut) {
    els.liveLogLabel.textContent = "Scanning paused after 3 hours";
    return;
  }

  els.liveLogLabel.textContent = els.liveScanToggle.checked ? "Scanning for new wipes every 30s" : "Scan for new wipes";
}

async function scanForNewPull({ forced = false } = {}) {
  if (!currentPullData) return;
  if (!forced && !els.liveScanToggle.checked) return;
  if (!forced && liveScanStartedAt && Date.now() - liveScanStartedAt >= LIVE_SCAN_TIMEOUT_MS) {
    liveScanTimedOut = true;
    els.liveScanToggle.checked = false;
    updateScanLabel();
    updateLivePolling();
    setStatus("Scanning paused after 3 hours to avoid extra API calls.");
    return;
  }

  try {
    const reportUrl = reportUrlInput.value.trim();
    setStatus(forced ? "Checking for new wipes..." : "Scanning for new wipes...", { loading: true });
    const payload = await fetchAnalysis({ reportUrl, pullId: "latest", scope: "pull", fresh: true });
    if (payload.fight.id > (latestKnownFightId || 0)) {
      pullCache.set(pullCacheKey(reportUrl, "latest"), payload);
      pullCache.set(pullCacheKey(reportUrl, payload.fight.id), payload);
      latestKnownFightId = payload.fight.id;
      if (pullSelect.value === "latest" && activeTab === "latest") {
        setStatus("New wipe found. Loading latest wipe...", { loading: true });
        renderDashboard(payload);
      } else {
        renderPullOptions(payload.report.pulls || [], currentPullData.fight.id);
        updateLiveState(payload);
      }
      setStatus(payload.report.title);
    } else {
      updateLiveState(payload);
      setStatus(forced ? "No new wipe found." : payload.report.title);
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
  els.dashboardControls.classList.toggle("is-hidden", tabName !== "latest");
}

function renderDashboard(data) {
  const latest = data.latestWipe;
  const summary = data.summary;
  currentPullData = data;
  spellMap = data.spells || spellMap;
  els.reportLink.href = reportUrlForFight(data.report.code, data.fight.id);
  updateAllProgAccess(data.report.guild);
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
  els.eggDamageCount.textContent = latest.eggDamageLeaderboard.length;
  els.consumableCount.textContent = latest.consumableLeaderboard.length;

  els.wipeFailures.innerHTML = renderWipeFailures(latest.wipeLevelFailures);
  els.deaths.innerHTML = renderDeaths(latest.deaths, latest.wipeLevelFailures);
  els.mistakes.innerHTML = renderMistakes(latest.likelyMistakes, latest.wipeLevelFailures);
  els.echoSoaks.innerHTML = renderEchoSoaks(latest.correctEchoSoakLeaderboard, { expandable: true });
  els.quillSoaks.innerHTML = renderQuillSoaks(latest.correctQuillSoakLeaderboard);
  els.eruptionInterrupts.innerHTML = renderEruptionInterrupts(latest.eruptionInterruptLeaderboard);
  els.eggDamage.innerHTML = renderEggDamage(latest.eggDamageLeaderboard);
  els.consumables.innerHTML = renderConsumables(latest.consumableLeaderboard);

  const nightPayload = nightCache.get(nightCacheKey(reportUrlInput.value.trim()));
  if (nightPayload) renderNightDashboard(nightPayload.wholeNight);
  else renderNightPlaceholder();

  const allProgPayload = allProgCache.get(allProgCacheKey(reportUrlInput.value.trim()));
  if (allProgPayload) renderAllProgDashboard(allProgPayload.allProg);
  else renderAllProgPlaceholder();
}

function updateAllProgAccess(guild) {
  const canShow = Number(guild?.id) === ALL_PROG_GUILD_ID;
  els.allProgTabButton.classList.toggle("is-hidden", !canShow);
  if (!canShow && activeTab === "all-prog") setActiveTab("latest");
}

function renderNightDashboard(night) {
  if (!night) {
    renderNightPlaceholder();
    return;
  }

  els.nightSummaryGrid.innerHTML = [
    metric("Attempts", night.pullCount),
    metric("Wipes", night.wipeCount),
    metric("Combat", formatDurationCompact(night.combatDurationMs)),
  ].join("");

  els.nightMistakeCount.textContent = night.mistakeLeaderboard.length;
  els.nightSoakCount.textContent = night.correctEchoSoakLeaderboard.length;
  els.nightQuillCount.textContent = night.correctQuillSoakLeaderboard.length;
  els.nightInterruptCount.textContent = night.eruptionInterruptLeaderboard.length;
  els.nightEggDamageCount.textContent = night.eggDamageLeaderboard.length;
  els.nightConsumableCount.textContent = night.consumableLeaderboard.length;

  els.nightMistakes.innerHTML = renderNightMistakes(night.mistakeLeaderboard);
  els.nightEchoSoaks.innerHTML = renderEchoSoaks(night.correctEchoSoakLeaderboard);
  els.nightQuillSoaks.innerHTML = renderQuillSoaks(night.correctQuillSoakLeaderboard);
  els.nightEruptionInterrupts.innerHTML = renderEruptionInterrupts(night.eruptionInterruptLeaderboard);
  els.nightEggDamage.innerHTML = renderEggDamage(night.eggDamageLeaderboard);
  els.nightConsumables.innerHTML = renderConsumables(night.consumableLeaderboard);
}

function renderNightPlaceholder() {
  els.nightSummaryGrid.innerHTML = "";
  els.nightMistakeCount.textContent = 0;
  els.nightSoakCount.textContent = 0;
  els.nightQuillCount.textContent = 0;
  els.nightInterruptCount.textContent = 0;
  els.nightEggDamageCount.textContent = 0;
  els.nightConsumableCount.textContent = 0;
  els.nightMistakes.innerHTML = empty("Loading night-wide mistakes.");
  els.nightEchoSoaks.innerHTML = empty("Loading night-wide soaks.");
  els.nightQuillSoaks.innerHTML = empty("Loading night-wide quill soaks.");
  els.nightEruptionInterrupts.innerHTML = empty("Loading night-wide interrupts.");
  els.nightEggDamage.innerHTML = empty("Loading night-wide egg damage.");
  els.nightConsumables.innerHTML = empty("Loading night-wide consumable usage.");
}

function renderAllProgDashboard(allProg) {
  if (!allProg) {
    renderAllProgPlaceholder();
    return;
  }

  els.allProgSummaryGrid.innerHTML = [
    metric("Reports", allProg.reportCount),
    metric("Attempts", allProg.pullCount),
    metric("Wipes", allProg.wipeCount),
    metric("Combat", formatDurationCompact(allProg.combatDurationMs)),
  ].join("");

  els.allProgMistakeCount.textContent = allProg.mistakeLeaderboard.length;
  els.allProgSoakCount.textContent = allProg.correctEchoSoakLeaderboard.length;
  els.allProgQuillCount.textContent = allProg.correctQuillSoakLeaderboard.length;
  els.allProgInterruptCount.textContent = allProg.eruptionInterruptLeaderboard.length;
  els.allProgEggDamageCount.textContent = allProg.eggDamageLeaderboard.length;
  els.allProgConsumableCount.textContent = allProg.consumableLeaderboard.length;

  els.allProgMistakes.innerHTML = renderNightMistakes(allProg.mistakeLeaderboard);
  els.allProgEchoSoaks.innerHTML = renderEchoSoaks(allProg.correctEchoSoakLeaderboard);
  els.allProgQuillSoaks.innerHTML = renderQuillSoaks(allProg.correctQuillSoakLeaderboard);
  els.allProgEruptionInterrupts.innerHTML = renderEruptionInterrupts(allProg.eruptionInterruptLeaderboard);
  els.allProgEggDamage.innerHTML = renderEggDamage(allProg.eggDamageLeaderboard);
  els.allProgConsumables.innerHTML = renderConsumables(allProg.consumableLeaderboard);
}

function renderAllProgPlaceholder() {
  els.allProgSummaryGrid.innerHTML = "";
  els.allProgMistakeCount.textContent = 0;
  els.allProgSoakCount.textContent = 0;
  els.allProgQuillCount.textContent = 0;
  els.allProgInterruptCount.textContent = 0;
  els.allProgEggDamageCount.textContent = 0;
  els.allProgConsumableCount.textContent = 0;
  els.allProgMistakes.innerHTML = empty("Loading all-prog mistakes.");
  els.allProgEchoSoaks.innerHTML = empty("Loading all-prog soaks.");
  els.allProgQuillSoaks.innerHTML = empty("Loading all-prog quill soaks.");
  els.allProgEruptionInterrupts.innerHTML = empty("Loading all-prog interrupts.");
  els.allProgEggDamage.innerHTML = empty("Loading all-prog egg damage.");
  els.allProgConsumables.innerHTML = empty("Loading all-prog consumable usage.");
}

function renderPullOptions(pulls, selectedFightId) {
  const requested = pullSelect.value || "latest";
  pullSelect.innerHTML = [
    `<option value="latest">Latest wipe</option>`,
    ...pulls.map((pull) => {
      const label = pull.kill ? "Kill" : "Wipe";
      const hp = pull.kill ? "0.0%" : `${Number(pull.bossPercentage).toFixed(1)}%`;
      return `<option value="${pull.id}">${label} ${pull.wipeNumber || pull.id} - ${hp} - ${escapeHtml(pull.duration)}</option>`;
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

function allProgCacheKey(reportUrl) {
  return `${reportUrl}::all-prog`;
}

function metric(label, value) {
  return `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><span class="metric-value">${escapeHtml(value)}</span></div>`;
}

function renderWipeFailures(rows) {
  if (!rows.length) return empty("No wipe-level failures detected for this wipe.");
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

function syncImmunityToggles() {
  document.querySelectorAll(".ignore-immunity-toggle").forEach((toggle) => {
    toggle.checked = ignoreImmunitySoaks;
  });
}

function renderEchoLeaderboardSections() {
  if (currentPullData?.latestWipe) {
    els.echoSoaks.innerHTML = renderEchoSoaks(currentPullData.latestWipe.correctEchoSoakLeaderboard, { expandable: true });
  }

  const nightPayload = nightCache.get(nightCacheKey(reportUrlInput.value.trim()));
  if (nightPayload?.wholeNight) {
    els.nightEchoSoaks.innerHTML = renderEchoSoaks(nightPayload.wholeNight.correctEchoSoakLeaderboard);
  }

  const allProgPayload = allProgCache.get(allProgCacheKey(reportUrlInput.value.trim()));
  if (allProgPayload?.allProg) {
    els.allProgEchoSoaks.innerHTML = renderEchoSoaks(allProgPayload.allProg.correctEchoSoakLeaderboard);
  }
}

function renderEchoSoaks(rows, { expandable = false } = {}) {
  if (!rows.length) return empty("No correct Radiant Echoes soaks detected.");
  const rankedRows = rows
    .map((row) => ({
      ...row,
      rankedCorrectSoaks: Math.max(0, row.totalCorrectSoaks - (ignoreImmunitySoaks ? row.immunitySoaks || 0 : 0)),
    }))
    .sort((a, b) => b.rankedCorrectSoaks - a.rankedCorrectSoaks || a.player.name.localeCompare(b.player.name));

  if (expandable) {
    return expandableEchoBars(rankedRows);
  }

  return leaderboardBars(
    rankedRows,
    "rankedCorrectSoaks",
    echoDetails,
  );
}

function expandableEchoBars(rows) {
  const max = Math.max(...rows.map((row) => Number(row.rankedCorrectSoaks || 0)), 1);
  return `<div class="bar-list expandable-bar-list">${rows.map((row) => expandableEchoRow(row, max)).join("")}</div>`;
}

function expandableEchoRow(row, max) {
  const value = Number(row.rankedCorrectSoaks || 0);
  const width = value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  const instances = [...(row.instances || [])].sort((a, b) => a.timestamp - b.timestamp);

  return `<details class="bar-row-detail">
    <summary class="bar-row bar-row-summary">
      <span class="bar-player">${player(row.player)}</span>
      <span class="bar-visual"><span class="bar-track"><span class="bar-fill ${classColorClass(row.player.class)}" style="width:${width}%"></span></span></span>
      <span class="bar-value">${formatNumber(value)}</span>
      <span class="bar-details">${echoDetails(row).map(escapeHtml).join(" | ")}</span>
    </summary>
    <div class="echo-instance-list">
      ${instances.length ? instances.map(renderEchoInstance).join("") : `<span class="empty-inline">No timestamped soaks.</span>`}
    </div>
  </details>`;
}

function renderEchoInstance(instance) {
  const label = instance.type === "immune" ? "Immune" : instance.type === "light" ? "Light" : "Void";
  return `<span class="echo-instance">
    <strong>${escapeHtml(instance.time)}</strong>
    <span>${escapeHtml(label)}</span>
    <span>${spell(instance.abilityId, instance.abilityName)}</span>
    <span class="echo-instance-amount">${formatNumber(instance.amount)}</span>
  </span>`;
}

function echoDetails(row) {
  return [
    `Light ${formatNumber(row.lightSoaks)}`,
    `Void ${formatNumber(row.voidSoaks)}`,
    `Immune ${formatNumber(row.immunitySoaks)}`,
    `Wrong ${formatNumber(row.wrongColorSoaks)}`,
  ];
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

function renderEggDamage(rows) {
  if (!rows.length) return empty("No egg phase damage detected.");
  return leaderboardBars(
    rows,
    "totalDamage",
    () => [],
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
      <span>Wipes</span>
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

function formatDurationCompact(ms) {
  const totalMinutes = Math.round(Number(ms || 0) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
