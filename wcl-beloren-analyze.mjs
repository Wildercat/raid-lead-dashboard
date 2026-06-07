import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv(join(dirname(fileURLToPath(import.meta.url)), ".env"));

const REPORT_URL =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  "https://www.warcraftlogs.com/reports/c28N14ZFVxybzAHW?fight=33&type=summary";
const SUMMARY_MODE = process.argv.includes("--summary");
const CLIENT_ID = process.env.WARCRAFT_LOGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WARCRAFT_LOGS_CLIENT_SECRET;

const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_URL = "https://www.warcraftlogs.com/api/v2/client";

const BELOREN_ENCOUNTER_ID = 3182;

const SPELLS = {
  lightFeather: 1241162,
  voidFeather: 1241163,
  lightEcho: 1242991,
  voidEcho: 1242996,
  eruptingLightEcho: 1262736,
  eruptingVoidEcho: 1262737,
  lightEruption: 1243852,
  voidEruption: 1243854,
  lightQuill: 1242093,
  voidQuill: 1242094,
  lightFlames: 1242803,
  voidFlames: 1242815,
  voidlightConvergence: 1241932,
  voidlightRupture: 1243866,
  burningHeart: 1264650,
  ashenBenediction: 1262573,
  lightBurn: 1244348,
  voidBurn: 1266404,
  lightDive: 1241291,
  voidDive: 1241340,
  lightPatch: 1241840,
  voidPatch: 1241841,
  lightEdict: 1241646,
  lightEdictPhysical: 1265781,
  voidEdict: 1241676,
  voidEdictPhysical: 1265793,
  rebirth: 1263412,
  melee: 1,
};

const ABILITY_NAMES = {
  [SPELLS.lightFeather]: "Light Feather",
  [SPELLS.voidFeather]: "Void Feather",
  [SPELLS.lightEcho]: "Light Echo",
  [SPELLS.voidEcho]: "Void Echo",
  [SPELLS.eruptingLightEcho]: "Erupting Light Echo",
  [SPELLS.eruptingVoidEcho]: "Erupting Void Echo",
  [SPELLS.lightEruption]: "Light Eruption",
  [SPELLS.voidEruption]: "Void Eruption",
  [SPELLS.lightQuill]: "Light Quill",
  [SPELLS.voidQuill]: "Void Quill",
  [SPELLS.lightFlames]: "Light Flames",
  [SPELLS.voidFlames]: "Void Flames",
  [SPELLS.voidlightConvergence]: "Voidlight Convergence",
  [SPELLS.voidlightRupture]: "Voidlight Rupture",
  [SPELLS.burningHeart]: "Burning Heart",
  [SPELLS.ashenBenediction]: "Ashen Benediction",
  [SPELLS.lightBurn]: "Light Burn",
  [SPELLS.voidBurn]: "Void Burn",
  [SPELLS.lightDive]: "Light Dive",
  [SPELLS.voidDive]: "Void Dive",
  [SPELLS.lightPatch]: "Light Patch",
  [SPELLS.voidPatch]: "Void Patch",
  [SPELLS.lightEdict]: "Light Edict",
  [SPELLS.lightEdictPhysical]: "Light Edict",
  [SPELLS.voidEdict]: "Void Edict",
  [SPELLS.voidEdictPhysical]: "Void Edict",
  [SPELLS.rebirth]: "Rebirth",
  [SPELLS.melee]: "Melee",
};

const COLOR_DAMAGE_RULES = {
  [SPELLS.lightEcho]: {
    color: "light",
    expectedFeather: "light",
    mechanic: "Radiant Echoes",
    correctLabel: "correct orb soak",
    wrongLabel: "wrong-color orb soak",
    deathLinkedLabel: "soaked wrong orb color",
  },
  [SPELLS.voidEcho]: {
    color: "void",
    expectedFeather: "void",
    mechanic: "Radiant Echoes",
    correctLabel: "correct orb soak",
    wrongLabel: "wrong-color orb soak",
    deathLinkedLabel: "soaked wrong orb color",
  },
  [SPELLS.lightQuill]: {
    color: "light",
    expectedFeather: "light",
    mechanic: "Infused Quills",
    wrongLabel: "wrong quill",
    deathLinkedLabel: "wrong quill",
  },
  [SPELLS.voidQuill]: {
    color: "void",
    expectedFeather: "void",
    mechanic: "Infused Quills",
    wrongLabel: "wrong quill",
    deathLinkedLabel: "wrong quill",
  },
  [SPELLS.lightFlames]: {
    color: "light",
    expectedFeather: "light",
    mechanic: "Incubation of Flames",
    wrongLabel: "Egg DoT",
    deathLinkedLabel: "Egg DoT",
  },
  [SPELLS.voidFlames]: {
    color: "void",
    expectedFeather: "void",
    mechanic: "Incubation of Flames",
    wrongLabel: "Egg DoT",
    deathLinkedLabel: "Egg DoT",
  },
};

const WIPE_FAILURE_RULES = {
  [SPELLS.lightEruption]: {
    mechanic: "Light/Void Eruption",
    label: "Light Eruption not interrupted",
    attribution: "unclear",
  },
  [SPELLS.voidEruption]: {
    mechanic: "Light/Void Eruption",
    label: "Void Eruption not interrupted",
    attribution: "unclear",
  },
  [SPELLS.eruptingLightEcho]: {
    mechanic: "Radiant Echoes",
    label: "Radiant Echo reached boss",
    attribution: "unclear",
  },
  [SPELLS.eruptingVoidEcho]: {
    mechanic: "Radiant Echoes",
    label: "Radiant Echo reached boss",
    attribution: "unclear",
  },
};

const REPORT_SHELL_QUERY = `
query ReportShell($code: String!) {
  reportData {
    report(code: $code) {
      code
      title
      startTime
      endTime
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
        abilities {
          gameID
          name
        }
        actors {
          id
          name
          type
          subType
          gameID
        }
      }
    }
  }
}
`;

const EVENTS_QUERY = `
query ReportEvents(
  $code: String!
  $fightIDs: [Int]
  $dataType: EventDataType
  $startTime: Float
  $endTime: Float
  $limit: Int
) {
  reportData {
    report(code: $code) {
      events(
        fightIDs: $fightIDs
        dataType: $dataType
        startTime: $startTime
        endTime: $endTime
        limit: $limit
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}
`;

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ||= value;
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
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing WARCRAFT_LOGS_CLIENT_ID or WARCRAFT_LOGS_CLIENT_SECRET.");
  }

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

async function graphql(token, query, variables) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(
      `GraphQL request failed: ${response.status}\n${JSON.stringify(body.errors || body, null, 2)}`,
    );
  }

  return body.data;
}

async function fetchAllEvents(token, { code, fightId, fightIds, dataType, startTime, endTime }) {
  const events = [];
  let pageStart = startTime;
  const ids = fightIds || [fightId];

  while (true) {
    const data = await graphql(token, EVENTS_QUERY, {
      code,
      fightIDs: ids,
      dataType,
      startTime: pageStart,
      endTime,
      limit: 10000,
    });

    const page = data.reportData.report.events;
    events.push(...(page.data || []));

    if (!page.nextPageTimestamp || (endTime && page.nextPageTimestamp >= endTime)) break;
    pageStart = page.nextPageTimestamp;
  }

  return events;
}

function pickFight(report, requestedFightId) {
  if (requestedFightId) {
    const requested = report.fights.find((fight) => fight.id === requestedFightId);
    if (!requested) throw new Error(`Fight ${requestedFightId} was not found in report ${report.code}.`);
    return requested;
  }

  const belorenWipes = report.fights
    .filter((fight) => fight.encounterID === BELOREN_ENCOUNTER_ID && !fight.kill)
    .sort((a, b) => b.id - a.id);

  if (!belorenWipes.length) throw new Error("No Beloren wipes found in the report.");
  return belorenWipes[0];
}

function actorName(actorById, id) {
  return actorById.get(id)?.name || `Actor ${id}`;
}

function actorMeta(actorById, id) {
  const actor = actorById.get(id);
  return {
    id,
    name: actor?.name || `Actor ${id}`,
    type: actor?.type || null,
    class: actor?.subType || null,
  };
}

function abilityIdOf(event) {
  return event.abilityGameID ?? event.ability?.gameID ?? event.ability?.guid ?? null;
}

function abilityNameOf(event, abilityById) {
  const abilityId = abilityIdOf(event);
  return abilityById?.get(abilityId) || ABILITY_NAMES[abilityId] || event.ability?.name || `Ability ${abilityId}`;
}

function msFromPull(fight, timestamp) {
  return timestamp - fight.startTime;
}

function formatTime(ms) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function buildFeatherTimeline(debuffEvents) {
  const segmentsByPlayer = new Map();
  const activeByPlayer = new Map();

  const relevant = debuffEvents
    .filter((event) => abilityIdOf(event) === SPELLS.lightFeather || abilityIdOf(event) === SPELLS.voidFeather)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const event of relevant) {
    const playerId = event.targetID;
    const state = abilityIdOf(event) === SPELLS.lightFeather ? "light" : "void";
    const existing = activeByPlayer.get(playerId);

    if (event.type === "applydebuff" || event.type === "refreshdebuff") {
      if (existing?.state === state) continue;
      if (existing) existing.end = event.timestamp;

      const segment = {
        playerId,
        state,
        abilityId: abilityIdOf(event),
        start: event.timestamp,
        end: null,
      };
      activeByPlayer.set(playerId, segment);

      if (!segmentsByPlayer.has(playerId)) segmentsByPlayer.set(playerId, []);
      segmentsByPlayer.get(playerId).push(segment);
    }

    if (event.type === "removedebuff" && existing?.state === state) {
      existing.end = event.timestamp;
      activeByPlayer.delete(playerId);
    }
  }

  return {
    getAt(playerId, timestamp) {
      const segments = segmentsByPlayer.get(playerId) || [];
      const matches = segments.filter((segment) => {
        return segment.start <= timestamp && (segment.end === null || timestamp <= segment.end);
      });

      if (!matches.length) return { state: "unknown", segment: null };
      matches.sort((a, b) => b.start - a.start);
      return { state: matches[0].state, segment: matches[0] };
    },
    segmentCount: [...segmentsByPlayer.values()].reduce((sum, segments) => sum + segments.length, 0),
    playerCount: segmentsByPlayer.size,
  };
}

function evidenceForDamageEvent({ event, fight, actorById, feather }) {
  const abilityId = abilityIdOf(event);
  return {
    timestamp: event.timestamp,
    time: formatTime(msFromPull(fight, event.timestamp)),
    abilityId,
    abilityName: ABILITY_NAMES[abilityId] || event.ability?.name || `Ability ${abilityId}`,
    source: actorName(actorById, event.sourceID),
    target: actorName(actorById, event.targetID),
    amount: event.amount ?? 0,
    overkill: event.overkill ?? 0,
    targetFeather: feather?.state || "unknown",
  };
}

function buildFindings({ fight, actorById, damageEvents, featherTimeline }) {
  const findings = [];
  const mistakes = [];
  const contributions = [];
  const wipeFailureGroups = new Map();
  const flameMistakeGroups = { active: new Map(), items: [] };

  for (const event of damageEvents.sort((a, b) => a.timestamp - b.timestamp)) {
    const abilityId = abilityIdOf(event);
    const wipeRule = WIPE_FAILURE_RULES[abilityId];

    if (wipeRule) {
      addWipeFailureEvent(wipeFailureGroups, { event, fight, actorById, abilityId, wipeRule });
      continue;
    }

    const colorRule = COLOR_DAMAGE_RULES[abilityId];
    if (!colorRule || !event.targetID) continue;

    const feather = featherTimeline.getAt(event.targetID, event.timestamp);
    const evidence = evidenceForDamageEvent({ event, fight, actorById, feather });
    const base = {
      timestamp: event.timestamp,
      time: formatTime(msFromPull(fight, event.timestamp)),
      player: actorMeta(actorById, event.targetID),
      mechanic: colorRule.mechanic,
      abilityId,
      abilityName: evidence.abilityName,
      mechanicColor: colorRule.color,
      expectedFeather: colorRule.expectedFeather,
      actualFeather: feather.state,
      damageAmount: event.amount ?? 0,
      evidence: [evidence],
    };

    if (feather.state === colorRule.expectedFeather) {
      if (colorRule.mechanic === "Radiant Echoes") {
        contributions.push({
          id: `contribution-${abilityId}-${event.timestamp}-${event.targetID}`,
          category: "contribution",
          severity: "info",
          label: colorRule.correctLabel,
          ...base,
        });
      }
      continue;
    }

    if (feather.state === "unknown") continue;

    if (colorRule.mechanic === "Incubation of Flames") {
      addFlameMistakeEvent(flameMistakeGroups, {
        event,
        fight,
        actorById,
        abilityId,
        colorRule,
        base,
        evidence,
      });
      continue;
    }

    const mistake = {
      id: `mistake-${abilityId}-${event.timestamp}-${event.targetID}`,
      category: "likely_mistake",
      severity: "high",
      label: colorRule.wrongLabel,
      outcome: "unknown impact",
      attribution: "target_player",
      deathLinkedLabel: colorRule.deathLinkedLabel,
      ...base,
    };
    findings.push(mistake);
    mistakes.push(mistake);
  }

  for (const finding of [...wipeFailureGroups.values()].map(finalizeWipeFailureGroup)) {
    findings.push(finding);
    mistakes.push(finding);
  }

  for (const mistake of flameMistakeGroups.items.map(finalizeFlameMistakeGroup)) {
    findings.push(mistake);
    mistakes.push(mistake);
  }

  findings.sort((a, b) => a.timestamp - b.timestamp);
  mistakes.sort((a, b) => a.timestamp - b.timestamp);

  return { findings, mistakes, contributions };
}

function addWipeFailureEvent(groups, { event, fight, actorById, abilityId, wipeRule }) {
  const key = `${abilityId}:${Math.floor(event.timestamp / 1000)}`;
  const group = groups.get(key) || {
    id: `wipe-${abilityId}-${Math.floor(event.timestamp / 1000)}`,
    category: "wipe_level_failure",
    severity: "wipe",
    timestamp: event.timestamp,
    time: formatTime(msFromPull(fight, event.timestamp)),
    mechanic: wipeRule.mechanic,
    label: wipeRule.label,
    attribution: wipeRule.attribution,
    abilityId,
    abilityName: ABILITY_NAMES[abilityId] || `Ability ${abilityId}`,
    affectedPlayerIds: new Set(),
    raidDamageTotal: 0,
    hitCount: 0,
  };

  if (event.targetID) group.affectedPlayerIds.add(event.targetID);
  group.raidDamageTotal += event.amount ?? 0;
  group.hitCount += 1;
  group.timestamp = Math.min(group.timestamp, event.timestamp);
  group.time = formatTime(msFromPull(fight, group.timestamp));
  group.actorById = actorById;
  groups.set(key, group);
}

function finalizeWipeFailureGroup(group) {
  const affectedPlayers = [...group.affectedPlayerIds].map((id) => actorMeta(group.actorById, id));
  return {
    id: group.id,
    category: group.category,
    severity: group.severity,
    timestamp: group.timestamp,
    time: group.time,
    mechanic: group.mechanic,
    label: group.label,
    attribution: group.attribution,
    players: affectedPlayers,
    hitCount: group.hitCount,
    raidDamageTotal: group.raidDamageTotal,
    evidence: [
      {
        timestamp: group.timestamp,
        time: group.time,
        abilityId: group.abilityId,
        abilityName: group.abilityName,
        source: "Belo'ren",
        target: `${affectedPlayers.length} players`,
        amount: group.raidDamageTotal,
      },
    ],
  };
}

function addFlameMistakeEvent(groups, { event, fight, actorById, abilityId, colorRule, base, evidence }) {
  const groupKey = `${event.targetID}:${abilityId}`;
  const existing = groups.active.get(groupKey);

  if (existing && event.timestamp - existing.lastTimestamp <= 15000) {
    existing.lastTimestamp = event.timestamp;
    existing.tickCount += 1;
    existing.damageAmount += event.amount ?? 0;
    existing.evidence.push(evidence);
    return;
  }

  const next = {
    id: `mistake-${abilityId}-${event.timestamp}-${event.targetID}`,
    category: "likely_mistake",
    severity: "high",
    label: colorRule.wrongLabel,
    outcome: "unknown impact",
    attribution: "target_player",
    deathLinkedLabel: colorRule.deathLinkedLabel,
    ...base,
    tickCount: 1,
    firstTimestamp: event.timestamp,
    lastTimestamp: event.timestamp,
    evidence: [evidence],
  };
  groups.items.push(next);
  groups.active.set(groupKey, next);
}

function finalizeFlameMistakeGroup(group) {
  group.evidence = group.evidence.slice(0, 12);
  group.damageAmount = Math.round(group.damageAmount);
  group.tickCount = group.tickCount || group.evidence.length;
  return group;
}

function buildDeaths({ fight, actorById, deaths, damageEvents, mistakes }) {
  return deaths
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((death, index) => {
      const playerId = death.targetID;
      const recentDamage = damageEvents
        .filter((event) => event.targetID === playerId && event.timestamp <= death.timestamp)
        .filter((event) => event.timestamp >= death.timestamp - 10000)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
        .reverse();

      const linkedMistakes = mistakes
        .filter((mistake) => mistake.player?.id === playerId)
        .filter((mistake) => {
          const windowMs = mistake.mechanic === "Incubation of Flames" ? 30000 : 10000;
          return mistake.timestamp <= death.timestamp && mistake.timestamp >= death.timestamp - windowMs;
        })
        .sort((a, b) => {
          const severityDelta = severityRank(b.severity) - severityRank(a.severity);
          return severityDelta || b.timestamp - a.timestamp;
        });

      const linkedMistake = linkedMistakes[0] || null;
      const directEvent = recentDamage[recentDamage.length - 1] || null;

      return {
        id: `death-${index + 1}-${playerId}-${death.timestamp}`,
        order: index + 1,
        player: actorMeta(actorById, playerId),
        timestamp: death.timestamp,
        time: formatTime(msFromPull(fight, death.timestamp)),
        directDeathCause: directEvent
          ? {
              abilityId: abilityIdOf(directEvent),
              abilityName: ABILITY_NAMES[abilityIdOf(directEvent)] || `Ability ${abilityIdOf(directEvent)}`,
              amount: directEvent.amount ?? 0,
              overkill: directEvent.overkill ?? 0,
            }
          : null,
        likelyMistake: linkedMistake
          ? {
              label: linkedMistake.deathLinkedLabel || linkedMistake.label,
              mechanic: linkedMistake.mechanic,
              time: linkedMistake.time,
              abilityId: linkedMistake.abilityId,
              evidence: linkedMistake.evidence,
            }
          : null,
        finalDamageEvents: recentDamage.map((event) => ({
          timestamp: event.timestamp,
          time: formatTime(msFromPull(fight, event.timestamp)),
          abilityId: abilityIdOf(event),
          abilityName: ABILITY_NAMES[abilityIdOf(event)] || `Ability ${abilityIdOf(event)}`,
          source: actorName(actorById, event.sourceID),
          amount: event.amount ?? 0,
          overkill: event.overkill ?? 0,
        })),
      };
    });
}

function severityRank(severity) {
  return { wipe: 100, high: 80, warning: 60, info: 10 }[severity] || 0;
}

function buildEchoLeaderboard({ actorById, contributions, mistakes, deaths }) {
  const rows = new Map();

  function rowFor(player) {
    if (!player?.id) return null;
    if (!rows.has(player.id)) {
      rows.set(player.id, {
        player,
        totalCorrectSoaks: 0,
        lightSoaks: 0,
        voidSoaks: 0,
        wrongColorSoaks: 0,
      });
    }
    return rows.get(player.id);
  }

  for (const contribution of contributions.filter((item) => item.mechanic === "Radiant Echoes")) {
    const row = rowFor(contribution.player);
    if (!row) continue;
    row.totalCorrectSoaks += 1;
    if (contribution.mechanicColor === "light") row.lightSoaks += 1;
    if (contribution.mechanicColor === "void") row.voidSoaks += 1;
  }

  for (const mistake of mistakes.filter((item) => item.mechanic === "Radiant Echoes" && item.category === "likely_mistake")) {
    const row = rowFor(mistake.player);
    if (!row) continue;
    row.wrongColorSoaks += 1;
  }

  for (const death of deaths) {
    const causeId = death.directDeathCause?.abilityId;
    if (causeId !== SPELLS.lightEcho && causeId !== SPELLS.voidEcho) continue;

    const row = rowFor(death.player);
    if (!row) continue;
    row.deathsFromSoaks = (row.deathsFromSoaks || 0) + 1;
  }

  return [...rows.values()]
    .sort((a, b) => b.totalCorrectSoaks - a.totalCorrectSoaks || a.player.name.localeCompare(b.player.name))
    .map((row) => ({
      ...row,
      deathsFromSoaks: row.deathsFromSoaks || 0,
      survivalRate:
        row.totalCorrectSoaks > 0
          ? Number(((row.totalCorrectSoaks - (row.deathsFromSoaks || 0)) / row.totalCorrectSoaks).toFixed(3))
          : null,
      player: actorMeta(actorById, row.player.id),
    }));
}

function buildEruptionInterruptLeaderboard({ actorById, interrupts }) {
  const rows = new Map();

  function rowFor(playerId) {
    if (!rows.has(playerId)) {
      rows.set(playerId, {
        player: actorMeta(actorById, playerId),
        totalInterrupts: 0,
        lightEruptionInterrupts: 0,
        voidEruptionInterrupts: 0,
      });
    }
    return rows.get(playerId);
  }

  for (const event of interrupts) {
    if (event.extraAbilityGameID !== SPELLS.lightEruption && event.extraAbilityGameID !== SPELLS.voidEruption) {
      continue;
    }

    const row = rowFor(event.sourceID);
    row.totalInterrupts += 1;
    if (event.extraAbilityGameID === SPELLS.lightEruption) row.lightEruptionInterrupts += 1;
    if (event.extraAbilityGameID === SPELLS.voidEruption) row.voidEruptionInterrupts += 1;
  }

  return [...rows.values()].sort(
    (a, b) => b.totalInterrupts - a.totalInterrupts || a.player.name.localeCompare(b.player.name),
  );
}

function consumableTypeFor(name) {
  if (/healthstone/i.test(name)) return "healthstone";
  if (/(health|healing) potion/i.test(name)) return "healthPotion";
  return null;
}

function buildConsumableLeaderboard({ actorById, abilityById, healingEvents }) {
  const rows = new Map();

  function rowFor(playerId) {
    if (!rows.has(playerId)) {
      rows.set(playerId, {
        player: actorMeta(actorById, playerId),
        totalUses: 0,
        healthstoneUses: 0,
        healthPotionUses: 0,
        healing: 0,
        overheal: 0,
      });
    }
    return rows.get(playerId);
  }

  for (const event of healingEvents) {
    const abilityName = abilityNameOf(event, abilityById);
    const consumableType = consumableTypeFor(abilityName);
    if (!consumableType || !event.sourceID || event.sourceID !== event.targetID) continue;

    const row = rowFor(event.sourceID);
    row.totalUses += 1;
    row.healing += event.amount || 0;
    row.overheal += event.overheal || 0;
    if (consumableType === "healthstone") row.healthstoneUses += 1;
    if (consumableType === "healthPotion") row.healthPotionUses += 1;
  }

  return [...rows.values()]
    .sort((a, b) => b.totalUses - a.totalUses || b.healing - a.healing || a.player.name.localeCompare(b.player.name))
    .map((row) => ({
      ...row,
      healing: Math.round(row.healing),
      overheal: Math.round(row.overheal),
    }));
}

function rowsByFight(events) {
  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.fight)) grouped.set(event.fight, []);
    grouped.get(event.fight).push(event);
  }
  return grouped;
}

function mergeEchoLeaderboards(actorById, leaderboards) {
  const rows = new Map();
  for (const leaderboard of leaderboards) {
    for (const item of leaderboard) {
      const id = item.player.id;
      const row =
        rows.get(id) ||
        {
          player: actorMeta(actorById, id),
          totalCorrectSoaks: 0,
          lightSoaks: 0,
          voidSoaks: 0,
          wrongColorSoaks: 0,
          deathsFromSoaks: 0,
        };
      row.totalCorrectSoaks += item.totalCorrectSoaks;
      row.lightSoaks += item.lightSoaks;
      row.voidSoaks += item.voidSoaks;
      row.wrongColorSoaks += item.wrongColorSoaks;
      row.deathsFromSoaks += item.deathsFromSoaks;
      rows.set(id, row);
    }
  }

  return [...rows.values()]
    .sort((a, b) => b.totalCorrectSoaks - a.totalCorrectSoaks || a.player.name.localeCompare(b.player.name))
    .map((row) => ({
      ...row,
      survivalRate:
        row.totalCorrectSoaks > 0
          ? Number(((row.totalCorrectSoaks - row.deathsFromSoaks) / row.totalCorrectSoaks).toFixed(3))
          : null,
    }));
}

function mergeInterruptLeaderboards(actorById, leaderboards) {
  const rows = new Map();
  for (const leaderboard of leaderboards) {
    for (const item of leaderboard) {
      const id = item.player.id;
      const row =
        rows.get(id) ||
        {
          player: actorMeta(actorById, id),
          totalInterrupts: 0,
          lightEruptionInterrupts: 0,
          voidEruptionInterrupts: 0,
        };
      row.totalInterrupts += item.totalInterrupts;
      row.lightEruptionInterrupts += item.lightEruptionInterrupts;
      row.voidEruptionInterrupts += item.voidEruptionInterrupts;
      rows.set(id, row);
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.totalInterrupts - a.totalInterrupts || a.player.name.localeCompare(b.player.name),
  );
}

function mergeConsumableLeaderboards(actorById, leaderboards) {
  const rows = new Map();
  for (const leaderboard of leaderboards) {
    for (const item of leaderboard) {
      const id = item.player.id;
      const row =
        rows.get(id) ||
        {
          player: actorMeta(actorById, id),
          totalUses: 0,
          healthstoneUses: 0,
          healthPotionUses: 0,
          healing: 0,
          overheal: 0,
        };
      row.totalUses += item.totalUses;
      row.healthstoneUses += item.healthstoneUses;
      row.healthPotionUses += item.healthPotionUses;
      row.healing += item.healing;
      row.overheal += item.overheal;
      rows.set(id, row);
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.totalUses - a.totalUses || b.healing - a.healing || a.player.name.localeCompare(b.player.name),
  );
}

function buildMistakeLeaderboard(actorById, mistakesByFight) {
  const rows = new Map();

  for (const { fight, mistakes } of mistakesByFight) {
    for (const mistake of mistakes.filter((item) => item.category === "likely_mistake")) {
      const id = mistake.player?.id;
      if (!id) continue;
      const row =
        rows.get(id) ||
        {
          player: actorMeta(actorById, id),
          totalMistakes: 0,
          mistakeCounts: new Map(),
          pulls: new Set(),
        };
      const key = mistake.label;
      const current = row.mistakeCounts.get(key) || {
        label: key,
        mechanic: mistake.mechanic,
        count: 0,
      };
      current.count += 1;
      row.mistakeCounts.set(key, current);
      row.totalMistakes += 1;
      row.pulls.add(fight.id);
      rows.set(id, row);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      player: row.player,
      totalMistakes: row.totalMistakes,
      pullCount: row.pulls.size,
      mistakes: [...row.mistakeCounts.values()].sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label),
      ),
    }))
    .sort((a, b) => b.totalMistakes - a.totalMistakes || a.player.name.localeCompare(b.player.name));
}

function buildSummary({ mistakes, deaths, wipeFailures, echoLeaderboard }) {
  const mistakeCounts = new Map();
  for (const mistake of mistakes) {
    const key = mistake.label;
    mistakeCounts.set(key, (mistakeCounts.get(key) || 0) + 1);
  }

  return {
    wipeFailureCount: wipeFailures.length,
    deathCount: deaths.length,
    likelyMistakeCount: mistakes.filter((item) => item.category === "likely_mistake").length,
    topMistakeLabels: [...mistakeCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    topEchoSoakers: echoLeaderboard.slice(0, 10).map((row) => ({
      player: row.player.name,
      totalCorrectSoaks: row.totalCorrectSoaks,
      lightSoaks: row.lightSoaks,
      voidSoaks: row.voidSoaks,
      wrongColorSoaks: row.wrongColorSoaks,
    })),
  };
}

export async function analyzeBeloren(reportUrl = REPORT_URL, options = {}) {
  const { reportCode, fightId } = parseReportUrl(reportUrl);
  const token = await getAccessToken();
  const shell = await graphql(token, REPORT_SHELL_QUERY, { code: reportCode });
  const report = shell.reportData.report;
  const selectedFightId =
    options.pullId === "latest"
      ? null
      : options.pullId !== undefined && options.pullId !== null && options.pullId !== ""
        ? Number(options.pullId)
        : fightId;
  const fight = pickFight(report, selectedFightId);
  const actorById = new Map(report.masterData.actors.map((actor) => [actor.id, actor]));
  const abilityById = new Map((report.masterData.abilities || []).map((ability) => [ability.gameID, ability.name]));
  const belorenFights = report.fights
    .filter((item) => item.encounterID === BELOREN_ENCOUNTER_ID)
    .sort((a, b) => a.id - b.id);
  const belorenFightIds = belorenFights.map((item) => item.id);
  const eventStartTime = Math.min(...belorenFights.map((item) => item.startTime));
  const eventEndTime = Math.max(...belorenFights.map((item) => item.endTime));
  const scope = options.scope === "night" ? "night" : "pull";

  async function fetchEventBundle({ fightIds, startTime, endTime }) {
    const [debuffs, damageTaken, deaths, casts, interrupts, healing] = await Promise.all([
      fetchAllEvents(token, { code: reportCode, fightIds, dataType: "Debuffs", startTime, endTime }),
      fetchAllEvents(token, { code: reportCode, fightIds, dataType: "DamageTaken", startTime, endTime }),
      fetchAllEvents(token, { code: reportCode, fightIds, dataType: "Deaths", startTime, endTime }),
      fetchAllEvents(token, { code: reportCode, fightIds, dataType: "Casts", startTime, endTime }),
      fetchAllEvents(token, { code: reportCode, fightIds, dataType: "Interrupts", startTime, endTime }),
      fetchAllEvents(token, { code: reportCode, fightIds, dataType: "Healing", startTime, endTime }),
    ]);
    return { debuffs, damageTaken, deaths, casts, interrupts, healing };
  }

  function analyzeFight(item, bundle) {
    const debuffsByFight = rowsByFight(bundle.debuffs);
    const damageTakenByFight = rowsByFight(bundle.damageTaken);
    const deathsByFight = rowsByFight(bundle.deaths);
    const castsByFight = rowsByFight(bundle.casts);
    const interruptsByFight = rowsByFight(bundle.interrupts);
    const healingByFight = rowsByFight(bundle.healing);
    const debuffs = debuffsByFight.get(item.id) || [];
    const damageTaken = damageTakenByFight.get(item.id) || [];
    const deaths = deathsByFight.get(item.id) || [];
    const casts = castsByFight.get(item.id) || [];
    const interrupts = interruptsByFight.get(item.id) || [];
    const healing = healingByFight.get(item.id) || [];
    const featherTimeline = buildFeatherTimeline(debuffs);
    const { findings, mistakes, contributions } = buildFindings({
      fight: item,
      actorById,
      damageEvents: damageTaken,
      featherTimeline,
    });
    const deathRecords = buildDeaths({ fight: item, actorById, deaths, damageEvents: damageTaken, mistakes });
    const wipeFailures = findings.filter((finding) => finding.category === "wipe_level_failure");
    const echoLeaderboard = buildEchoLeaderboard({ actorById, contributions, mistakes, deaths: deathRecords });
    const eruptionInterruptLeaderboard = buildEruptionInterruptLeaderboard({ actorById, interrupts });
    const consumableLeaderboard = buildConsumableLeaderboard({ actorById, abilityById, healingEvents: healing });

    return {
      fight: item,
      debuffs,
      damageTaken,
      deaths,
      casts,
      interrupts,
      healing,
      featherTimeline,
      findings,
      mistakes,
      contributions,
      deathRecords,
      wipeFailures,
      echoLeaderboard,
      eruptionInterruptLeaderboard,
      consumableLeaderboard,
    };
  }

  const output = {
    report: {
      code: report.code,
      title: report.title,
      pulls: report.fights
        .filter((item) => item.encounterID === BELOREN_ENCOUNTER_ID)
        .sort((a, b) => b.id - a.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          kill: item.kill,
          bossPercentage: item.bossPercentage,
          duration: formatTime(item.endTime - item.startTime),
        })),
    },
    fight: {
      id: fight.id,
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

  if (scope === "pull") {
    const selectedBundle = await fetchEventBundle({
      fightIds: [fight.id],
      startTime: fight.startTime,
      endTime: fight.endTime,
    });
    const selectedAnalysis = analyzeFight(fight, selectedBundle);
    const echoLeaderboard = selectedAnalysis.echoLeaderboard;
    const eruptionInterruptLeaderboard = selectedAnalysis.eruptionInterruptLeaderboard;
    const consumableLeaderboard = selectedAnalysis.consumableLeaderboard;
    const deathRecords = selectedAnalysis.deathRecords;
    const mistakes = selectedAnalysis.mistakes;
    const wipeFailures = selectedAnalysis.wipeFailures;
    const featherTimeline = selectedAnalysis.featherTimeline;

    output.fetchedEventCounts = {
      debuffs: selectedAnalysis.debuffs.length,
      damageTaken: selectedAnalysis.damageTaken.length,
      deaths: selectedAnalysis.deaths.length,
      casts: selectedAnalysis.casts.length,
      interrupts: selectedAnalysis.interrupts.length,
      healing: selectedAnalysis.healing.length,
    };
    output.featherTimeline = {
      playerCount: featherTimeline.playerCount,
      segmentCount: featherTimeline.segmentCount,
    };
    output.summary = buildSummary({ mistakes, deaths: deathRecords, wipeFailures, echoLeaderboard });
    output.latestWipe = {
      wipeLevelFailures: wipeFailures,
      deaths: deathRecords,
      likelyMistakes: mistakes
        .filter((item) => item.category === "likely_mistake")
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.timestamp - b.timestamp)
        .slice(0, 100),
      correctEchoSoakLeaderboard: echoLeaderboard,
      eruptionInterruptLeaderboard,
      consumableLeaderboard,
    };
  }

  if (scope === "night") {
    const nightBundle = await fetchEventBundle({
      fightIds: belorenFightIds,
      startTime: eventStartTime,
      endTime: eventEndTime,
    });
    const analyses = belorenFights.map((item) => analyzeFight(item, nightBundle));

    output.fetchedEventCounts = {
      nightDebuffs: nightBundle.debuffs.length,
      nightDamageTaken: nightBundle.damageTaken.length,
      nightDeaths: nightBundle.deaths.length,
      nightCasts: nightBundle.casts.length,
      nightInterrupts: nightBundle.interrupts.length,
      nightHealing: nightBundle.healing.length,
    };
    output.wholeNight = {
      pullCount: analyses.length,
      wipeCount: analyses.filter((item) => !item.fight.kill).length,
      killCount: analyses.filter((item) => item.fight.kill).length,
      correctEchoSoakLeaderboard: mergeEchoLeaderboards(
        actorById,
        analyses.map((item) => item.echoLeaderboard),
      ),
      eruptionInterruptLeaderboard: mergeInterruptLeaderboards(
        actorById,
        analyses.map((item) => item.eruptionInterruptLeaderboard),
      ),
      consumableLeaderboard: mergeConsumableLeaderboards(
        actorById,
        analyses.map((item) => item.consumableLeaderboard),
      ),
      mistakeLeaderboard: buildMistakeLeaderboard(
        actorById,
        analyses.map((item) => ({ fight: item.fight, mistakes: item.mistakes })),
      ),
    };
  }

  return output;
}

export function compactOutput(output) {
  return {
    report: output.report,
    fight: output.fight,
    fetchedEventCounts: output.fetchedEventCounts,
    featherTimeline: output.featherTimeline,
    summary: output.summary,
    deathsLinkedToLikelyMistakes: output.latestWipe.deaths
      .filter((death) => death.likelyMistake)
      .map((death) => ({
        order: death.order,
        player: death.player.name,
        time: death.time,
        likelyMistake: death.likelyMistake.label,
        directDeathCause: death.directDeathCause?.abilityName || null,
      })),
    likelyMistakes: output.latestWipe.likelyMistakes.map((mistake) => ({
      time: mistake.time,
      player: mistake.player.name,
      label: mistake.label,
      abilityName: mistake.abilityName,
      expectedFeather: mistake.expectedFeather,
      actualFeather: mistake.actualFeather,
      damageAmount: mistake.damageAmount,
    })),
    topEchoSoakers: output.latestWipe.correctEchoSoakLeaderboard.slice(0, 10).map((row) => ({
      player: row.player.name,
      totalCorrectSoaks: row.totalCorrectSoaks,
      lightSoaks: row.lightSoaks,
      voidSoaks: row.voidSoaks,
      wrongColorSoaks: row.wrongColorSoaks,
      deathsFromSoaks: row.deathsFromSoaks,
      survivalRate: row.survivalRate,
    })),
  };
}

async function main() {
  const output = await analyzeBeloren(REPORT_URL);
  console.log(JSON.stringify(SUMMARY_MODE ? compactOutput(output) : output, null, 2));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
