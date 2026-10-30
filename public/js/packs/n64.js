// N64 games: the real cartridge in an emulator on the TV. Each phone is an N64 controller.
import { esc, sticker, ask } from "../shared.js";
import { message } from "../ui.js";

const PORTS = 4;
// EmulatorJS input ids for the N64. The stick and C buttons are analog (0..0x7fff).
const BUTTONS = { a: 0, b: 1, start: 3, l: 10, r: 11, z: 12, cr: 20, cl: 21, cd: 22, cu: 23 };
const STICK = { right: 16, left: 17, down: 18, up: 19 };
const MAX = 0x7fff;

const CHARACTERS = [
  { name: "Mario", color: "#e52521" },
  { name: "Luigi", color: "#3fae49" },
  { name: "Peach", color: "#f58cc4" },
  { name: "Yoshi", color: "#7bc943" },
  { name: "Wario", color: "#f5c400" },
  { name: "DK", color: "#9b5a2b" },
];

// Reads N64 RAM straight out of the emulator's WebAssembly memory.
class Ram {
  constructor(frame, map) {
    this.frame = frame;
    this.map = map;
    this.base = -1;
    this.buffer = null;
    this.lastSearch = 0;
  }

  heap() {
    return this.frame.contentWindow?.EJS_emulator?.Module?.HEAPU8;
  }

  // Drop the reference to the emulator's memory, so a replaced emulator can be freed.
  forget() {
    this.buffer = null;
    this.base = -1;
  }

  ready() {
    const heap = this.heap();
    if (!heap) return false;
    if (heap.buffer === this.buffer && this.base >= 0) return true;
    if (Date.now() - this.lastSearch < 2000) return false;
    this.lastSearch = Date.now();
    this.buffer = heap.buffer;
    this.base = -1;
    // The emulator stores each 32-bit N64 word little-endian, so a word-aligned 32-bit view reads the marker as-is.
    // indexOf runs natively; a byte-by-byte loop in JavaScript took seconds on a phone and froze the page.
    const words = new Uint32Array(heap.buffer, 0, heap.length >>> 2);
    const [first, ...rest] = this.map.marker;
    for (let i = words.indexOf(first); i !== -1; i = words.indexOf(first, i + 1)) {
      if (rest.every((w, k) => words[i + 1 + k] === w)) {
        this.base = i * 4 - 0x400;
        return true;
      }
    }
    return false;
  }

  u8(address) {
    return this.heap()[this.base + ((address & 0x7fffff) ^ 3)];
  }

  s16(address) {
    const v = (this.u8(address) << 8) | this.u8(address + 1);
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  // { board: false } outside a board, otherwise whose turn it is and every player's slot.
  read() {
    const RAM = this.map;
    if (!this.ready() || this.u8(RAM.board) !== 2) return { board: false };
    const players = [0, 1, 2, 3].map((i) => {
      const s = RAM.players + i * RAM.size;
      return { port: this.u8(s + 3), chr: this.u8(s + 4), cpu: (this.u8(s + 7) & 1) === 1, coins: this.s16(s + 8), stars: this.s16(s + 14) };
    });
    const turn = this.u8(RAM.turn);
    if (turn > 3 || players.some((p) => p.chr >= CHARACTERS.length)) return { board: false };
    return { board: true, turn, players };
  }
}

// The latest turn save is kept in the TV browser, so a reloaded page can pick the game up again.
function saveStore(key, mode, value) {
  return new Promise((resolve) => {
    const open = indexedDB.open("couch-club", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("saves");
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const store = open.result.transaction("saves", mode === "put" ? "readwrite" : "readonly").objectStore("saves");
      const req = mode === "put" ? store.put(value, key) : store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    };
  });
}

const KEEP_SAVES = 4;
const FROZEN_AFTER = 4000; // ms without a new frame

class Host {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;
    this.port = {}; // player id -> controller port 0..3
    ctx.ids.slice(0, PORTS).forEach((id, i) => (this.port[id] = i));
    this.vip = ctx.ids[0];
    this.sent = {}; // player id -> { key, at } of the last live update
    this.saves = []; // newest first: { label, at, state }
    this.stored = null; // the save kept in the browser from an earlier session
    this.lastTurn = null;
    this.frames = { n: -1, at: Date.now() };
    this.frozen = false;
    this.onMessage = (e) => {
      if (e.origin !== location.origin || e.data?.n64 !== "started") return;
      this.running = true;
      this.el.querySelector(".mp2-loading")?.remove();
      this.el.querySelector(".mp2-legend")?.classList.add("is-fading");
      this.frames = { n: -1, at: Date.now() };
      this.poll ||= setInterval(() => this.watch(), 300);
      const after = this.afterStart;
      this.afterStart = null;
      if (after) setTimeout(after, 800);
    };
  }

  mount(el) {
    this.el = el;
    const players = Object.entries(this.port).map(([id, port]) => ({ p: this.ctx.players[id], port }));
    el.innerHTML = `
      <iframe class="mp2-frame" src="${this.src()}" allow="autoplay; gamepad; fullscreen; screen-wake-lock"></iframe>
      <div class="mp2-loading"><p class="splash-title">${esc(this.game.title)}</p><p>Loading the cartridge…</p></div>
      <ol class="mp2-legend">
        ${players.map(({ p, port }) => `<li>${sticker(p, "sm")}<b>${esc(p.name)}</b><span>P${port + 1}</span></li>`).join("")}
      </ol>
      <p class="mp2-note" hidden></p>`;
    this.frame = el.querySelector(".mp2-frame");
    this.ram = this.game.ram ? new Ram(this.frame, this.game.ram) : null;
    addEventListener("message", this.onMessage);
    saveStore(this.game.id, "get").then((s) => (this.stored = s ? { label: s.label, at: s.at } : null));
  }

  src() {
    return `/n64.html?rom=${encodeURIComponent(`/roms/${this.game.id}.zip`)}&name=${encodeURIComponent(this.game.title)}`;
  }

  emulator() {
    return this.frame?.contentWindow?.EJS_emulator;
  }

  start() {
    this.ctx.ids.forEach((id) =>
      this.ctx.view(id, id in this.port ? { stage: "pad", port: this.port[id] + 1, vip: id === this.vip } : { stage: "full" })
    );
  }

  note(text, sticky = false) {
    const el = this.el.querySelector(".mp2-note");
    el.textContent = text;
    el.hidden = !text;
    clearTimeout(this.noteTimer);
    if (text && !sticky) this.noteTimer = setTimeout(() => (el.hidden = true), 4000);
  }

  watch() {
    this.checkFrozen();
    let state;
    try {
      state = this.ram ? this.ram.read() : { board: false };
    } catch {
      state = { board: false };
    }
    // Save at the start of every turn, so a freeze only costs one turn.
    const turn = state.board ? state.turn : null;
    if (turn !== null && turn !== this.lastTurn && !this.frozen) this.saveTurn(state);
    this.lastTurn = turn;
    this.tellPhones(state);
  }

  checkFrozen() {
    let n;
    try {
      n = this.emulator()?.gameManager?.getFrameNum();
    } catch {
      n = undefined;
    }
    if (n !== this.frames.n) this.frames = { n, at: Date.now() };
    const frozen = Date.now() - this.frames.at > FROZEN_AFTER;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    const vip = this.ctx.players[this.vip]?.name || "The VIP";
    this.note(frozen ? `The game stopped responding. ${vip} can open Menu on their phone and go back to the last save.` : "", frozen);
    this.sent = {};
  }

  saveTurn(state) {
    return this.save(`${CHARACTERS[state.players[state.turn].chr].name}’s turn`);
  }

  // Keeps the last few saves in memory and the newest one in the browser.
  async save(what) {
    let data;
    try {
      data = await this.emulator().gameManager.getState();
    } catch {
      return false;
    }
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const save = { label: `${what} (${time})`, at: Date.now(), state: data };
    this.saves = [save, ...this.saves].slice(0, KEEP_SAVES);
    saveStore(this.game.id, "put", save);
    this.stored = null; // this session's saves replace the one from before
    this.sent = {};
    return true;
  }

  // Tell each phone whose turn it is and how its own character is doing. The VIP also gets the menu options.
  tellPhones(state) {
    Object.entries(this.port).forEach(([id, port]) => {
      let data = { board: false };
      if (state.board) {
        const mine = state.players.find((p) => !p.cpu && p.port === port);
        const current = state.players[state.turn];
        data = {
          board: true,
          me: mine ? { chr: mine.chr, coins: mine.coins, stars: mine.stars } : null,
          turn: { chr: current.chr, cpu: current.cpu, mine: current === mine },
        };
      }
      if (id === this.vip) {
        data.frozen = this.frozen;
        data.saves = this.saves.map((s) => s.label);
        data.stored = this.stored?.label || null;
      }
      const key = JSON.stringify(data);
      const last = this.sent[id];
      // Resend now and then so a phone that reconnected catches up.
      if (last?.key === key && Date.now() - last.at < 3000) return;
      this.sent[id] = { key, at: Date.now() };
      this.ctx.live(id, data);
    });
  }

  // Go back to a turn save. A frozen emulator is reloaded first.
  async restore(which) {
    let save = this.saves[which];
    if (which === "stored") save = await saveStore(this.game.id, "get");
    if (!save) return;
    if (typeof which === "number") this.saves = this.saves.slice(which);
    const apply = () => {
      try {
        this.emulator().gameManager.loadState(save.state);
        this.note(`Back to ${save.label}`);
      } catch {
        this.note("That save couldn’t be loaded.");
      }
      this.lastTurn = null;
      this.sent = {};
    };
    if (this.frozen) this.reload(apply);
    else apply();
  }

  reload(after) {
    this.afterStart = after;
    this.frozen = false;
    this.note("Restarting the console…", true);
    this.running = false;
    this.ram?.forget();
    this.frame.src = this.src();
  }

  menu(data) {
    if (data.menu === "restore") return this.restore(data.save);
    if (data.menu === "save" && !this.frozen) return this.save("your save").then((ok) => this.note(ok ? "Game saved" : "Couldn’t save right now"));
    if (data.menu === "reset") {
      if (this.frozen) return this.reload(null);
      try {
        this.emulator().gameManager.restart();
        this.note("Console reset");
      } catch {
        this.reload(null);
      }
    }
  }

  // Input that reaches the emulator core before the game has started can hang it, so it waits until then.
  press(port, input, value) {
    if (!this.running) return;
    this.frame?.contentWindow?.pad?.(port, input, value);
  }

  input(id, data) {
    const port = this.port[id];
    if (port === undefined) return;
    if (data.quit) return id === this.vip && this.ctx.quit();
    if (data.menu) return id === this.vip && this.menu(data);
    if (data.b in BUTTONS) {
      const input = BUTTONS[data.b];
      this.press(port, input, data.v ? (input >= 16 ? MAX : 1) : 0);
    }
    if (typeof data.x === "number" && typeof data.y === "number") {
      const x = Math.max(-1, Math.min(1, data.x));
      const y = Math.max(-1, Math.min(1, data.y));
      this.press(port, STICK.right, Math.round(Math.max(0, x) * MAX));
      this.press(port, STICK.left, Math.round(Math.max(0, -x) * MAX));
      this.press(port, STICK.down, Math.round(Math.max(0, y) * MAX));
      this.press(port, STICK.up, Math.round(Math.max(0, -y) * MAX));
    }
  }

  // A phone that drops out shouldn't leave a button held down.
  leave(id) {
    const port = this.port[id];
    if (port === undefined) return;
    Object.values(BUTTONS).concat(Object.values(STICK)).forEach((input) => this.press(port, input, 0));
  }

  // Free the emulator's memory before the next game: phone browsers only fit a few emulators at once,
  // and anything still pointing at the old one keeps it alive.
  destroy() {
    clearInterval(this.poll);
    clearTimeout(this.noteTimer);
    removeEventListener("message", this.onMessage);
    this.ram?.forget();
    this.ram = null;
    this.saves = [];
    if (this.frame) {
      this.frame.src = "about:blank";
      this.frame.remove();
      this.frame = null;
    }
  }
}

/* ---------- Phone: the controller ---------- */

// Held sideways like a real N64 pad: stick under the left thumb, A and B under the right thumb,
// C buttons above them, the rarely used L, Z, R and Start along the top edge.
function phone(view, el, send) {
  if (view.stage !== "pad") return message(el, { title: "Watch the TV", text: "All four controllers are taken. You’re up next round." });

  el.innerHTML = `
    <div class="pad">
      <div class="pad-top">
        <span class="pad-status">${view.port ? `<b class="pad-port">P${view.port}</b>` : ""}<span class="pad-me ${view.home ? "is-hint" : ""}">${view.home ? esc(view.vip ? "Stick to choose · A to play" : `${view.vipName} picks the game`) : ""}</span></span>
        <button class="pad-btn pad-small pad-start" data-b="start">Start</button>
        <button class="pad-small pad-full" data-act="full" aria-label="Full screen">⛶</button>
        ${view.vip ? (view.home ? `<button class="pad-small pad-vote" data-act="vote">Vote</button><button class="pad-small pad-menu" data-act="list">Games</button>` : `<button class="pad-small pad-menu" data-act="menu">Menu</button>`) : ""}
      </div>
      <button class="pad-btn pad-shoulder pad-l" data-b="l">L</button>
      <button class="pad-btn pad-shoulder pad-r" data-b="r">R</button>
      <p class="pad-turn" aria-live="polite"></p>
      <div class="pad-zone" aria-label="Control stick">
        <div class="pad-base"><div class="pad-knob"></div></div>
      </div>
      <div class="pad-face">
        <button class="pad-btn pad-c" data-b="cu" style="--r:19vmin;--b:63vmin" aria-label="C up">▲</button>
        <button class="pad-btn pad-c" data-b="cl" style="--r:29vmin;--b:53vmin" aria-label="C left">◀</button>
        <button class="pad-btn pad-c" data-b="cr" style="--r:9vmin;--b:53vmin" aria-label="C right">▶</button>
        <button class="pad-btn pad-c" data-b="cd" style="--r:19vmin;--b:43vmin" aria-label="C down">▼</button>
        <button class="pad-btn pad-b" data-b="b" style="--r:46vmin;--b:33vmin">B</button>
        <button class="pad-btn pad-a" data-b="a" style="--r:19vmin;--b:21vmin">A</button>
        <button class="pad-btn pad-z" data-b="z" style="--r:44vmin;--b:10vmin">Z</button>
      </div>
      <p class="pad-hint">Turn your phone sideways for the best grip.</p>
      <div class="pad-sheet" hidden></div>
    </div>`;

  const pad = el.querySelector(".pad");
  pad.addEventListener("contextmenu", (e) => e.preventDefault());

  // Full screen and sideways, on the first touch and from the button. iPhones can't do this from a web page;
  // there the button explains the home-screen shortcut instead.
  const goFull = () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.("landscape")).catch(() => {});
  };
  let triedFull = false;
  pad.addEventListener("pointerdown", (e) => {
    if (triedFull || e.target.closest("[data-act=full]")) return;
    triedFull = true;
    goFull();
  });
  pad.querySelector("[data-act=full]").addEventListener("click", () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (document.documentElement.requestFullscreen) return goFull();
    ask({ title: "Full screen on iPhone", text: "iPhones can’t go full screen from a web page. Tap Share → Add to Home Screen, then open the controller from that icon.", ok: "Got it", cancel: null });
  });

  // Buttons follow the finger rather than the element it first touched: a thumb can slide from B to A,
  // or rest between two buttons (A+Z, A+B) and press both.
  const REACH = 16; // px around the contact point
  const held = new Set();
  const touches = new Map(); // pointer id -> buttons under that finger
  const under = (x, y) => {
    const found = new Set();
    for (const [dx, dy] of [[0, 0], [REACH, 0], [-REACH, 0], [0, REACH], [0, -REACH]]) {
      const btn = document.elementFromPoint(x + dx, y + dy)?.closest?.("[data-b]");
      if (btn && pad.contains(btn)) found.add(btn.dataset.b);
    }
    return found;
  };
  const sync = () => {
    const now = new Set();
    touches.forEach((set) => set.forEach((b) => now.add(b)));
    now.forEach((b) => {
      if (held.has(b)) return;
      held.add(b);
      pad.querySelector(`[data-b="${b}"]`)?.classList.add("is-down");
      navigator.vibrate?.(8);
      send({ b, v: 1 });
    });
    [...held].forEach((b) => {
      if (now.has(b)) return;
      held.delete(b);
      pad.querySelector(`[data-b="${b}"]`)?.classList.remove("is-down");
      send({ b, v: 0 });
    });
  };
  pad.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("[data-b]")) return;
    e.preventDefault();
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      // Only fails for synthetic pointers.
    }
    touches.set(e.pointerId, under(e.clientX, e.clientY));
    sync();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, under(e.clientX, e.clientY));
    sync();
  });
  const lift = (e) => touches.delete(e.pointerId) && sync();
  pad.addEventListener("pointerup", lift);
  pad.addEventListener("pointercancel", lift);

  // Floating stick: wherever the thumb lands in the zone becomes the centre.
  const zone = pad.querySelector(".pad-zone");
  const base = pad.querySelector(".pad-base");
  const knob = pad.querySelector(".pad-knob");
  let finger = null;
  let center = null;
  let last = "0,0";
  let frame = 0;
  let next = null;
  const radius = () => base.offsetWidth * 0.4;

  const setStick = (x, y) => {
    knob.style.transform = `translate(${x * radius()}px, ${y * radius()}px)`;
    // Small dead zone, then round so tiny wobbles don't flood the network.
    const q = (v) => (Math.abs(v) < 0.12 ? 0 : Math.round(v * 20) / 20);
    const key = `${q(x)},${q(y)}`;
    if (key === last) return;
    last = key;
    next = { x: q(x), y: q(y) };
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      send(next);
    });
  };
  const move = (e) => {
    let x = (e.clientX - center.x) / radius();
    let y = (e.clientY - center.y) / radius();
    const m = Math.hypot(x, y);
    if (m > 1) (x /= m), (y /= m);
    setStick(x, y);
  };
  zone.addEventListener("pointerdown", (e) => {
    if (finger !== null) return;
    finger = e.pointerId;
    try {
      zone.setPointerCapture(finger);
    } catch {
      // Only fails for synthetic pointers; real touches are always capturable.
    }
    const r = zone.getBoundingClientRect();
    center = { x: e.clientX, y: e.clientY };
    base.style.left = `${e.clientX - r.left}px`;
    base.style.top = `${e.clientY - r.top}px`;
    zone.classList.add("is-active");
    move(e);
  });
  zone.addEventListener("pointermove", (e) => e.pointerId === finger && move(e));
  const release = (e) => {
    if (e.pointerId !== finger) return;
    finger = null;
    zone.classList.remove("is-active");
    base.style.left = base.style.top = "";
    setStick(0, 0);
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);

  // Whose turn it is, read from the game by the TV.
  const me = pad.querySelector(".pad-me");
  const turn = pad.querySelector(".pad-turn");
  let wasMine = false;
  let latest = {};
  const onLive = ({ detail: d }) => {
    latest = d;
    pad.classList.toggle("is-my-turn", !!d.turn?.mine);
    pad.querySelector(".pad-menu")?.classList.toggle("is-alert", !!d.frozen);
    if (!sheet.hidden) openMenu();
    if (!d.board) {
      me.textContent = "";
      turn.textContent = "";
      wasMine = false;
      return;
    }
    if (d.me) {
      const c = CHARACTERS[d.me.chr];
      pad.style.setProperty("--chr", c.color);
      me.innerHTML = `${esc(c.name)} <span>★ ${d.me.stars}</span> <span>● ${d.me.coins}</span>`;
    } else {
      me.textContent = "Not playing this board";
    }
    const c = CHARACTERS[d.turn.chr];
    turn.textContent = d.turn.mine ? "Your turn!" : `${c.name}’s turn${d.turn.cpu ? " (COM)" : ""}`;
    if (d.turn.mine && !wasMine) navigator.vibrate?.([120, 80, 120]);
    wasMine = d.turn.mine;
  };
  addEventListener("cc-live", onLive);

  // VIP menu: go back to a turn save, reset the console, or leave.
  const sheet = pad.querySelector(".pad-sheet");
  const openMenu = () => {
    const saves = latest.saves || [];
    sheet.innerHTML = `
      <p class="ph-kicker">Game menu</p>
      ${latest.frozen ? `<p class="pad-sheet-alert">The game stopped responding. Go back to the last save to carry on.</p>` : ""}
      <div class="pad-sheet-list">
        ${latest.frozen ? "" : `<button class="btn" data-act="save">Save now</button>`}
        ${saves.map((label, i) => `<button class="btn ${i || !latest.frozen ? "btn-ghost" : ""}" data-save="${i}">Go back to ${esc(label)}</button>`).join("")}
        ${!saves.length && latest.stored ? `<button class="btn btn-ghost" data-save="stored">Continue from ${esc(latest.stored)}</button>` : ""}
        <button class="btn btn-ghost" data-act="reset">Reset console</button>
        <button class="btn btn-ghost" data-act="quit">Quit to the game menu</button>
        <button class="btn btn-ghost" data-act="close">Close</button>
      </div>`;
    sheet.hidden = false;
    sheet.querySelectorAll("[data-save]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const save = btn.dataset.save === "stored" ? "stored" : Number(btn.dataset.save);
        send({ menu: "restore", save });
        sheet.hidden = true;
      })
    );
    sheet.querySelector("[data-act=save]")?.addEventListener("click", () => {
      send({ menu: "save" });
      sheet.hidden = true;
    });
    sheet.querySelector("[data-act=reset]").addEventListener("click", async () => {
      if (!(await ask({ title: "Reset the console?", text: "This goes back to the title screen. Anything you didn’t save is lost.", ok: "Reset" }))) return;
      send({ menu: "reset" });
      sheet.hidden = true;
    });
    sheet.querySelector("[data-act=quit]").addEventListener("click", async () => {
      if (await ask({ title: "Stop the game?", text: "Everyone goes back to the game menu.", ok: "Stop" })) send({ quit: true });
    });
    sheet.querySelector("[data-act=close]").addEventListener("click", () => (sheet.hidden = true));
  };
  pad.querySelector("[data-act=menu]")?.addEventListener("click", openMenu);
  pad.querySelector("[data-act=list]")?.addEventListener("click", () => dispatchEvent(new CustomEvent("cc-show-list")));
  pad.querySelector("[data-act=vote]")?.addEventListener("click", () => send({ vote: true }));

  // Let go of everything if the screen changes while a button is held.
  return () => {
    removeEventListener("cc-live", onLive);
    held.forEach((b) => send({ b, v: 0 }));
    if (last !== "0,0") send({ x: 0, y: 0 });
  };
}

export { phone as controller };

// One shelf entry per game; they share the emulator host and the controller.
export function n64Pack(game) {
  return {
    id: `n64-${game.id}`,
    title: game.title,
    tagline: game.tagline,
    color: game.color,
    min: 0, // the TV's keyboard or a USB pad works too, so no phones are needed to start
    max: 8,
    minutes: game.minutes,
    Host: class extends Host {
      constructor(ctx) {
        super(ctx, game);
      }
    },
    phone,
  };
}
