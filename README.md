# Raid Lead Dashboard

Warcraft Logs triage dashboard for supported March on Quel'Danas bosses. The app accepts a report URL, analyzes boss wipes, and gives raid leads compact views for the latest wipe, the whole night, and all cached progression for supported guilds.

## Changelog

### 0.3

Backend and progression-focused iteration. This version adds compact server-side report storage for much faster repeat loads, guild-gated All Progression analysis, and several data correctness fixes.

- Massive backend changes to allow near-instant load times and new All Progression tab.
- Immune soaks for correct orbs were not getting counted as immunes; fixed.
- Added toggle for ignoring orb immunes, currently 0 damage hits by orbs.
- Wipe/pull numbers now match WCL numbering.
- Excluded trash from data.
- Added Check now button for new wipes, with loading text/spinner.
- Scan toggle now times out after 3 hours and shows "Scanning paused after 3 hours".
- Scan/check behavior no longer jumps tabs weirdly; manual check on All Prog stayed on All Prog in browser testing.
- Removed baked-in placeholder URL. The app now prompts for a log URL and remembers the last pasted URL via localStorage.
- Added Egg Damage leaderboard to Latest Wipe, Whole Night, and All Prog.
- Leaderboards now include all players present for the pull/night, even at 0.
- Pet kicks are attributed to the pet owner via WCL petOwner.
- Wipe-level frontal labels no longer include player names; evidence still shows who was hit.
- Whole Night / All Prog summary cards now show Attempts, Wipes, and Combat time, and no longer show mistake/consumable user cards.
- All Prog aggregation includes Egg Damage and combat duration.

## Run Locally

1. Copy `.env.example` to `.env`.
2. Add Warcraft Logs client credentials.
3. Start the server:

```bash
npm start
```

The app listens on `PORT` when set, otherwise `4173`.

## Chat Log Uploader

The L'ura Memory Game panel can use local WoW chat log callouts. The uploader tails `WoWChatLog.txt`, parses only matching symbol callouts, and posts those normalized events to the dashboard server.

```bash
npm run chatlog:uploader -- --report-url https://www.warcraftlogs.com/reports/REPORT_CODE
```

Optional flags:

```bash
--server http://localhost:4173
--file "C:\Program Files (x86)\World of Warcraft\_retail_\Logs\WoWChatLog.txt"
--from-start
```

## Deploy

Deploy the `work/` directory as the app root.

Required environment variables:

```bash
WARCRAFT_LOGS_CLIENT_ID
WARCRAFT_LOGS_CLIENT_SECRET
```

Start command:

```bash
npm start
```

Health check:

```text
/api/health
```

For Render, `render.yaml` is included. Set the two Warcraft Logs env vars in the service dashboard after creating the service.

