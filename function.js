"use strict";

const entry = require("./index.js");

if (require.main === module && typeof entry.handleNodeRequest === "function") {
  const http = require("node:http");
  const port = Number(process.env.PORT || 8787);
  http.createServer((req, res) => {
    entry.handleNodeRequest(req, res).catch((err) => {
      res.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(`Internal Server Error: ${err.message}`);
    });
  }).listen(port, () => {
    console.log(`Server running at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  ...entry,
  fetch: entry.fetch || entry.handleFetchRequest,
  handler: entry.handler || entry.handleFetchRequest,
  default: entry.fetch || entry.handleFetchRequest,
};
