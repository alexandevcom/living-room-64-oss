import { connect } from "./net.js";
import { initDisplayLink, onDisplayMessage } from "./display-link.js";
import { PACKS, PACKS_BY_ID, SHOW_PARTY_GAMES } from "./packs/index.js";
import { AVATARS, esc, sticker, rankBy, logoText, ask, timer } from "./shared.js";
import { sfx, announce, unlockAudio, toggleMute, isMuted, onCaption, currentCaption } from "./audio.js";

// N64 games stand on the shelf as cartridges. The party games (when shown) get big boxes, up to six of them.
const LIBRARY = !SHOW_PARTY_GAMES || PACKS.length > 6;

const MAX_PLAYERS = 8;
const app = document.getElementById("app");

const hub = {
  code: null,
  phoneUrl: "",
  joinUrl: "",
  phase: "boot", // boot → home → pack → over → home …
  players: {}, // id -> { name, avatar, online, view, fresh }
  order: [], // ids in join order
  drinking: false,
  pack: null, // pack definition
  host: null, // running pack instance
  result: null, // { ranking, sips }
  sips: {},
  cursor: 0, // home: the cartridge the VIP's stick points at
  stick: "", // the VIP's last stick direction, so one flick moves one step
  vote: null, // { picks: { id: Set(packId) }, done: Set(id), ends, timer }
  spinTimer: null,
};

const VOTE_SECONDS = 30;
let net = null;

/* ---------- Connection ---------- */

function handle(msg) {
  switch (msg.t) {
    case "room":
      hub.code = msg.code;
      hub.phoneUrl = msg.phoneUrl.replace("http://", "");
      hub.joinUrl = msg.joinUrl;
      sessionStorage.setItem("cc-room", msg.code);
      if (hub.phase === "boot") {
        hub.phase = "home";
        sfx.bell();
        announce("Welcome! Grab your phones.");
      }
      render();
      break;
    case "join":
      addPlayer(msg.id, msg.name);
      break;
    case "leave": {
      const p = hub.players[msg.id];
      if (!p) break;
      p.online = false;
      hub.host?.leave?.(msg.id);
      refreshHomeViews();
      if (hub.phase !== "pack") render();
      break;
    }
    case "input":
      onInput(msg.id, msg.data);
      break;
    case "display-join":
    case "display-leave":
    case "from-display":
      onDisplayMessage(msg);
      break;
  }
}

function sendTo(id, data) {
  net.send({ t: "send", to: id, data });
}

function sendView(id, view) {
  const p = hub.players[id];
  p.view = view;
  sendTo(id, { t: "view", view, me: { name: p.name, avatar: p.avatar, vip: vipId() === id, pack: hub.phase === "pack" ? hub.pack.id : null } });
}

/* ---------- Players ---------- */

function addPlayer(id, rawName) {
  const name = String(rawName || "").trim().slice(0, 12) || "Player";
  let p = hub.players[id];
  if (!p) {
    if (hub.order.length >= MAX_PLAYERS) return sendTo(id, { t: "error", message: `This room is full (${MAX_PLAYERS} players).` });
    p = hub.players[id] = { name, avatar: null, online: true, view: null, fresh: true };
    hub.order.push(id);
    sfx.join();
  } else {
    p.online = true;
    p.name = name;
  }
  if (!p.avatar) sendView(id, avatarView());
  else if (p.view) sendView(id, p.view);
  else sendView(id, homeView());
  if (hub.phase !== "pack") render();
}

function avatarView() {
  return { screen: "avatar", taken: takenAvatars() };
}

function takenAvatars() {
  return hub.order.map((id) => hub.players[id].avatar).filter(Boolean);
}

function chooseAvatar(id, avatar) {
  const p = hub.players[id];
  if (!AVATARS.some((a) => a.id === avatar) || takenAvatars().includes(avatar)) return sendView(id, avatarView());
  const first = !p.avatar;
  p.avatar = avatar;
  p.fresh = true;
  sfx.join();
  if (first) announce(`${p.name} is here!`);
  // Everyone still picking sees the updated list of taken avatars.
  hub.order.forEach((pid) => !hub.players[pid].avatar && sendView(pid, avatarView()));
  if (hub.phase === "pack") sendView(id, { screen: "watch", text: "You’re in! You’ll join the next game." });
  else if (hub.phase === "over") sendView(id, overView(id));
  else refreshHomeViews();
  if (hub.phase !== "pack") render();
}

// Remove a player from the TV. Their phone goes back to the join screen; they can join again.
async function kick(id) {
  const p = hub.players[id];
  if (!p || hub.phase === "pack") return;
  if (!(await ask({ title: `Remove ${p.name}?`, text: "Their phone goes back to the join screen. They can join again.", ok: "Remove" }))) return;
  if (!hub.players[id]) return;
  sendTo(id, { t: "error", message: "The TV removed you from the game. You can join again." });
  delete hub.players[id];
  hub.order = hub.order.filter((x) => x !== id);
  announce(`${p.name} left.`);
  hub.order.forEach((pid) => !hub.players[pid].avatar && sendView(pid, avatarView()));
  refreshHomeViews();
  render();
}

function ready() {
  return hub.order.filter((id) => hub.players[id].online && hub.players[id].avatar);
}

function vipId() {
  return ready()[0];
}

/* ---------- Phone input ---------- */

function onInput(id, data) {
  const p = hub.players[id];
  if (!p) return;
  const isVip = id === vipId();
  switch (data.t) {
    case "avatar":
      return chooseAvatar(id, data.avatar);
    case "pick":
      if (isVip && hub.phase !== "pack") startPack(data.pack);
      return;
    case "drinking":
      if (isVip && hub.phase !== "pack") setDrinking(!!data.on);
      return;
    case "again":
      if (isVip && hub.phase === "over") startPack(hub.pack.id);
      return;
    case "menu":
      if (isVip && hub.phase === "over") goHome();
      return;
    case "vote":
      return onVote(id, data, isVip);
    case "game":
      if (hub.phase === "home") return isVip && shelfInput(data);
      return hub.host?.input(id, data);
  }
}

// The VIP's controller moves a cursor over the shelf: stick to move, A or Start to play.
function shelfInput(data) {
  if (data.vote) return startVote();
  if (typeof data.x === "number") {
    const dir = Math.abs(data.x) > 0.6 ? (data.x > 0 ? "right" : "left") : Math.abs(data.y) > 0.6 ? (data.y > 0 ? "down" : "up") : "";
    if (dir && dir !== hub.stick) moveCursor(dir);
    hub.stick = dir;
  }
  // The C buttons are arrows too.
  const arrow = { cl: "left", cr: "right", cu: "up", cd: "down" }[data.b];
  if (arrow && data.v) moveCursor(arrow);
  if ((data.b === "a" || data.b === "start") && data.v) {
    sfx.ding();
    startPack(PACKS[hub.cursor]?.id);
  }
}

function moveCursor(dir) {
  const cols = LIBRARY ? Math.min(PACKS.length, 5) : PACKS.length;
  const next = hub.cursor + { left: -1, right: 1, up: -cols, down: cols }[dir];
  if (next < 0 || next >= PACKS.length) return;
  hub.cursor = next;
  sfx.tick();
  showCursor();
}

function showCursor() {
  app.querySelectorAll(".shelf .box").forEach((box, i) => box.classList.toggle("is-cursor", i === hub.cursor));
}

/* ---------- Vote and spin ----------
   Everyone ticks the games they'd play; the TV then spins over the voted games.
   More votes means a bigger slice of the wheel. No votes at all: any game can come up. */

function startVote() {
  if (hub.phase !== "home" || !PACKS.length) return;
  hub.phase = "vote";
  hub.vote = { picks: {}, done: new Set(), ends: Date.now() + VOTE_SECONDS * 1000 };
  hub.vote.timer = setTimeout(spin, VOTE_SECONDS * 1000);
  sfx.bell();
  announce("Vote! Tap every game you’d play.");
  refreshVoteViews();
  render();
}

function voters(packId) {
  return ready().filter((id) => hub.vote.picks[id]?.has(packId));
}

function voteView(id) {
  return {
    screen: "vote",
    packs: PACKS.map((p) => ({ id: p.id, title: p.title, color: p.color })),
    mine: [...(hub.vote.picks[id] || [])],
    counts: Object.fromEntries(PACKS.map((p) => [p.id, voters(p.id).length])),
    done: hub.vote.done.has(id),
    ends: hub.vote.ends,
    seconds: VOTE_SECONDS,
  };
}

function refreshVoteViews() {
  ready().forEach((id) => sendView(id, voteView(id)));
}

function onVote(id, data, isVip) {
  if (hub.phase !== "vote") return;
  if (data.cancel && isVip) return cancelVote();
  if (data.spin && isVip) return spin();
  if (data.pack && PACKS_BY_ID[data.pack] && !hub.vote.done.has(id)) {
    const picks = (hub.vote.picks[id] ||= new Set());
    picks.has(data.pack) ? picks.delete(data.pack) : picks.add(data.pack);
    sfx.tick();
  }
  if (data.done) hub.vote.done.add(id);
  if (ready().every((pid) => hub.vote.done.has(pid))) return spin();
  refreshVoteViews();
  render();
}

function cancelVote() {
  clearTimeout(hub.vote?.timer);
  hub.vote = null;
  goHome();
}

function spin() {
  if (hub.phase !== "vote") return;
  clearTimeout(hub.vote.timer);
  const tally = PACKS.map((p, i) => ({ p, i, n: voters(p.id).length }));
  const voted = tally.filter((t) => t.n > 0);
  const pool = voted.length ? voted : tally.map((t) => ({ ...t, n: 1 }));
  let roll = Math.random() * pool.reduce((sum, t) => sum + t.n, 0);
  const winner = pool.find((t) => (roll -= t.n) < 0) || pool[pool.length - 1];

  hub.phase = "spin";
  hub.vote.pool = new Set(pool.map((t) => t.p.id));
  ready().forEach((id) => sendView(id, { screen: "watch", text: "The TV is spinning…" }));
  announce(voted.length ? "Spinning between your picks!" : "Nobody voted, so anything goes!");
  render();

  // Hop over the pool in shelf order, slowing down, and stop on the winner after a few laps.
  const order = pool.map((t) => t.i);
  const hops = order.length * 3 + order.indexOf(winner.i) + 1;
  let k = 0;
  const hop = () => {
    hub.cursor = order[k % order.length];
    showCursor();
    sfx.tick();
    k++;
    if (k < hops) hub.spinTimer = setTimeout(hop, 70 + 380 * (k / hops) ** 2.2);
    else land(winner.p);
  };
  hop();
}

function land(pack) {
  app.querySelector(".shelf .box.is-cursor")?.classList.add("is-winner");
  sfx.fanfare();
  announce(`${pack.title}!`);
  hub.spinTimer = setTimeout(() => {
    hub.vote = null;
    startPack(pack.id);
  }, 2600);
}

function setDrinking(on) {
  hub.drinking = on;
  announce(on ? "Drinking mode is on. Pace yourselves." : "Drinking mode is off.");
  refreshHomeViews();
  render();
}

/* ---------- Home ---------- */

function homeView() {
  const count = ready().length;
  return {
    screen: "home",
    drinking: hub.drinking,
    party: SHOW_PARTY_GAMES,
    vipName: hub.players[vipId()]?.name || "",
    packs: PACKS.map((p) => ({ id: p.id, title: p.title, tagline: p.tagline, players: `${p.min}–${p.max}`, color: p.color, ok: count >= p.min && count <= p.max, min: p.min })),
  };
}

function refreshHomeViews() {
  if (hub.phase !== "home") return;
  hub.order.forEach((id) => hub.players[id].avatar && sendView(id, homeView()));
}

function goHome() {
  hub.phase = "home";
  hub.pack = null;
  hub.result = null;
  refreshHomeViews();
  render();
}

/* ---------- Packs ---------- */

function startPack(packId) {
  const P = PACKS_BY_ID[packId];
  const ids = ready();
  if (!P || ids.length < P.min || ids.length > P.max) return;
  hub.pack = P;
  hub.phase = "pack";
  hub.sips = Object.fromEntries(ids.map((id) => [id, 0]));
  hub.order.forEach((id) => !ids.includes(id) && hub.players[id].avatar && sendView(id, { screen: "watch", text: "You’ll join the next game." }));
  render();

  const view = (id, data) => sendView(id, { screen: "game", pack: P.id, ...data });
  hub.host = new P.Host({
    ids,
    players: hub.players,
    drinking: hub.drinking,
    view,
    viewAll: (data) => ids.forEach((id) => view(id, typeof data === "function" ? data(id) : data)),
    announce,
    sfx,
    sip: (id, n, reason) => giveSips([{ id, n }], reason),
    sips: (list, reason) => giveSips(list, reason),
    end: (scores) => endPack(scores),
    quit: () => quitPack(),
    live: (id, data) => sendTo(id, { t: "live", data }),
  });
  hub.host.mount(app.querySelector(".stage"));
  hub.host.start();
}

// Leave a pack without a winner screen.
function quitPack() {
  hub.host?.destroy?.();
  hub.host = null;
  goHome();
}

// list: [{ id, n }]. Only does something in drinking mode.
function giveSips(list, reason) {
  if (!hub.drinking) return;
  const real = list.filter((s) => s.n > 0 && hub.players[s.id]);
  if (!real.length) return;
  const box = app.querySelector(".toasts");
  real.forEach(({ id, n }) => {
    hub.sips[id] = (hub.sips[id] || 0) + n;
    sendTo(id, { t: "sip", n, reason });
  });
  if (!box) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">🍺</span>
    <span class="toast-who">${real.map(({ id, n }) => `${sticker(hub.players[id], "xs")}<b>${esc(hub.players[id].name)}</b> ${n} ${n === 1 ? "sip" : "sips"}`).join("<br>")}</span>
    <span class="toast-why">${esc(reason)}</span>`;
  box.append(toast);
  setTimeout(() => toast.classList.add("is-out"), 4500);
  setTimeout(() => toast.remove(), 5000);
}

// scores: { id: points }
function endPack(scores) {
  const ids = Object.keys(scores);
  hub.host?.destroy?.();
  hub.host = null;
  const ranking = rankBy(ids, (id) => -scores[id], (id) => scores[id]);
  hub.result = { ranking, scores, sips: { ...hub.sips } };
  hub.phase = "over";
  const winners = ranking.filter((r) => r.rank === 1).map((r) => hub.players[r.id].name);
  sfx.fanfare();
  announce(`${winners.join(" and ")} ${winners.length > 1 ? "win" : "wins"} ${hub.pack.title}!`);
  hub.order.forEach((id) => hub.players[id].avatar && sendView(id, overView(id)));
  render();
}

function overView(id) {
  const r = hub.result.ranking.find((x) => x.id === id);
  return { screen: "over", title: hub.pack.title, place: r?.rank || null, score: r ? hub.result.scores[id] : null, sips: hub.result.sips[id] || 0, drinking: hub.drinking };
}

/* ---------- Rendering ---------- */

function render() {
  app.dataset.pack = hub.phase === "pack" || hub.phase === "over" ? hub.pack.id : "hub";
  if (hub.phase === "boot") return renderBoot();
  if (hub.phase === "pack" && app.querySelector(".stage")?.dataset.owner === hub.pack.id) return;

  app.className = `tv backdrop is-${hub.phase}`;
  app.innerHTML = `
    <main class="stage" ${hub.phase === "pack" ? `data-owner="${hub.pack.id}"` : ""}>${["home", "vote", "spin"].includes(hub.phase) ? homeScreen() : hub.phase === "over" ? overScreen() : ""}</main>
    <footer class="bar">
      <span class="bar-mic" aria-hidden="true"></span>
      <span class="bar-caption" data-caption>${esc(currentCaption())}</span>
      ${["home", "vote", "spin"].includes(hub.phase) ? "" : `<span class="bar-join">Join: <b>${esc(hub.phoneUrl)}</b> · code <b>${esc(hub.code)}</b></span>`}
      ${hub.drinking ? `<span class="bar-drinking">🍺 Drinking mode</span>` : ""}
      <button class="bar-mute" data-act="full">${document.fullscreenElement ? "Exit full screen" : "Full screen"} <kbd>F</kbd></button>
      <button class="bar-mute" data-act="mute">${isMuted() ? "Sound off" : "Sound on"} <kbd>M</kbd></button>
    </footer>
    <div class="toasts" aria-live="polite"></div>`;

  app.querySelector("[data-act=mute]").addEventListener("click", flipMute);
  app.querySelector("[data-act=full]").addEventListener("click", toggleFullscreen);
  if (hub.phase === "home") app.querySelectorAll("[data-pack]").forEach((el) => el.addEventListener("click", () => startPack(el.dataset.pack)));
  app.querySelector("[data-act=vote]")?.addEventListener("click", startVote);
  app.querySelector("[data-act=drinking]")?.addEventListener("click", () => setDrinking(!hub.drinking));
  app.querySelector("[data-act=again]")?.addEventListener("click", () => startPack(hub.pack.id));
  app.querySelector("[data-act=home]")?.addEventListener("click", goHome);
  app.querySelectorAll("[data-kick]").forEach((btn) => btn.addEventListener("click", () => kick(btn.dataset.kick)));
  showCursor();
  Object.values(hub.players).forEach((p) => (p.fresh = false));
}

function renderBoot() {
  app.className = "tv backdrop is-boot";
  app.innerHTML = `
    <div class="boot">
      <h1 class="logo">${logoText("Game\nnight")}</h1>
      <p class="boot-sub">N64 games on the TV. Your phone is the controller.</p>
      <button class="btn btn-big" data-act="open">Open the room</button>
      <p class="hint">Turns on sound and creates a room code.</p>
    </div>`;
  app.querySelector("[data-act=open]").addEventListener("click", () => {
    unlockAudio();
    // Real full screen also lets the page draw beside a phone's camera cutout (with viewport-fit=cover).
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    net = connect({
      onOpen: () => net.send({ t: "host", code: hub.code || sessionStorage.getItem("cc-room") }),
      onMessage: handle,
    });
    initDisplayLink((msg) => net.send(msg));
  });
  // /tv?open skips this screen, for a kiosk with nobody at a mouse (e.g. streamed with Steam Link).
  // Sound then needs the browser started with --autoplay-policy=no-user-gesture-required.
  if (new URLSearchParams(location.search).has("open") && !net) app.querySelector("[data-act=open]").click();
}

function homeScreen() {
  const players = hub.order.map((id) => hub.players[id]);
  const count = ready().length;
  const vip = hub.players[vipId()];
  return `
    <section class="home">
      <header class="home-head">
        <div class="home-title">
          <h1 class="logo logo-sm">${logoText(hub.phase === "vote" ? "Vote!" : hub.phase === "spin" ? "Spinning…" : "Pick a game")}</h1>
          ${hub.phase === "vote" ? timer(hub.vote.ends, VOTE_SECONDS) : ""}
        </div>
        <div class="join-card">
          <img class="qr" src="/qr.svg?data=${encodeURIComponent(hub.joinUrl)}" alt="QR code to join">
          <div>
            <p class="join-lead">Scan to join</p>
            <p>or go to <b>${esc(hub.phoneUrl)}</b></p>
            <p class="join-code">code <b>${esc(hub.code)}</b></p>
          </div>
        </div>
      </header>

      <div class="shelf ${LIBRARY ? "is-library" : ""} ${PACKS.length < 5 ? "is-few" : ""} ${hub.vote ? "is-voting" : ""} ${hub.vote && PACKS.some((p) => voters(p.id).length) ? "has-votes" : ""}" style="--cols:${Math.min(PACKS.length, 5) || 1}">
        ${PACKS.map((p, i) => {
          const ok = count >= p.min && count <= p.max;
          const who = hub.vote ? voters(p.id) : [];
          const inPool = hub.phase !== "spin" || hub.vote.pool.has(p.id);
          return `
          <button class="box ${ok ? "" : "is-locked"} ${who.length ? "is-voted" : ""} ${inPool ? "" : "is-out"}" data-pack="${p.id}" style="--c:${p.color};--i:${i}" ${ok ? "" : "disabled"}>
            ${who.length ? `<span class="votes">${who.map((id) => sticker(hub.players[id], "xs")).join("")}</span>` : ""}
            ${LIBRARY ? cartridge(p, i) : `<span class="box-art"><img src="/assets/covers/${p.id}.webp" alt="" onerror="this.remove()"></span>`}
            <span class="box-title">${esc(p.title)}</span>
            <span class="box-tag">${esc(p.tagline)}</span>
            <span class="box-meta">${count < p.min ? `Needs ${p.min}+ players` : `${p.min}–${p.max} players · ${p.minutes} min`}</span>
          </button>`;
        }).join("")}
        ${PACKS.length ? "" : `<p class="shelf-empty">No games yet. Put your ROMs in the <b>roms</b> folder, then reload this page.</p>`}
      </div>

      <footer class="home-foot">
        <div class="roster">
          ${players.length
            ? hub.order.map((id) => {
                const p = hub.players[id];
                return `<span class="roster-item ${p.fresh ? "is-fresh" : ""} ${p.online ? "" : "is-offline"}">${sticker(p, "md")}<b>${esc(p.name)}</b><button class="roster-kick" data-kick="${esc(id)}" aria-label="Remove ${esc(p.name)}" title="Remove ${esc(p.name)}">✕</button></span>`;
              }).join("")
            : `<span class="roster-empty">Nobody here yet. Scan the code to join.</span>`}
        </div>
        ${SHOW_PARTY_GAMES ? `<button class="switch ${hub.drinking ? "is-on" : ""}" data-act="drinking" role="switch" aria-checked="${hub.drinking}">
          <span class="switch-track"><span class="switch-knob"></span></span> Drinking mode
        </button>` : ""}
      </footer>
      <p class="home-hint">${!PACKS.length ? "" : hub.phase === "vote" ? "Tap every game you’d play on your phone. More votes, bigger chance." : hub.phase === "spin" ? "" : !SHOW_PARTY_GAMES && vip ? `${esc(vip.name)}: stick to choose, A to play, or <button class="hint-btn" data-act="vote">Vote <kbd>V</kbd></button> to let everyone choose.` : vip ? (SHOW_PARTY_GAMES ? `${esc(vip.name)} picks the game on their phone, or click a box.` : `${esc(vip.name)}: move the stick to choose, press A to play.`) : "The first player to join picks the game."}</p>
    </section>`;
}

// An N64 cartridge: grey plastic with grip ridges along the top, notched sides, and the game's label in the recess.
// Without a cover image, the label is the game's name on its colour.
function cartridge(p, i) {
  const lines = [];
  for (const word of p.title.split(" ")) {
    if (lines.length && `${lines.at(-1)} ${word}`.length <= 10) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  const name = lines.map((line, k) => `<tspan x="120" y="${113.5 + (k - (lines.length - 1) / 2) * 26}">${esc(line)}</tspan>`).join("");
  const ridges = Array.from({ length: 5 }, (_, k) => `<rect x="54" y="${17 + k * 4.2}" width="132" height="1.8" rx="0.9" fill="#5d5d63"/><rect x="54" y="${18.8 + k * 4.2}" width="132" height="1" rx="0.5" fill="#b9b9bf"/>`).join("");
  return `
    <svg class="cart" viewBox="0 0 240 206" aria-hidden="true">
      <defs>
        <linearGradient id="cart-body-${i}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a9a9af"/><stop offset="0.55" stop-color="#8c8c92"/><stop offset="1" stop-color="#6f6f75"/>
        </linearGradient>
        <linearGradient id="cart-edge-${i}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.08" stop-color="#fff" stop-opacity="0"/>
          <stop offset="0.92" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/>
        </linearGradient>
        <clipPath id="cart-label-${i}"><rect x="30" y="46" width="180" height="135" rx="7"/></clipPath>
      </defs>
      <path d="M22 204 V170 L12 160 V34 Q12 6 40 6 H200 Q228 6 228 34 V160 L218 170 V204 Z" fill="url(#cart-body-${i})"/>
      <path d="M22 204 V170 L12 160 V34 Q12 6 40 6 H200 Q228 6 228 34 V160 L218 170 V204 Z" fill="url(#cart-edge-${i})"/>
      ${ridges}
      <rect x="26" y="42" width="188" height="143" rx="10" fill="#5f5f65"/>
      <rect x="28" y="44" width="184" height="139" rx="9" fill="#e9e9ec"/>
      <rect x="30" y="46" width="180" height="135" rx="7" fill="${p.color}"/>
      <text class="cart-name" text-anchor="middle" dominant-baseline="central">${name}</text>
      ${p.cover ? `<image href="/assets/covers/${p.id}.webp" x="30" y="46" width="180" height="135" preserveAspectRatio="xMidYMid slice" clip-path="url(#cart-label-${i})"/>` : ""}
      <rect x="30" y="46" width="180" height="135" rx="7" fill="none" stroke="#000" stroke-opacity="0.18"/>
      <rect x="22" y="192" width="196" height="12" fill="#000" fill-opacity="0.12"/>
    </svg>`;
}

function overScreen() {
  const { ranking, scores, sips } = hub.result;
  const champ = hub.players[ranking[0].id];
  return `
    <section class="over">
      <p class="over-kicker">${esc(hub.pack.title)} winner</p>
      <div class="over-champ">${sticker(champ, "xl", "is-bounce")}<h2 class="over-name">${esc(champ.name)}</h2></div>
      <ol class="standings">
        ${ranking
          .map((r, i) => {
            const p = hub.players[r.id];
            return `<li style="--i:${i}"><span class="st-rank">${r.rank}</span>${sticker(p, "sm")}<b>${esc(p.name)}</b><span class="st-score">${scores[r.id]}</span>${hub.drinking ? `<span class="st-sips">🍺 ${sips[r.id] || 0}</span>` : ""}</li>`;
          })
          .join("")}
      </ol>
      <div class="over-actions">
        <button class="btn" data-act="again">Play again</button>
        <button class="btn btn-ghost" data-act="home">Pick another game</button>
      </div>
    </section>`;
}

function flipMute() {
  toggleMute();
  const btn = app.querySelector("[data-act=mute]");
  if (btn) btn.innerHTML = `${isMuted() ? "Sound off" : "Sound on"} <kbd>M</kbd>`;
}

onCaption((text) => {
  const el = app.querySelector("[data-caption]");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("is-new");
  void el.offsetWidth;
  el.classList.add("is-new");
});

// Keep the screen on while this page is showing, so a phone or laptop acting as the console doesn't dim
// or lock mid-game. The browser drops the lock when the page is hidden; take it again when it's back.
let wakeLock = null;
async function keepAwake() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => (wakeLock = null));
  } catch {
    // Not allowed here (e.g. plain http on another device); the screen just follows its own timeout.
  }
}
document.addEventListener("visibilitychange", keepAwake);
keepAwake();

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

document.addEventListener("fullscreenchange", () => {
  const btn = app.querySelector("[data-act=full]");
  if (btn) btn.innerHTML = `${document.fullscreenElement ? "Exit full screen" : "Full screen"} <kbd>F</kbd>`;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "m" || e.key === "M") flipMute();
  if (e.key === "f" || e.key === "F") toggleFullscreen();
  // Arrow keys and Enter pick a game on the laptop too.
  if (hub.phase === "home" && (e.key === "v" || e.key === "V")) return startVote();
  if (hub.phase === "vote" && e.key === " ") {
    e.preventDefault();
    return spin();
  }
  if (hub.phase === "home") {
    const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
    if (dir) {
      e.preventDefault();
      moveCursor(dir);
    }
    if (e.key === "Enter" && !e.target.closest?.("button")) startPack(PACKS[hub.cursor]?.id);
  }
});

// While Mario Party 2 runs, keys go to the emulator frame; it passes F back up.
addEventListener("message", (e) => e.origin === location.origin && e.data?.n64 === "key-f" && toggleFullscreen());

render();
