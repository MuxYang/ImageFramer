const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "assests");
const DEFAULT_FILE = "index.html";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
};

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function getCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html" || ext === ".json") {
    return "no-store";
  }
  return "public, max-age=31536000, immutable";
}

function normalizeRequestPath(inputPath) {
  const urlPath = decodeURIComponent(inputPath || "/").replace(/\\/g, "/");
  const routePath = urlPath === "/" ? `/${DEFAULT_FILE}` : urlPath;
  const resolvedPath = path.resolve(ROOT_DIR, `.${routePath}`);

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    return null;
  }
  return resolvedPath;
}

async function readStaticFile(inputPath) {
  const resolvedPath = normalizeRequestPath(inputPath);
  if (!resolvedPath) {
    return {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: Buffer.from("Forbidden", "utf8"),
    };
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      throw new Error("Not a file");
    }

    const content = await fs.readFile(resolvedPath);
    return {
      status: 200,
      headers: {
        "Content-Type": getContentType(resolvedPath),
        "Cache-Control": getCacheControl(resolvedPath),
        "X-Content-Type-Options": "nosniff",
      },
      body: content,
    };
  } catch {
    return {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: Buffer.from("Not Found", "utf8"),
    };
  }
}

async function handleNodeRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      Allow: "GET, HEAD",
    });
    res.end("Method Not Allowed");
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const result = await readStaticFile(url.pathname);
  res.writeHead(result.status, result.headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(result.body);
}

async function handleFetchRequest(request) {
  const method = request.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        Allow: "GET, HEAD",
      },
    });
  }

  const url = new URL(request.url);
  const result = await readStaticFile(url.pathname);
  return new Response(method === "HEAD" ? null : result.body, {
    status: result.status,
    headers: result.headers,
  });
}

function startLocalServer() {
  const port = Number(process.env.PORT || 8787);
  const server = http.createServer((req, res) => {
    handleNodeRequest(req, res).catch((err) => {
      res.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(`Internal Server Error: ${err.message}`);
    });
  });

  server.listen(port, () => {
    console.log(`Server running at http://127.0.0.1:${port}`);
  });
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(handleFetchRequest(event.request));
  });
}

if (require.main === module) {
  startLocalServer();
}

module.exports = {
  handleFetchRequest,
  handleNodeRequest,
  fetch: handleFetchRequest,
  handler: handleFetchRequest,
  startLocalServer,
};
