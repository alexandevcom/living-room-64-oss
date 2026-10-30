import { connect } from "./net.js";
import { PACKS_BY_ID } from "./packs/index.js";
import { controller } from "./packs/n64.js";
import { AVATARS, esc, sticker, ordinal, colorOf, logoText, timer } from "./shared.js";

// sessionStorage: one player per tab and kept across reloads (handy for testing with several tabs).
const id = sessionStorage.getItem("cc-id") || Math.random().toString(36).slice(2, 10);
sessionStorage.setItem("cc-id", id);

const params = new URLSearchParams(location.search);
const app = document.getElementById("app");
let net = null;
let joining = null; // { code, name }
let cleanup = null;
let current = null; // the last { view, me }, to redraw the home screen
let showList = false; // home: the game list instead of the controller

addEventListener("cc-show-list", () => {
  showList = true;
  if (current) render(current.view, current.me);
});

/* ---------- Joining ---------- */

function showJoin(error = "") {
  runCleanup();
  app.className = "phone backdrop is-join";
  app.dataset.pack = "hub";
  app.innerHTML = `
    <form class="join">
      <h1 class="logo">${logoText("Join the\ngame")}</h1>
      <label>Room code
        <input class="code-input" name="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false"
               value="${esc(joining?.code || params.get("room") || "")}" required>
      </label>
      <label>Your name
        <input name="name" maxlength="12" autocomplete="nickname" value="${esc(localStorage.getItem("cc-name") || "")}" required>
      </label>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
      <button class="btn btn-big">Join</button>
    </form>`;
  const form = app.querySelector("form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    localStorage.setItem("cc-name", name);
    join(form.code.value.trim().toUpperCase(), name);
  });
}

function join(code, name) {
  joining = { code, name };
  sessionStorage.setItem("cc-room", code);
  status("Joining…");
  if (!net) {
    net = connect({
      onOpen: () => joining && net.send({ t: "join", id, ...joining }),
      onMessage: handle,
      onClose: () => joining && status("Connection lost. Reconnecting…"),
    });
  } else {
    net.send({ t: "join", id, ...joining });
  }
}

function status(text) {
  runCleanup();
  app.className = "phone backdrop";
  app.innerHTML = `<div class="ph-center"><div class="spinner"></div><p class="ph-text">${esc(text)}</p></div>`;
}

function handle(msg) {
  if (msg.t === "error") {
    joining = null;
    return showJoin(msg.message);
  }
  if (msg.t === "host-left") return status("The TV lost its connection. Hang tight…");
  if (msg.t === "host-back" && joining) return net.send({ t: "join", id, ...joining });
  if (msg.t === "sip") return showSip(msg);
  // Small updates a pack screen applies in place, without rebuilding it.
  if (msg.t === "live") return dispatchEvent(new CustomEvent("cc-live", { detail: msg.data }));
  if (msg.t === "view") render(msg.view, msg.me);
}

/* ---------- Screens ---------- */

function runCleanup() {
  cleanup?.();
  cleanup = null;
}

function render(view, me) {
  current = { view, me };
  runCleanup();
  const packId = view.screen === "game" ? view.pack : view.screen === "over" ? null : "hub";
  app.className = `phone backdrop is-${view.screen}${view.stage ? ` stage-${view.stage}` : ""}`;
  app.dataset.pack = packId || app.dataset.pack || "hub";
  app.style.setProperty("--me", colorOf(me));

  if (view.screen === "avatar") return avatarScreen(view, me);

  app.innerHTML = `
    <header class="me">${sticker(me, "sm")}<b>${esc(me.name)}</b>${me.vip ? '<span class="me-tag">VIP</span>' : ""}</header>
    <main class="screen"></main>
    <div class="sip-layer"></div>`;
  const screen = app.querySelector(".screen");
  const send = (t, data = {}) => net.send({ t, ...data });

  if (view.screen === "game") {
    cleanup = PACKS_BY_ID[view.pack].phone(view, screen, (data) => send("game", data), me) || null;
    return;
  }
  if (view.screen === "home") {
    cleanup = homeScreen(view, me, screen, send) || null;
    return;
  }
  if (view.screen === "vote") return voteScreen(view, me, screen, send);
  if (view.screen === "over") return overScreen(view, me, screen, send);
  screen.innerHTML = `<div class="ph-center"><p class="ph-title">Watch the TV</p><p class="ph-text">${esc(view.text || "")}</p></div>`;
}

function avatarScreen(view, me) {
  app.innerHTML = `
    <div class="avatar-pick">
      <p class="ph-kicker">Hi ${esc(me.name)}</p>
      <p class="ph-title">Pick your sticker</p>
      <div class="avatar-grid">
        ${AVATARS.map((a) => {
          const taken = view.taken.includes(a.id) && me.avatar !== a.id;
          return `<button class="avatar-opt" data-id="${a.id}" ${taken ? "disabled" : ""} aria-label="${a.name}${taken ? " (taken)" : ""}">
            ${sticker({ name: a.name, avatar: a.id }, "lg")}<span>${taken ? "Taken" : a.name}</span>
          </button>`;
        }).join("")}
      </div>
    </div>`;
  app.querySelectorAll(".avatar-opt").forEach((btn) =>
    btn.addEventListener("click", () => {
      navigator.vibrate?.(20);
      net.send({ t: "avatar", avatar: btn.dataset.id });
    })
  );
}

function homeScreen(view, me, screen, send) {
  // N64 shelf: the phone is already a controller; the VIP picks a cartridge on the TV with the stick and A.
  if (!view.party && !showList) {
    app.classList.add("stage-pad");
    return controller({ stage: "pad", port: me.vip ? 1 : null, vip: me.vip, home: true, vipName: view.vipName }, screen, (data) => send("game", data));
  }
  if (!me.vip) {
    screen.innerHTML = `
      <div class="ph-center">
        <p class="ph-kicker">You’re in</p>
        <p class="ph-title">Waiting for ${esc(view.vipName)} to pick a game</p>
        <p class="ph-text">Keep your eyes on the TV.</p>
        ${view.drinking ? `<p class="ph-text">🍺 Drinking mode is on.</p>` : ""}
      </div>`;
    return;
  }
  screen.innerHTML = `
    <div class="menu">
      <p class="ph-kicker">You’re the VIP</p>
      <p class="ph-title">Pick a game</p>
      ${view.party ? "" : `<button class="btn btn-ghost" data-act="pad">Back to the controller</button>`}
      <div class="menu-list">
        ${view.packs
          .map(
            (p) => `
          <button class="menu-item" data-pack="${p.id}" style="--c:${p.color}" ${p.ok ? "" : "disabled"}>
            <span class="menu-art"><img src="/assets/covers/${p.id}.webp" alt="" onerror="this.remove()"></span>
            <span class="menu-text"><b>${esc(p.title)}</b><small>${esc(p.ok ? p.tagline : `Needs ${p.min}+ players`)}</small></span>
          </button>`
          )
          .join("")}
      </div>
      ${view.party ? `<button class="switch ${view.drinking ? "is-on" : ""}" data-act="drinking" role="switch" aria-checked="${view.drinking}">
        <span class="switch-track"><span class="switch-knob"></span></span> Drinking mode
      </button>` : ""}
    </div>`;
  screen.querySelectorAll("[data-pack]").forEach((btn) => btn.addEventListener("click", () => send("pick", { pack: btn.dataset.pack })));
  screen.querySelector("[data-act=drinking]")?.addEventListener("click", () => send("drinking", { on: !view.drinking }));
  screen.querySelector("[data-act=pad]")?.addEventListener("click", () => {
    showList = false;
    render(view, me);
  });
}

// Tick every game you'd play; the TV spins between the picks.
function voteScreen(view, me, screen, send) {
  screen.innerHTML = `
    <div class="vote">
      <div class="vote-head">
        <div><p class="ph-kicker">Vote</p><p class="ph-title">What do you want to play?</p></div>
        ${timer(view.ends, view.seconds)}
      </div>
      <p class="ph-text">Tap every game you’d play. More votes, bigger chance on the wheel.</p>
      <div class="vote-grid">
        ${view.packs
          .map(
            (p) => `
          <button class="vote-card ${view.mine.includes(p.id) ? "is-on" : ""}" data-vote="${p.id}" aria-pressed="${view.mine.includes(p.id)}" ${view.done ? "disabled" : ""}>
            <span class="vote-art" style="--c:${p.color}"><img src="/assets/covers/${p.id}.webp" alt="" onerror="this.remove()"></span>
            <span class="vote-name">${esc(p.title)}</span>
            ${view.counts[p.id] ? `<span class="vote-count">${view.counts[p.id]}</span>` : ""}
          </button>`
          )
          .join("")}
      </div>
      <div class="dock">
        ${view.done ? `<p class="hint">Waiting for the others…</p>` : `<button class="btn btn-big" data-act="done">${view.mine.length ? "Done" : "Anything is fine"}</button>`}
        ${me.vip ? `<button class="btn btn-ghost" data-act="spin">Spin now</button><button class="btn btn-ghost" data-act="cancel">Cancel vote</button>` : ""}
      </div>
    </div>`;
  screen.querySelectorAll("[data-vote]").forEach((btn) => btn.addEventListener("click", () => send("vote", { pack: btn.dataset.vote })));
  screen.querySelector("[data-act=done]")?.addEventListener("click", () => send("vote", { done: true }));
  screen.querySelector("[data-act=spin]")?.addEventListener("click", () => send("vote", { spin: true }));
  screen.querySelector("[data-act=cancel]")?.addEventListener("click", () => send("vote", { cancel: true }));
}

function overScreen(view, me, screen, send) {
  screen.innerHTML = `
    <div class="ph-center">
      <p class="ph-kicker">${esc(view.title)}</p>
      ${view.place ? `<p class="ph-place">${view.place === 1 ? "Winner!" : ordinal(view.place)}</p><p class="ph-text">${view.score} points</p>` : `<p class="ph-title">Game over</p>`}
      ${view.drinking && view.place ? `<p class="ph-text">🍺 ${view.sips} ${view.sips === 1 ? "sip" : "sips"} this game</p>` : ""}
    </div>
    ${me.vip ? `<div class="dock"><button class="btn btn-big" data-act="again">Play again</button><button class="btn btn-ghost" data-act="menu">Pick another game</button></div>` : `<p class="hint dock">The VIP decides what’s next.</p>`}`;
  screen.querySelector("[data-act=again]")?.addEventListener("click", () => send("again"));
  screen.querySelector("[data-act=menu]")?.addEventListener("click", () => send("menu"));
}

function showSip({ n, reason }) {
  navigator.vibrate?.([100, 60, 100]);
  const layer = app.querySelector(".sip-layer") || app;
  const card = document.createElement("div");
  card.className = "sip";
  card.innerHTML = `<span class="sip-icon">🍺</span><b>Drink ${n} ${n === 1 ? "sip" : "sips"}</b><small>${esc(reason)}</small>`;
  layer.append(card);
  setTimeout(() => card.classList.add("is-out"), 3500);
  setTimeout(() => card.remove(), 4000);
}

// No double-tap zoom or long-press menus while mashing buttons.
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());

const savedRoom = sessionStorage.getItem("cc-room");
const savedName = localStorage.getItem("cc-name");
if (savedRoom && savedName && (!params.get("room") || params.get("room").toUpperCase() === savedRoom)) join(savedRoom, savedName);
else showJoin();
