import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBeloren } from "../wcl-beloren-analyze.mjs";

const PORT = Number(process.env.PORT || 4173);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_ROOT = join(ROOT, "public");
const analysisCache = new Map();

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

      const scope = body.scope === "night" ? "night" : "pull";
      const cacheKey = JSON.stringify({
        reportUrl: body.reportUrl,
        pullId: scope === "night" ? "night" : body.pullId || "latest",
        scope,
      });
      if (!body.fresh && analysisCache.has(cacheKey)) {
        return sendJson(response, 200, analysisCache.get(cacheKey));
      }

      const result = await analyzeBeloren(body.reportUrl, { pullId: body.pullId || "latest", scope });
      analysisCache.set(cacheKey, result);
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
