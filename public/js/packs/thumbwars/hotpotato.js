import { esc, rankBy, Timers } from "./common.js";

const BOMBS = 3;

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.round = 0;
    this.blown = Object.fromEntries(ctx.ids.map((id) => [id, 0]));
  }

  mount(el) {
    el.innerHTML = `
      <div class="game potato">
        <header class="game-head">
          <h2 class="game-title">Hot Potato</h2>
          <p class="game-sub" data-sub></p>
        </header>
        <div class="bomb-zone" data-zone></div>
      </div>`;
    this.sub = el.querySelector("[data-sub]");
    this.zone = el.querySelector("[data-zone]");
  }

  start() {
    this.next();
  }

  online() {
    return this.ctx.ids.filter((id) => this.ctx.players[id].online);
  }

  next() {
    this.round++;
    if (this.round > BOMBS) return this.end();
    const alive = this.online();
    if (alive.length < 2) return this.end();
    this.phase = "live";
    this.holder = alive[Math.floor(Math.random() * alive.length)];
    this.sub.textContent = `Bomb ${this.round} of ${BOMBS}`;
    this.draw();
    this.sendViews();
    const fuse = 10 + Math.random() * 14;
    // Ticking speeds up for the last few seconds, a small hint that it's about to go.
    this.t.every(0.5, () => this.ctx.sfx.tick());
    this.t.after(fuse - 3, () => this.t.every(0.17, () => this.ctx.sfx.tick()));
    this.t.after(fuse, () => this.explode());
  }

  draw() {
    const p = this.ctx.players[this.holder];
    this.zone.className = "bomb-zone";
    this.zone.innerHTML = `
      <div class="bomb"><span class="fuse"></span><span class="spark"></span></div>
      <p class="holder" style="--c:${p.color}"><span>${esc(p.name)}</span> has the bomb</p>`;
  }

  sendViews() {
    const { ids, players } = this.ctx;
    const targets = (id) => this.online().filter((x) => x !== id).map((x) => ({ id: x, name: players[x].name, color: players[x].color }));
    ids.forEach((id) =>
      this.ctx.view(id, id === this.holder ? { stage: "hold", targets: targets(id) } : { stage: "safe", holder: players[this.holder].name, color: players[this.holder].color })
    );
  }

  input(id, data) {
    if (this.phase !== "live" || id !== this.holder || data.pass === id || !this.online().includes(data.pass)) return;
    this.holder = data.pass;
    this.ctx.sfx.whoosh();
    this.draw();
    this.sendViews();
  }

  leave(id) {
    if (this.phase !== "live" || id !== this.holder) return;
    const others = this.online();
    if (others.length < 1) return;
    this.holder = others[Math.floor(Math.random() * others.length)];
    this.draw();
    this.sendViews();
  }

  explode() {
    this.phase = "boom";
    this.t.clear();
    const victim = this.holder;
    const p = this.ctx.players[victim];
    this.blown[victim]++;
    this.ctx.sfx.boom();
    this.zone.className = "bomb-zone is-boom";
    this.zone.innerHTML = `<p class="boom-word">Boom</p><p class="holder" style="--c:${p.color}"><span>${esc(p.name)}</span> got blown up</p>`;
    this.ctx.announce(`Boom! ${p.name} is down!`);
    this.ctx.viewAll((id) => ({ stage: "boom", you: id === victim, victim: p.name }));
    this.t.after(3.5, () => this.next());
  }

  end() {
    this.ctx.finish(
      rankBy(this.ctx.ids, (id) => this.blown[id], (id) => (this.blown[id] ? `Blown up ${this.blown[id]}×` : "Never blown up"))
    );
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "hold") {
    navigator.vibrate?.([80, 40, 80]);
    el.innerHTML = `
      <div class="hold">
        <p class="ph-big">You have the bomb</p>
        <p>Pass it to</p>
        <div class="targets">
          ${view.targets.map((t) => `<button class="target" style="--c:${t.color}" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join("")}
        </div>
      </div>`;
    el.querySelectorAll(".target").forEach((btn) =>
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        send({ pass: btn.dataset.id });
      }, { once: true })
    );
    return;
  }
  if (view.stage === "safe") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-big">Safe, for now</p>
        <p><b style="color:${view.color}">${esc(view.holder)}</b> has the bomb.</p>
      </div>`;
    return;
  }
  if (view.you) navigator.vibrate?.(600);
  el.innerHTML = `
    <div class="ph-center ${view.you ? "is-blown" : ""}">
      <p class="ph-mega">Boom</p>
      <p>${view.you ? "You got blown up." : `${esc(view.victim)} got blown up.`}</p>
    </div>`;
}

export default {
  id: "hotpotato",
  title: "Hot Potato",
  how: "Pass the bomb to someone else before it blows. Whoever holds it loses.",
  minPlayers: 2,
  Host,
  phone,
};
