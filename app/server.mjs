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

const PORT = Number(process.env.PORT || 4173);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_ROOT = join(ROOT, "public");
const DATA_CACHE_ROOT = process.env.DATA_CACHE_DIR || join(ROOT, "..", ".data-cache");
const STORE_VERSION = 7;
const ENCOUNTER_ID_BELOREN = 3182;
const ALLOWED_ALL_PROG_GUILD_ID = 811453;
const reportStoreCache = new Map();
const reportBuilds = new Map();
const pullResponseCache = new Map();

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
      if (scope === "pull") {
        const result = await getPullDashboardResponse(body.reportUrl, {
          pullId: body.pullId || "latest",
          fresh: Boolean(body.fresh),
        });
        return sendJson(response, 200, result);
      }

      const reportStore = await getStoredReportDashboard(body.reportUrl, { fresh: Boolean(body.fresh) });
      const result = await responseFromReportStore(reportStore, {
        reportUrl: body.reportUrl,
        pullId: body.pullId || "latest",
        scope,
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

async function getStoredReportDashboard(reportUrl, { fresh = false } = {}) {
  const reportCode = reportCodeFromUrl(reportUrl);
  const memoryStore = reportStoreCache.get(reportCode);
  if (!fresh && memoryStore) return memoryStore;

  if (!fresh) {
    const diskStore = readReportStoreFromDisk(reportCode);
    if (diskStore) {
      reportStoreCache.set(reportCode, diskStore);
      return diskStore;
    }
  }

  if (fresh) {
    const currentStore = memoryStore || readReportStoreFromDisk(reportCode);
    if (currentStore) {
      reportStoreCache.set(reportCode, currentStore);
      const shell = await fetchBelorenReportShell(reportUrl);
      if (currentStore.source?.belorenFightSignature === belorenFightSignature(shell.report)) {
        return currentStore;
      }
    }
  }

  if (reportBuilds.has(reportCode)) return reportBuilds.get(reportCode);

  const buildPromise = buildReportDashboardStore(reportUrl)
    .then((store) => {
      reportStoreCache.set(reportCode, store);
      writeReportStoreToDisk(reportCode, store);
      return store;
    })
    .finally(() => {
      reportBuilds.delete(reportCode);
    });

  reportBuilds.set(reportCode, buildPromise);
  return buildPromise;
}

async function getPullDashboardResponse(reportUrl, { pullId = "latest", fresh = false } = {}) {
  const reportCode = reportCodeFromUrl(reportUrl);
  const cacheKey = `${reportCode}:${pullId || "latest"}`;
  if (!fresh && pullResponseCache.has(cacheKey)) return pullResponseCache.get(cacheKey);

  const shell = await fetchBelorenReportShell(reportUrl);
  const fight = selectBossFightFromReport(shell.report, pullId);
  const fightCacheKey = `${reportCode}:${fight.id}`;
  if (!fresh && pullResponseCache.has(fightCacheKey)) return pullResponseCache.get(fightCacheKey);

  const rawData = await fetchBelorenFightData(reportUrl, [fight.id]);
  const result = analyzeBelorenData(rawData, {
    reportUrl,
    pullId: String(fight.id),
    scope: "pull",
  });
  pullResponseCache.set(cacheKey, result);
  pullResponseCache.set(fightCacheKey, result);
  return result;
}

async function buildReportDashboardStore(reportUrl) {
  const rawData = await fetchBelorenReportData(reportUrl);
  const nightOutput = analyzeBelorenData(rawData, { reportUrl, scope: "night" });
  const pulls = {};

  for (const pull of nightOutput.report.pulls) {
    const pullOutput = analyzeBelorenData(rawData, {
      reportUrl,
      pullId: String(pull.id),
      scope: "pull",
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
      encounterID: ENCOUNTER_ID_BELOREN,
      name: "Belo'ren, Child of Al'ar",
    },
    source: {
      reportStartTime: rawData.report.startTime,
      reportEndTime: rawData.report.endTime,
      belorenFightSignature: belorenFightSignature(rawData.report),
    },
    report: nightOutput.report,
    spells: nightOutput.spells,
    pulls,
    wholeNight: nightOutput.wholeNight,
    wholeNightFetchedEventCounts: nightOutput.fetchedEventCounts,
  };
}

async function responseFromReportStore(store, { pullId = "latest", scope }) {
  const fight = selectFightFromStore(store, pullId);

  if (scope === "prog") {
    return {
      report: store.report,
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
  if (guildId !== ALLOWED_ALL_PROG_GUILD_ID) {
    throw new Error("All Prog is only available for AotA Mythic Raid Team reports.");
  }

  await ensureGuildBelorenStores(guildId, difficulty);

  const stores = loadReportStores()
    .filter((store) => store.report?.guild?.id === guildId)
    .filter((store) => store.boss?.encounterID === currentStore.boss?.encounterID)
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

async function ensureGuildBelorenStores(guildId, difficulty) {
  const summaries = await fetchGuildBelorenReportSummaries({ guildID: guildId, difficulty });
  const storesByCode = new Map(loadReportStores().map((store) => [store.reportCode, store]));

  for (const summary of summaries) {
    if (storesByCode.has(summary.code)) continue;

    const reportUrl = `https://www.warcraftlogs.com/reports/${summary.code}`;
    try {
      const store = await getStoredReportDashboard(reportUrl);
      storesByCode.set(summary.code, store);
    } catch (error) {
      console.warn(`Skipping guild report ${summary.code}: ${error.message}`);
    }
  }
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

function selectBossFightFromReport(report, pullId) {
  const fights = report.fights
    .filter((fight) => fight.encounterID === ENCOUNTER_ID_BELOREN)
    .sort((a, b) => a.id - b.id);
  if (!fights.length) throw new Error("No Beloren pulls found in the report.");

  if (pullId === "latest" || pullId === undefined || pullId === null || pullId === "") {
    return fights.slice().reverse().find((fight) => !fight.kill) || fights[fights.length - 1];
  }

  const requested = fights.find((fight) => String(fight.id) === String(pullId));
  if (!requested) throw new Error(`Wipe ${pullId} was not found in report ${report.code}.`);
  return requested;
}

function belorenFightSignature(report) {
  return report.fights
    .filter((fight) => fight.encounterID === ENCOUNTER_ID_BELOREN)
    .map((fight) => `${fight.id}:${fight.startTime}:${fight.endTime}:${fight.kill}:${fight.bossPercentage}`)
    .join("|");
}

function reportCodeFromUrl(input) {
  const url = new URL(input);
  const match = url.pathname.match(/\/reports\/([^/]+)/);
  if (!match) throw new Error(`Could not find report code in URL: ${input}`);
  return match[1];
}

function reportStorePath(reportCode) {
  return join(DATA_CACHE_ROOT, "reports", `${reportCode}.json`);
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

function writeReportStoreToDisk(reportCode, data) {
  mkdirSync(join(DATA_CACHE_ROOT, "reports"), { recursive: true });
  writeFileSync(reportStorePath(reportCode), JSON.stringify(data));
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
