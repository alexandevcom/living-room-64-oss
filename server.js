// Serves the TV and phone pages and relays messages between them.
// The game itself runs in the TV's browser; this server only passes messages along.
import http from "node:http";
import dgram from "node:dgram";
import os from "node:os";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";

const PORT = Number(process.env.PORT) || 3000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "public");
const ROMS = path.join(HERE, "roms"); // Game files stay outside public/ and are only served from /roms/.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".zip": "application/zip",
  ".webmanifest": "application/manifest+json",
};
const ROUTES = { "/": "/play.html", "/tv": "/tv.html", "/display": "/display.html" };

function lanAddress() {
  try {
    const addresses = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal);
    const home = addresses.find((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address));
    return (home || addresses[0])?.address || null;
  } catch {
    // Android (Termux) doesn't let apps list network interfaces.
    return null;
  }
}

// Asks the OS which local address it would use to reach the internet. Works where listing interfaces doesn't.
// A UDP "connect" sends nothing; it only picks a route.
function routeAddress() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    socket.on("error", () => (socket.close(), resolve(null)));
    socket.connect(53, "8.8.8.8", () => {
      const { address } = socket.address();
      socket.close();
      resolve(address);
    });
  });
}

// HOST_IP=192.168.x.y overrides the address shown on the TV and in the QR code.
const HOST = process.env.HOST_IP || lanAddress() || (await routeAddress()) || "localhost";
const PHONE_URL = `http://${HOST}:${PORT}`;

/* ---------- HTTP ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Lets the TV's display page report problems, since there are no dev tools on a TV.
  if (url.pathname === "/log" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk).length > 4000 && req.destroy());
    req.on("end", () => console.log(`[display ${req.socket.remoteAddress}] ${body}`));
    res.writeHead(204);
    return res.end();
  }

  // For the phone's auto-updater: only restart the server when no TV page is open.
  if (url.pathname === "/status") {
    const playing = [...rooms.values()].some((room) => room.host?.readyState === 1);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ playing }));
  }

  // What this machine has: the games whose ROM is in roms/ (only those go on the shelf), and the cover art.
  if (url.pathname === "/library.json") {
    const names = (dir, ext) => readdir(dir).then((files) => files.filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)), () => []);
    const library = { roms: await names(ROMS, ".zip"), covers: await names(path.join(ROOT, "assets", "covers"), ".webp") };
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(library));
  }

  if (url.pathname === "/qr.svg") {
    const svg = await QRCode.toString(url.searchParams.get("data") || PHONE_URL, { type: "svg", margin: 0 });
    res.writeHead(200, { "content-type": TYPES[".svg"] });
    return res.end(svg);
  }

  const base = url.pathname.startsWith("/roms/") ? ROMS : ROOT;
  const file = path.normalize(path.join(base, ROUTES[url.pathname] || url.pathname.replace(/^\/roms/, "")));
  if (!file.startsWith(base)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

/* ---------- WebSocket relay ---------- */

const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new Map(); // code -> { host, players: Map<id, ws>, expire }

function send(ws, msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

function newCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  while (rooms.has(code));
  return code;
}

function hostRoom(ws, wanted) {
  let code = wanted;
  const existing = rooms.get(code);
  if (existing && existing.host?.readyState !== 1) {
    // The TV reconnected: give it its room back.
    clearTimeout(existing.expire);
    existing.host = ws;
    existing.players.forEach((p) => send(p, { t: "host-back" }));
    existing.displays.forEach((d) => (send(d, { t: "host-back" }), send(ws, { t: "display-join", id: d.did })));
  } else {
    code = newCode();
    rooms.set(code, { host: ws, players: new Map(), displays: new Set() });
  }
  ws.role = "host";
  ws.code = code;
  send(ws, { t: "room", code, phoneUrl: PHONE_URL, joinUrl: `${PHONE_URL}/?room=${code}` });
}

// A second screen (the TV's own browser) attaches to the newest open room, so nobody types a code with a remote.
let displayCount = 0;
function attachDisplay(ws) {
  const open = [...rooms.entries()].reverse().find(([, room]) => room.host?.readyState === 1);
  if (!open) return send(ws, { t: "no-room" });
  const [code, room] = open;
  ws.role = "display";
  ws.code = code;
  ws.did = `d${++displayCount}`;
  room.displays.add(ws);
  send(room.host, { t: "display-join", id: ws.did });
}

function joinRoom(ws, { code, id, name }) {
  code = String(code || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(ws, { t: "error", message: `No game with code ${code}. Check the code on the TV.` });
  if (room.host?.readyState !== 1) return send(ws, { t: "error", message: "The TV isn’t connected right now. Try again in a moment." });

  id = String(id).slice(0, 32);
  const previous = room.players.get(id);
  if (previous && previous !== ws) previous.close();
  room.players.set(id, ws);
  ws.role = "player";
  ws.code = code;
  ws.pid = id;
  send(room.host, { t: "join", id, name: String(name || "").slice(0, 24) });
}

wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "host") return hostRoom(ws, msg.code);
    if (msg.t === "join") return joinRoom(ws, msg);
    if (msg.t === "display") return attachDisplay(ws);

    const room = rooms.get(ws.code);
    if (!room) return;
    if (ws.role === "host" && msg.t === "send") {
      if (msg.to) send(room.players.get(msg.to), msg.data);
      else room.players.forEach((p) => send(p, msg.data));
    } else if (ws.role === "host" && msg.t === "to-display") {
      room.displays.forEach((d) => (!msg.to || d.did === msg.to) && send(d, msg.data));
    } else if (ws.role === "player") {
      send(room.host, { t: "input", id: ws.pid, data: msg });
    } else if (ws.role === "display") {
      send(room.host, { t: "from-display", id: ws.did, data: msg });
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.code);
    if (!room) return;
    if (ws.role === "host" && room.host === ws) {
      room.players.forEach((p) => send(p, { t: "host-left" }));
      room.displays.forEach((d) => send(d, { t: "host-left" }));
      room.expire = setTimeout(() => rooms.delete(ws.code), 10 * 60 * 1000);
    } else if (ws.role === "player" && room.players.get(ws.pid) === ws) {
      room.players.delete(ws.pid);
      send(room.host, { t: "leave", id: ws.pid });
    } else if (ws.role === "display") {
      room.displays.delete(ws);
      send(room.host, { t: "display-leave", id: ws.did });
    }
  });
});

// Drop phones that went to sleep without closing their connection.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.alive) return ws.terminate();
    ws.alive = false;
    ws.ping();
  });
}, 15000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Living Room 64 is running\n`);
  console.log(`  TV:      http://localhost:${PORT}/tv`);
  console.log(`  Phones:  ${PHONE_URL}\n`);
});
