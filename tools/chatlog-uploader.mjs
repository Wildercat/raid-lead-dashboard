#!/usr/bin/env node
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_CHAT_LOG = "C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs\\WoWChatLog.txt";
const SYMBOL_CODES = new Map([
  ["t", "7242384"],
  ["circle", "134635"],
  ["diamond", "340528"],
  ["triangle", "351033"],
  ["cross", "236903"],
]);

const args = parseArgs(process.argv.slice(2));
const server = String(args.server || "http://localhost:4173").replace(/\/$/, "");
const reportUrl = args.reportUrl || args.report || "";
const chatLogPath = args.file || args.path || DEFAULT_CHAT_LOG;
const pollMs = Number(args.pollMs || 500);
const fromStart = Boolean(args.fromStart);
const once = Boolean(args.once);

if (!reportUrl) exitWithUsage("Missing --report-url");
if (!existsSync(chatLogPath)) exitWithUsage(`Chat log not found: ${chatLogPath}`);

const year = new Date().getFullYear();
let position = fromStart ? 0 : statSync(chatLogPath).size;
let pending = [];
let partialLine = "";

console.log(`Watching ${chatLogPath}`);
console.log(`Uploading Lura symbol callouts to ${server}`);

while (true) {
  const size = statSync(chatLogPath).size;
  if (size < position) {
    position = 0;
    partialLine = "";
  }

  if (size > position) {
    const { text, nextPosition } = readNewText(chatLogPath, position, size);
    position = nextPosition;
    consumeText(text);
    await flushEvents();
  }

  if (once) break;
  await delay(pollMs);
}

async function flushEvents() {
  if (!pending.length) return;
  const events = pending;
  pending = [];

  const response = await fetch(`${server}/api/chat-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportUrl, events }),
  });

  if (!response.ok) {
    pending.unshift(...events);
    const body = await response.text().catch(() => "");
    console.error(`Upload failed: HTTP ${response.status} ${body}`);
    return;
  }

  const result = await response.json().catch(() => ({}));
  console.log(`Uploaded ${events.length} event(s). Server has ${result.total ?? "?"}.`);
}

function consumeText(text) {
  const lines = (partialLine + text).split(/\r?\n/);
  partialLine = lines.pop() || "";
  for (const line of lines) {
    const event = parseChatLine(line);
    if (!event) continue;
    pending.push(event);
    console.log(`${new Date(event.timestamp).toLocaleTimeString()} ${event.player}: ${event.callout}`);
  }
}

function parseChatLine(line) {
  const match = line.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s{2}(.*)$/);
  if (!match) return null;
  const [, month, day, hour, minute, second, millisecond, message] = match;
  const raidMatch = message.match(/\|Hchannel:RAID\|h\[(?:Raid Leader|Raid)\]\|h\s+([^:]+):\s*(\d{5,8}|T|Circle|Diamond|Triangle|Cross)\s*$/i);
  if (!raidMatch) return null;

  const fullPlayer = raidMatch[1].trim();
  const callout = raidMatch[2].trim();
  const code = SYMBOL_CODES.get(callout.toLowerCase()) || callout;
  return {
    timestamp: new Date(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(millisecond)).getTime(),
    fullPlayer,
    player: fullPlayer.split("-")[0],
    callout,
    code,
  };
}

function readNewText(file, start, end) {
  const length = end - start;
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, length, start);
  } finally {
    closeSync(fd);
  }
  return { text: buffer.toString("utf8"), nextPosition: end };
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function exitWithUsage(message) {
  console.error(message);
  console.error("");
  console.error("Usage:");
  console.error("  node tools/chatlog-uploader.mjs --report-url <wcl-url> [--server http://localhost:4173] [--file <WoWChatLog.txt>]");
  process.exit(1);
}
