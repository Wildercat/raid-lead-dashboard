import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeBelorenData,
  fetchBelorenFightData,
  fetchBelorenReportData,
  fetchBelorenReportShell,
  fetchGuildBelorenReportSummaries,
} from "../wcl-beloren-analyze.mjs";
import { analyzeLuraData, fetchLuraFightData, fetchLuraReportData, LURA_ENCOUNTER_ID } from "../wcl-lura-analyze.mjs";

const PORT = Number(process.env.PORT || 4173);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_ROOT = join(ROOT, "public");
const DATA_CACHE_ROOT = process.env.DATA_CACHE_DIR || join(ROOT, "..", ".data-cache");
const STORE_VERSION = 15;
const ENCOUNTER_ID_BELOREN = 3182;
const ALLOWED_ALL_PROG_GUILD_ID = 811453;
const SHARED_SCAN_WCL_INTERVAL_MS = 5000;
const reportStoreCache = new Map();
const reportBuilds = new Map();
const reportScans = new Map();
const pullResponseCache = new Map();
const nightResponseCache = new Map();

const BOSS_ADAPTERS = {
  beloren: {
    key: "beloren",
    encounterID: ENCOUNTER_ID_BELOREN,
    name: "Belo'ren, Child of Al'ar",
    supportsAllProg: true,
    fetchReportData: fetchBelorenReportData,
    fetchFightData: fetchBelorenFightData,
    analyzeData: analyzeBelorenData,
    analysisOptions: () => ({}),
  },
  lura: {
    key: "lura",
    encounterID: LURA_ENCOUNTER_ID,
    name: "Midnight Falls",
    supportsAllProg: false,
    fetchReportData: fetchLuraReportData,
    fetchFightData: fetchLuraFightData,
    analyzeData: analyzeLuraData,
    analysisOptions: ({ kickAssignments = "" } = {}) => ({ kickAssignments }),
  },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        service: "beloren-dashboard",
      });
    }

    if (request.method === "POST" && request.url === "/api/analyze") {
      const body = await readJsonBody(request);
      if (!body.reportUrl || typeof body.reportUrl !== "string") {
        return sendJson(response, 400, { error: "reportUrl is required" });
      }

      const scope = body.scope === "night" ? "night" : body.scope === "prog" ? "prog" : "pull";
      const kickAssignments = typeof body.kickAssignments === "string" ? body.kickAssignments : "";

      if (scope === "pull") {
        const result = await getPullDashboardResponse(body.reportUrl, {
          pullId: body.pullId || "latest",
          fresh: Boolean(body.fresh),
          kickAssignments,
        });
        return sendJson(response, 200, result);
      }

      if (scope === "night") {
        const result = await getNightDashboardResponse(body.reportUrl, {
          fresh: Boolean(body.fresh),
          kickAssignments,
        });
        return sendJson(response, 200, result);
      }

      if (scope === "prog") {
        const currentNight = await getNightDashboardResponse(body.reportUrl, {
          fresh: Boolean(body.fresh),
          kickAssignments,
        });
        const currentSummary = nightSummaryFromResponse(body.reportUrl, currentNight, {
          adapter: adapterForBossKey(currentNight.boss?.key),
          kickAssignments,
        });
        return sendJson(response, 200, {
          report: currentNight.report,
          boss: currentNight.boss,
          spells: currentNight.spells,
          fight: currentNight.fight,
          fetchedEventCounts: {},
          featherTimeline: null,
          summary: null,
          latestWipe: null,
          wholeNight: null,
          allProg: await buildAllProgDashboard(currentSummary),
        });
      }
    }

    if (request.method === "POST" && request.url === "/api/scan") {
      const body = await readJsonBody(request);
      if (!body.reportUrl || typeof body.reportUrl !== "string") {
        return sendJson(response, 400, { error: "reportUrl is required" });
      }

      const result = await scanReportForNewPull(body.reportUrl, {
        force: Boolean(body.force),
        kickAssignments: typeof body.kickAssignments === "string" ? body.kickAssignments : "",
      });
      return sendJson(response, 200, result);
    }

    if (request.method === "GET") {
      return serveStatic(request, response);
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected error" });
  }
}).listen(PORT, () => {
  console.log(`Beloren dashboard running at http://localhost:${PORT}`);
});

async function getStoredReportDashboard(reportUrl, { fresh = false, kickAssignments = "" } = {}) {
  const reportCode = reportCodeFromUrl(reportUrl);
  const storeKey = reportStoreKey(reportCode, kickAssignments);
  const memoryStore = reportStoreCache.get(storeKey);
  if (!fresh && memoryStore) return memoryStore;

  if (!fresh) {
    const diskStore = readReportStoreFromDisk(storeKey);
    if (diskStore) {
      reportStoreCache.set(storeKey, diskStore);
      return diskStore;
    }
  }

  if (fresh) {
    const currentStore = memoryStore || readReportStoreFromDisk(storeKey);
    if (currentStore) {
      reportStoreCache.set(storeKey, currentStore);
      const shell = await fetchBelorenReportShell(reportUrl);
      if (
        currentStore.wholeNight &&
        currentStore.source?.bossFightSignature === bossFightSignature(shell.report, currentStore.boss?.encounterID)
      ) {
        return currentStore;
      }
    }
  }

  if (reportBuilds.has(storeKey)) return reportBuilds.get(storeKey);

  const buildPromise = buildReportDashboardStore(reportUrl, { kickAssignments })
    .then((store) => {
      reportStoreCache.set(storeKey, store);
      writeReportStoreToDisk(storeKey, store);
      return store;
    })
    .finally(() => {
      reportBuilds.delete(storeKey);
    });

  reportBuilds.set(storeKey, buildPromise);
  return buildPromise;
}

async function getBossContext(reportUrl, { kickAssignments = "" } = {}) {
  const reportCode = reportCodeFromUrl(reportUrl);
  const shell = await fetchBelorenReportShell(reportUrl);
  const adapter = adapterForReport(shell.report);
  const cacheKey = bossCacheKey(reportCode, adapter, { kickAssignments });
  return { reportCode, shell, adapter, cacheKey };
}

function adapterForReport(report) {
  if (report.fights.some((fight) => fight.encounterID === LURA_ENCOUNTER_ID)) return BOSS_ADAPTERS.lura;
  if (report.fights.some((fight) => fight.encounterID === ENCOUNTER_ID_BELOREN)) return BOSS_ADAPTERS.beloren;
  throw new Error("No supported boss pulls found in the report.");
}

function adapterForBossKey(key) {
  const adapter = BOSS_ADAPTERS[key || "beloren"];
  if (!adapter) throw new Error(`Unsupported boss key: ${key}`);
  return adapter;
}

function bossCacheKey(reportCode, adapter, { kickAssignments = "" } = {}) {
  const configHash = adapter.key === "lura" && kickAssignments.trim() ? hashString(kickAssignments.trim()) : "default";
  return `${reportCode}-${adapter.key}-${configHash}`;
}

async function getPullDashboardResponse(reportUrl, { pullId = "latest", fresh = false, kickAssignments = "" } = {}) {
  const context = await getBossContext(reportUrl, { kickAssignments });
  const cacheKey = `${context.cacheKey}:pull:${pullId || "latest"}`;
  if (!fresh && pullResponseCache.has(cacheKey)) return pullResponseCache.get(cacheKey);

  const fight = selectBossFightFromReport(context.shell.report, context.adapter, pullId);
  const fightCacheKey = `${context.cacheKey}:pull:${fight.id}`;
  if (!fresh && pullResponseCache.has(fightCacheKey)) return pullResponseCache.get(fightCacheKey);

  const rawData = await context.adapter.fetchFightData(reportUrl, [fight.id]);
  const result = context.adapter.analyzeData(rawData, {
    reportUrl,
    pullId: String(fight.id),
    scope: "pull",
    ...context.adapter.analysisOptions({ kickAssignments }),
  });
  normalizeBossResponse(result, context.adapter, reportUrl);
  pullResponseCache.set(cacheKey, result);
  pullResponseCache.set(fightCacheKey, result);
  return result;
}

async function getNightDashboardResponse(reportUrl, { fresh = false, kickAssignments = "" } = {}) {
  const context = await getBossContext(reportUrl, { kickAssignments });
  if (!fresh && nightResponseCache.has(context.cacheKey)) return nightResponseCache.get(context.cacheKey);

  if (!fresh) {
    const cachedSummary = readNightSummaryFromDisk(context.cacheKey);
    if (cachedSummary) {
      const response = responseFromNightSummary(cachedSummary);
      nightResponseCache.set(context.cacheKey, response);
      return response;
    }
  }

  const rawData = await context.adapter.fetchReportData(reportUrl);
  const result = context.adapter.analyzeData(rawData, {
    reportUrl,
    scope: "night",
    ...context.adapter.analysisOptions({ kickAssignments }),
  });
  normalizeBossResponse(result, context.adapter, reportUrl);
  nightResponseCache.set(context.cacheKey, result);
  writeNightSummaryToDisk(context.cacheKey, nightSummaryFromResponse(reportUrl, result, context));
  return result;
}

function normalizeBossResponse(result, adapter, reportUrl) {
  result.reportUrl = reportUrl;
  result.boss ||= { key: adapter.key, encounterID: adapter.encounterID, name: adapter.name };
  return result;
}

async function rebuildReportDashboardStore(reportUrl, { kickAssignments = "" } = {}) {
  const reportCode = reportCodeFromUrl(reportUrl);
  const storeKey = reportStoreKey(reportCode, kickAssignments);
  const store = await buildReportDashboardStore(reportUrl, { kickAssignments });
  reportStoreCache.set(storeKey, store);
  writeReportStoreToDisk(storeKey, store);
  return store;
}

async function buildReportDashboardStore(reportUrl, { kickAssignments = "" } = {}) {
  const shell = await fetchBelorenReportShell(reportUrl);
  const adapter = adapterForReport(shell.report);
  const rawData = await adapter.fetchReportData(reportUrl);
  const analysisOptions = adapter.analysisOptions({ kickAssignments });
  const nightOutput = adapter.analyzeData(rawData, { reportUrl, scope: "night", ...analysisOptions });
  const pulls = {};

  for (const pull of nightOutput.report.pulls) {
    const pullOutput = adapter.analyzeData(rawData, {
      reportUrl,
      pullId: String(pull.id),
      scope: "pull",
      ...analysisOptions,
    });
    pulls[pull.id] = {
      fight: pullOutput.fight,
      fetchedEventCounts: pullOutput.fetchedEventCounts,
      featherTimeline: pullOutput.featherTimeline,
      summary: pullOutput.summary,
      latestWipe: pullOutput.latestWipe,
    };
  }

  return {
    version: STORE_VERSION,
    kind: "beloren-dashboard-store",
    reportCode: rawData.reportCode,
    reportUrl,
    fetchedAt: new Date().toISOString(),
    boss: {
      key: adapter.key,
      encounterID: adapter.encounterID,
      name: adapter.name,
    },
    source: {
      reportStartTime: rawData.report.startTime,
      reportEndTime: rawData.report.endTime,
      bossFightSignature: bossFightSignature(rawData.report, adapter.encounterID),
      kickAssignmentsHash: adapter.key === "lura" ? hashString(kickAssignments) : null,
    },
    report: nightOutput.report,
    spells: nightOutput.spells,
    pulls,
    wholeNight: nightOutput.wholeNight,
    wholeNightFetchedEventCounts: nightOutput.fetchedEventCounts,
  };
}

async function scanReportForNewPull(reportUrl, { force = false, kickAssignments = "" } = {}) {
  const store = await getStoredReportDashboard(reportUrl, { kickAssignments });
  const storeKey = reportStoreKey(store.reportCode, kickAssignments);
  const scanState = reportScans.get(storeKey) || {};
  const now = Date.now();

  if (!force && scanState.lastCheckedAt && now - scanState.lastCheckedAt < SHARED_SCAN_WCL_INTERVAL_MS) {
    return {
      ...(await responseFromReportStore(store, { pullId: "latest", scope: "pull" })),
      scan: {
        checkedWcl: false,
        appendedFightIds: [],
        nextCheckInMs: SHARED_SCAN_WCL_INTERVAL_MS - (now - scanState.lastCheckedAt),
      },
    };
  }

  if (scanState.promise) return scanState.promise;

  const scanPromise = scanAndMaybeAppendBossFights(reportUrl, store, { kickAssignments }).finally(() => {
    const latest = reportScans.get(storeKey) || {};
    delete latest.promise;
    reportScans.set(storeKey, latest);
  });

  reportScans.set(storeKey, { ...scanState, promise: scanPromise });
  return scanPromise;
}

async function scanAndMaybeAppendBossFights(reportUrl, store, { kickAssignments = "" } = {}) {
  const storeKey = reportStoreKey(store.reportCode, kickAssignments);
  const shell = await fetchBelorenReportShell(reportUrl);
  const signature = bossFightSignature(shell.report, store.boss?.encounterID);
  let appendedFightIds = [];

  if (store.source?.bossFightSignature !== signature) {
    appendedFightIds = await appendNewBossFightsToStore(store, shell.report, { kickAssignments });
    if (!appendedFightIds.length) {
      store = await getStoredReportDashboard(reportUrl, { fresh: true, kickAssignments });
    }
  }

  reportScans.set(storeKey, { lastCheckedAt: Date.now(), lastSignature: signature });
  return {
    ...(await responseFromReportStore(store, { pullId: "latest", scope: "pull" })),
    scan: { checkedWcl: true, appendedFightIds, nextCheckInMs: SHARED_SCAN_WCL_INTERVAL_MS },
  };
}

async function appendNewBossFightsToStore(store, report, { kickAssignments = "" } = {}) {
  const existingIds = new Set(Object.keys(store.pulls || {}).map(Number));
  const newFights = report.fights
    .filter((fight) => fight.encounterID === store.boss?.encounterID && !existingIds.has(fight.id))
    .sort((a, b) => a.id - b.id);

  if (!newFights.length) {
    store.source = {
      ...(store.source || {}),
      bossFightSignature: bossFightSignature(report, store.boss?.encounterID),
    };
    return [];
  }

  const reportUrl = store.reportUrl || `https://www.warcraftlogs.com/reports/${store.reportCode}`;
  const isLura = store.boss?.key === "lura";
  const rawData = isLura
    ? await fetchLuraFightData(reportUrl, newFights.map((fight) => fight.id))
    : await fetchBelorenFightData(reportUrl, newFights.map((fight) => fight.id));
  const analyzeData = isLura ? analyzeLuraData : analyzeBelorenData;
  const analysisOptions = isLura ? { kickAssignments } : {};

  for (const fight of newFights) {
    const pullOutput = analyzeData(rawData, {
      reportUrl,
      pullId: String(fight.id),
      scope: "pull",
      ...analysisOptions,
    });
    store.pulls[fight.id] = {
      fight: pullOutput.fight,
      fetchedEventCounts: pullOutput.fetchedEventCounts,
      featherTimeline: pullOutput.featherTimeline,
      summary: pullOutput.summary,
      latestWipe: pullOutput.latestWipe,
    };
    store.spells = { ...(store.spells || {}), ...(pullOutput.spells || {}) };
  }

  store.report = {
    ...store.report,
    title: report.title,
    guild: report.guild || null,
    pulls: bossPullsFromReport(report, store.boss?.encounterID),
    liveLog: liveLogStatus(report, store.boss?.encounterID),
  };
  store.source = {
    ...(store.source || {}),
    reportStartTime: report.startTime,
    reportEndTime: report.endTime,
    bossFightSignature: bossFightSignature(report, store.boss?.encounterID),
  };
  store.fetchedAt = new Date().toISOString();
  store.wholeNight = null;
  store.wholeNightFetchedEventCounts = {};

  const storeKey = reportStoreKey(store.reportCode, kickAssignments);
  reportStoreCache.set(storeKey, store);
  writeReportStoreToDisk(storeKey, store);
  return newFights.map((fight) => fight.id);
}

async function responseFromReportStore(store, { pullId = "latest", scope }) {
  const fight = selectFightFromStore(store, pullId);

  if (scope === "prog") {
    return {
      report: store.report,
      boss: store.boss,
      spells: store.spells,
      fight: fight.fight,
      fetchedEventCounts: {},
      featherTimeline: null,
      summary: null,
      latestWipe: null,
      wholeNight: null,
      allProg: await buildAllProgDashboard(store),
    };
  }

  if (scope === "night") {
    return {
      report: store.report,
      boss: store.boss,
      spells: store.spells,
      fight: fight.fight,
      fetchedEventCounts: store.wholeNightFetchedEventCounts || {},
      featherTimeline: null,
      summary: null,
      latestWipe: null,
      wholeNight: store.wholeNight,
      allProg: null,
    };
  }

  return {
    report: store.report,
    boss: store.boss,
    spells: store.spells,
    fight: fight.fight,
    fetchedEventCounts: fight.fetchedEventCounts,
    featherTimeline: fight.featherTimeline,
    summary: fight.summary,
    latestWipe: fight.latestWipe,
    wholeNight: null,
    allProg: null,
  };
}

async function buildAllProgDashboard(currentStore) {
  const guildId = currentStore.report?.guild?.id;
  const difficulty = currentStore.report?.pulls?.find((pull) => !pull.kill)?.difficulty || currentStore.fight?.difficulty;
  const adapter = adapterForBossKey(currentStore.boss?.key);
  if (!adapter.supportsAllProg) throw new Error(`All Prog is not available for ${adapter.name} reports right now.`);
  if (guildId !== ALLOWED_ALL_PROG_GUILD_ID) {
    throw new Error("All Prog is only available for AotA Mythic Raid Team reports.");
  }

  await ensureGuildBelorenNightSummaries(guildId, difficulty);

  const stores = loadNightSummaries()
    .filter((store) => store.report?.guild?.id === guildId)
    .filter((store) => store.boss?.key === adapter.key)
    .filter((store) => store.report?.pulls?.some((pull) => pull.difficulty === difficulty));

  if (!stores.some((store) => store.reportCode === currentStore.reportCode)) stores.push(currentStore);

  return {
    reportCount: stores.length,
    pullCount: sum(stores, (store) => store.wholeNight?.pullCount),
    wipeCount: sum(stores, (store) => store.wholeNight?.wipeCount),
    combatDurationMs: sum(stores, (store) => store.wholeNight?.combatDurationMs),
    guild: currentStore.report.guild,
    boss: currentStore.boss,
    reports: stores
      .map((store) => ({
        code: store.reportCode,
        title: store.report?.title,
        fetchedAt: store.fetchedAt,
        pullCount: store.wholeNight?.pullCount || 0,
        difficulty,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    correctEchoSoakLeaderboard: mergeLeaderboardRows(stores, "correctEchoSoakLeaderboard", {
      primary: "totalCorrectSoaks",
      fields: ["totalCorrectSoaks", "lightSoaks", "voidSoaks", "immunitySoaks", "wrongColorSoaks", "deathsFromSoaks"],
      withSurvivalRate: true,
    }),
    correctQuillSoakLeaderboard: mergeLeaderboardRows(stores, "correctQuillSoakLeaderboard", {
      primary: "totalCorrectQuills",
      fields: ["totalCorrectQuills", "lightQuills", "voidQuills", "multiHitQuills"],
    }),
    eggDamageLeaderboard: mergeLeaderboardRows(stores, "eggDamageLeaderboard", {
      primary: "totalDamage",
      fields: ["totalDamage"],
    }),
    eruptionInterruptLeaderboard: mergeLeaderboardRows(stores, "eruptionInterruptLeaderboard", {
      primary: "totalInterrupts",
      fields: ["totalInterrupts", "lightEruptionInterrupts", "voidEruptionInterrupts"],
    }),
    consumableLeaderboard: mergeLeaderboardRows(stores, "consumableLeaderboard", {
      primary: "totalUses",
      fields: ["totalUses", "healthstoneUses", "healthPotionUses", "healing", "overheal"],
    }),
    mistakeLeaderboard: mergeMistakeLeaderboards(stores),
  };
}

async function ensureGuildBelorenNightSummaries(guildId, difficulty) {
  const summaries = await fetchGuildBelorenReportSummaries({ guildID: guildId, difficulty });
  const storesByCode = new Map(loadNightSummaries().map((store) => [store.reportCode, store]));

  for (const summary of summaries) {
    if (storesByCode.has(summary.code)) continue;

    const reportUrl = `https://www.warcraftlogs.com/reports/${summary.code}`;
    try {
      const response = await getNightDashboardResponse(reportUrl);
      const store = nightSummaryFromResponse(reportUrl, response, {
        adapter: BOSS_ADAPTERS.beloren,
        cacheKey: bossCacheKey(summary.code, BOSS_ADAPTERS.beloren),
      });
      storesByCode.set(summary.code, store);
    } catch (error) {
      console.warn(`Skipping guild report ${summary.code}: ${error.message}`);
    }
  }
}

function loadNightSummaries() {
  const summaries = new Map();

  for (const response of nightResponseCache.values()) {
    const adapter = adapterForBossKey(response.boss?.key);
    const reportUrl = response.reportUrl || `https://www.warcraftlogs.com/reports/${response.report?.code}`;
    const summary = nightSummaryFromResponse(reportUrl, response, {
      adapter,
      cacheKey: bossCacheKey(response.report?.code, adapter),
    });
    if (summary?.cacheKey) summaries.set(summary.cacheKey, summary);
  }

  const summaryDir = join(DATA_CACHE_ROOT, "night-summaries");
  if (existsSync(summaryDir)) {
    for (const file of readdirSync(summaryDir)) {
      if (!file.endsWith(".json")) continue;
      const summary = readNightSummaryFromDisk(file.slice(0, -5));
      if (summary?.cacheKey) summaries.set(summary.cacheKey, summary);
    }
  }

  for (const store of loadReportStores()) {
    if (store?.wholeNight) {
      const summary = nightSummaryFromStore(store);
      if (summary?.cacheKey && !summaries.has(summary.cacheKey)) summaries.set(summary.cacheKey, summary);
    }
  }

  return [...summaries.values()];
}

function nightSummaryFromResponse(reportUrl, response, context = {}) {
  if (!response?.report || !response?.wholeNight) return null;
  const adapter = context.adapter || adapterForBossKey(response.boss?.key);
  const reportCode = response.report.code || reportCodeFromUrl(reportUrl);
  const cacheKey = context.cacheKey || bossCacheKey(reportCode, adapter);
  return {
    version: STORE_VERSION,
    kind: "boss-night-summary",
    cacheKey,
    reportCode,
    reportUrl,
    fetchedAt: new Date().toISOString(),
    boss: response.boss || { key: adapter.key, encounterID: adapter.encounterID, name: adapter.name },
    report: response.report,
    spells: response.spells,
    fight: response.fight,
    wholeNight: response.wholeNight,
    wholeNightFetchedEventCounts: response.fetchedEventCounts || {},
  };
}

function nightSummaryFromStore(store) {
  const adapter = adapterForBossKey(store.boss?.key);
  return {
    version: STORE_VERSION,
    kind: "boss-night-summary",
    cacheKey: bossCacheKey(store.reportCode, adapter),
    reportCode: store.reportCode,
    reportUrl: store.reportUrl,
    fetchedAt: store.fetchedAt,
    boss: store.boss,
    report: store.report,
    spells: store.spells,
    fight: store.report?.pulls?.[0] || null,
    wholeNight: store.wholeNight,
    wholeNightFetchedEventCounts: store.wholeNightFetchedEventCounts || {},
  };
}

function responseFromNightSummary(summary) {
  return {
    reportUrl: summary.reportUrl,
    report: summary.report,
    boss: summary.boss,
    spells: summary.spells,
    fight: summary.fight || summary.report?.pulls?.[0] || null,
    fetchedEventCounts: summary.wholeNightFetchedEventCounts || {},
    featherTimeline: null,
    summary: null,
    latestWipe: null,
    wholeNight: summary.wholeNight,
    allProg: null,
  };
}

function loadReportStores() {
  const reportDir = join(DATA_CACHE_ROOT, "reports");
  if (!existsSync(reportDir)) return [...reportStoreCache.values()];

  const stores = new Map();
  for (const store of reportStoreCache.values()) stores.set(store.reportCode, store);

  for (const file of readdirSync(reportDir)) {
    if (!file.endsWith(".json")) continue;
    const reportCode = file.slice(0, -5);
    const store = readReportStoreFromDisk(reportCode);
    if (store) stores.set(reportCode, store);
  }

  return [...stores.values()];
}

function mergeLeaderboardRows(stores, key, { primary, fields, withSurvivalRate = false }) {
  const rows = new Map();
  for (const store of stores) {
    for (const item of store.wholeNight?.[key] || []) {
      const playerKey = playerMergeKey(item.player);
      if (!playerKey) continue;
      const row = rows.get(playerKey) || { player: item.player };
      for (const field of fields) row[field] = (row[field] || 0) + Number(item[field] || 0);
      rows.set(playerKey, row);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      survivalRate:
        withSurvivalRate && row.totalCorrectSoaks > 0
          ? Number(((row.totalCorrectSoaks - (row.deathsFromSoaks || 0)) / row.totalCorrectSoaks).toFixed(3))
          : row.survivalRate,
    }))
    .sort((a, b) => Number(b[primary] || 0) - Number(a[primary] || 0) || a.player.name.localeCompare(b.player.name));
}

function mergeMistakeLeaderboards(stores) {
  const rows = new Map();
  for (const store of stores) {
    for (const item of store.wholeNight?.mistakeLeaderboard || []) {
      const playerKey = playerMergeKey(item.player);
      if (!playerKey) continue;
      const row = rows.get(playerKey) || {
        player: item.player,
        totalMistakes: 0,
        pullCount: 0,
        mistakeCounts: new Map(),
      };
      row.totalMistakes += item.totalMistakes || 0;
      row.pullCount += item.pullCount || 0;
      for (const mistake of item.mistakes || []) {
        const key = `${mistake.label}::${mistake.mechanic}`;
        const current = row.mistakeCounts.get(key) || {
          label: mistake.label,
          mechanic: mistake.mechanic,
          count: 0,
        };
        current.count += mistake.count || 0;
        row.mistakeCounts.set(key, current);
      }
      rows.set(playerKey, row);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      player: row.player,
      totalMistakes: row.totalMistakes,
      pullCount: row.pullCount,
      mistakes: [...row.mistakeCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.totalMistakes - a.totalMistakes || a.player.name.localeCompare(b.player.name));
}

function playerMergeKey(player) {
  const name = String(player?.name || "").trim().toLowerCase();
  if (!name) return null;
  return `${name}:${String(player?.class || "").trim().toLowerCase()}`;
}

function sum(items, valueForItem) {
  return items.reduce((total, item) => total + Number(valueForItem(item) || 0), 0);
}

function selectFightFromStore(store, pullId) {
  const requested =
    pullId === "latest" || pullId === undefined || pullId === null || pullId === ""
      ? store.report.pulls.find((pull) => !pull.kill) || store.report.pulls[0]
      : store.report.pulls.find((pull) => String(pull.id) === String(pullId));

  if (!requested) throw new Error(`Wipe ${pullId} was not found in report ${store.reportCode}.`);
  const fight = store.pulls[String(requested.id)];
  if (!fight) throw new Error(`Stored dashboard data for wipe ${requested.id} was not found.`);
  return fight;
}

function selectBossFightFromReport(report, adapter, pullId) {
  const fights = report.fights
    .filter((fight) => fight.encounterID === adapter.encounterID)
    .sort((a, b) => a.id - b.id);
  if (!fights.length) throw new Error(`No ${adapter.name} pulls found in the report.`);

  if (pullId === "latest" || pullId === undefined || pullId === null || pullId === "") {
    return fights.slice().reverse().find((fight) => !fight.kill) || fights[fights.length - 1];
  }

  const requested = fights.find((fight) => String(fight.id) === String(pullId));
  if (!requested) throw new Error(`Wipe ${pullId} was not found in report ${report.code}.`);
  return requested;
}

function bossPullsFromReport(report, encounterID) {
  const fights = report.fights.filter((fight) => fight.encounterID === encounterID).sort((a, b) => a.id - b.id);
  const fightNumberById = new Map(fights.map((fight, index) => [fight.id, index + 1]));
  return fights
    .slice()
    .sort((a, b) => b.id - a.id)
    .map((fight) => ({
      id: fight.id,
      wipeNumber: fightNumberById.get(fight.id),
      name: fight.name,
      difficulty: fight.difficulty,
      kill: fight.kill,
      bossPercentage: fight.bossPercentage,
      duration: formatFightDuration(fight.endTime - fight.startTime),
    }));
}

function liveLogStatus(report, encounterID) {
  const fights = report.fights.filter((fight) => fight.encounterID === encounterID);
  const latestEndTime = Math.max(...fights.map((fight) => fight.endTime || 0));
  const absoluteEndTime = report.startTime + latestEndTime;
  return {
    latestEndTime: absoluteEndTime,
    activeWithinMinutes: Math.max(0, Math.round((Date.now() - absoluteEndTime) / 60000)),
    isActive: Date.now() - absoluteEndTime <= 30 * 60 * 1000,
  };
}

function formatFightDuration(ms) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function belorenFightSignature(report) {
  return bossFightSignature(report, ENCOUNTER_ID_BELOREN);
}

function bossFightSignature(report, encounterID) {
  return report.fights
    .filter((fight) => fight.encounterID === encounterID)
    .map((fight) => `${fight.id}:${fight.startTime}:${fight.endTime}:${fight.kill}:${fight.bossPercentage}`)
    .join("|");
}

function reportCodeFromUrl(input) {
  const url = new URL(input);
  const match = url.pathname.match(/\/reports\/([^/]+)/);
  if (!match) throw new Error(`Could not find report code in URL: ${input}`);
  return match[1];
}

function reportStoreKey(reportCode, kickAssignments = "") {
  const assignmentHash = kickAssignments.trim() ? `-kick-${hashString(kickAssignments)}` : "";
  return `${reportCode}${assignmentHash}`;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < String(value || "").length; index += 1) {
    hash = (hash * 31 + String(value).charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function reportStorePath(reportCode) {
  return join(DATA_CACHE_ROOT, "reports", `${reportCode}.json`);
}

function nightSummaryPath(cacheKey) {
  return join(DATA_CACHE_ROOT, "night-summaries", `${cacheKey}.json`);
}

function readReportStoreFromDisk(reportCode) {
  const path = reportStorePath(reportCode);
  if (!existsSync(path)) return null;

  try {
    const store = JSON.parse(readFileSync(path, "utf8"));
    if (store?.version !== STORE_VERSION || store?.kind !== "beloren-dashboard-store") return null;
    return store;
  } catch {
    return null;
  }
}

function readNightSummaryFromDisk(cacheKey) {
  const path = nightSummaryPath(cacheKey);
  if (!existsSync(path)) return null;

  try {
    const summary = JSON.parse(readFileSync(path, "utf8"));
    if (summary?.version !== STORE_VERSION || summary?.kind !== "boss-night-summary") return null;
    return summary;
  } catch {
    return null;
  }
}

function writeReportStoreToDisk(reportCode, data) {
  mkdirSync(join(DATA_CACHE_ROOT, "reports"), { recursive: true });
  writeFileSync(reportStorePath(reportCode), JSON.stringify(data));
}

function writeNightSummaryToDisk(cacheKey, data) {
  if (!data) return;
  mkdirSync(join(DATA_CACHE_ROOT, "night-summaries"), { recursive: true });
  writeFileSync(nightSummaryPath(cacheKey), JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolvedPath = normalize(join(PUBLIC_ROOT, requestedPath));

  if (!resolvedPath.startsWith(PUBLIC_ROOT) || !existsSync(resolvedPath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(resolvedPath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(readFileSync(resolvedPath));
}
