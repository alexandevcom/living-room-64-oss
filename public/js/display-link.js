// Sends the TV page to a second screen: the TV's own browser at /display.
// The menus are mirrored as HTML (sharp at any size, almost no delay); the emulator's picture and sound
// go as a low-latency WebRTC stream, encoded by the phone's hardware.

const displays = new Map(); // display id -> { pc }
let send = () => {};
let observer = null;
let timer = 0;

// Problems on the console show up in the server's log, like the display's.
const report = (...parts) => navigator.sendBeacon?.("/log", ["console:", ...parts].join(" "));

export function initDisplayLink(sendRaw) {
  send = sendRaw;
}

function toDisplay(data, to) {
  send({ t: "to-display", to, data });
}

// The page as HTML, with the emulator iframe swapped for a slot the display fills with the stream.
function snapshot() {
  const app = document.getElementById("app");
  const copy = app.cloneNode(true);
  copy.querySelectorAll("iframe.mp2-frame").forEach((frame) => {
    const slot = document.createElement("div");
    slot.className = "mp2-frame";
    slot.dataset.stream = "";
    frame.replaceWith(slot);
  });
  return { t: "mirror", cls: app.className, pack: app.dataset.pack, html: copy.innerHTML };
}

// Where a node sits under #app, as child indexes, so the display can find its copy.
function pathTo(node) {
  const app = document.getElementById("app");
  const path = [];
  for (let n = node; n && n !== app; n = n.parentNode) {
    if (!n.parentNode) return null;
    path.unshift([...n.parentNode.childNodes].indexOf(n));
  }
  return path;
}

// Most changes are a class flipping (the cursor moving, a vote landing). Those go as a tiny list of attribute
// changes; anything structural sends the whole page again.
let pendingAttrs = [];
let needFull = false;

function mirrorSoon(records) {
  // The game was closed: let go of its stream so the emulator can be freed.
  if (!document.querySelector("iframe.mp2-frame")) displays.forEach((display) => display.media && stopStream(display));
  if (!displays.size) return;
  for (const r of records) {
    if (r.type !== "attributes" || needFull) {
      needFull = true;
      continue;
    }
    const path = pathTo(r.target);
    if (!path || r.target.closest?.("iframe")) needFull = true;
    else pendingAttrs.push({ path, name: r.attributeName });
  }
  if (timer) return;
  // A timer, not requestAnimationFrame: that pauses whenever the console page isn't on screen.
  timer = setTimeout(() => {
    timer = 0;
    if (needFull) toDisplay(snapshot());
    else {
      const seen = new Set();
      const attrs = pendingAttrs
        .filter((a) => !seen.has(a.path.join() + a.name) && seen.add(a.path.join() + a.name))
        .map((a) => {
          let n = document.getElementById("app");
          for (const i of a.path) n = n?.childNodes[i];
          return { path: a.path, name: a.name, value: n?.getAttribute?.(a.name) ?? null };
        });
      if (attrs.length) toDisplay({ t: "attrs", attrs });
    }
    pendingAttrs = [];
    needFull = false;
  }, 16);
}

function watchPage() {
  if (observer) return;
  observer = new MutationObserver(mirrorSoon);
  observer.observe(document.getElementById("app"), { subtree: true, childList: true, attributes: true, characterData: true });
}

export function onDisplayMessage(msg) {
  if (msg.t === "display-join") {
    displays.set(msg.id, {});
    watchPage();
    toDisplay(snapshot(), msg.id);
    stream(msg.id);
  } else if (msg.t === "display-leave") {
    const display = displays.get(msg.id);
    if (display) stopStream(display);
    displays.delete(msg.id);
  } else if (msg.t === "from-display") {
    answer(msg.id, msg.data);
  }
}

function emulator() {
  const win = document.querySelector("iframe.mp2-frame")?.contentWindow;
  const canvas = win?.document?.querySelector("canvas");
  return canvas ? { canvas, audio: win.__audioStream } : null;
}

function stream(id) {
  streamTo(id).catch((e) => report("stream failed:", e?.name, e?.message));
}

// Closing the connection isn't enough: the captured tracks keep the old emulator (and its memory) alive.
function stopStream(display) {
  display.pc?.close();
  display.media?.getTracks().forEach((track) => track.stop());
  display.pc = null;
  display.media = null;
}

async function streamTo(id) {
  const display = displays.get(id);
  if (!display) return;
  stopStream(display);
  const emu = emulator();
  if (!emu) return report("no emulator canvas yet");
  report("streaming", `${emu.canvas.width}x${emu.canvas.height}`, emu.audio ? "with sound" : "without sound");

  const media = emu.canvas.captureStream(60);
  display.media = media;
  const video = media.getVideoTracks()[0];
  video.contentHint = "motion";
  emu.audio?.getAudioTracks().forEach((track) => media.addTrack(track));

  const pc = new RTCPeerConnection(); // same network, so no STUN/TURN servers
  display.pc = pc;
  const sender = pc.addTrack(video, media);
  media.getAudioTracks().forEach((track) => pc.addTrack(track, media));

  // H264 is hardware-encoded on the phone and hardware-decoded on the TV. Chrome only accepts codecs from the
  // receiver's list here, and refuses the whole list if one is missing, so this is best effort.
  try {
    const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
    const codecs = RTCRtpReceiver.getCapabilities("video")?.codecs || [];
    const h264 = codecs.filter((c) => /h264/i.test(c.mimeType));
    if (h264.length) transceiver?.setCodecPreferences?.([...h264, ...codecs.filter((c) => !h264.includes(c))]);
  } catch (e) {
    report("codec preference ignored:", e?.message);
  }

  pc.onicecandidate = (e) => e.candidate && toDisplay({ t: "rtc", candidate: e.candidate.toJSON() }, id);
  await pc.setLocalDescription(await pc.createOffer());
  toDisplay({ t: "rtc", sdp: pc.localDescription.toJSON() }, id);

  // Smooth motion over sharpness, and a size the encoder can keep up with.
  const params = sender.getParameters();
  params.degradationPreference = "maintain-framerate";
  if (params.encodings?.[0]) {
    params.encodings[0].maxBitrate = 8_000_000;
    params.encodings[0].maxFramerate = 60;
    const scale = emu.canvas.width / 1280;
    if (scale > 1) params.encodings[0].scaleResolutionDownBy = scale;
  }
  sender.setParameters(params).catch(() => {});
}

async function answer(id, data) {
  const pc = displays.get(id)?.pc;
  if (!pc || data.t !== "rtc") return;
  if (data.sdp) await pc.setRemoteDescription(data.sdp).catch(() => {});
  if (data.candidate) await pc.addIceCandidate(data.candidate).catch(() => {});
}

// A game started (or the console was restarted after a freeze): stream it to every display.
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.n64 !== "started") return;
  if (displays.size) report("game started, streaming to", displays.size, "display(s)");
  setTimeout(() => displays.forEach((_, id) => stream(id)), 500);
});
