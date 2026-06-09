#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 41738);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function resolveRequest(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = cleanPath.replace(/^\/+/, "");
  const target = path.resolve(repoRoot, relative);

  if (target !== repoRoot && !target.startsWith(`${repoRoot}${path.sep}`)) {
    return null;
  }

  return target;
}

const server = http.createServer((req, res) => {
  if ((req.url || "/").split("?")[0] === "/") {
    redirect(res, "/docs/demo/");
    return;
  }

  const target = resolveRequest(req.url || "/");
  if (!target) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(target, (statError, stats) => {
    const filePath = !statError && stats.isDirectory() ? path.join(target, "index.html") : target;

    fs.readFile(filePath, (error, data) => {
      if (error) {
        send(res, 404, "Not found");
        return;
      }

      const type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      send(res, 200, data, type);
    });
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Set PORT=41739 or stop the existing process.`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AgentForge visual demo: http://127.0.0.1:${port}/`);
});
