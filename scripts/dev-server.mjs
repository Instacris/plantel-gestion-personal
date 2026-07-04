/* Servidor de desarrollo local: sirve el frontend estático y monta las mismas
   funciones de /api que usa Vercel en producción.
   Uso: npm run dev  →  http://localhost:3000 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import signup from "../api/signup.js";
import signin from "../api/signin.js";
import state from "../api/state.js";
import reset from "../api/reset.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 3000;

const ROUTES = { signup, signin, state, reset };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/\/+$/, "");
    const handler = ROUTES[name];
    if (!handler) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "No encontrado" }));
    }
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: "Error del servidor" })); }
    }
    return;
  }

  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, "index.html")) {
    res.statusCode = 403;
    return res.end("Prohibido");
  }
  try {
    const data = await readFile(file);
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("No encontrado");
  }
});

server.listen(PORT, () => console.log(`Dev server en http://localhost:${PORT}`));
