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
let pullAgeTimer = null;
let latestKnownFightId = null;
let activeTab = "latest";
let ignoreImmunitySoaks = false;
let liveScanStartedAt = null;
let liveScanTimedOut = false;
let currentBossKey = "beloren";
let selectedTerminateSpawnSetId = null;
let selectedMemorySequenceId = null;
let activeTrendScope = null;
let visibleTrendPlayers = new Set();
let showOverallTrend = true;
let suppressUrlStateUpdate = false;
const ALL_PROG_GUILD_IDS = new Set([811453, 713862]);
const LAST_REPORT_URL_KEY = "beloren-dashboard:last-report-url";
const LURA_KICK_ORDER_KEY = "beloren-dashboard:lura-kick-order";
const DEFAULT_LURA_KICK_ORDER = `Fartgrip Dreadknights Rhetorica Chairmanjeff
Boshjanski Walshy Koralie Flashwiz
Senpaibacon Snobshot Demo Elpumba`;
const LURA_SYMBOL_ICONS = {
  7242384: { name: "T", src: "/assets/lura-symbols/t.png" },
  134635: { name: "Circle", src: "/assets/lura-symbols/circle.png" },
  340528: { name: "Diamond", src: "/assets/lura-symbols/diamond.png" },
  351033: { name: "Triangle", src: "/assets/lura-symbols/triangle.png" },
  236903: { name: "Cross", src: "/assets/lura-symbols/cross.png" },
};
const LIVE_SCAN_INTERVAL_MS = 2000;
const LIVE_SCAN_TIMEOUT_MS = 3 * 60 * 60 * 1000;

const els = {
  title: document.querySelector("h1"),
  summaryGrid: document.querySelector("#summary-grid"),
  nightSummaryGrid: document.querySelector("#night-summary-grid"),
  allProgSummaryGrid: document.querySelector("#all-prog-summary-grid"),
  wipeFailures: document.querySelector("#wipe-failures"),
  deaths: document.querySelector("#deaths"),
  mistakes: document.querySelector("#mistakes"),
  echoSoaks: document.querySelector("#echo-soaks"),
  quillSoaks: document.querySelector("#quill-soaks"),
  eruptionInterrupts: document.querySelector("#eruption-interrupts"),
  symbolCalls: document.querySelector("#symbol-calls"),
  eggDamage: document.querySelector("#egg-damage"),
  consumables: document.querySelector("#consumables"),
  nightMistakes: document.querySelector("#night-mistakes"),
  nightGlaives: document.querySelector("#night-glaives"),
  nightGlaiveTrend: document.querySelector("#night-glaive-trend"),
  nightEchoSoaks: document.querySelector("#night-echo-soaks"),
  nightQuillSoaks: document.querySelector("#night-quill-soaks"),
  nightEruptionInterrupts: document.querySelector("#night-eruption-interrupts"),
  nightEggDamage: document.querySelector("#night-egg-damage"),
  nightConsumables: document.querySelector("#night-consumables"),
  allProgMistakes: document.querySelector("#all-prog-mistakes"),
  allProgGlaives: document.querySelector("#all-prog-glaives"),
  allProgGlaiveTrend: document.querySelector("#all-prog-glaive-trend"),
  allProgEchoSoaks: document.querySelector("#all-prog-echo-soaks"),
  allProgQuillSoaks: document.querySelector("#all-prog-quill-soaks"),
  allProgEruptionInterrupts: document.querySelector("#all-prog-eruption-interrupts"),
  allProgEggDamage: document.querySelector("#all-prog-egg-damage"),
  allProgConsumables: document.querySelector("#all-prog-consumables"),
  liveLogControl: document.querySelector("#live-log-control"),
  liveScanToggle: document.querySelector("#live-scan-toggle"),
  liveLogLabel: document.querySelector("#live-log-label"),
  forceScanButton: document.querySelector("#force-scan-button"),
  refreshNightButton: document.querySelector("#refresh-night-button"),
  refreshAllProgButton: document.querySelector("#refresh-all-prog-button"),
  trendModal: document.querySelector("#trend-modal"),
  trendModalTitle: document.querySelector("#trend-modal-title"),
  trendPlayerToggles: document.querySelector("#trend-player-toggles"),
  trendModalChart: document.querySelector("#trend-modal-chart"),
  trendModalClose: document.querySelector("#trend-modal-close"),
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
  symbolCallCount: document.querySelector("#symbol-call-count"),
  eggDamageCount: document.querySelector("#egg-damage-count"),
  consumableCount: document.querySelector("#consumable-count"),
  nightMistakeCount: document.querySelector("#night-mistake-count"),
  nightGlaiveCount: document.querySelector("#night-glaive-count"),
  nightGlaiveTrendCount: document.querySelector("#night-glaive-trend-count"),
  nightSoakCount: document.querySelector("#night-soak-count"),
  nightQuillCount: document.querySelector("#night-quill-count"),
  nightInterruptCount: document.querySelector("#night-interrupt-count"),
  nightEggDamageCount: document.querySelector("#night-egg-damage-count"),
  nightConsumableCount: document.querySelector("#night-consumable-count"),
  allProgMistakeCount: document.querySelector("#all-prog-mistake-count"),
  allProgGlaiveCount: document.querySelector("#all-prog-glaive-count"),
  allProgGlaiveTrendCount: document.querySelector("#all-prog-glaive-trend-count"),
  allProgSoakCount: document.querySelector("#all-prog-soak-count"),
  allProgQuillCount: document.querySelector("#all-prog-quill-count"),
  allProgInterruptCount: document.querySelector("#all-prog-interrupt-count"),
  allProgEggDamageCount: document.querySelector("#all-prog-egg-damage-count"),
  allProgConsumableCount: document.querySelector("#all-prog-consumable-count"),
};

const bossLabels = {
  beloren: {
    title: "Belo'ren Review",
    wipeFailures: "Wipe-Level Failures",
    mistakesEmpty: "No mistakes detected by the current Belo'ren rules.",
    echo: "Correct Radiant Echoes Soaks",
    quill: "Correct Quill Soaks",
    interrupts: "Eruption Interrupts",
    symbolCalls: "",
    consumables: "Healthstone / Potions",
    eggDamage: "Egg Damage",
    glaiveMistakes: "",
  },
  lura: {
    title: "Midnight Falls Review",
    wipeFailures: "Wipe Conditions",
    mistakesEmpty: "No mistakes detected by the current Lura rules.",
    echo: "Tears of L'ura Soaks",
    quill: "Tears of L'ura Spawned",
    interrupts: "Terminate Timeline",
    nightInterrupts: "Terminate Interrupts",
    symbolCalls: "Memory Game",
    consumables: "Healthstone / Potions",
    eggDamage: "",
    glaiveMistakes: "Hit By Glaive",
  },
};

const initialUrlState = parseUrlState();
const initialReportUrl = initialUrlState.reportUrl || localStorage.getItem(LAST_REPORT_URL_KEY);
if (initialReportUrl) reportUrlInput.value = initialReportUrl;
setStatus(initialReportUrl ? "Ready." : "Paste a Warcraft Logs report URL to start.");

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", async () => {
    setActiveTab(button.dataset.tab);
    updateUrlState();

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
  updateUrlState({ tab: "latest", fightId: null });
  await analyze(reportUrl, "latest");
});

pullSelect.addEventListener("change", async () => {
  if (pullSelect.disabled) return;
  setActiveTab("latest");
  updateUrlState({ tab: "latest", fightId: pullSelect.value === "latest" ? null : pullSelect.value });
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

els.refreshNightButton.addEventListener("click", async () => {
  await loadWholeNight(reportUrlInput.value.trim(), { fresh: true });
});

els.refreshAllProgButton.addEventListener("click", async () => {
  await loadAllProg(reportUrlInput.value.trim(), { fresh: true });
});

document.querySelectorAll(".trend-expand-button").forEach((button) => {
  button.addEventListener("click", () => openTrendModal(button.dataset.trendScope));
});

els.trendModalClose.addEventListener("click", closeTrendModal);
els.trendModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-trend-modal]")) closeTrendModal();
  const overallToggle = event.target.closest(".trend-overall-toggle");
  if (overallToggle) {
    if (event.altKey) {
      isolateOverallTrend();
      return;
    }
    showOverallTrend = !showOverallTrend;
    renderTrendModal();
    return;
  }
  const selectAllToggle = event.target.closest(".trend-select-all-toggle");
  if (selectAllToggle) {
    selectAllTrendSeries();
    return;
  }
  const toggle = event.target.closest(".trend-player-toggle");
  if (!toggle) return;
  const key = toggle.dataset.playerKey;
  if (!key) return;
  if (event.altKey) {
    isolateTrendPlayer(key);
    return;
  }
  if (visibleTrendPlayers.has(key)) visibleTrendPlayers.delete(key);
  else visibleTrendPlayers.add(key);
  renderTrendModal();
});

els.trendModal.addEventListener("dblclick", (event) => {
  const toggle = event.target.closest(".trend-player-toggle");
  if (!toggle || toggle.classList.contains("trend-overall-toggle")) return;
  const key = toggle.dataset.playerKey;
  if (!key) return;
  isolateTrendPlayer(key);
});

els.eruptionInterrupts.addEventListener("change", (event) => {
  if (!event.target.matches(".terminate-spawn-select")) return;
  selectedTerminateSpawnSetId = event.target.value;
  els.eruptionInterrupts.innerHTML = renderTerminateTimeline(currentPullData?.latestWipe?.interruptTimeline);
});

els.eruptionInterrupts.addEventListener("click", async (event) => {
  if (!event.target.matches(".apply-kick-order-button")) return;
  const input = els.eruptionInterrupts.querySelector(".kick-order-input");
  localStorage.setItem(LURA_KICK_ORDER_KEY, (input?.value || DEFAULT_LURA_KICK_ORDER).trim());
  clearReportCaches(reportUrlInput.value.trim());
  await analyze(reportUrlInput.value.trim(), pullSelect.value || "latest");
});

els.symbolCalls.addEventListener("change", (event) => {
  if (!event.target.matches(".memory-sequence-select")) return;
  selectedMemorySequenceId = event.target.value;
  els.symbolCalls.innerHTML = renderSymbolCalls(currentPullData?.latestWipe?.symbolMacroSequences);
});

els.allProgSummaryGrid.addEventListener("click", async (event) => {
  if (!event.target.matches(".discover-reports-button")) return;
  event.target.disabled = true;
  await loadAllProg(reportUrlInput.value.trim(), { discoverReports: true });
});

document.querySelectorAll(".ignore-immunity-toggle").forEach((toggle) => {
  toggle.addEventListener("change", () => {
    ignoreImmunitySoaks = toggle.checked;
    syncImmunityToggles();
    renderEchoLeaderboardSections();
  });
});

document.querySelectorAll(".mistake-rate-toggle input").forEach((toggle) => {
  toggle.addEventListener("change", () => {
    renderAggregateMistakeSections();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.trendModal.classList.contains("is-hidden")) closeTrendModal();
});

initializeFromUrlState(initialUrlState);

async function analyze(reportUrl, pullId = pullSelect.value || "latest", { skipUrlUpdate = false } = {}) {
  if (!reportUrl) {
    setStatus("Paste a Warcraft Logs report URL to start.");
    return;
  }
  setStatus("Fetching wipe events...", { loading: true });
  const cacheKey = pullCacheKey(reportUrl, pullId);
  if (pullCache.has(cacheKey)) {
    const cached = pullCache.get(cacheKey);
    cached.requestedPullId = pullId;
    renderDashboard(cached);
    setStatus(cached.report.title);
    dashboardEl.classList.remove("is-empty");
    els.statusTabs.classList.remove("is-hidden");
    els.liveLogControl.classList.remove("is-hidden");
    if (!skipUrlUpdate) updateUrlState({ tab: activeTab, fightId: pullId === "latest" ? null : cached.fight.id });
    return;
  }

  try {
    const payload = await fetchAnalysis({ reportUrl, pullId, scope: "pull" });
    payload.requestedPullId = pullId;

    pullCache.set(cacheKey, payload);
    pullCache.set(pullCacheKey(reportUrl, payload.fight.id), payload);
    renderDashboard(payload);
    setStatus(payload.report.title);
    dashboardEl.classList.remove("is-empty");
    els.statusTabs.classList.remove("is-hidden");
    els.liveLogControl.classList.remove("is-hidden");
    if (!skipUrlUpdate) updateUrlState({ tab: activeTab, fightId: pullId === "latest" ? null : payload.fight.id });
  } catch (error) {
    setStatus(error.message, { error: true });
  }
}

async function fetchAnalysis({ reportUrl, pullId = "latest", scope, fresh = false, discoverReports = false }) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportUrl, pullId, scope, fresh, discoverReports, kickAssignments: kickAssignmentsForRequest() }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Analysis failed");
  return payload;
}

async function fetchScan({ reportUrl, force = false }) {
  const response = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportUrl, force, kickAssignments: kickAssignmentsForRequest() }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Scan failed");
  return payload;
}

async function loadWholeNight(reportUrl, { fresh = false } = {}) {
  if (!reportUrl || dashboardEl.classList.contains("is-empty")) return;
  const cacheKey = nightCacheKey(reportUrl);
  if (!fresh && nightCache.has(cacheKey)) {
    const cached = nightCache.get(cacheKey);
    renderNightDashboard(cached.wholeNight);
    setStatus(cached.report.title);
    updateUrlState({ tab: "night", fightId: null });
    return;
  }

  if (fresh) {
    nightCache.delete(cacheKey);
    allProgCache.delete(allProgCacheKey(reportUrl));
  }

  setRefreshButtonState(els.refreshNightButton, fresh);
  setStatus(fresh ? "Refreshing whole-night events..." : "Fetching whole-night events...", { loading: true });

  try {
    const payload = await fetchAnalysis({ reportUrl, scope: "night", fresh });
    spellMap = payload.spells || spellMap;
    nightCache.set(cacheKey, payload);
    renderNightDashboard(payload.wholeNight);
    if (payload.report?.pulls && currentPullData?.fight) renderPullOptions(payload.report.pulls, currentPullData.fight.id);
    setStatus(payload.report.title);
    updateUrlState({ tab: "night", fightId: null });
  } catch (error) {
    setStatus(error.message, { error: true });
  } finally {
    setRefreshButtonState(els.refreshNightButton, false);
  }
}

async function loadAllProg(reportUrl, { discoverReports = false, fresh = false } = {}) {
  if (!reportUrl || dashboardEl.classList.contains("is-empty") || els.allProgTabButton.classList.contains("is-hidden")) return;
  const cacheKey = allProgCacheKey(reportUrl);
  if (!discoverReports && !fresh && allProgCache.has(cacheKey)) {
    const cached = allProgCache.get(cacheKey);
    renderAllProgDashboard(cached.allProg);
    setStatus(cached.report.title);
    updateUrlState({ tab: "all-prog", fightId: null });
    return;
  }

  if (fresh) {
    allProgCache.delete(cacheKey);
    nightCache.delete(nightCacheKey(reportUrl));
  }

  setRefreshButtonState(els.refreshAllProgButton, fresh);
  setStatus(
    fresh ? "Refreshing all-prog data..." : discoverReports ? "Finding guild reports..." : "Loading cached all-prog data...",
    { loading: true },
  );

  try {
    const payload = await fetchAnalysis({ reportUrl, scope: "prog", discoverReports, fresh });
    spellMap = payload.spells || spellMap;
    allProgCache.set(cacheKey, payload);
    renderAllProgDashboard(payload.allProg);
    setStatus(payload.report.title);
    updateUrlState({ tab: "all-prog", fightId: null });
  } catch (error) {
    setStatus(error.message, { error: true });
  } finally {
    setRefreshButtonState(els.refreshAllProgButton, false);
  }
}

function setRefreshButtonState(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Refreshing..." : "Refresh";
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

  els.liveLogLabel.textContent = els.liveScanToggle.checked ? "Scanning for new wipes" : "Scan for new wipes";
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
    const payload = await fetchScan({ reportUrl, force: forced });
    if (payload.fight.id > (latestKnownFightId || 0)) {
      clearAggregateCaches(reportUrl);
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

async function initializeFromUrlState(state) {
  if (!state.reportUrl) return;
  suppressUrlStateUpdate = true;
  try {
    localStorage.setItem(LAST_REPORT_URL_KEY, state.reportUrl);
    pullSelect.value = state.fightId || "latest";
    setActiveTab("latest");
    await analyze(state.reportUrl, state.fightId || "latest", { skipUrlUpdate: true });

    if (state.tab === "night") {
      setActiveTab("night");
      await loadWholeNight(state.reportUrl);
    } else if (state.tab === "all-prog") {
      setActiveTab("all-prog");
      await loadAllProg(state.reportUrl);
    } else {
      setActiveTab("latest");
    }
  } finally {
    suppressUrlStateUpdate = false;
    updateUrlState({
      tab: activeTab,
      fightId: activeTab === "latest" && pullSelect.value !== "latest" ? pullSelect.value : state.fightId,
    });
  }
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  const rawReport = params.get("report") || params.get("code") || "";
  const reportCode = reportCodeFromInput(rawReport);
  const reportUrl = reportCode ? `https://www.warcraftlogs.com/reports/${reportCode}` : "";
  const fightId = params.get("fight") || params.get("pull") || fightIdFromInput(rawReport);
  const tab = normalizeUrlTab(params.get("tab"), fightId);
  return { reportUrl, reportCode, tab, fightId };
}

function normalizeUrlTab(tab, fightId = "") {
  const value = String(tab || "").toLowerCase();
  if (value === "night" || value === "whole-night") return "night";
  if (value === "prog" || value === "all-prog" || value === "allprog") return "all-prog";
  if (value === "pull" || value === "latest") return "latest";
  return fightId ? "latest" : "latest";
}

function updateUrlState({ tab = activeTab, fightId = null } = {}) {
  if (suppressUrlStateUpdate) return;
  const reportCode = reportCodeFromInput(reportUrlInput.value.trim());
  const url = new URL(window.location.href);
  url.search = "";
  if (reportCode) url.searchParams.set("report", reportCode);
  const normalizedTab = normalizeUrlTab(tab);
  if (reportCode) url.searchParams.set("tab", normalizedTab === "all-prog" ? "prog" : normalizedTab);
  const selectedFightId = fightId ?? (normalizedTab === "latest" && pullSelect.value !== "latest" ? pullSelect.value : "");
  if (reportCode && normalizedTab === "latest" && selectedFightId && selectedFightId !== "latest") {
    url.searchParams.set("fight", selectedFightId);
  }
  window.history.replaceState({}, "", url);
}

function reportCodeFromInput(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/reports\/([^/?#]+)/);
    if (match) return match[1];
  } catch {
    // Fall through to report-code parsing.
  }
  return value.replace(/^https?:\/\/(www\.)?warcraftlogs\.com\/reports\//i, "").split(/[/?#&]/)[0];
}

function fightIdFromInput(input) {
  try {
    return new URL(String(input || "").trim()).searchParams.get("fight") || "";
  } catch {
    return "";
  }
}

function renderDashboard(data) {
  const latest = data.latestWipe;
  const summary = data.summary;
  currentBossKey = data.boss?.key || "beloren";
  if (currentBossKey === "lura") selectedTerminateSpawnSetId = data.latestWipe?.interruptTimeline?.selectedSpawnSetId || null;
  if (currentBossKey === "lura") selectedMemorySequenceId = data.latestWipe?.symbolMacroSequences?.sequences?.[0]?.id || null;
  currentPullData = data;
  spellMap = data.spells || spellMap;
  els.reportLink.href = reportUrlForFight(data.report.code, data.fight.id);
  applyBossLabels(currentBossKey);
  updateAllProgAccess(data.report.guild, data.boss);
  updateLiveState(data);

  renderPullOptions(data.report.pulls || [], data.fight.id, data.requestedPullId);

  els.summaryGrid.innerHTML = [
    metric("Duration", data.fight.duration),
    metric("Boss HP", `${Number(data.fight.bossPercentage).toFixed(1)}%`),
    metric("Deaths", summary.deathCount),
    liveMetric("Ended", "pull-age", relativeTimeAgo(data.fight.absoluteEndTime)),
  ].join("");
  startPullAgeTimer(data.fight.absoluteEndTime);

  els.wipeCount.textContent = latest.wipeLevelFailures.length;
  els.deathCount.textContent = latest.deaths.length;
  els.mistakeCount.textContent = latest.likelyMistakes.length + latest.wipeLevelFailures.length;
  els.soakCount.textContent = latest.correctEchoSoakLeaderboard.length;
  els.quillCount.textContent = latest.correctQuillSoakLeaderboard.length;
  els.interruptCount.textContent = currentBossKey === "lura" ? latest.interruptTimeline?.eventCount || 0 : latest.eruptionInterruptLeaderboard.length;
  els.symbolCallCount.textContent = memoryGameHitCount(latest.symbolMacroSequences);
  els.eggDamageCount.textContent = latest.eggDamageLeaderboard.length;
  els.consumableCount.textContent = latest.consumableLeaderboard.length;

  els.wipeFailures.innerHTML = renderWipeFailures(latest.wipeLevelFailures);
  els.deaths.innerHTML = renderDeaths(latest.deaths, latest.wipeLevelFailures);
  els.mistakes.innerHTML = renderMistakes(latest.likelyMistakes, latest.wipeLevelFailures);
  els.echoSoaks.innerHTML = renderEchoSoaks(latest.correctEchoSoakLeaderboard, { expandable: true });
  els.quillSoaks.innerHTML = renderQuillSoaks(latest.correctQuillSoakLeaderboard);
  els.eruptionInterrupts.innerHTML =
    currentBossKey === "lura"
      ? renderTerminateTimeline(latest.interruptTimeline)
      : renderEruptionInterrupts(latest.eruptionInterruptLeaderboard);
  els.symbolCalls.innerHTML = renderSymbolCalls(latest.symbolMacroSequences);
  els.eggDamage.innerHTML = renderEggDamage(latest.eggDamageLeaderboard);
  els.consumables.innerHTML = renderConsumables(latest.consumableLeaderboard);

  const nightPayload = nightCache.get(nightCacheKey(reportUrlInput.value.trim()));
  if (nightPayload) renderNightDashboard(nightPayload.wholeNight);
  else renderNightPlaceholder();

  const allProgPayload = allProgCache.get(allProgCacheKey(reportUrlInput.value.trim()));
  if (allProgPayload) renderAllProgDashboard(allProgPayload.allProg);
  else renderAllProgPlaceholder();
}

function updateAllProgAccess(guild, boss) {
  const canShow = ALL_PROG_GUILD_IDS.has(Number(guild?.id)) && Boolean(boss?.key);
  els.allProgTabButton.classList.toggle("is-hidden", !canShow);
  if (!canShow && activeTab === "all-prog") setActiveTab("latest");
}

function applyBossLabels(bossKey) {
  const labels = bossLabels[bossKey] || bossLabels.beloren;
  els.title.textContent = "Raid Lead Dashboard";
  setPanelTitle(els.wipeFailures, labels.wipeFailures);
  setPanelTitle(els.echoSoaks, labels.echo);
  setPanelTitle(els.quillSoaks, labels.quill);
  setPanelTitle(els.eruptionInterrupts, labels.interrupts);
  setPanelTitle(els.symbolCalls, labels.symbolCalls || "Symbol Calls");
  setPanelTitle(els.consumables, labels.consumables);
  setPanelTitle(els.eggDamage, labels.eggDamage || "Egg Damage");
  setPanelTitle(els.nightEchoSoaks, labels.echo);
  setPanelTitle(els.nightQuillSoaks, labels.quill);
  setPanelTitle(els.nightEruptionInterrupts, labels.nightInterrupts || labels.interrupts);
  setPanelTitle(els.nightConsumables, labels.consumables);
  setPanelTitle(els.nightEggDamage, labels.eggDamage || "Egg Damage");
  setPanelTitle(els.allProgEchoSoaks, labels.echo);
  setPanelTitle(els.allProgQuillSoaks, labels.quill);
  setPanelTitle(els.allProgEruptionInterrupts, labels.nightInterrupts || labels.interrupts);
  setPanelTitle(els.allProgConsumables, labels.consumables);
  setPanelTitle(els.allProgEggDamage, labels.eggDamage || "Egg Damage");
  els.eggDamage.closest(".panel").classList.toggle("is-hidden", !labels.eggDamage);
  els.symbolCalls.closest(".panel").classList.toggle("is-hidden", !labels.symbolCalls);
  els.nightEggDamage.closest(".panel").classList.toggle("is-hidden", !labels.eggDamage);
  els.allProgEggDamage.closest(".panel").classList.toggle("is-hidden", !labels.eggDamage);
  document.querySelectorAll(".glaive-panel").forEach((panel) => {
    panel.classList.toggle("is-hidden", !labels.glaiveMistakes);
  });
  els.consumables.closest(".panel").classList.remove("is-hidden");
  els.nightConsumables.closest(".panel").classList.remove("is-hidden");
  els.allProgConsumables.closest(".panel").classList.remove("is-hidden");
  document.querySelectorAll(".mini-toggle").forEach((toggle) => {
    toggle.classList.toggle("is-hidden", bossKey === "lura");
  });
}

function setPanelTitle(contentEl, title) {
  const heading = contentEl?.closest(".panel")?.querySelector("h2");
  if (heading) heading.textContent = title;
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
  els.nightGlaiveCount.textContent = (night.glaiveMistakeLeaderboard || []).length;
  els.nightGlaiveTrendCount.textContent = (night.glaiveHitsByNight || night.glaiveHitsByPull || []).length;
  els.nightSoakCount.textContent = night.correctEchoSoakLeaderboard.length;
  els.nightQuillCount.textContent = night.correctQuillSoakLeaderboard.length;
  els.nightInterruptCount.textContent = night.eruptionInterruptLeaderboard.length;
  els.nightEggDamageCount.textContent = night.eggDamageLeaderboard.length;
  els.nightConsumableCount.textContent = night.consumableLeaderboard.length;

  els.nightMistakes.innerHTML = renderNightMistakes(night.mistakeLeaderboard, {
    mode: currentMistakeMode("night"),
  });
  els.nightGlaives.innerHTML = renderNightMistakes(night.glaiveMistakeLeaderboard || [], {
    mode: currentMistakeMode("night-glaive"),
    emptyMessage: "No glaive hits detected.",
  });
  els.nightGlaiveTrend.innerHTML = renderGlaiveTrend(night.glaiveHitsByNight || night.glaiveHitsByPull || []);
  els.nightEchoSoaks.innerHTML = renderEchoSoaks(night.correctEchoSoakLeaderboard);
  els.nightQuillSoaks.innerHTML = renderQuillSoaks(night.correctQuillSoakLeaderboard);
  els.nightEruptionInterrupts.innerHTML = renderEruptionInterrupts(night.eruptionInterruptLeaderboard);
  els.nightEggDamage.innerHTML = renderEggDamage(night.eggDamageLeaderboard);
  els.nightConsumables.innerHTML = renderConsumables(night.consumableLeaderboard);
}

function renderNightPlaceholder() {
  const labels = activeBossLabels();
  els.nightSummaryGrid.innerHTML = "";
  els.nightMistakeCount.textContent = 0;
  els.nightGlaiveCount.textContent = 0;
  els.nightGlaiveTrendCount.textContent = 0;
  els.nightSoakCount.textContent = 0;
  els.nightQuillCount.textContent = 0;
  els.nightInterruptCount.textContent = 0;
  els.nightEggDamageCount.textContent = 0;
  els.nightConsumableCount.textContent = 0;
  els.nightMistakes.innerHTML = empty("Loading night-wide mistakes.");
  els.nightGlaives.innerHTML = empty("Loading night-wide glaive hits.");
  els.nightGlaiveTrend.innerHTML = empty("Loading night-wide glaive trend.");
  els.nightEchoSoaks.innerHTML = empty(loadingPanelText("night-wide", labels.echo));
  els.nightQuillSoaks.innerHTML = empty(loadingPanelText("night-wide", labels.quill));
  els.nightEruptionInterrupts.innerHTML = empty(loadingPanelText("night-wide", labels.nightInterrupts || labels.interrupts));
  els.nightEggDamage.innerHTML = empty(loadingPanelText("night-wide", labels.eggDamage || "damage"));
  els.nightConsumables.innerHTML = empty(loadingPanelText("night-wide", labels.consumables));
}

function renderAllProgDashboard(allProg) {
  if (!allProg) {
    renderAllProgPlaceholder();
    return;
  }

  els.allProgSummaryGrid.innerHTML = [
    reportCountMetric(allProg),
    metric("Attempts", allProg.pullCount),
    metric("Wipes", allProg.wipeCount),
    metric("Combat", formatDurationCompact(allProg.combatDurationMs)),
  ].join("");

  els.allProgMistakeCount.textContent = allProg.mistakeLeaderboard.length;
  els.allProgGlaiveCount.textContent = (allProg.glaiveMistakeLeaderboard || []).length;
  els.allProgGlaiveTrendCount.textContent = (allProg.glaiveHitsByNight || allProg.glaiveHitsByPull || []).length;
  els.allProgSoakCount.textContent = allProg.correctEchoSoakLeaderboard.length;
  els.allProgQuillCount.textContent = allProg.correctQuillSoakLeaderboard.length;
  els.allProgInterruptCount.textContent = allProg.eruptionInterruptLeaderboard.length;
  els.allProgEggDamageCount.textContent = allProg.eggDamageLeaderboard.length;
  els.allProgConsumableCount.textContent = allProg.consumableLeaderboard.length;

  els.allProgMistakes.innerHTML = renderNightMistakes(allProg.mistakeLeaderboard, {
    mode: currentMistakeMode("all-prog"),
  });
  els.allProgGlaives.innerHTML = renderNightMistakes(allProg.glaiveMistakeLeaderboard || [], {
    mode: currentMistakeMode("all-prog-glaive"),
    emptyMessage: "No glaive hits detected.",
  });
  els.allProgGlaiveTrend.innerHTML = renderGlaiveTrend(allProg.glaiveHitsByNight || allProg.glaiveHitsByPull || []);
  els.allProgEchoSoaks.innerHTML = renderEchoSoaks(allProg.correctEchoSoakLeaderboard);
  els.allProgQuillSoaks.innerHTML = renderQuillSoaks(allProg.correctQuillSoakLeaderboard);
  els.allProgEruptionInterrupts.innerHTML = renderEruptionInterrupts(allProg.eruptionInterruptLeaderboard);
  els.allProgEggDamage.innerHTML = renderEggDamage(allProg.eggDamageLeaderboard);
  els.allProgConsumables.innerHTML = renderConsumables(allProg.consumableLeaderboard);
}

function renderAllProgPlaceholder() {
  const labels = activeBossLabels();
  els.allProgSummaryGrid.innerHTML = "";
  els.allProgMistakeCount.textContent = 0;
  els.allProgGlaiveCount.textContent = 0;
  els.allProgGlaiveTrendCount.textContent = 0;
  els.allProgSoakCount.textContent = 0;
  els.allProgQuillCount.textContent = 0;
  els.allProgInterruptCount.textContent = 0;
  els.allProgEggDamageCount.textContent = 0;
  els.allProgConsumableCount.textContent = 0;
  els.allProgMistakes.innerHTML = empty("Loading all-prog mistakes.");
  els.allProgGlaives.innerHTML = empty("Loading all-prog glaive hits.");
  els.allProgGlaiveTrend.innerHTML = empty("Loading all-prog glaive trend.");
  els.allProgEchoSoaks.innerHTML = empty(loadingPanelText("all-prog", labels.echo));
  els.allProgQuillSoaks.innerHTML = empty(loadingPanelText("all-prog", labels.quill));
  els.allProgEruptionInterrupts.innerHTML = empty(loadingPanelText("all-prog", labels.nightInterrupts || labels.interrupts));
  els.allProgEggDamage.innerHTML = empty(loadingPanelText("all-prog", labels.eggDamage || "damage"));
  els.allProgConsumables.innerHTML = empty(loadingPanelText("all-prog", labels.consumables));
}

function activeBossLabels() {
  return bossLabels[currentBossKey] || bossLabels.beloren;
}

function loadingPanelText(scope, label) {
  return `Loading ${scope} ${label}.`;
}

function renderPullOptions(pulls, selectedFightId, requestedPullId = pullSelect.value || "latest") {
  const requested = requestedPullId || "latest";
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
  return `${reportUrl}::${currentBossKey === "lura" ? simpleHash(kickAssignmentsForRequest()) : "default"}::${pullId || "latest"}`;
}

function reportUrlForFight(reportCode, fightId) {
  return `https://www.warcraftlogs.com/reports/${encodeURIComponent(reportCode)}?fight=${encodeURIComponent(fightId)}&type=summary`;
}

function nightCacheKey(reportUrl) {
  return `${reportUrl}::whole-night`;
}

function allProgCacheKey(reportUrl) {
  return `${reportUrl}::${currentBossKey === "lura" ? simpleHash(kickAssignmentsForRequest()) : "default"}::all-prog`;
}

function kickAssignmentsForRequest() {
  const panelInput = document.querySelector(".kick-order-input");
  const saved = localStorage.getItem(LURA_KICK_ORDER_KEY);
  return currentBossKey === "lura" ? (panelInput?.value || saved || DEFAULT_LURA_KICK_ORDER).trim() : "";
}

function clearReportCaches(reportUrl) {
  for (const key of pullCache.keys()) if (key.startsWith(`${reportUrl}::`)) pullCache.delete(key);
  clearAggregateCaches(reportUrl);
}

function clearAggregateCaches(reportUrl) {
  nightCache.delete(nightCacheKey(reportUrl));
  allProgCache.delete(allProgCacheKey(reportUrl));
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < String(value || "").length; index += 1) {
    hash = (hash * 31 + String(value).charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function metric(label, value) {
  return `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><span class="metric-value">${escapeHtml(value)}</span></div>`;
}

function liveMetric(label, id, value) {
  return `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><span id="${escapeHtml(id)}" class="metric-value">${escapeHtml(value)}</span></div>`;
}

function startPullAgeTimer(absoluteEndTime) {
  if (pullAgeTimer) clearInterval(pullAgeTimer);
  updatePullAgeMetric(absoluteEndTime);
  pullAgeTimer = setInterval(() => updatePullAgeMetric(absoluteEndTime), 1000);
}

function updatePullAgeMetric(absoluteEndTime) {
  const node = document.querySelector("#pull-age");
  if (node) node.textContent = relativeTimeAgo(absoluteEndTime);
}

function reportCountMetric(allProg) {
  const reports = allProg.reports || [];
  return `<details class="metric metric-details">
    <summary>
      <span>
        <span class="metric-label">Reports</span>
        <span class="metric-value">${escapeHtml(allProg.reportCount)}</span>
      </span>
    </summary>
    <div class="metric-expanded">
      ${reports.length ? `<div class="report-list">${reports.map(reportLinkRow).join("")}</div>` : `<p>No cached reports yet.</p>`}
      <button class="scan-now-button discover-reports-button" type="button">${allProg.discoveredReports ? "Check again" : "Find more reports"}</button>
    </div>
  </details>`;
}

function reportLinkRow(report) {
  const url = report.url || `https://www.warcraftlogs.com/reports/${encodeURIComponent(report.code)}`;
  const count = `${formatNumber(report.pullCount || 0)} pulls`;
  return `<a class="report-row-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
    <span>${escapeHtml(report.title || report.code)}</span>
    <span>${escapeHtml(count)}</span>
  </a>`;
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
  if (!rows.length && !wipeFailures.length) return empty((bossLabels[currentBossKey] || bossLabels.beloren).mistakesEmpty);
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

function renderAggregateMistakeSections() {
  const nightPayload = nightCache.get(nightCacheKey(reportUrlInput.value.trim()));
  if (nightPayload?.wholeNight) {
    els.nightMistakes.innerHTML = renderNightMistakes(nightPayload.wholeNight.mistakeLeaderboard, {
      mode: currentMistakeMode("night"),
    });
    els.nightGlaives.innerHTML = renderNightMistakes(nightPayload.wholeNight.glaiveMistakeLeaderboard || [], {
      mode: currentMistakeMode("night-glaive"),
      emptyMessage: "No glaive hits detected.",
    });
  }

  const allProgPayload = allProgCache.get(allProgCacheKey(reportUrlInput.value.trim()));
  if (allProgPayload?.allProg) {
    els.allProgMistakes.innerHTML = renderNightMistakes(allProgPayload.allProg.mistakeLeaderboard, {
      mode: currentMistakeMode("all-prog"),
    });
    els.allProgGlaives.innerHTML = renderNightMistakes(allProgPayload.allProg.glaiveMistakeLeaderboard || [], {
      mode: currentMistakeMode("all-prog-glaive"),
      emptyMessage: "No glaive hits detected.",
    });
  }
}

function currentMistakeMode(scope) {
  return document.querySelector(`input[name="${scope}-mistake-mode"]:checked`)?.value || "total";
}

function trendPointsForScope(scope) {
  const reportUrl = reportUrlInput.value.trim();
  if (scope === "night") return nightCache.get(nightCacheKey(reportUrl))?.wholeNight?.glaiveHitsByNight || [];
  if (scope === "all-prog") return allProgCache.get(allProgCacheKey(reportUrl))?.allProg?.glaiveHitsByNight || [];
  return [];
}

function openTrendModal(scope) {
  const points = trendPointsForScope(scope);
  if (!points.length) return;
  activeTrendScope = scope;
  visibleTrendPlayers = new Set(allTrendPlayers(points).map((row) => trendPlayerKey(row.player)));
  showOverallTrend = true;
  els.trendModalTitle.textContent = scope === "all-prog" ? "All Prog Glaive Hits / Minute" : "Whole Night Glaive Hits / Minute";
  renderTrendModal();
  els.trendModal.classList.remove("is-hidden");
}

function closeTrendModal() {
  activeTrendScope = null;
  els.trendModal.classList.add("is-hidden");
}

function renderTrendModal() {
  const points = trendPointsForScope(activeTrendScope);
  const players = allTrendPlayers(points);
  els.trendPlayerToggles.innerHTML = players.length
    ? [renderTrendOverallToggle(), renderTrendSelectAllToggle(), ...players.map(renderTrendPlayerToggle)].join("")
    : `<span class="empty-inline">No player series available yet.</span>`;
  els.trendModalChart.innerHTML = renderGlaiveTrend(points, {
    expanded: true,
    visiblePlayers: visibleTrendPlayers,
    showOverall: showOverallTrend,
  });
}

function renderTrendOverallToggle() {
  return `<button class="trend-player-toggle trend-overall-toggle ${showOverallTrend ? "is-active" : ""}" type="button" title="Click to toggle. Alt-click to isolate overall.">
    <span class="legend-dot"></span>
    Overall
  </button>`;
}

function renderTrendSelectAllToggle() {
  return `<button class="trend-player-toggle trend-select-all-toggle" type="button" title="Show overall and all players">
    Select all
  </button>`;
}

function renderTrendPlayerToggle(row) {
  const key = trendPlayerKey(row.player);
  const active = visibleTrendPlayers.has(key);
  return `<button class="trend-player-toggle ${active ? "is-active" : ""}" type="button" data-player-key="${escapeHtml(key)}" title="Click to toggle. Double-click or Alt-click to isolate.">
    <span class="trend-player-swatch ${classColorClass(row.player.class)}"></span>
    ${escapeHtml(row.player.name)}
  </button>`;
}

function isolateTrendPlayer(key) {
  visibleTrendPlayers = new Set([key]);
  showOverallTrend = false;
  renderTrendModal();
}

function isolateOverallTrend() {
  visibleTrendPlayers = new Set();
  showOverallTrend = true;
  renderTrendModal();
}

function selectAllTrendSeries() {
  visibleTrendPlayers = new Set(allTrendPlayers(trendPointsForScope(activeTrendScope)).map((row) => trendPlayerKey(row.player)));
  showOverallTrend = true;
  renderTrendModal();
}

function allTrendPlayers(points) {
  const rows = new Map();
  for (const point of points) {
    for (const item of point.players || []) {
      const key = trendPlayerKey(item.player);
      const row = rows.get(key) || { player: item.player, totalHits: 0, combatDurationMs: 0, pullCount: 0 };
      row.totalHits += Number(item.totalHits || 0);
      row.combatDurationMs += Number(item.combatDurationMs || 0);
      row.pullCount += Number(item.pullCount || 0);
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      glaiveHitsPerMinute: row.combatDurationMs > 0 ? row.totalHits / (row.combatDurationMs / 60000) : 0,
    }))
    .sort(
      (a, b) =>
        Number(b.glaiveHitsPerMinute || 0) - Number(a.glaiveHitsPerMinute || 0) ||
        Number(b.totalHits || 0) - Number(a.totalHits || 0) ||
        a.player.name.localeCompare(b.player.name),
    );
}

function trendPlayerKey(player) {
  return `${String(player?.name || "").trim().toLowerCase()}:${String(player?.class || "").trim().toLowerCase()}`;
}

function renderGlaiveTrend(points, { expanded = false, visiblePlayers = new Set(), showOverall = true } = {}) {
  if (!points.length) return empty("No glaive hit trend data.");
  const plotsNightRates = points.some((point) => point.glaiveHitsPerMinute !== undefined);
  const valueForPoint = (point) =>
    plotsNightRates ? Number(point.glaiveHitsPerMinute || 0) : Number(point.count || 0);
  const formatTrendValue = (value) => (plotsNightRates ? Number(value || 0).toFixed(2) : formatNumber(value));
  const playerRows = expanded
    ? allTrendPlayers(points).filter((row) => visiblePlayers.has(trendPlayerKey(row.player)))
    : [];
  const playerValues = playerRows.flatMap((row) =>
    points
      .map((point) => playerTrendValue(point, row.player))
      .filter((value) => value !== null),
  );
  const width = expanded ? 980 : 680;
  const height = expanded ? 430 : 190;
  const pad = { top: 18, right: expanded ? 26 : 14, bottom: expanded ? 42 : 34, left: expanded ? 42 : 28 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const overallValues = showOverall ? points.map(valueForPoint) : [];
  const highestVisibleValue = Math.max(...overallValues, ...playerValues, 0);
  const maxCount = highestVisibleValue > 0 ? highestVisibleValue : 1;
  const xFor = (index) => pad.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const yFor = (value) => pad.top + innerHeight - (Number(value || 0) / maxCount) * innerHeight;
  const actualPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(valueForPoint(point)).toFixed(1)}`).join(" ");
  const playerPaths = playerRows
    .map((row) => {
      const values = points.map((point) => playerTrendValue(point, row.player));
      const path = values.map((value, index) => {
        if (value === null) return "";
        const hasPreviousPoint = values.slice(0, index).some((item) => item !== null);
        return `${hasPreviousPoint ? "L" : "M"} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`;
      }).filter(Boolean).join(" ");
      const dots = values
        .map((value, index) => {
          if (value === null) return "";
          const point = points[index];
          const label = point.globalLabel || point.label || `Night ${index + 1}`;
          const title = `${row.player.name} - ${label}: ${formatTrendValue(value)} hits / minute`;
          return `<g class="trend-node" title="${escapeHtml(title)}">
            <title>${escapeHtml(title)}</title>
            <circle class="trend-player-dot ${classColorClass(row.player.class)}" cx="${xFor(index).toFixed(1)}" cy="${yFor(value).toFixed(1)}" r="2.4"></circle>
          </g>`;
        })
        .join("");
      return `<g>
        <path class="trend-player-line ${classColorClass(row.player.class)}" d="${path}"><title>${escapeHtml(row.player.name)}</title></path>
        ${dots}
      </g>`;
    })
    .join("");
  const xLabels = points
    .map((point, index) => {
      const maxLabels = expanded ? 24 : 12;
      if (points.length > maxLabels && index % Math.ceil(points.length / maxLabels) !== 0 && index !== points.length - 1) return "";
      return `<text class="trend-axis-label" x="${xFor(index).toFixed(1)}" y="${height - 12}" text-anchor="middle">${escapeHtml(point.globalNightNumber || point.globalPullNumber || point.wipeNumber || index + 1)}</text>`;
    })
    .join("");
  const dots = showOverall
    ? points
    .map((point, index) => {
      const x = xFor(index);
      const value = valueForPoint(point);
      const y = yFor(value);
      const labelY = Math.max(10, y - 7);
      const tooltipLabel = point.globalNightNumber
        ? `${point.globalLabel || `Night ${point.globalNightNumber}`} (${point.reportTitle || point.reportCode || "Report"}, ${formatDurationCompact(point.combatDurationMs)} combat, ${formatNumber(point.totalHits)} total hits)`
        : point.globalPullNumber
        ? `${point.globalLabel || `Pull ${point.globalPullNumber}`} (${point.reportTitle || point.reportCode || "Report"} / ${point.label || `Wipe ${point.wipeNumber || index + 1}`})`
        : point.label || `Pull ${index + 1}`;
      const title = `${tooltipLabel}: ${formatTrendValue(value)} ${plotsNightRates ? "glaive hits / minute" : "glaive hits"}`;
      return `<g class="trend-node" title="${escapeHtml(title)}">
        <title>${escapeHtml(title)}</title>
        <circle class="trend-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"></circle>
        <text class="trend-point-label" x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle">${formatTrendValue(value)}</text>
      </g>`;
    })
    .join("")
    : "";

  return `<div class="trend-chart ${expanded ? "is-expanded" : "is-compact"}">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Glaive hits by pull">
      <line class="trend-axis" x1="${pad.left}" y1="${pad.top + innerHeight}" x2="${width - pad.right}" y2="${pad.top + innerHeight}"></line>
      <line class="trend-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerHeight}"></line>
      <text class="trend-axis-label" x="2" y="${pad.top + 4}">${formatTrendValue(maxCount)}</text>
      <text class="trend-axis-label" x="8" y="${pad.top + innerHeight + 4}">0</text>
      ${playerPaths}
      ${showOverall ? `<path class="trend-actual-line" d="${actualPath}"></path>` : ""}
      ${dots}
      ${xLabels}
    </svg>
    <div class="trend-legend">
      ${showOverall ? `<span><i class="legend-dot"></i>${plotsNightRates ? "Overall hits / min" : "Overall hits"}</span>` : ""}
      ${expanded ? `<span>${formatNumber(playerRows.length)} player lines shown</span>` : ""}
    </div>
  </div>`;
}

function playerTrendValue(point, player) {
  const key = trendPlayerKey(player);
  const playerPoint = (point.players || []).find((item) => trendPlayerKey(item.player) === key);
  if (!playerPoint || Number(playerPoint.pullCount || 0) <= 0) return null;
  return Number(playerPoint.glaiveHitsPerMinute || 0);
}

function renderEchoSoaks(rows, { expandable = false } = {}) {
  if (!rows.length) return empty(currentBossKey === "lura" ? "No Tears of L'ura soaks detected." : "No correct Radiant Echoes soaks detected.");
  if (currentBossKey === "lura") {
    return leaderboardBars(rows, "totalSoaks", (row) => [`Soaks ${formatNumber(row.totalSoaks)}`]);
  }
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
  if (!rows.length) return empty(currentBossKey === "lura" ? "No Tears of L'ura spawns detected." : "No solo correct-color quill soaks detected.");
  if (currentBossKey === "lura") {
    return leaderboardBars(rows, "totalSpawned", (row) => [`Spawned ${formatNumber(row.totalSpawned)}`]);
  }
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
  if (!rows.length) return empty(currentBossKey === "lura" ? "No Terminate interrupts detected." : "No Light/Void Eruption interrupts detected.");
  if (currentBossKey === "lura") {
    return leaderboardBars(
      rows,
      "totalInterrupts",
      (row) => [
        `Success ${formatNumber(row.successfulInterrupts)}`,
        `Out ${formatNumber(row.outOfOrderInterrupts)}`,
        `Extra ${formatNumber(row.extraInterruptCasts)}`,
      ],
    );
  }
  return leaderboardBars(
    rows,
    "totalInterrupts",
    (row) => [
      `Light ${formatNumber(row.lightEruptionInterrupts)}`,
      `Void ${formatNumber(row.voidEruptionInterrupts)}`,
    ],
  );
}

function renderTerminateTimeline(timeline) {
  const spawnSets = timeline?.spawnSets || [];
  const selectedSet = spawnSets.find((set) => set.id === selectedTerminateSpawnSetId) || spawnSets.find((set) => set.id === timeline?.selectedSpawnSetId) || spawnSets[0] || null;
  const events = selectedSet?.events || timeline?.events || [];
  const assignedGroups = selectedSet?.assignedGroups || [];
  const extraCasts = selectedSet?.extraCasts || [];
  const terminateDeaths = selectedSet?.deaths || [];
  if (!spawnSets.length && !events.length && !extraCasts.length && !terminateDeaths.length) return empty("No Terminate kicks detected.");
  const windowStart = Number(selectedSet?.startTimestamp || Math.min(...events.map((event) => event.timestamp), ...extraCasts.map((event) => event.timestamp), ...terminateDeaths.map((event) => event.timestamp)) || 0);
  const windowEnd = Number(selectedSet?.endTimestamp || Math.max(...events.map((event) => event.timestamp), ...extraCasts.map((event) => event.timestamp), ...terminateDeaths.map((event) => event.timestamp)) || windowStart + 1);
  const durationMs = Math.max(1, windowEnd - windowStart);
  return `<div class="terminate-timeline${selectedSet?.missedTerminate ? " has-failure" : ""}">
    ${spawnSets.length > 1 ? renderTerminateSpawnPicker(spawnSets, selectedSet) : ""}
    ${renderTerminateConfig()}
    ${renderAssignedGroups(timeline?.configuredGroups || assignedGroups)}
    ${renderGroupedKickTimelines(events, assignedGroups, windowStart, durationMs)}
    ${terminateDeaths.length ? renderTerminateDeathRow(terminateDeaths, windowStart, durationMs) : ""}
    ${extraCasts.length ? renderExtraKickRow(extraCasts, windowStart, durationMs) : ""}
  </div>`;
}

function renderSymbolCalls(symbols) {
  const sequences = symbols?.sequences || [];
  if (symbols?.source === "missing" && !sequences.length) return empty("No rune events detected for this wipe.");
  if (!sequences.length) return empty("No rune events detected for this wipe.");

  const selected = sequences.find((sequence) => sequence.id === selectedMemorySequenceId) || sequences[0];
  selectedMemorySequenceId = selected.id;
  return `<div class="symbol-sequence-list">
    ${sequences.length > 1 ? renderMemorySequencePicker(sequences, selected) : ""}
    ${renderSymbolSequence(selected)}
  </div>`;
}

function renderMemorySequencePicker(sequences, selected) {
  return `<div class="terminate-picker memory-picker">
    <label for="memory-sequence-select">Sequence</label>
    <select id="memory-sequence-select" class="memory-sequence-select">
      ${sequences.map((sequence) => `<option value="${escapeHtml(sequence.id)}"${sequence.id === selected.id ? " selected" : ""}>${sequence.unassigned ? "Unassigned" : `Sequence ${sequence.order}`} - ${formatNumber(sequence.activations?.length || 0)} hits / ${formatNumber(sequence.eventCount)} calls</option>`).join("")}
    </select>
  </div>`;
}

function renderSymbolSequence(sequence) {
  return `<section class="symbol-sequence${sequence.unassigned ? " is-unassigned" : ""}">
    <div class="symbol-sequence-head">
      <strong>${sequence.unassigned ? "Unassigned" : `Sequence ${sequence.order}`}</strong>
      <span>${escapeHtml(sequence.time)} · ${formatNumber(sequence.eventCount)} calls · ${formatNumber(sequence.activations?.length || 0)} hits</span>
    </div>
    <div class="memory-columns">
      <div>
        <h3>Callouts</h3>
    ${
      sequence.events?.length
        ? `<ol class="symbol-call-list">${sequence.events.map(renderSymbolCall).join("")}</ol>`
        : `<div class="symbol-empty">No chat log callouts available.</div>`
    }
      </div>
      <div>
        <h3>Rune Hits</h3>
        ${
          sequence.activations?.length
            ? `<ol class="memory-activation-list">${sequence.activations.map(renderMemoryActivation).join("")}</ol>`
            : `<div class="symbol-empty">No Resonance or Dissonance events found.</div>`
        }
      </div>
    </div>
  </section>`;
}

function renderSymbolCall(event) {
  const offset = Number.isFinite(event.offsetMs) ? `+${(event.offsetMs / 1000).toFixed(1)}s` : event.time;
  return `<li class="symbol-call">
    <span class="symbol-order">${formatNumber(event.order)}</span>
    <span class="symbol-player">${escapeHtml(event.player || "Unknown")}</span>
    ${symbolIcon(event.code)}
    <span class="symbol-offset">${escapeHtml(offset)}</span>
  </li>`;
}

function renderMemoryActivation(event) {
  const names = (event.players || []).map((item) => item.name).join(", ");
  const title = names || `${formatNumber(event.playerCount || 0)} players`;
  return `<li class="memory-activation is-${escapeHtml(event.result)}" title="${escapeHtml(title)}">
    <span class="symbol-order">${formatNumber(event.order)}</span>
    <span class="memory-result">${spellIconOnly(event.abilityId, event.abilityName)}</span>
    <span class="memory-targets">${escapeHtml(names || "No players")}</span>
    <span class="symbol-offset">${escapeHtml(event.time)}</span>
  </li>`;
}

function memoryGameHitCount(symbols) {
  return (symbols?.sequences || []).reduce((total, sequence) => total + (sequence.activations?.length || 0), 0);
}

function symbolIcon(code) {
  const icon = LURA_SYMBOL_ICONS[String(code)];
  if (!icon) {
    return `<span class="lura-symbol-icon symbol-unknown" title="${escapeHtml(`Unknown · ${code}`)}" aria-label="Unknown">?</span>`;
  }
  return `<img class="lura-symbol-icon" src="${escapeHtml(icon.src)}" alt="${escapeHtml(icon.name)}" title="${escapeHtml(`${icon.name} · ${code}`)}" />`;
}

function renderTerminateSpawnPicker(spawnSets, selectedSet) {
  return `<div class="terminate-picker">
    <label for="terminate-spawn-select">Matrix spawn</label>
    <select id="terminate-spawn-select" class="terminate-spawn-select">
      ${spawnSets.map((set) => `<option value="${escapeHtml(set.id)}"${set.id === selectedSet?.id ? " selected" : ""}>${escapeHtml(set.label)} - ${escapeHtml(set.startTime)}${set.missedTerminate ? " - missed Terminate" : ""}</option>`).join("")}
    </select>
  </div>`;
}

function renderAssignedGroups(groups) {
  if (!groups.length) return "";
  return `<div class="assigned-group-list">
    ${groups.map((group) => `<div class="assigned-group"><strong>${escapeHtml(group.label)}${group.assumed ? " <span>(assumed)</span>" : ""}</strong><div class="assigned-kicks">${(group.assignedPlayers || []).map(renderAssignedKick).join("")}</div></div>`).join("")}
  </div>`;
}

function renderGroupedKickTimelines(events, assignedGroups, windowStart, durationMs) {
  const groups = assignedGroups.length ? assignedGroups : [{ label: "Kicks" }];
  const rows = groups.map((group) => ({
    label: group.label,
    events: events.filter((event) => event.assignmentGroup === group.label),
  }));
  const unassigned = events.filter((event) => !groups.some((group) => event.assignmentGroup === group.label));
  if (unassigned.length) rows.push({ label: "Other", events: unassigned });

  return rows.map((row) => `<section class="terminate-row">
    <div class="terminate-row-head">
      <strong>${escapeHtml(row.label)}</strong>
      <span>${escapeHtml(row.events.length ? "Successful kicks" : "No kicks")}</span>
    </div>
    <div class="terminate-track">
      ${positionedTimelineEvents(row.events || [], windowStart, durationMs).map((event) => renderKickMarker(event)).join("")}
    </div>
  </section>`).join("");
}

function renderTerminateConfig() {
  return `<details class="terminate-config">
    <summary>Configuration</summary>
    <div class="terminate-config-body">
      <label for="kick-order-input">Terminate kick order</label>
      <textarea id="kick-order-input" class="kick-order-input" rows="3" spellcheck="false">${escapeHtml(kickAssignmentsForRequest())}</textarea>
      <button class="apply-kick-order-button" type="button">Apply order</button>
    </div>
  </details>`;
}

function renderAssignedKick(playerInfo) {
  const title = playerInfo.dead ? `${playerInfo.name} died at ${playerInfo.deathTime}` : playerInfo.name;
  return `<span class="assigned-kick${playerInfo.dead ? " is-dead" : ""}" title="${escapeHtml(title)}">${escapeHtml(playerInfo.name)}${playerInfo.dead ? " dead" : ""}</span>`;
}

function renderExtraKickRow(events, windowStart, durationMs) {
  return `<section class="terminate-row">
    <div class="terminate-row-head">
      <strong>Extra</strong>
      <span>Interrupt casts</span>
    </div>
    <div class="terminate-track">
      ${positionedTimelineEvents(events, windowStart, durationMs).map((event) => renderKickMarker(event)).join("")}
    </div>
  </section>`;
}

function renderTerminateDeathRow(events, windowStart, durationMs) {
  const grouped = groupedTimelineEvents(events, (event) => `${event.time}:${event.abilityId || "terminate"}`);
  return `<section class="terminate-row terminate-death-row">
    <div class="terminate-row-head">
      <strong>Deaths</strong>
      <span>To Terminate</span>
    </div>
    <div class="terminate-track terminate-death-track">
      ${positionedTimelineEvents(grouped, windowStart, durationMs).map((event) => renderTerminateDeathMarker(event)).join("")}
    </div>
  </section>`;
}

function renderTerminateDeathMarker(event) {
  const left = event.leftPercent;
  const lane = event.lane || 0;
  const names = event.players?.map((item) => item.name).join(", ") || event.player?.name || "";
  const title = `${event.time} ${names} died to ${event.abilityName || "Terminate"}`;
  const label = event.players?.length > 1 ? `${event.players.length} players` : player(event.player);
  return `<span class="terminate-death-marker" style="left:${left}%; top:${4 + lane * 18}px" title="${escapeHtml(title)}">
    <span class="kick-time">${escapeHtml(event.time)}</span>
    <span class="kick-player">${label}</span>
  </span>`;
}

function renderKickMarker(event) {
  const left = event.leftPercent;
  const lane = event.lane || 0;
  const expected = event.expectedName ? `${event.assignmentGroup || ""} #${event.order}: expected ${event.expectedName}` : event.status === "extra" ? "No successful interrupt" : "Unassigned";
  const target = event.assignmentGroup && event.assignmentGroup !== "Unassigned" ? ` on ${event.assignmentGroup}` : "";
  const markedMismatch = event.targetMarker && event.status === "out_of_order";
  const title = `${event.time} ${event.player?.name || ""}${target} - ${markedMismatch ? "wrong marked-target kick, " : ""}${expected}`;
  return `<span class="kick-marker ${escapeHtml(event.status)}${markedMismatch ? " is-marked-mismatch" : ""}" style="left:${left}%; top:${4 + lane * 18}px" title="${escapeHtml(title)}">
    <span class="kick-time">${escapeHtml(event.time)}</span>
    <span class="kick-player">${player(event.player)}</span>
    <span class="kick-order">${event.order ? `#${formatNumber(event.order)}` : ""}</span>
  </span>`;
}

function positionedTimelineEvents(events = [], windowStart, durationMs) {
  const laneEnds = [];
  return events
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event) => {
      const normalized = Math.max(0, Math.min(1, (Number(event.timestamp || 0) - windowStart) / durationMs));
      const leftPercent = 4 + normalized * 92;
      let lane = laneEnds.findIndex((end) => leftPercent - end >= 12);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = leftPercent;
      return { ...event, leftPercent, lane };
    });
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

function renderNightMistakes(rows, { mode = "total", emptyMessage = null } = {}) {
  if (!rows.length) return empty(emptyMessage || (bossLabels[currentBossKey] || bossLabels.beloren).mistakesEmpty);
  const sortedRows = sortedMistakeRows(rows, mode);
  const highestMetric = Math.max(...sortedRows.map((row) => mistakeMetricValue(row, mode)), 0);
  const max = highestMetric > 0 ? highestMetric : 1;
  const metricLabel = mode === "per-attempt" ? "Per att" : "Total";
  return `<div class="night-mistake-list">
    <div class="night-mistake-header">
      <span>Player</span>
      <span>${metricLabel}</span>
      <span>Attempts</span>
    </div>
    ${sortedRows.map((row) => renderNightMistakeRow(row, max, mode)).join("")}
  </div>`;
}

function sortedMistakeRows(rows, mode) {
  return rows
    .slice()
    .sort(
      (a, b) =>
        mistakeMetricValue(b, mode) - mistakeMetricValue(a, mode) ||
        Number(b.totalMistakes || 0) - Number(a.totalMistakes || 0) ||
        a.player.name.localeCompare(b.player.name),
    );
}

function mistakeMetricValue(row, mode) {
  if (mode === "per-attempt") {
    return Number(row.mistakesPerAttempt ?? (Number(row.totalMistakes || 0) / Math.max(Number(row.pullCount || 0), 1)));
  }
  return Number(row.totalMistakes || 0);
}

function formatMistakeMetric(row, mode) {
  if (mode === "per-attempt") return mistakeMetricValue(row, mode).toFixed(2);
  return formatNumber(row.totalMistakes);
}

function renderNightMistakeRow(row, max, mode) {
  const value = mistakeMetricValue(row, mode);
  const width = value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return `<article class="night-mistake-row">
    <details>
      <summary class="night-mistake-main">
        <span>${player(row.player)}</span>
        <span class="bar-cell"><span class="bar-track"><span class="bar-fill ${classColorClass(row.player.class)}" style="width:${width}%"></span></span><strong>${formatMistakeMetric(row, mode)}</strong></span>
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
  return `<div class="evidence-list">${groupedEvidenceItems(items)
    .map(
      (item) =>
        `<span title="${escapeHtml(item.tooltip || "")}">${escapeHtml(item.time)} ${spell(item.abilityId, item.abilityName)} -> ${escapeHtml(item.targetLabel)} (${formatNumber(item.amount)})</span>`,
    )
    .join("")}</div>`;
}

function groupedEvidenceItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.time}:${item.abilityId || item.abilityName}`;
    const group = groups.get(key) || { ...item, amount: 0, targets: [] };
    group.amount += Number(item.amount || 0);
    if (item.target) group.targets.push(item.target);
    groups.set(key, group);
  }

  return [...groups.values()].map((item) => ({
    ...item,
    targetLabel: item.targets.length > 1 ? `${item.targets.length} players` : item.targets[0] || item.target || "",
    tooltip: item.targets.length > 1 ? item.targets.join(", ") : item.targets[0] || item.target || "",
  }));
}

function groupedTimelineEvents(events = [], keyForEvent) {
  const groups = new Map();
  for (const event of events) {
    const key = keyForEvent(event);
    const group = groups.get(key) || { ...event, players: [] };
    group.players.push(event.player);
    groups.set(key, group);
  }
  return [...groups.values()];
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

function spellIconOnly(abilityId, fallbackName) {
  const id = Number(abilityId || 0);
  const meta = spellMap[id] || {};
  const name = meta.name || fallbackName || `Ability ${id}`;
  const icon = meta.icon ? `https://wow.zamimg.com/images/wow/icons/small/${escapeHtml(meta.icon)}` : "";
  if (!id || !icon) return `<span class="spell-icon-only spell-icon-fallback" title="${escapeHtml(name)}">?</span>`;
  return `<a class="spell-icon-only" href="https://www.wowhead.com/spell=${id}" data-wowhead="spell=${id}" title="${escapeHtml(name)}" target="_blank" rel="noreferrer"><img class="spell-icon" src="${icon}" alt="${escapeHtml(name)}" loading="lazy" /></a>`;
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

function relativeTimeAgo(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "Unknown";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ${elapsedMinutes % 60}m ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
