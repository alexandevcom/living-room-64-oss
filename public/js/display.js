// The TV's own browser as a screen for the console phone. It shows a live copy of the console's page
// and plays the emulator stream in the spot where the console has the emulator. Nothing runs here.

// No dev tools on a TV: report what happens to the server's log.
const report = (...parts) => navigator.sendBeacon?.("/log", parts.join(" "));
addEventListener("error", (e) => report("error:", e.message, e.filename, e.lineno));
addEventListener("unhandledrejection", (e) => report("rejection:", e.reason?.message || e.reason));
report("page loaded", navigator.userAgent);

const app = document.getElementById("app");
const start = document.querySelector("[data-start]");
const statusLine = document.querySelector("[data-status]");
const soundButton = document.querySelector("[data-sound]");

const video = document.createElement("video");
video.className = "stream";
video.autoplay = true;
video.playsInline = true;
video.muted = true; // muted video may autoplay; sound comes on after OK is pressed

let ws = null;
let pc = null;
let pending = [];
let started = false;
let mirrored = false;

// The start screen only covers the page until the console's page arrives.
function status(text) {
  statusLine.textContent = text;
  start.hidden = mirrored;
}

// The browser only allows sound and full screen after a key press on the remote.
function begin(e) {
  if (started) return;
  report("start pressed via", e?.type, e?.key || "");
  soundButton.hidden = true;
  started = true;
  video.muted = false;
  video.play().catch(() => {});
  document.documentElement.requestFullscreen?.().catch(() => {});
  status("Looking for the console…");
}
// The selected button takes the remote's OK; any key or click anywhere works too.
soundButton.addEventListener("click", begin);
addEventListener("keydown", begin);
addEventListener("click", begin);
addEventListener("load", () => soundButton.focus());

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => (report("socket open"), ws.send(JSON.stringify({ t: "display" })));
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    mirrored = false;
    status("Looking for the console…");
    setTimeout(connect, 2000);
  };
}

function handle(msg) {
  if (msg.t !== "mirror") report("message:", msg.t, msg.sdp ? "sdp" : "", msg.candidate ? "candidate" : "");
  if (msg.t === "no-room") {
    status("Open Living Room 64 on the console phone and tap “Open the room”.");
    ws.close(); // try again shortly
  } else if (msg.t === "host-left") {
    mirrored = false;
    status("The console lost its connection. Hang tight…");
    // If it doesn't come back (app restarted, new room), go looking for the newest room again.
    setTimeout(() => !mirrored && ws.close(), 4000);
  } else if (msg.t === "mirror") {
    mirror(msg);
  } else if (msg.t === "attrs") {
    // Small updates (the cursor moving): change just those attributes.
    for (const { path, name, value } of msg.attrs) {
      let node = app;
      for (const i of path) node = node?.childNodes[i];
      if (!node?.setAttribute) continue;
      if (value === null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
  } else if (msg.t === "rtc") {
    rtc(msg);
  }
}

/* ---------- Mirroring the page ----------
   Patch the DOM instead of replacing it, so animations don't restart and the video keeps playing. */

function mirror({ cls, pack, html }) {
  const next = document.createElement("div");
  next.innerHTML = html;
  app.className = cls;
  app.dataset.pack = pack;
  patchChildren(app, next);
  const slot = app.querySelector("[data-stream]");
  if (slot && video.parentNode !== slot) {
    slot.append(video);
    video.play().catch(() => {});
  }
  if (!mirrored) {
    report("first mirror", app.querySelectorAll(".box").length, "boxes");
    mirrored = true;
    status("");
  }
}

function patchChildren(parent, next) {
  const want = [...next.childNodes];
  want.forEach((node, i) => {
    const cur = parent.childNodes[i];
    if (!cur) parent.append(node);
    else if (cur.nodeType !== node.nodeType || cur.nodeName !== node.nodeName) parent.replaceChild(node, cur);
    else patchNode(cur, node);
  });
  while (parent.childNodes.length > want.length) parent.lastChild.remove();
}

function patchNode(cur, node) {
  if (cur.nodeType !== 1) {
    if (cur.nodeValue !== node.nodeValue) cur.nodeValue = node.nodeValue;
    return;
  }
  for (const { name } of [...cur.attributes]) if (!node.hasAttribute(name)) cur.removeAttribute(name);
  for (const { name, value } of [...node.attributes]) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
  if ("stream" in cur.dataset) return; // the video lives here; leave its children alone
  patchChildren(cur, node);
}

/* ---------- The game stream ---------- */

async function rtc(msg) {
  if (msg.sdp) {
    pc?.close();
    pc = new RTCPeerConnection();
    pc.ontrack = (e) => {
      // Play frames as soon as they arrive; a party game cares more about delay than smoothness.
      try {
        e.receiver.jitterBufferTarget = 0;
      } catch {}
      try {
        e.receiver.playoutDelayHint = 0;
      } catch {}
      video.srcObject = e.streams[0];
      video.play().catch(() => {});
    };
    pc.onicecandidate = (e) => e.candidate && ws.send(JSON.stringify({ t: "rtc", candidate: e.candidate.toJSON() }));
    await pc.setRemoteDescription(msg.sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    ws.send(JSON.stringify({ t: "rtc", sdp: pc.localDescription.toJSON() }));
    pending.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
    pending = [];
  }
  if (msg.candidate) {
    if (pc?.remoteDescription) pc.addIceCandidate(msg.candidate).catch(() => {});
    else pending.push(msg.candidate);
  }
}

connect();
