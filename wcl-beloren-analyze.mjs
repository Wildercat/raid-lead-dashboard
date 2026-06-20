import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv(join(dirname(fileURLToPath(import.meta.url)), ".env"));

const REPORT_URL =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  "https://www.warcraftlogs.com/reports/cpLTD4K92BnGPMmV?fight=40&type=summary";
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

const TANK_SPEC_IDS = new Set([66, 73, 104, 250, 268, 581]);

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
    wrongLabel: "wrong orb",
    deathLinkedLabel: "wrong orb",
  },
  [SPELLS.voidEcho]: {
    color: "void",
    expectedFeather: "void",
    mechanic: "Radiant Echoes",
    correctLabel: "correct orb soak",
    wrongLabel: "wrong orb",
    deathLinkedLabel: "wrong orb",
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

const FRONTAL_RULES = {
  [SPELLS.lightEdict]: {
    color: "light",
    expectedFeather: "light",
    mechanic: "Boss Frontal",
    label: "wrong frontal color",
    nonTankLabel: "stood in frontal",
  },
  [SPELLS.lightEdictPhysical]: {
    color: "light",
    expectedFeather: "light",
    mechanic: "Boss Frontal",
    label: "wrong frontal color",
    nonTankLabel: "stood in frontal",
  },
  [SPELLS.voidEdict]: {
    color: "void",
    expectedFeather: "void",
    mechanic: "Boss Frontal",
    label: "wrong frontal color",
    nonTankLabel: "stood in frontal",
  },
  [SPELLS.voidEdictPhysical]: {
    color: "void",
    expectedFeather: "void",
    mechanic: "Boss Frontal",
    label: "wrong frontal color",
    nonTankLabel: "stood in frontal",
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
      guild {
        id
        name
        server {
          name
          region {
            name
          }
        }
      }
      fights {
        id
        encounterID
        name
        difficulty
        kill
        startTime
        endTime
        bossPercentage
        lastPhase
        phaseTransitions {
          id
          startTime
        }
      }
      masterData {
        abilities {
          gameID
          name
          icon
        }
        actors {
          id
          name
          type
          subType
          gameID
          petOwner
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

const DAMAGE_DONE_TABLE_QUERY = `
query DamageDoneTable($code: String!, $fightIDs: [Int], $startTime: Float, $endTime: Float) {
  reportData {
    report(code: $code) {
      table(dataType: DamageDone, fightIDs: $fightIDs, startTime: $startTime, endTime: $endTime)
    }
  }
}
`;

const GUILD_REPORTS_QUERY = `
query GuildReports($guildID: Int!, $limit: Int, $page: Int) {
  reportData {
    reports(guildID: $guildID, limit: $limit, page: $page) {
      current_page
      last_page
      data {
        code
        title
        startTime
        endTime
        fights {
          id
          encounterID
          difficulty
          name
          kill
        }
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

async function fetchEventBundle(token, { code, fightIds, startTime, endTime }) {
  const [debuffs, damageTaken, deaths, casts, interrupts, healing, combatantInfo] = await Promise.all([
    fetchAllEvents(token, { code, fightIds, dataType: "Debuffs", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "DamageTaken", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Deaths", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Casts", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Interrupts", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "Healing", startTime, endTime }),
    fetchAllEvents(token, { code, fightIds, dataType: "CombatantInfo", startTime, endTime }),
  ]);
  return { debuffs, damageTaken, deaths, casts, interrupts, healing, combatantInfo };
}

async function fetchDamageDoneTable(token, { code, fightId, startTime, endTime }) {
  const data = await graphql(token, DAMAGE_DONE_TABLE_QUERY, {
    code,
    fightIDs: [fightId],
    startTime,
    endTime,
  });
  return data.reportData.report.table?.data?.entries || [];
}

async function fetchPhaseDamageTables(token, { code, fights, phaseId }) {
  const tables = {};

  await Promise.all(
    fights.map(async (fight) => {
      const rows = new Map();
      for (const window of phaseWindowsForFight(fight, phaseId)) {
        const entries = await fetchDamageDoneTable(token, {
          code,
          fightId: fight.id,
          startTime: window.startTime,
          endTime: window.endTime,
        });
        for (const entry of entries) {
          const row = rows.get(entry.id) || {
            id: entry.id,
            name: entry.name,
            type: entry.type,
            total: 0,
            activeTime: 0,
          };
          row.total += entry.total || 0;
          row.activeTime += entry.activeTime || 0;
          rows.set(entry.id, row);
        }
      }
      tables[fight.id] = [...rows.values()];
    }),
  );

  return tables;
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

function isPlayerActor(actor) {
  return actor?.type === "Player";
}

function petOwnerId(actor) {
  if (!actor?.petOwner) return null;
  if (typeof actor.petOwner === "object") return actor.petOwner.id || null;
  return actor.petOwner;
}

function resolvePlayerActorId(actorById, id) {
  const actor = actorById.get(id);
  if (!actor) return id;
  if (isPlayerActor(actor)) return id;
  if (actor.type === "Pet" || actor.subType === "Pet") {
    const ownerId = petOwnerId(actor);
    if (ownerId && isPlayerActor(actorById.get(ownerId))) return ownerId;
  }
  return id;
}

function actorRole(specByActor, id) {
  const specID = specByActor?.get(id) || null;
  return {
    specID,
    role: TANK_SPEC_IDS.has(specID) ? "tank" : "non_tank",
  };
}

function playerMeta(actorById, specByActor, id) {
  return {
    ...actorMeta(actorById, id),
    ...actorRole(specByActor, id),
  };
}

function abilityIdOf(event) {
  return event.abilityGameID ?? event.ability?.gameID ?? event.ability?.guid ?? null;
}

function abilityNameOf(event, abilityById) {
  const abilityId = abilityIdOf(event);
  return abilityById?.get(abilityId)?.name || ABILITY_NAMES[abilityId] || event.ability?.name || `Ability ${abilityId}`;
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

function presentPlayersFromCombatantInfo(actorById, specByActor, combatantInfoEvents) {
  const rows = new Map();
  for (const event of combatantInfoEvents) {
    const id = event.sourceID;
    if (!id || !isPlayerActor(actorById.get(id))) continue;
    rows.set(id, playerMeta(actorById, specByActor, id));
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function uniquePlayers(players) {
  const rows = new Map();
  for (const player of players) {
    if (player?.id) rows.set(player.id, player);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
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

function buildFindings({ fight, actorById, specByActor, damageEvents, featherTimeline }) {
  const findings = [];
  const mistakes = [];
  const contributions = [];
  const wipeFailureGroups = new Map();
  const flameMistakeGroups = { active: new Map(), items: [] };
  const ruptureMistakeGroups = { active: new Map(), items: [] };
  const frontalGroups = new Map();

  for (const event of damageEvents.sort((a, b) => a.timestamp - b.timestamp)) {
    const abilityId = abilityIdOf(event);
    const wipeRule = WIPE_FAILURE_RULES[abilityId];

    if (wipeRule) {
      addWipeFailureEvent(wipeFailureGroups, { event, fight, actorById, abilityId, wipeRule });
      continue;
    }

    const frontalRule = FRONTAL_RULES[abilityId];
    if (frontalRule && event.targetID) {
      addFrontalEvent(frontalGroups, {
        event,
        fight,
        actorById,
        specByActor,
        featherTimeline,
        abilityId,
        frontalRule,
      });
      continue;
    }

    if (abilityId === SPELLS.voidlightRupture && event.targetID) {
      const feather = featherTimeline.getAt(event.targetID, event.timestamp);
      const evidence = evidenceForDamageEvent({ event, fight, actorById, feather });
      const base = {
        timestamp: event.timestamp,
        time: formatTime(msFromPull(fight, event.timestamp)),
        player: playerMeta(actorById, specByActor, event.targetID),
        mechanic: "Radiant Echoes",
        abilityId,
        abilityName: evidence.abilityName,
        mechanicColor: "immune",
        expectedFeather: "opposite",
        actualFeather: feather.state,
        damageAmount: event.amount ?? 0,
        evidence: [evidence],
      };

      if ((event.amount ?? 0) <= 0) {
        contributions.push({
          id: `contribution-${abilityId}-${event.timestamp}-${event.targetID}`,
          category: "contribution",
          severity: "info",
          label: "immune orb soak",
          ...base,
        });
        continue;
      }

      addRuptureMistakeEvent(ruptureMistakeGroups, { event, abilityId, base, evidence });
      continue;
    }

    const colorRule = COLOR_DAMAGE_RULES[abilityId];
    if (!colorRule || !event.targetID) continue;

    const feather = featherTimeline.getAt(event.targetID, event.timestamp);
    const evidence = evidenceForDamageEvent({ event, fight, actorById, feather });
    const base = {
      timestamp: event.timestamp,
      time: formatTime(msFromPull(fight, event.timestamp)),
      player: playerMeta(actorById, specByActor, event.targetID),
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
        const isImmuneSoak = (event.amount ?? 0) <= 0;
        contributions.push({
          id: `contribution-${abilityId}-${event.timestamp}-${event.targetID}`,
          category: "contribution",
          severity: "info",
          label: isImmuneSoak ? "immune orb soak" : colorRule.correctLabel,
          ...base,
          mechanicColor: isImmuneSoak ? "immune" : base.mechanicColor,
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

  for (const mistake of ruptureMistakeGroups.items.map(finalizeRuptureMistakeGroup)) {
    findings.push(mistake);
    mistakes.push(mistake);
  }

  for (const finding of [...frontalGroups.values()].map(finalizeFrontalGroup)) {
    if (finding.wipeFailure) {
      findings.push(finding.wipeFailure);
      mistakes.push(finding.wipeFailure);
    }
    if (finding.mistake) {
      findings.push(finding.mistake);
      mistakes.push(finding.mistake);
    }
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

function addRuptureMistakeEvent(groups, { event, abilityId, base, evidence }) {
  const groupKey = `${event.targetID}:${abilityId}`;
  const existing = groups.active.get(groupKey);

  if (existing && event.timestamp - existing.lastTimestamp <= 5000) {
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
    label: "wrong orb",
    outcome: "took Voidlight Rupture damage",
    attribution: "target_player",
    deathLinkedLabel: "wrong orb",
    ...base,
    tickCount: 1,
    firstTimestamp: event.timestamp,
    lastTimestamp: event.timestamp,
    evidence: [evidence],
  };
  groups.items.push(next);
  groups.active.set(groupKey, next);
}

function finalizeRuptureMistakeGroup(group) {
  group.evidence = group.evidence.slice(0, 8);
  group.damageAmount = Math.round(group.damageAmount);
  group.tickCount = group.tickCount || group.evidence.length;
  return group;
}

function addFrontalEvent(groups, { event, fight, actorById, specByActor, featherTimeline, abilityId, frontalRule }) {
  const feather = featherTimeline.getAt(event.targetID, event.timestamp);
  if (feather.state === "unknown") return;

  const player = playerMeta(actorById, specByActor, event.targetID);
  const isTank = player.role === "tank";
  const wrongColor = feather.state !== frontalRule.expectedFeather;
  const shouldCreateMistake = !isTank;
  const shouldCreateWipeFailure = wrongColor;
  if (!shouldCreateMistake && !shouldCreateWipeFailure) return;

  const groupKey = `${event.targetID}:${frontalRule.color}:${Math.floor(event.timestamp / 1000)}`;
  const evidence = evidenceForDamageEvent({ event, fight, actorById, feather });
  const group =
    groups.get(groupKey) ||
    {
      id: `frontal-${event.targetID}-${frontalRule.color}-${Math.floor(event.timestamp / 1000)}`,
      timestamp: event.timestamp,
      time: formatTime(msFromPull(fight, event.timestamp)),
      player,
      mechanic: frontalRule.mechanic,
      abilityId,
      abilityName: evidence.abilityName,
      mechanicColor: frontalRule.color,
      expectedFeather: frontalRule.expectedFeather,
      actualFeather: feather.state,
      damageAmount: 0,
      evidence: [],
      shouldCreateMistake,
      shouldCreateWipeFailure,
      wrongColor,
      isTank,
    };

  group.timestamp = Math.min(group.timestamp, event.timestamp);
  group.time = formatTime(msFromPull(fight, group.timestamp));
  group.damageAmount += event.amount || 0;
  group.evidence.push(evidence);
  group.shouldCreateMistake ||= shouldCreateMistake;
  group.shouldCreateWipeFailure ||= shouldCreateWipeFailure;
  groups.set(groupKey, group);
}

function finalizeFrontalGroup(group) {
  const evidence = group.evidence.slice(0, 8);
  const base = {
    timestamp: group.timestamp,
    time: group.time,
    player: group.player,
    mechanic: group.mechanic,
    abilityId: group.abilityId,
    abilityName: group.abilityName,
    mechanicColor: group.mechanicColor,
    expectedFeather: group.expectedFeather,
    actualFeather: group.actualFeather,
    damageAmount: Math.round(group.damageAmount),
    evidence,
  };

  return {
    wipeFailure: group.shouldCreateWipeFailure
      ? {
          id: `${group.id}-wipe`,
          category: "wipe_level_failure",
          severity: "wipe",
          label: "wrong frontal color",
          attribution: group.player.role === "tank" ? "tank_player_unclear" : "target_player",
          players: [group.player],
          hitCount: group.evidence.length,
          raidDamageTotal: Math.round(group.damageAmount),
          ...base,
        }
      : null,
    mistake: group.shouldCreateMistake
      ? {
          id: `${group.id}-mistake`,
          category: "likely_mistake",
          severity: "high",
          label: group.wrongColor ? "wrong frontal color" : "stood in frontal",
          outcome: group.wrongColor ? "boss enrage" : "avoidable frontal hit",
          attribution: "target_player",
          deathLinkedLabel: group.wrongColor ? "wrong frontal color" : "stood in frontal",
          ...base,
        }
      : null,
  };
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

function buildEchoLeaderboard({ actorById, presentPlayers, contributions, mistakes, deaths }) {
  const rows = new Map();

  function rowFor(player) {
    if (!player?.id) return null;
    if (!rows.has(player.id)) {
      rows.set(player.id, {
        player,
        totalCorrectSoaks: 0,
        lightSoaks: 0,
        voidSoaks: 0,
        immunitySoaks: 0,
        wrongColorSoaks: 0,
        instances: [],
      });
    }
    return rows.get(player.id);
  }

  for (const player of presentPlayers) rowFor(player);

  for (const contribution of contributions.filter((item) => item.mechanic === "Radiant Echoes")) {
    const row = rowFor(contribution.player);
    if (!row) continue;
    row.totalCorrectSoaks += 1;
    if (contribution.mechanicColor === "light") row.lightSoaks += 1;
    if (contribution.mechanicColor === "void") row.voidSoaks += 1;
    if (contribution.mechanicColor === "immune") row.immunitySoaks += 1;
    row.instances.push({
      timestamp: contribution.timestamp,
      time: contribution.time,
      abilityId: contribution.abilityId,
      abilityName: contribution.abilityName,
      type: contribution.mechanicColor,
      amount: contribution.damageAmount,
    });
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
      instances: row.instances.sort((a, b) => a.timestamp - b.timestamp),
      deathsFromSoaks: row.deathsFromSoaks || 0,
      survivalRate:
        row.totalCorrectSoaks > 0
          ? Number(((row.totalCorrectSoaks - (row.deathsFromSoaks || 0)) / row.totalCorrectSoaks).toFixed(3))
          : null,
      player: actorMeta(actorById, row.player.id),
    }));
}

function buildQuillLeaderboard({ actorById, presentPlayers, damageEvents, featherTimeline }) {
  const rows = new Map();
  const groups = new Map();

  for (const event of damageEvents) {
    const abilityId = abilityIdOf(event);
    const colorRule = COLOR_DAMAGE_RULES[abilityId];
    if (!colorRule || colorRule.mechanic !== "Infused Quills" || !event.targetID) continue;

    const key = `${abilityId}:${Math.floor(event.timestamp / 250)}`;
    const group = groups.get(key) || {
      abilityId,
      color: colorRule.color,
      expectedFeather: colorRule.expectedFeather,
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }

  function rowFor(playerId) {
    if (!rows.has(playerId)) {
      rows.set(playerId, {
        player: actorMeta(actorById, playerId),
        totalCorrectQuills: 0,
        lightQuills: 0,
        voidQuills: 0,
        multiHitQuills: 0,
      });
    }
    return rows.get(playerId);
  }

  for (const player of presentPlayers) rowFor(player.id);

  for (const group of groups.values()) {
    const targets = new Set(group.events.map((event) => event.targetID));
    if (targets.size !== 1) {
      for (const targetID of targets) rowFor(targetID).multiHitQuills += 1;
      continue;
    }

    const event = group.events[0];
    const feather = featherTimeline.getAt(event.targetID, event.timestamp);
    if (feather.state !== group.expectedFeather) continue;

    const row = rowFor(event.targetID);
    row.totalCorrectQuills += 1;
    if (group.color === "light") row.lightQuills += 1;
    if (group.color === "void") row.voidQuills += 1;
  }

  return [...rows.values()].sort(
    (a, b) => b.totalCorrectQuills - a.totalCorrectQuills || a.player.name.localeCompare(b.player.name),
  );
}

function buildEruptionInterruptLeaderboard({ actorById, presentPlayers, interrupts }) {
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

  for (const player of presentPlayers) rowFor(player.id);

  for (const event of interrupts) {
    if (event.extraAbilityGameID !== SPELLS.lightEruption && event.extraAbilityGameID !== SPELLS.voidEruption) {
      continue;
    }

    const row = rowFor(resolvePlayerActorId(actorById, event.sourceID));
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

function buildConsumableLeaderboard({ actorById, abilityById, presentPlayers, healingEvents }) {
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

  for (const player of presentPlayers) rowFor(player.id);

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

function phaseWindowsForFight(fight, phaseId) {
  const transitions = [...(fight.phaseTransitions || [])].sort((a, b) => a.startTime - b.startTime);
  return transitions
    .map((transition, index) => ({
      id: transition.id,
      startTime: transition.startTime,
      endTime: transitions[index + 1]?.startTime || fight.endTime,
    }))
    .filter((window) => window.id === phaseId && window.endTime > window.startTime);
}

function buildEggDamageLeaderboard({ actorById, presentPlayers, tableEntries }) {
  const rows = new Map();

  function rowFor(playerId) {
    if (!rows.has(playerId)) {
      rows.set(playerId, {
        player: actorMeta(actorById, playerId),
        totalDamage: 0,
      });
    }
    return rows.get(playerId);
  }

  for (const player of presentPlayers) rowFor(player.id);

  for (const entry of tableEntries || []) {
    if (!rows.has(entry.id)) continue;
    rows.get(entry.id).totalDamage += entry.total || 0;
  }

  return [...rows.values()]
    .sort((a, b) => b.totalDamage - a.totalDamage || a.player.name.localeCompare(b.player.name))
    .map((row) => ({
      ...row,
      totalDamage: Math.round(row.totalDamage),
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

function buildSpecByActor(combatantInfoEvents) {
  const specs = new Map();
  for (const event of combatantInfoEvents) {
    if (event.sourceID && event.specID) specs.set(event.sourceID, event.specID);
  }
  return specs;
}

function buildSpellMap(abilityById) {
  const ids = new Set([
    ...Object.values(SPELLS),
    ...abilityById.keys(),
  ]);
  return Object.fromEntries(
    [...ids]
      .filter(Boolean)
      .map((id) => {
        const ability = abilityById.get(id);
        return [
          id,
          {
            id,
            name: ability?.name || ABILITY_NAMES[id] || `Ability ${id}`,
            icon: ability?.icon || null,
          },
        ];
      }),
  );
}

function reportTimestamp(report, fightTime) {
  return report.startTime + fightTime;
}

function liveLogStatus(report, pulls) {
  const latestPull = pulls.slice().sort((a, b) => b.id - a.id)[0] || null;
  if (!latestPull) return { isLive: false, latestPullEndedAt: null, ageMs: null };
  const latestPullEndedAt = reportTimestamp(report, latestPull.endTime);
  const ageMs = Date.now() - latestPullEndedAt;
  return {
    isLive: ageMs >= 0 && ageMs <= 30 * 60 * 1000,
    latestPullEndedAt,
    ageMs,
  };
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
          immunitySoaks: 0,
          wrongColorSoaks: 0,
          deathsFromSoaks: 0,
        };
      row.totalCorrectSoaks += item.totalCorrectSoaks;
      row.lightSoaks += item.lightSoaks;
      row.voidSoaks += item.voidSoaks;
      row.immunitySoaks += item.immunitySoaks || 0;
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

function mergeQuillLeaderboards(actorById, leaderboards) {
  const rows = new Map();
  for (const leaderboard of leaderboards) {
    for (const item of leaderboard) {
      const id = item.player.id;
      const row =
        rows.get(id) ||
        {
          player: actorMeta(actorById, id),
          totalCorrectQuills: 0,
          lightQuills: 0,
          voidQuills: 0,
          multiHitQuills: 0,
        };
      row.totalCorrectQuills += item.totalCorrectQuills;
      row.lightQuills += item.lightQuills;
      row.voidQuills += item.voidQuills;
      row.multiHitQuills += item.multiHitQuills;
      rows.set(id, row);
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.totalCorrectQuills - a.totalCorrectQuills || a.player.name.localeCompare(b.player.name),
  );
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

function mergeEggDamageLeaderboards(actorById, leaderboards) {
  const rows = new Map();
  for (const leaderboard of leaderboards) {
    for (const item of leaderboard) {
      const id = item.player.id;
      const row =
        rows.get(id) ||
        {
          player: actorMeta(actorById, id),
          totalDamage: 0,
        };
      row.totalDamage += item.totalDamage;
      rows.set(id, row);
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.totalDamage - a.totalDamage || a.player.name.localeCompare(b.player.name),
  );
}

function buildMistakeLeaderboard(actorById, presentPlayers, mistakesByFight) {
  const rows = new Map();

  for (const player of presentPlayers) {
    rows.set(player.id, {
      player: actorMeta(actorById, player.id),
      totalMistakes: 0,
      mistakeCounts: new Map(),
      pulls: new Set(),
    });
  }

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
      immunitySoaks: row.immunitySoaks || 0,
      wrongColorSoaks: row.wrongColorSoaks,
    })),
  };
}

export async function fetchBelorenReportShell(reportUrl = REPORT_URL) {
  const { reportCode, fightId } = parseReportUrl(reportUrl);
  const token = await getAccessToken();
  const shell = await graphql(token, REPORT_SHELL_QUERY, { code: reportCode });
  return {
    reportUrl,
    reportCode,
    requestedFightId: fightId,
    report: shell.reportData.report,
  };
}

export async function fetchGuildBelorenReportSummaries({ guildID, difficulty, limit = 20, maxPages = 20 }) {
  const token = await getAccessToken();
  const reports = [];
  let page = 1;
  let lastPage = 1;

  do {
    const data = await graphql(token, GUILD_REPORTS_QUERY, { guildID, limit, page });
    const pagination = data.reportData.reports;
    reports.push(...(pagination.data || []));
    lastPage = pagination.last_page || page;
    page += 1;
  } while (page <= lastPage && page <= maxPages);

  return reports
    .filter((report) =>
      report.fights?.some(
        (fight) =>
          fight.encounterID === BELOREN_ENCOUNTER_ID &&
          fight.kill === false &&
          (difficulty === undefined || difficulty === null || fight.difficulty === difficulty),
      ),
    )
    .map((report) => ({
      code: report.code,
      title: report.title,
      startTime: report.startTime,
      endTime: report.endTime,
      belorenFightCount: report.fights.filter(
        (fight) =>
          fight.encounterID === BELOREN_ENCOUNTER_ID &&
          (difficulty === undefined || difficulty === null || fight.difficulty === difficulty),
      ).length,
      belorenWipeCount: report.fights.filter(
        (fight) =>
          fight.encounterID === BELOREN_ENCOUNTER_ID &&
          fight.kill === false &&
          (difficulty === undefined || difficulty === null || fight.difficulty === difficulty),
      ).length,
    }))
    .sort((a, b) => b.startTime - a.startTime);
}

export async function fetchBelorenReportData(reportUrl = REPORT_URL) {
  const shell = await fetchBelorenReportShell(reportUrl);
  const { reportUrl: normalizedReportUrl, reportCode, requestedFightId, report } = shell;
  const token = await getAccessToken();
  const belorenFights = report.fights
    .filter((item) => item.encounterID === BELOREN_ENCOUNTER_ID)
    .sort((a, b) => a.id - b.id);

  if (!belorenFights.length) {
    throw new Error("No Beloren pulls found in the report.");
  }

  const belorenFightIds = belorenFights.map((item) => item.id);
  const eventStartTime = Math.min(...belorenFights.map((item) => item.startTime));
  const eventEndTime = Math.max(...belorenFights.map((item) => item.endTime));
  const bundle = await fetchEventBundle(token, {
    code: reportCode,
    fightIds: belorenFightIds,
    startTime: eventStartTime,
    endTime: eventEndTime,
  });
  const phaseDamageDoneTables = await fetchPhaseDamageTables(token, {
    code: reportCode,
    fights: belorenFights,
    phaseId: 2,
  });

  return {
    reportUrl: normalizedReportUrl,
    reportCode,
    requestedFightId,
    fetchedAt: new Date().toISOString(),
    report,
    bundle,
    phaseDamageDoneTables,
  };
}

export async function fetchBelorenFightData(reportUrl = REPORT_URL, fightIds = []) {
  const shell = await fetchBelorenReportShell(reportUrl);
  const { reportUrl: normalizedReportUrl, reportCode, requestedFightId, report } = shell;
  const token = await getAccessToken();
  const idSet = new Set(fightIds.map(Number).filter(Number.isFinite));
  const belorenFights = report.fights
    .filter((item) => item.encounterID === BELOREN_ENCOUNTER_ID && idSet.has(item.id))
    .sort((a, b) => a.id - b.id);

  if (!belorenFights.length) {
    throw new Error("No matching Beloren pulls found in the report.");
  }

  const bundle = await fetchEventBundle(token, {
    code: reportCode,
    fightIds: belorenFights.map((item) => item.id),
    startTime: Math.min(...belorenFights.map((item) => item.startTime)),
    endTime: Math.max(...belorenFights.map((item) => item.endTime)),
  });
  const phaseDamageDoneTables = await fetchPhaseDamageTables(token, {
    code: reportCode,
    fights: belorenFights,
    phaseId: 2,
  });

  return {
    reportUrl: normalizedReportUrl,
    reportCode,
    requestedFightId,
    fetchedAt: new Date().toISOString(),
    report,
    bundle,
    phaseDamageDoneTables,
  };
}

export async function analyzeBeloren(reportUrl = REPORT_URL, options = {}) {
  const data = await fetchBelorenReportData(reportUrl);
  return analyzeBelorenData(data, { ...options, reportUrl });
}

export function analyzeBelorenData(data, options = {}) {
  const reportUrl = options.reportUrl || data.reportUrl || `https://www.warcraftlogs.com/reports/${data.reportCode}`;
  const { reportCode, fightId } = parseReportUrl(reportUrl);
  const report = data.report;
  const selectedFightId =
    options.pullId === "latest"
      ? null
      : options.pullId !== undefined && options.pullId !== null && options.pullId !== ""
        ? Number(options.pullId)
        : fightId || data.requestedFightId;
  const fight = pickFight(report, selectedFightId);
  const actorById = new Map(report.masterData.actors.map((actor) => [actor.id, actor]));
  const abilityById = new Map((report.masterData.abilities || []).map((ability) => [ability.gameID, ability]));
  const belorenFights = report.fights
    .filter((item) => item.encounterID === BELOREN_ENCOUNTER_ID)
    .sort((a, b) => a.id - b.id);
  const belorenFightNumberById = new Map(belorenFights.map((item, index) => [item.id, index + 1]));
  const belorenFightIds = belorenFights.map((item) => item.id);
  const eventStartTime = Math.min(...belorenFights.map((item) => item.startTime));
  const eventEndTime = Math.max(...belorenFights.map((item) => item.endTime));
  const scope = options.scope === "night" ? "night" : "pull";
  const fullBundle = data.bundle;
  const debuffsByFight = rowsByFight(fullBundle.debuffs);
  const damageTakenByFight = rowsByFight(fullBundle.damageTaken);
  const deathsByFight = rowsByFight(fullBundle.deaths);
  const castsByFight = rowsByFight(fullBundle.casts);
  const interruptsByFight = rowsByFight(fullBundle.interrupts);
  const healingByFight = rowsByFight(fullBundle.healing);
  const combatantInfoByFight = rowsByFight(fullBundle.combatantInfo);

  function analyzeFight(item) {
    const debuffs = debuffsByFight.get(item.id) || [];
    const damageTaken = damageTakenByFight.get(item.id) || [];
    const deaths = deathsByFight.get(item.id) || [];
    const casts = castsByFight.get(item.id) || [];
    const interrupts = interruptsByFight.get(item.id) || [];
    const healing = healingByFight.get(item.id) || [];
    const combatantInfo = combatantInfoByFight.get(item.id) || [];
    const specByActor = buildSpecByActor(combatantInfo);
    const presentPlayers = presentPlayersFromCombatantInfo(actorById, specByActor, combatantInfo);
    const featherTimeline = buildFeatherTimeline(debuffs);
    const { findings, mistakes, contributions } = buildFindings({
      fight: item,
      actorById,
      specByActor,
      damageEvents: damageTaken,
      featherTimeline,
    });
    const deathRecords = buildDeaths({ fight: item, actorById, deaths, damageEvents: damageTaken, mistakes });
    const wipeFailures = findings.filter((finding) => finding.category === "wipe_level_failure");
    const echoLeaderboard = buildEchoLeaderboard({ actorById, presentPlayers, contributions, mistakes, deaths: deathRecords });
    const quillLeaderboard = buildQuillLeaderboard({ actorById, presentPlayers, damageEvents: damageTaken, featherTimeline });
    const eruptionInterruptLeaderboard = buildEruptionInterruptLeaderboard({ actorById, presentPlayers, interrupts });
    const consumableLeaderboard = buildConsumableLeaderboard({ actorById, abilityById, presentPlayers, healingEvents: healing });
    const eggDamageLeaderboard = buildEggDamageLeaderboard({
      actorById,
      presentPlayers,
      tableEntries: data.phaseDamageDoneTables?.[item.id] || [],
    });

    return {
      fight: item,
      debuffs,
      damageTaken,
      deaths,
      casts,
      interrupts,
      healing,
      combatantInfo,
      presentPlayers,
      featherTimeline,
      findings,
      mistakes,
      contributions,
      deathRecords,
      wipeFailures,
      echoLeaderboard,
      quillLeaderboard,
      eruptionInterruptLeaderboard,
      consumableLeaderboard,
      eggDamageLeaderboard,
    };
  }

  const output = {
    report: {
      code: report.code,
      title: report.title,
      guild: report.guild || null,
      pulls: report.fights
        .filter((item) => item.encounterID === BELOREN_ENCOUNTER_ID)
        .sort((a, b) => b.id - a.id)
        .map((item) => ({
          id: item.id,
          wipeNumber: belorenFightNumberById.get(item.id),
          name: item.name,
          difficulty: item.difficulty,
          kill: item.kill,
          bossPercentage: item.bossPercentage,
          duration: formatTime(item.endTime - item.startTime),
        })),
      liveLog: liveLogStatus(report, belorenFights),
    },
    spells: buildSpellMap(abilityById),
    fight: {
      id: fight.id,
      wipeNumber: belorenFightNumberById.get(fight.id),
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
    const selectedAnalysis = analyzeFight(fight);
    const echoLeaderboard = selectedAnalysis.echoLeaderboard;
    const eruptionInterruptLeaderboard = selectedAnalysis.eruptionInterruptLeaderboard;
    const consumableLeaderboard = selectedAnalysis.consumableLeaderboard;
    const eggDamageLeaderboard = selectedAnalysis.eggDamageLeaderboard;
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
      combatantInfo: selectedAnalysis.combatantInfo.length,
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
      correctQuillSoakLeaderboard: selectedAnalysis.quillLeaderboard,
      eruptionInterruptLeaderboard,
      consumableLeaderboard,
      eggDamageLeaderboard,
    };
  }

  if (scope === "night") {
    const nightBundle = fullBundle;
    const analyses = belorenFights.map((item) => analyzeFight(item));

    output.fetchedEventCounts = {
      nightDebuffs: nightBundle.debuffs.length,
      nightDamageTaken: nightBundle.damageTaken.length,
      nightDeaths: nightBundle.deaths.length,
      nightCasts: nightBundle.casts.length,
      nightInterrupts: nightBundle.interrupts.length,
      nightHealing: nightBundle.healing.length,
      nightCombatantInfo: nightBundle.combatantInfo.length,
    };
    output.wholeNight = {
      pullCount: analyses.length,
      wipeCount: analyses.filter((item) => !item.fight.kill).length,
      killCount: analyses.filter((item) => item.fight.kill).length,
      combatDurationMs: analyses.reduce((total, item) => total + (item.fight.endTime - item.fight.startTime), 0),
      correctEchoSoakLeaderboard: mergeEchoLeaderboards(
        actorById,
        analyses.map((item) => item.echoLeaderboard),
      ),
      correctQuillSoakLeaderboard: mergeQuillLeaderboards(
        actorById,
        analyses.map((item) => item.quillLeaderboard),
      ),
      eruptionInterruptLeaderboard: mergeInterruptLeaderboards(
        actorById,
        analyses.map((item) => item.eruptionInterruptLeaderboard),
      ),
      eggDamageLeaderboard: mergeEggDamageLeaderboards(
        actorById,
        analyses.map((item) => item.eggDamageLeaderboard),
      ),
      consumableLeaderboard: mergeConsumableLeaderboards(
        actorById,
        analyses.map((item) => item.consumableLeaderboard),
      ),
      mistakeLeaderboard: buildMistakeLeaderboard(
        actorById,
        uniquePlayers(analyses.flatMap((item) => item.presentPlayers)),
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
      immunitySoaks: row.immunitySoaks || 0,
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
