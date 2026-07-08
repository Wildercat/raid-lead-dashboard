import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv(join(dirname(fileURLToPath(import.meta.url)), ".env"));

const REPORT_URL =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  "https://www.warcraftlogs.com/reports/q9c6hgxTJPHKwrCt";

export const LURA_ENCOUNTER_ID = 3183;

const CLIENT_ID = process.env.WARCRAFT_LOGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WARCRAFT_LOGS_CLIENT_SECRET;
const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_URL = "https://www.warcraftlogs.com/api/v2/client";

const SPELLS = {
  terminateA: 1284932,
  terminateB: 1284934,
  terminateC: 1286276,
  resonance: 1249582,
  dissonanceA: 1249584,
  dissonanceB: 1249585,
  naaruLament: 1254256,
  tearsOfLura: 1254257,
  lightsEnd: 1284699,
  cosmicFracture: 1251789,
  heavensGlaivesA: 1253915,
  heavensGlaivesB: 1254076,
  darkQuasarA: 1282469,
  darkQuasarB: 1282470,
  dawnCrystal: 1253050,
  cosmicBolt: 1281764,
};

const TERMINATE_IDS = new Set([SPELLS.terminateA, SPELLS.terminateB, SPELLS.terminateC]);
const RESONANCE_IDS = new Set([SPELLS.resonance]);
const DISSONANCE_IDS = new Set([SPELLS.dissonanceA, SPELLS.dissonanceB]);
const GLAIVE_IDS = new Set([SPELLS.heavensGlaivesA, SPELLS.heavensGlaivesB]);
const QUASAR_IDS = new Set([SPELLS.darkQuasarA, SPELLS.darkQuasarB]);
const RAID_MARKERS = new Map([
  [1, "Star"],
  [2, "Circle"],
  [3, "Diamond"],
  [4, "Triangle"],
  [5, "Moon"],
  [6, "Square"],
  [7, "Cross"],
  [8, "Skull"],
]);
const WIPE_DAMAGE_IDS = new Set([
  ...TERMINATE_IDS,
  ...DISSONANCE_IDS,
  SPELLS.naaruLament,
  SPELLS.lightsEnd,
  SPELLS.cosmicFracture,
]);

const ABILITY_NAMES = {
  [SPELLS.terminateA]: "Terminate",
  [SPELLS.terminateB]: "Terminate",
  [SPELLS.terminateC]: "Terminate",
  [SPELLS.resonance]: "Resonance",
  [SPELLS.dissonanceA]: "Dissonance",
  [SPELLS.dissonanceB]: "Dissonance",
  [SPELLS.naaruLament]: "Naaru's Lament",
  [SPELLS.tearsOfLura]: "Tears of L'ura",
  [SPELLS.lightsEnd]: "Light's End",
  [SPELLS.cosmicFracture]: "Cosmic Fracture",
  [SPELLS.heavensGlaivesA]: "Heaven's Glaives",
  [SPELLS.heavensGlaivesB]: "Heaven's Glaives",
  [SPELLS.darkQuasarA]: "Dark Quasar",
  [SPELLS.darkQuasarB]: "Dark Quasar",
  [SPELLS.dawnCrystal]: "Dawn Crystal",
  [SPELLS.cosmicBolt]: "Cosmic Bolt",
};

const DEFAULT_KICK_ASSIGNMENTS = `Fartgrip Dreadknights Rhetorica Chairmanjeff
Boshjanski Walshy Koralie Flashwiz
Senpaibacon Snobshot Demo Elpumba`;

const REPORT_SHELL_QUERY = `
query ReportShell($code: String!) {
  reportData {
    report(code: $code) {
      code
      title
      startTime
      endTime
      guild { id name server { name region { name } } }
      fights {
        id
        encounterID
        name
        difficulty
        kill
        startTime
        endTime
        bossPercentage
      }
      masterData {
        abilities { gameID name icon }
        actors { id name type subType petOwner }
      }
    }
  }
}`;

const EVENTS_QUERY = `
query ReportEvents($code: String!, $fightIDs: [Int], $dataType: EventDataType, $startTime: Float, $endTime: Float, $limit: Int) {
  reportData {
    report(code: $code) {
      events(fightIDs: $fightIDs, dataType: $dataType, startTime: $startTime, endTime: $endTime, limit: $limit) {
        data
        nextPageTimestamp
      }
    }
  }
}`;

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    process.env[trimmed.slice(0, equalsIndex).trim()] ||= trimmed.slice(equalsIndex + 1).trim();
  }
}

function parseReportUrl(input) {
  const url = new URL(input);
  const match = url.pathname.match(/\/reports\/([^/]+)/);
  if (!match) throw new Error(`Could not find report code in URL: ${input}`);
  const fightParam = url.searchParams.get("fight");
  return {
    reportCode: match[1],
    fightId: fightParam && /^\d+$/.test(fightParam) ? Number(fightParam) : null,
  };
}

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Missing WARCRAFT_LOGS_CLIENT_ID or WARCRAFT_LOGS_CLIENT_SECRET.");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok) throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function graphql(token, query, variables) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(`GraphQL request failed: ${response.status}\n${JSON.stringify(body.errors || body, null, 2)}`);
  }
  return body.data;
}

async function fetchAllEvents(token, { code, fightIds, dataType, startTime, endTime }) {
  const events = [];
  let pageStart = startTime;
  while (true) {
    const data = await graphql(token, EVENTS_QUERY, { code, fightIDs: fightIds, dataType, startTime: pageStart, endTime, limit: 10000 });
    const page = data.reportData.report.events;
    events.push(...(page.data || []));
    if (!page.nextPageTimestamp || page.nextPageTimestamp >= endTime) break;
    pageStart = page.nextPageTimestamp;
  }
  return events;
}

async function fetchEventBundle(token, { code, fightIds, startTime, endTime }) {
  const [damageTaken, deaths, casts, interrupts, debuffs, combatantInfo] = await Promise.all([
    fetchAllEvents(token, { code, fightIds, dataType: "DamageTaken", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Deaths", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Casts", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Interrupts", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Debuffs", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "CombatantInfo", startTime, endTime }),
  ]);
  return { damageTaken, deaths, casts, interrupts, debuffs, combatantInfo };
}

export async function fetchLuraReportData(reportUrl = REPORT_URL) {
  const { reportCode, fightId } = parseReportUrl(reportUrl);
  const token = await getAccessToken();
  const shell = await graphql(token, REPORT_SHELL_QUERY, { code: reportCode });
  const report = shell.reportData.report;
  const luraFights = report.fights.filter((fight) => fight.encounterID === LURA_ENCOUNTER_ID).sort((a, b) => a.id - b.id);
  if (!luraFights.length) throw new Error("No Midnight Falls pulls found in the report.");
  const bundle = await fetchEventBundle(token, {
    code: reportCode,
    fightIds: luraFights.map((fight) => fight.id),
    startTime: Math.min(...luraFights.map((fight) => fight.startTime)),
    endTime: Math.max(...luraFights.map((fight) => fight.endTime)),
  });
  return { reportUrl, reportCode, requestedFightId: fightId, report, bundle };
}

export async function fetchLuraFightData(reportUrl = REPORT_URL, fightIds = []) {
  const { reportCode, fightId } = parseReportUrl(reportUrl);
  const token = await getAccessToken();
  const shell = await graphql(token, REPORT_SHELL_QUERY, { code: reportCode });
  const report = shell.reportData.report;
  const idSet = new Set(fightIds.map(Number).filter(Number.isFinite));
  const luraFights = report.fights
    .filter((fight) => fight.encounterID === LURA_ENCOUNTER_ID && idSet.has(fight.id))
    .sort((a, b) => a.id - b.id);
  if (!luraFights.length) throw new Error("No matching Midnight Falls pulls found in the report.");
  const bundle = await fetchEventBundle(token, {
    code: reportCode,
    fightIds: luraFights.map((fight) => fight.id),
    startTime: Math.min(...luraFights.map((fight) => fight.startTime)),
    endTime: Math.max(...luraFights.map((fight) => fight.endTime)),
  });
  return { reportUrl, reportCode, requestedFightId: fightId, report, bundle };
}

export async function analyzeLura(reportUrl = REPORT_URL, options = {}) {
  const data = await fetchLuraReportData(reportUrl);
  return analyzeLuraData(data, { ...options, reportUrl });
}

export function analyzeLuraData(data, options = {}) {
  const reportUrl = options.reportUrl || data.reportUrl || `https://www.warcraftlogs.com/reports/${data.reportCode}`;
  const { reportCode, fightId } = parseReportUrl(reportUrl);
  const report = data.report;
  const actorById = new Map(report.masterData.actors.map((actor) => [actor.id, actor]));
  const abilityById = new Map((report.masterData.abilities || []).map((ability) => [ability.gameID, ability]));
  const kickAssignments = parseKickAssignments(options.kickAssignments || DEFAULT_KICK_ASSIGNMENTS);
  const fights = report.fights.filter((fight) => fight.encounterID === LURA_ENCOUNTER_ID).sort((a, b) => a.id - b.id);
  const fightNumberById = new Map(fights.map((fight, index) => [fight.id, index + 1]));
  const selectedFightId =
    options.pullId === "latest"
      ? null
      : options.pullId !== undefined && options.pullId !== null && options.pullId !== ""
        ? Number(options.pullId)
        : fightId || data.requestedFightId;
  const fight = selectedFightId
    ? fights.find((item) => item.id === selectedFightId)
    : fights.slice().reverse().find((item) => !item.kill) || fights[fights.length - 1];
  if (!fight) throw new Error(`Midnight Falls wipe ${options.pullId || "latest"} was not found.`);

  const output = {
    boss: { key: "lura", encounterID: LURA_ENCOUNTER_ID, name: "Midnight Falls" },
    report: {
      code: report.code,
      title: report.title,
      guild: report.guild || null,
      pulls: fights
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((item) => ({
          id: item.id,
          wipeNumber: fightNumberById.get(item.id),
          name: item.name,
          difficulty: item.difficulty,
          kill: item.kill,
          bossPercentage: item.bossPercentage,
          duration: formatTime(item.endTime - item.startTime),
        })),
      liveLog: liveLogStatus(report, fights),
    },
    spells: buildSpellMap(abilityById),
    fight: {
      id: fight.id,
      wipeNumber: fightNumberById.get(fight.id),
      name: fight.name,
      encounterID: fight.encounterID,
      difficulty: fight.difficulty,
      kill: fight.kill,
      bossPercentage: fight.bossPercentage,
      duration: formatTime(fight.endTime - fight.startTime),
    },
    fetchedEventCounts: {},
    featherTimeline: null,
    summary: null,
    latestWipe: null,
    wholeNight: null,
  };

  const analyses = fights.map((item) => analyzeFight({ fight: item, bundle: data.bundle, actorById, abilityById, kickAssignments }));
  const selectedAnalysis = analyses.find((analysis) => analysis.fight.id === fight.id);

  if (options.scope === "night") {
    output.fetchedEventCounts = {
      nightDamageTaken: data.bundle.damageTaken.length,
      nightDeaths: data.bundle.deaths.length,
      nightCasts: data.bundle.casts.length,
      nightInterrupts: data.bundle.interrupts.length,
      nightDebuffs: data.bundle.debuffs.length,
      nightCombatantInfo: data.bundle.combatantInfo.length,
    };
    output.wholeNight = {
      pullCount: analyses.length,
      wipeCount: analyses.filter((item) => !item.fight.kill).length,
      killCount: analyses.filter((item) => item.fight.kill).length,
      combatDurationMs: analyses.reduce((total, item) => total + (item.fight.endTime - item.fight.startTime), 0),
      correctEchoSoakLeaderboard: mergeRows(analyses.map((item) => item.tearsSoakLeaderboard), "totalSoaks", ["totalSoaks"]),
      correctQuillSoakLeaderboard: mergeRows(analyses.map((item) => item.tearsSpawnedLeaderboard), "totalSpawned", ["totalSpawned"]),
      eruptionInterruptLeaderboard: mergeRows(analyses.map((item) => item.interruptLeaderboard), "totalInterrupts", [
        "totalInterrupts",
        "successfulInterrupts",
        "assignedInterrupts",
        "outOfOrderInterrupts",
        "extraInterruptCasts",
      ]),
      consumableLeaderboard: mergeRows(analyses.map((item) => item.lightsEndCausedLeaderboard), "totalWipesCaused", ["totalWipesCaused"]),
      eggDamageLeaderboard: [],
      mistakeLeaderboard: buildMistakeLeaderboard(analyses),
    };
    return output;
  }

  output.fetchedEventCounts = {
    damageTaken: selectedAnalysis.damageTaken.length,
    deaths: selectedAnalysis.deaths.length,
    casts: selectedAnalysis.casts.length,
    interrupts: selectedAnalysis.interrupts.length,
    debuffs: selectedAnalysis.debuffs.length,
    combatantInfo: selectedAnalysis.combatantInfo.length,
  };
  output.summary = {
    wipeFailureCount: selectedAnalysis.wipeFailures.length,
    deathCount: selectedAnalysis.deathRecords.length,
    likelyMistakeCount: selectedAnalysis.mistakes.length,
  };
  output.latestWipe = {
    wipeLevelFailures: selectedAnalysis.wipeFailures,
    deaths: selectedAnalysis.deathRecords,
    likelyMistakes: selectedAnalysis.mistakes,
    correctEchoSoakLeaderboard: selectedAnalysis.tearsSoakLeaderboard,
    correctQuillSoakLeaderboard: selectedAnalysis.tearsSpawnedLeaderboard,
    eruptionInterruptLeaderboard: selectedAnalysis.interruptLeaderboard,
    interruptTimeline: selectedAnalysis.interruptTimeline,
    memoryActivations: selectedAnalysis.memoryActivations,
    consumableLeaderboard: selectedAnalysis.lightsEndCausedLeaderboard,
    eggDamageLeaderboard: [],
  };
  return output;
}

function analyzeFight({ fight, bundle, actorById, abilityById, kickAssignments }) {
  const damageTaken = bundle.damageTaken.filter((event) => event.fight === fight.id);
  const deaths = bundle.deaths.filter((event) => event.fight === fight.id);
  const casts = bundle.casts.filter((event) => event.fight === fight.id);
  const interrupts = bundle.interrupts.filter((event) => event.fight === fight.id);
  const debuffs = bundle.debuffs.filter((event) => event.fight === fight.id);
  const combatantInfo = bundle.combatantInfo.filter((event) => event.fight === fight.id);
  const presentPlayers = presentPlayersFromCombatantInfo(actorById, combatantInfo);
  const crystalTimeline = buildCrystalTimeline(casts, debuffs, actorById);
  const terminateSequences = buildTerminateSequences({ fight, actorById, interrupts, kickAssignments });
  const wipeFailures = buildWipeFailures({ fight, actorById, damageTaken, terminateSequences, crystalTimeline });
  const interruptTimeline = buildInterruptTimeline({
    fight,
    actorById,
    casts,
    interrupts,
    deaths,
    terminateSequences,
    kickAssignments,
    terminateFailures: terminateFailureEvents(damageTaken),
    terminateDeaths: terminateDeaths({ fight, actorById, deaths, damageTaken }),
  });
  const mistakes = buildMistakes({ fight, actorById, damageTaken, wipeFailures });
  const deathRecords = buildDeaths({ fight, actorById, deaths, damageEvents: damageTaken, mistakes });
  const memoryActivations = buildMemoryActivations({ fight, actorById, damageTaken });
  return {
    fight,
    damageTaken,
    deaths,
    casts,
    interrupts,
    debuffs,
    combatantInfo,
    presentPlayers,
    wipeFailures,
    mistakes,
    deathRecords,
    tearsSoakLeaderboard: buildTearsSoakLeaderboard({ actorById, presentPlayers, damageTaken }),
    tearsSpawnedLeaderboard: buildTearsSpawnedLeaderboard({ actorById, presentPlayers, casts }),
    interruptTimeline,
    memoryActivations,
    interruptLeaderboard: buildInterruptLeaderboard({ actorById, presentPlayers, casts, interrupts, terminateSequences }),
    lightsEndCausedLeaderboard: buildLightsEndCausedLeaderboard({ actorById, presentPlayers, wipeFailures }),
  };
}

function buildWipeFailures({ fight, actorById, damageTaken, terminateSequences, crystalTimeline }) {
  const rows = [];
  rows.push(...groupWipeDamage({ fight, actorById, damageTaken, abilityIds: TERMINATE_IDS, mechanic: "Terminate", label: "Terminate not interrupted" }));
  rows.push(...groupWipeDamage({ fight, actorById, damageTaken, abilityIds: DISSONANCE_IDS, mechanic: "Dissonance", label: "Runes out of order" }));
  rows.push(...groupWipeDamage({ fight, actorById, damageTaken, abilityIds: new Set([SPELLS.naaruLament]), mechanic: "Naaru's Lament", label: "Tears not soaked" }));
  rows.push(...groupWipeDamage({ fight, actorById, damageTaken, abilityIds: new Set([SPELLS.cosmicFracture]), mechanic: "Cosmic Fracture", label: "Crystal not full healed" }));

  for (const group of groupWipeDamage({ fight, actorById, damageTaken, abilityIds: new Set([SPELLS.lightsEnd]), mechanic: "Light's End", label: "Crystal destroyed" })) {
    const culprit = inferLightsEndCulprit(group.timestamp, crystalTimeline);
    if (culprit) {
      group.players = [actorMeta(actorById, culprit)];
      group.attribution = "crystal_carrier";
      group.evidence.unshift({
        timestamp: group.timestamp,
        time: group.time,
        abilityId: SPELLS.dawnCrystal,
        abilityName: "Dawn Crystal",
        source: actorName(actorById, culprit),
        target: "Missing crystal carrier",
        amount: 0,
      });
    }
    rows.push(group);
  }

  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

function terminateFailureEvents(damageTaken) {
  return [...new Set(damageTaken
    .filter((event) => TERMINATE_IDS.has(abilityIdOf(event)))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event) => Math.floor(event.timestamp / 1000)))]
    .map((second) => {
      const events = damageTaken
        .filter((event) => TERMINATE_IDS.has(abilityIdOf(event)) && Math.floor(event.timestamp / 1000) === second)
        .sort((a, b) => a.timestamp - b.timestamp);
      return {
        timestamp: events[0]?.timestamp,
        targetIDs: [...new Set(events.map((event) => event.targetID).filter(Boolean))],
      };
    })
    .filter((failure) => failure.timestamp);
}

function buildMemoryActivations({ fight, actorById, damageTaken }) {
  const groups = new Map();
  const relevant = damageTaken
    .filter((event) => RESONANCE_IDS.has(abilityIdOf(event)) || DISSONANCE_IDS.has(abilityIdOf(event)))
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const event of relevant) {
    const abilityId = abilityIdOf(event);
    const isResonance = RESONANCE_IDS.has(abilityId);
    const isDissonance = DISSONANCE_IDS.has(abilityId);
    const key = `${abilityId}:${event.timestamp}`;
    const group = groups.get(key) || {
      id: `memory-${key}`,
      timestamp: event.timestamp,
      time: formatTime(event.timestamp - fight.startTime),
      abilityId,
      abilityName: ABILITY_NAMES[abilityId] || event.ability?.name || `Ability ${abilityId}`,
      result: isDissonance ? "dissonance" : "resonance",
      players: new Map(),
      amount: 0,
    };
    group.timestamp = Math.min(group.timestamp, event.timestamp);
    group.time = formatTime(group.timestamp - fight.startTime);
    group.amount += event.amount || 0;
    if (event.targetID) group.players.set(event.targetID, actorMeta(actorById, event.targetID));
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((group, index) => ({
      id: group.id,
      order: index + 1,
      timestamp: group.timestamp,
      time: group.time,
      abilityId: group.abilityId,
      abilityName: group.abilityName,
      result: group.result,
      playerCount: group.players.size,
      players: [...group.players.values()].sort((a, b) => a.name.localeCompare(b.name)),
      amount: group.amount,
    }));
}

function groupWipeDamage({ fight, actorById, damageTaken, abilityIds, mechanic, label, firstOnly = false }) {
  const groups = new Map();
  for (const event of damageTaken.filter((item) => abilityIds.has(abilityIdOf(item)))) {
    const key = `${abilityIdOf(event)}:${Math.floor(event.timestamp / 1000)}`;
    const group = groups.get(key) || {
      id: `wipe-${key}`,
      category: "wipe_level_failure",
      severity: "wipe",
      timestamp: event.timestamp,
      time: formatTime(event.timestamp - fight.startTime),
      mechanic,
      label,
      attribution: "raid_event",
      players: [],
      hitCount: 0,
      raidDamageTotal: 0,
      evidence: [],
    };
    group.timestamp = Math.min(group.timestamp, event.timestamp);
    group.time = formatTime(group.timestamp - fight.startTime);
    group.hitCount += 1;
    group.raidDamageTotal += event.amount || 0;
    group.evidence.push(evidenceForDamageEvent({ event, fight, actorById }));
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => a.timestamp - b.timestamp);
  return (firstOnly ? ordered.slice(0, 1) : ordered).map((group) => ({ ...group, evidence: group.evidence.slice(0, 12) }));
}

function buildMistakes({ fight, actorById, damageTaken, wipeFailures }) {
  const mistakes = [];
  for (const event of damageTaken) {
    const abilityId = abilityIdOf(event);
    if (!GLAIVE_IDS.has(abilityId) && !QUASAR_IDS.has(abilityId)) continue;
    const label = GLAIVE_IDS.has(abilityId) ? "Hit by glaive" : "Hit by beam";
    const mechanic = GLAIVE_IDS.has(abilityId) ? "Heaven's Glaives" : "Dark Quasar";
    mistakes.push({
      id: `mistake-${abilityId}-${event.timestamp}-${event.targetID}`,
      category: "likely_mistake",
      severity: "high",
      label,
      mechanic,
      timestamp: event.timestamp,
      time: formatTime(event.timestamp - fight.startTime),
      player: actorMeta(actorById, event.targetID),
      abilityId,
      abilityName: ABILITY_NAMES[abilityId] || event.ability?.name || `Ability ${abilityId}`,
      damageAmount: event.amount || 0,
      evidence: [evidenceForDamageEvent({ event, fight, actorById })],
      deathLinkedLabel: label,
    });
  }
  for (const failure of wipeFailures.filter((item) => item.mechanic === "Light's End" && item.players?.length === 1)) {
    const player = failure.players[0];
    mistakes.push({
      id: `mistake-lights-end-${failure.timestamp}-${player.id}`,
      category: "likely_mistake",
      severity: "wipe",
      label: "Light's End",
      mechanic: "Light's End",
      timestamp: failure.timestamp,
      time: failure.time,
      player,
      abilityId: SPELLS.lightsEnd,
      abilityName: "Light's End",
      damageAmount: failure.raidDamageTotal || 0,
      evidence: failure.evidence,
      deathLinkedLabel: "Light's End",
    });
  }
  return collapseMistakes(mistakes).sort((a, b) => a.timestamp - b.timestamp);
}

function collapseMistakes(mistakes) {
  const groups = new Map();
  for (const mistake of mistakes) {
    const key = `${mistake.player.id}:${mistake.abilityId}:${Math.floor(mistake.timestamp / 1000)}`;
    const group = groups.get(key) || { ...mistake, damageAmount: 0, evidence: [] };
    group.timestamp = Math.min(group.timestamp, mistake.timestamp);
    group.damageAmount += mistake.damageAmount || 0;
    group.evidence.push(...mistake.evidence);
    group.tickCount = (group.tickCount || 0) + 1;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, damageAmount: Math.round(group.damageAmount), evidence: group.evidence.slice(0, 6) }));
}

function buildCrystalTimeline(casts, debuffs, actorById) {
  const holders = new Set();
  const active = new Map();
  const events = [];
  for (const event of [...casts, ...debuffs].sort((a, b) => a.timestamp - b.timestamp)) {
    if (abilityIdOf(event) !== SPELLS.dawnCrystal) continue;
    const playerId = event.sourceID && actorById.get(event.sourceID)?.type === "Player" ? event.sourceID : event.targetID;
    if (!playerId || actorById.get(playerId)?.type !== "Player") continue;
    holders.add(playerId);
    if (event.type === "removedebuff") active.delete(playerId);
    else active.set(playerId, event.timestamp);
    events.push({ timestamp: event.timestamp, playerId, type: event.type || "cast" });
  }
  return { holders, activeAt(timestamp) {
    const activePlayers = new Set();
    for (const event of events.filter((item) => item.timestamp <= timestamp).sort((a, b) => a.timestamp - b.timestamp)) {
      if (event.type === "removedebuff") activePlayers.delete(event.playerId);
      else activePlayers.add(event.playerId);
    }
    return activePlayers;
  } };
}

function inferLightsEndCulprit(timestamp, crystalTimeline) {
  const active = crystalTimeline.activeAt(timestamp);
  const missing = [...crystalTimeline.holders].filter((playerId) => !active.has(playerId));
  return missing.length === 1 ? missing[0] : null;
}

function buildTearsSoakLeaderboard({ actorById, presentPlayers, damageTaken }) {
  const rows = initRows(actorById, presentPlayers, { totalSoaks: 0 });
  for (const event of damageTaken.filter((item) => abilityIdOf(item) === SPELLS.tearsOfLura)) {
    if (!rows.has(event.targetID)) continue;
    rows.get(event.targetID).totalSoaks += 1;
  }
  return sortRows(rows, "totalSoaks");
}

function buildTearsSpawnedLeaderboard({ actorById, presentPlayers, casts }) {
  const rows = initRows(actorById, presentPlayers, { totalSpawned: 0 });
  for (const event of casts.filter((item) => abilityIdOf(item) === SPELLS.dawnCrystal)) {
    const sourceID = resolvePlayerActorId(actorById, event.sourceID);
    if (!rows.has(sourceID)) continue;
    rows.get(sourceID).totalSpawned += 1;
  }
  return sortRows(rows, "totalSpawned");
}

function buildTerminateSequences({ fight, actorById, interrupts, kickAssignments }) {
  const successful = interrupts
    .filter((event) => TERMINATE_IDS.has(event.extraAbilityGameID))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (kickAssignments.length) {
    const groups = kickAssignments.map((assignedNames, index) => ({
      targetKey: `assignment-${index + 1}`,
      targetName: `Termination Matrix ${index + 1}`,
      assignedNames,
      events: [],
    }));

    for (const event of successful) {
      const sourceID = resolvePlayerActorId(actorById, event.sourceID);
      const actualName = actorName(actorById, sourceID);
      const group = groups.find((item) => item.assignedNames.some((name) => namesMatch(name, actualName))) || groups[0];
      group.events.push(event);
    }

    return groups.map((group) => ({
      targetKey: group.targetKey,
      targetName: group.targetName,
      assignedNames: group.assignedNames,
      events: group.events.map((event, index) => {
        const sourceID = resolvePlayerActorId(actorById, event.sourceID);
        const actualName = actorName(actorById, sourceID);
        const expectedName = group.assignedNames[index] || null;
        const status = expectedName ? (namesMatch(actualName, expectedName) ? "on_order" : "out_of_order") : "unassigned";
        return {
          timestamp: event.timestamp,
          time: formatTime(event.timestamp - fight.startTime),
          sourceID,
          actualName,
          expectedName,
          status,
          targetName: actorName(actorById, event.targetID),
          targetInstance: event.targetInstance || null,
          abilityId: abilityIdOf(event),
          extraAbilityId: event.extraAbilityGameID,
        };
      }),
    }));
  }

  const byTarget = new Map();
  for (const event of successful) {
    const targetKey = `${event.targetID || 0}:${event.targetInstance || 0}`;
    if (!byTarget.has(targetKey)) byTarget.set(targetKey, []);
    byTarget.get(targetKey).push(event);
  }

  const groups = [...byTarget.entries()].map(([targetKey, events]) => ({ targetKey, events }));
  const assignedLineByGroup = matchAssignmentLines(groups, kickAssignments, actorById);

  return groups.map(({ targetKey, events }, groupIndex) => {
    const assignedNames = assignedLineByGroup.get(groupIndex) || [];
    return {
      targetKey,
      targetName: actorName(actorById, events[0]?.targetID),
      assignedNames,
      events: events.map((event, index) => {
        const sourceID = resolvePlayerActorId(actorById, event.sourceID);
        const actualName = actorName(actorById, sourceID);
        const expectedName = assignedNames[index] || null;
        const status = expectedName ? (namesMatch(actualName, expectedName) ? "on_order" : "out_of_order") : "unassigned";
        return {
          timestamp: event.timestamp,
          time: formatTime(event.timestamp - fight.startTime),
          sourceID,
          actualName,
          expectedName,
          status,
          targetName: actorName(actorById, event.targetID),
          targetInstance: event.targetInstance || null,
          abilityId: abilityIdOf(event),
          extraAbilityId: event.extraAbilityGameID,
        };
      }),
    };
  });
}

function buildInterruptTimeline({ fight, actorById, casts, interrupts, deaths, kickAssignments, terminateFailures, terminateDeaths }) {
  const successful = interrupts
    .filter((event) => TERMINATE_IDS.has(event.extraAbilityGameID))
    .sort((a, b) => a.timestamp - b.timestamp);
  const extraCasts = casts
    .filter((event) => isPlayerInterruptCast(event))
    .filter((event) => !successful.some((interrupt) => sameActor(actorById, interrupt.sourceID, event.sourceID) && Math.abs(interrupt.timestamp - event.timestamp) <= 250))
    .map((event) => {
      const sourceID = resolvePlayerActorId(actorById, event.sourceID);
      return {
        id: `extra-kick-${event.timestamp}-${sourceID}`,
        type: "cast",
        timestamp: event.timestamp,
        time: formatTime(event.timestamp - fight.startTime),
        offsetMs: event.timestamp - fight.startTime,
        player: actorMeta(actorById, sourceID),
        expectedName: null,
        order: null,
        status: "extra",
        targetName: event.targetID ? actorName(actorById, event.targetID) : "No interrupt",
        targetInstance: event.targetInstance || null,
        targetMarker: event.targetMarker || null,
        abilityId: abilityIdOf(event),
        abilityName: ABILITY_NAMES[abilityIdOf(event)] || event.ability?.name || `Ability ${abilityIdOf(event)}`,
        extraAbilityId: null,
        extraAbilityName: null,
      };
    });

  const spawnSets = buildTerminateSpawnSets({ fight, actorById, successful, extraCasts, deaths, kickAssignments, terminateFailures, terminateDeaths });
  const selectedSpawnSetId = selectTerminateSpawnSet(spawnSets, terminateFailures[0]?.timestamp || null);

  return {
    durationMs: Math.max(1, fight.endTime - fight.startTime),
    spawnSets,
    selectedSpawnSetId,
    events: spawnSets.find((set) => set.id === selectedSpawnSetId)?.events || spawnSets[0]?.events || [],
    extraCasts,
    eventCount: spawnSets.reduce((total, set) => total + set.eventCount, 0),
  };
}

function buildTerminateSpawnSets({ fight, actorById, successful, extraCasts, deaths, kickAssignments, terminateFailures, terminateDeaths }) {
  const clusters = [];
  for (const event of successful) {
    const previous = clusters.at(-1)?.events.at(-1);
    if (!previous || event.timestamp - previous.timestamp > 12000) clusters.push({ events: [] });
    clusters.at(-1).events.push(event);
  }

  for (const failure of terminateFailures) {
    const timestamp = failure.timestamp;
    if (!clusters.some((cluster) => timestampNearCluster(timestamp, cluster))) {
      clusters.push({ events: [], missedFailures: [failure] });
    } else {
      const cluster = clusters.find((item) => timestampNearCluster(timestamp, item));
      if (cluster) cluster.missedFailures = [...(cluster.missedFailures || []), failure];
    }
  }

  return clusters
    .sort((a, b) => clusterStart(a, terminateFailures[0]?.timestamp || null) - clusterStart(b, terminateFailures[0]?.timestamp || null))
    .map((cluster, index) => {
      const startTimestamp = clusterStart(cluster, terminateFailures[0]?.timestamp || null);
      const endTimestamp = Math.max(cluster.events.at(-1)?.timestamp || 0, ...(cluster.missedFailures || []).map((failure) => failure.timestamp), startTimestamp);
      const clusteredExtras = extraCasts.filter((event) => event.timestamp >= startTimestamp - 2500 && event.timestamp <= endTimestamp + 2500);
      const clusteredDeaths = terminateDeaths.filter((event) => event.timestamp >= startTimestamp - 2500 && event.timestamp <= endTimestamp + 2500);
      const markerAware = cluster.events.some((event) => event.targetMarker);
      const assignedGroups = markerAware
        ? buildMarkerAssignedGroups({ fight, actorById, deaths, events: cluster.events, kickAssignments, spawnEndTimestamp: endTimestamp })
        : buildAssignedGroups({ fight, actorById, deaths, events: cluster.events, kickAssignments, spawnEndTimestamp: endTimestamp });
      const timelineEvents = markerAware
        ? buildMarkerKickEvents({ fight, actorById, events: cluster.events, assignedGroups })
        : buildUnifiedKickEvents({ fight, actorById, events: cluster.events, assignedGroups });

      return {
        id: `spawn-${index + 1}`,
        label: `Spawn ${index + 1}`,
        startTimestamp,
        endTimestamp,
        startTime: formatTime(startTimestamp - fight.startTime),
        missedTerminate: Boolean(cluster.missedFailures?.length),
        assignedGroups,
        events: timelineEvents,
        deaths: clusteredDeaths,
        extraCasts: clusteredExtras,
        eventCount: timelineEvents.length + clusteredExtras.length + clusteredDeaths.length,
      };
    });
}

function terminateDeaths({ fight, actorById, deaths, damageTaken }) {
  return deaths
    .map((death) => {
      const finalHit = damageTaken
        .filter((event) => event.targetID === death.targetID && TERMINATE_IDS.has(abilityIdOf(event)) && event.timestamp <= death.timestamp && event.timestamp >= death.timestamp - 1500)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      if (!finalHit) return null;
      return {
        id: `terminate-death-${death.targetID}-${death.timestamp}`,
        timestamp: death.timestamp,
        time: formatTime(death.timestamp - fight.startTime),
        offsetMs: death.timestamp - fight.startTime,
        player: actorMeta(actorById, death.targetID),
        abilityId: abilityIdOf(finalHit),
        abilityName: ABILITY_NAMES[abilityIdOf(finalHit)] || finalHit.ability?.name || "Terminate",
        amount: finalHit.amount || 0,
      };
    })
    .filter(Boolean);
}

function buildAssignedGroups({ fight, actorById, deaths, events, kickAssignments, spawnEndTimestamp }) {
  const deathByName = deathByNormalizedName({ fight, actorById, deaths });
  return kickAssignments.map((assignedNames, index) => ({
    id: `assignment-${index + 1}`,
    label: `Group ${index + 1}`,
    assignedNames,
    assignedPlayers: assignedNames.map((name, playerIndex) => {
      const playerEvent = events.find((event) => namesMatch(actorName(actorById, resolvePlayerActorId(actorById, event.sourceID)), name));
      const checkTimestamp = playerEvent?.timestamp || events[playerIndex]?.timestamp || spawnEndTimestamp;
      return assignedPlayerStatus(name, deathByName, checkTimestamp);
    }),
  }));
}

function buildMarkerAssignedGroups({ fight, actorById, deaths, events, kickAssignments, spawnEndTimestamp }) {
  const deathByName = deathByNormalizedName({ fight, actorById, deaths });
  const groups = markerEventGroups(events, actorById, kickAssignments);
  const assignedLineByGroup = matchAssignmentLines(groups, kickAssignments, actorById);
  return groups.map((group, index) => {
    const assignedNames = assignedLineByGroup.get(index) || assumedAssignedNames(actorById, group.events);
    const assumed = !assignedLineByGroup.has(index) && assignedNames.length > 0;
    return {
      id: group.targetKey,
      label: group.targetName,
      targetMarker: group.targetMarker,
      assumed,
      assignedNames,
      assignedPlayers: assignedNames.map((name, playerIndex) => {
        const playerEvent = group.events.find((event) => namesMatch(actorName(actorById, resolvePlayerActorId(actorById, event.sourceID)), name));
        const checkTimestamp = playerEvent?.timestamp || group.events[playerIndex]?.timestamp || spawnEndTimestamp;
        return assignedPlayerStatus(name, deathByName, checkTimestamp);
      }),
    };
  });
}

function assumedAssignedNames(actorById, events) {
  const names = [];
  for (const event of events.slice().sort((a, b) => a.timestamp - b.timestamp)) {
    const name = actorName(actorById, resolvePlayerActorId(actorById, event.sourceID));
    if (!names.some((item) => namesMatch(item, name))) names.push(name);
    if (names.length >= 4) break;
  }
  return names;
}

function buildUnifiedKickEvents({ fight, actorById, events, assignedGroups }) {
  const orderByGroup = new Map(assignedGroups.map((group) => [group.id, 0]));
  return events.map((event) => {
    const sourceID = resolvePlayerActorId(actorById, event.sourceID);
    const actualName = actorName(actorById, sourceID);
    const group = assignedGroups.find((item) => item.assignedNames.some((name) => namesMatch(name, actualName))) || null;
    const groupOrder = group ? (orderByGroup.get(group.id) || 0) : 0;
    const expectedName = group?.assignedNames[groupOrder] || null;
    const status = expectedName ? (namesMatch(actualName, expectedName) ? "on_order" : "out_of_order") : "unassigned";
    if (group) orderByGroup.set(group.id, groupOrder + 1);
    return {
      id: `kick-${event.timestamp}-${sourceID}`,
      type: "interrupt",
      timestamp: event.timestamp,
      time: formatTime(event.timestamp - fight.startTime),
      offsetMs: event.timestamp - fight.startTime,
      sourceID,
      actualName,
      player: actorMeta(actorById, sourceID),
      assignmentGroup: group?.label || "Unassigned",
      expectedName,
      order: group ? groupOrder + 1 : null,
      status,
      targetName: actorName(actorById, event.targetID),
      targetInstance: event.targetInstance || null,
      targetMarker: event.targetMarker || null,
      abilityId: abilityIdOf(event),
      abilityName: ABILITY_NAMES[abilityIdOf(event)] || `Ability ${abilityIdOf(event)}`,
      extraAbilityId: event.extraAbilityGameID,
      extraAbilityName: ABILITY_NAMES[event.extraAbilityGameID] || "Terminate",
    };
  });
}

function buildMarkerKickEvents({ fight, actorById, events, assignedGroups }) {
  const orderByGroup = new Map(assignedGroups.map((group) => [group.id, 0]));
  return events.map((event) => {
    const sourceID = resolvePlayerActorId(actorById, event.sourceID);
    const actualName = actorName(actorById, sourceID);
    const group = markerKickGroup(event, assignedGroups, actualName) || null;
    const groupOrder = group ? (orderByGroup.get(group.id) || 0) : 0;
    const expectedName = group?.assignedNames[groupOrder] || null;
    const status = expectedName ? (namesMatch(actualName, expectedName) ? "on_order" : "out_of_order") : "unassigned";
    if (group) orderByGroup.set(group.id, groupOrder + 1);
    return {
      id: `kick-${event.timestamp}-${sourceID}`,
      type: "interrupt",
      timestamp: event.timestamp,
      time: formatTime(event.timestamp - fight.startTime),
      offsetMs: event.timestamp - fight.startTime,
      sourceID,
      actualName,
      player: actorMeta(actorById, sourceID),
      assignmentGroup: group?.label || "Other",
      expectedName,
      order: group ? groupOrder + 1 : null,
      status,
      targetName: actorName(actorById, event.targetID),
      targetInstance: event.targetInstance || null,
      targetMarker: event.targetMarker || null,
      abilityId: abilityIdOf(event),
      abilityName: ABILITY_NAMES[abilityIdOf(event)] || `Ability ${abilityIdOf(event)}`,
      extraAbilityId: event.extraAbilityGameID,
      extraAbilityName: ABILITY_NAMES[event.extraAbilityGameID] || "Terminate",
    };
  });
}

function markerEventGroups(events, actorById, kickAssignments) {
  const groups = new Map();
  for (const event of events.filter((item) => item.targetMarker)) {
    const key = markerTargetKey(event);
    const targetMarker = Number.isFinite(Number(event.targetMarker)) ? Number(event.targetMarker) : null;
    if (!groups.has(key)) {
      groups.set(key, {
        targetKey: key,
        targetName: targetMarkerLabel(targetMarker),
        targetMarker,
        events: [],
      });
    }
    groups.get(key).events.push(event);
  }

  const usedSetters = attachMarkerSettingKicks([...groups.values()], events.filter((item) => !item.targetMarker), actorById, kickAssignments);
  const unmarkedEvents = events.filter((item) => !item.targetMarker && !usedSetters.has(item));
  if (unmarkedEvents.length) {
    groups.set("marker-unmarked", {
      targetKey: "marker-unmarked",
      targetName: "Unmarked",
      targetMarker: null,
      events: unmarkedEvents,
    });
  }

  return [...groups.values()].sort((a, b) => markerSortValue(a.targetMarker) - markerSortValue(b.targetMarker));
}

function attachMarkerSettingKicks(groups, unmarkedEvents, actorById, kickAssignments) {
  const used = new Set();
  for (const event of unmarkedEvents) {
    const actualName = actorName(actorById, resolvePlayerActorId(actorById, event.sourceID));
    const assignedLine = kickAssignments.find((line) => line.some((name) => namesMatch(name, actualName)));
    if (!assignedLine) continue;
    const group = groups.find((item) =>
      item.targetMarker &&
      item.events.some((markedEvent) => {
        const markedName = actorName(actorById, resolvePlayerActorId(actorById, markedEvent.sourceID));
        return assignedLine.some((name) => namesMatch(name, markedName));
      }),
    );
    if (!group) continue;
    event.assumedMarkerSetter = true;
    group.events.push(event);
    group.events.sort((a, b) => a.timestamp - b.timestamp);
    used.add(event);
  }

  for (const group of groups
    .filter((item) => item.targetMarker)
    .sort((a, b) => firstTimestamp(a.events) - firstTimestamp(b.events))) {
    const firstMarkedKick = firstTimestamp(group.events);
    const setter = unmarkedEvents
      .filter((event) => !used.has(event))
      .filter((event) => event.timestamp <= firstMarkedKick && firstMarkedKick - event.timestamp <= 2500)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!setter) continue;
    setter.assumedMarkerSetter = true;
    group.events.push(setter);
    group.events.sort((a, b) => a.timestamp - b.timestamp);
    used.add(setter);
  }
  return used;
}

function markerKickGroup(event, assignedGroups, actualName) {
  const markerGroup = event.targetMarker ? assignedGroups.find((item) => item.id === markerTargetKey(event)) : null;
  if (markerGroup) return markerGroup;
  const namedGroups = assignedGroups.filter((item) => item.assignedNames.some((name) => namesMatch(name, actualName)));
  if (namedGroups.length === 1) return namedGroups[0];
  return assignedGroups.find((item) => item.id === markerTargetKey(event)) || null;
}

function firstTimestamp(events) {
  return Math.min(...events.map((event) => event.timestamp));
}

function markerTargetKey(event) {
  return Number.isFinite(Number(event.targetMarker)) ? `marker-${Number(event.targetMarker)}` : "marker-unmarked";
}

function targetMarkerLabel(marker) {
  return marker ? RAID_MARKERS.get(marker) || `Marker ${marker}` : "Unmarked";
}

function markerSortValue(marker) {
  return marker || 99;
}

function deathByNormalizedName({ fight, actorById, deaths }) {
  const rows = new Map();
  for (const death of deaths) {
    const name = actorName(actorById, death.targetID);
    const key = normalizeName(name);
    const existing = rows.get(key);
    if (existing && existing.timestamp <= death.timestamp) continue;
    rows.set(key, {
      timestamp: death.timestamp,
      time: formatTime(death.timestamp - fight.startTime),
    });
  }
  return rows;
}

function assignedPlayerStatus(name, deathByName, spawnEndTimestamp) {
  const death = deathByName.get(normalizeName(name));
  const dead = Boolean(death && death.timestamp < spawnEndTimestamp);
  return {
    name,
    dead,
    deathTimestamp: dead ? death.timestamp : null,
    deathTime: dead ? death.time : null,
  };
}

function sameActor(actorById, leftId, rightId) {
  return resolvePlayerActorId(actorById, leftId) === resolvePlayerActorId(actorById, rightId);
}

function timestampNearCluster(timestamp, cluster) {
  const start = cluster.events[0]?.timestamp;
  const end = cluster.events.at(-1)?.timestamp;
  return start && end && timestamp >= start - 5000 && timestamp <= end + 12000;
}

function clusterStart(cluster, fallbackTimestamp) {
  return cluster.events[0]?.timestamp || cluster.missedTimestamp || fallbackTimestamp || 0;
}

function selectTerminateSpawnSet(spawnSets, terminateFailureTimestamp) {
  if (!spawnSets.length) return null;
  if (!terminateFailureTimestamp) return spawnSets[0].id;
  return spawnSets
    .slice()
    .sort((a, b) => Math.abs(a.startTimestamp - terminateFailureTimestamp) - Math.abs(b.startTimestamp - terminateFailureTimestamp))[0].id;
}

function matchAssignmentLines(groups, kickAssignments, actorById) {
  const available = new Set(kickAssignments.map((_, index) => index));
  const assignmentByGroup = new Map();
  const scored = [];
  groups.forEach((group, groupIndex) => {
    kickAssignments.forEach((line, lineIndex) => {
      const score = group.events.reduce((total, event, eventIndex) => {
        const actualName = actorName(actorById, resolvePlayerActorId(actorById, event.sourceID));
        const expectedName = line[eventIndex];
        return total + (expectedName && namesMatch(actualName, expectedName) ? 2 : line.some((name) => namesMatch(name, actualName)) ? 1 : 0);
      }, 0);
      scored.push({ groupIndex, lineIndex, score });
    });
  });

  for (const item of scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score)) {
    if (assignmentByGroup.has(item.groupIndex) || !available.has(item.lineIndex)) continue;
    assignmentByGroup.set(item.groupIndex, kickAssignments[item.lineIndex]);
    available.delete(item.lineIndex);
  }

  return assignmentByGroup;
}

function buildInterruptLeaderboard({ actorById, presentPlayers, casts, interrupts, terminateSequences }) {
  const rows = initRows(actorById, presentPlayers, {
    totalInterrupts: 0,
    successfulInterrupts: 0,
    extraInterruptCasts: 0,
    assignedInterrupts: 0,
    outOfOrderInterrupts: 0,
  });
  for (const event of interrupts.filter((item) => TERMINATE_IDS.has(item.extraAbilityGameID))) {
    const sourceID = resolvePlayerActorId(actorById, event.sourceID);
    if (!rows.has(sourceID)) continue;
    rows.get(sourceID).totalInterrupts += 1;
    rows.get(sourceID).successfulInterrupts += 1;
  }
  for (const sequence of terminateSequences) {
    for (const event of sequence.events) {
      if (!rows.has(event.sourceID)) continue;
      if (event.expectedName) rows.get(event.sourceID).assignedInterrupts += 1;
      if (event.status === "out_of_order") rows.get(event.sourceID).outOfOrderInterrupts += 1;
    }
  }
  for (const event of casts.filter((item) => isPlayerInterruptCast(item))) {
    const sourceID = resolvePlayerActorId(actorById, event.sourceID);
    if (!rows.has(sourceID)) continue;
    if (interrupts.some((interrupt) => interrupt.timestamp >= event.timestamp - 250 && interrupt.timestamp <= event.timestamp + 250 && interrupt.sourceID === event.sourceID)) continue;
    rows.get(sourceID).extraInterruptCasts += 1;
  }
  return sortRows(rows, "totalInterrupts");
}

function buildLightsEndCausedLeaderboard({ actorById, presentPlayers, wipeFailures }) {
  const rows = initRows(actorById, presentPlayers, { totalWipesCaused: 0 });
  for (const failure of wipeFailures.filter((item) => item.mechanic === "Light's End" && item.players?.length === 1)) {
    const playerId = failure.players[0].id;
    if (rows.has(playerId)) rows.get(playerId).totalWipesCaused += 1;
  }
  return sortRows(rows, "totalWipesCaused");
}

function initRows(actorById, players, fields) {
  const rows = new Map();
  for (const player of players) rows.set(player.id, { player: actorMeta(actorById, player.id), ...fields });
  return rows;
}

function sortRows(rows, key) {
  return [...rows.values()].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || a.player.name.localeCompare(b.player.name));
}

function mergeRows(leaderboards, primary, fields) {
  const rows = new Map();
  for (const leaderboard of leaderboards) {
    for (const item of leaderboard) {
      const key = playerMergeKey(item.player);
      const row = rows.get(key) || { player: item.player };
      for (const field of fields) row[field] = (row[field] || 0) + Number(item[field] || 0);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => Number(b[primary] || 0) - Number(a[primary] || 0) || a.player.name.localeCompare(b.player.name));
}

function buildMistakeLeaderboard(analyses) {
  const rows = new Map();
  for (const analysis of analyses) {
    for (const player of analysis.presentPlayers) {
      const key = playerMergeKey(player);
      if (!rows.has(key)) rows.set(key, { player, totalMistakes: 0, pullCount: 0, pulls: new Set(), mistakeCounts: new Map() });
    }
    for (const mistake of analysis.mistakes) {
      const key = playerMergeKey(mistake.player);
      const row = rows.get(key);
      if (!row) continue;
      const current = row.mistakeCounts.get(mistake.label) || { label: mistake.label, mechanic: mistake.mechanic, count: 0 };
      current.count += 1;
      row.mistakeCounts.set(mistake.label, current);
      row.totalMistakes += 1;
      row.pulls.add(analysis.fight.id);
    }
  }
  return [...rows.values()].map((row) => ({
    player: row.player,
    totalMistakes: row.totalMistakes,
    pullCount: row.pulls.size,
    mistakes: [...row.mistakeCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  })).sort((a, b) => b.totalMistakes - a.totalMistakes || a.player.name.localeCompare(b.player.name));
}

function buildDeaths({ fight, actorById, deaths, damageEvents, mistakes }) {
  return deaths.slice().sort((a, b) => a.timestamp - b.timestamp).map((death, index) => {
    const playerId = death.targetID;
    const recentDamage = damageEvents
      .filter((event) => event.targetID === playerId && event.timestamp <= death.timestamp && event.timestamp >= death.timestamp - 10000)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
      .reverse();
    const linkedMistake = mistakes
      .filter((mistake) => mistake.player?.id === playerId && mistake.timestamp <= death.timestamp && mistake.timestamp >= death.timestamp - 10000)
      .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
    const directEvent = recentDamage[recentDamage.length - 1] || null;
    return {
      id: `death-${index + 1}-${playerId}-${death.timestamp}`,
      order: index + 1,
      player: actorMeta(actorById, playerId),
      timestamp: death.timestamp,
      time: formatTime(death.timestamp - fight.startTime),
      directDeathCause: directEvent ? {
        abilityId: abilityIdOf(directEvent),
        abilityName: ABILITY_NAMES[abilityIdOf(directEvent)] || directEvent.ability?.name || `Ability ${abilityIdOf(directEvent)}`,
        amount: directEvent.amount || 0,
        overkill: directEvent.overkill || 0,
      } : null,
      likelyMistake: linkedMistake ? {
        label: linkedMistake.deathLinkedLabel || linkedMistake.label,
        mechanic: linkedMistake.mechanic,
        time: linkedMistake.time,
        abilityId: linkedMistake.abilityId,
        evidence: linkedMistake.evidence,
      } : null,
      finalDamageEvents: recentDamage.map((event) => ({
        timestamp: event.timestamp,
        time: formatTime(event.timestamp - fight.startTime),
        abilityId: abilityIdOf(event),
        abilityName: ABILITY_NAMES[abilityIdOf(event)] || event.ability?.name || `Ability ${abilityIdOf(event)}`,
        source: actorName(actorById, event.sourceID),
        amount: event.amount || 0,
        overkill: event.overkill || 0,
      })),
    };
  });
}

function presentPlayersFromCombatantInfo(actorById, combatantInfoEvents) {
  const players = new Map();
  for (const event of combatantInfoEvents) {
    if (event.sourceID && actorById.get(event.sourceID)?.type === "Player") players.set(event.sourceID, actorMeta(actorById, event.sourceID));
  }
  return [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function actorMeta(actorById, id) {
  const actor = actorById.get(id);
  return { id, name: actor?.name || `Actor ${id}`, type: actor?.type || null, class: actor?.subType || null };
}

function actorName(actorById, id) {
  return actorById.get(id)?.name || `Actor ${id}`;
}

function resolvePlayerActorId(actorById, id) {
  const actor = actorById.get(id);
  if (actor?.type === "Player") return id;
  const ownerId = actor?.petOwner && typeof actor.petOwner === "object" ? actor.petOwner.id : actor?.petOwner;
  return ownerId || id;
}

function playerMergeKey(player) {
  return `${String(player?.name || "").trim().toLowerCase()}:${String(player?.class || "").trim().toLowerCase()}`;
}

function abilityIdOf(event) {
  return event.abilityGameID ?? event.ability?.gameID ?? event.ability?.guid ?? null;
}

function evidenceForDamageEvent({ event, fight, actorById }) {
  const abilityId = abilityIdOf(event);
  return {
    timestamp: event.timestamp,
    time: formatTime(event.timestamp - fight.startTime),
    abilityId,
    abilityName: ABILITY_NAMES[abilityId] || event.ability?.name || `Ability ${abilityId}`,
    source: actorName(actorById, event.sourceID),
    target: actorName(actorById, event.targetID),
    amount: event.amount || 0,
  };
}

function isPlayerInterruptCast(event) {
  return new Set([47528, 183752, 97547, 187707, 96231, 147362, 1766, 57994, 2139, 6552, 116705, 106839]).has(abilityIdOf(event));
}

function parseKickAssignments(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).filter(Boolean))
    .filter((line) => line.length);
}

function normalizeName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function namesMatch(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  return levenshteinDistance(a, b) <= 2;
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let last = i - 1;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = old;
    }
  }
  return previous[b.length];
}

function buildSpellMap(abilityById) {
  const ids = new Set([...Object.values(SPELLS), ...abilityById.keys()]);
  return Object.fromEntries([...ids].filter(Boolean).map((id) => {
    const ability = abilityById.get(id);
    return [id, { id, name: ability?.name || ABILITY_NAMES[id] || `Ability ${id}`, icon: ability?.icon || null }];
  }));
}

function liveLogStatus(report, pulls) {
  const latestPull = pulls.slice().sort((a, b) => b.id - a.id)[0] || null;
  if (!latestPull) return { isLive: false, latestPullEndedAt: null, ageMs: null };
  const latestPullEndedAt = report.startTime + latestPull.endTime;
  const ageMs = Date.now() - latestPullEndedAt;
  return { isLive: ageMs >= 0 && ageMs <= 30 * 60 * 1000, latestPullEndedAt, ageMs };
}

function formatTime(ms) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await analyzeLura(REPORT_URL, { pullId: "latest" }), null, 2));
}
