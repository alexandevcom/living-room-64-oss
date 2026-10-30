import { esc, rankBy, Timers } from "./common.js";

const ROUNDS = 3;
const EARLY_PENALTY = 1000;
const MISS = 1500;

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.round = 0;
    this.total = Object.fromEntries(ctx.ids.map((id) => [id, 0]));
  }

  mount(el) {
    el.innerHTML = `
      <div class="game quickdraw">
        <header class="game-head">
          <h2 class="game-title">Quick Draw</h2>
          <p class="game-sub" data-sub></p>
        </header>
        <div class="duel" data-duel></div>
      </div>`;
    this.sub = el.querySelector("[data-sub]");
    this.duel = el.querySelector("[data-duel]");
  }

  start() {
    this.nextRound();
  }

  nextRound() {
    this.round++;
    if (this.round > ROUNDS) return this.end();
    this.times = {};
    this.early = [];
    this.phase = "wait";
    this.sub.textContent = `Round ${this.round} of ${ROUNDS}`;
    this.drawWait();
    this.ctx.viewAll({ stage: "wait", round: this.round, rounds: ROUNDS });
    this.t.after(2 + Math.random() * 3.5, () => this.go());
  }

  drawWait() {
    const names = this.early.map((id) => `<b style="color:${this.ctx.players[id].color}">${esc(this.ctx.players[id].name)}</b>`);
    this.duel.className = "duel is-wait";
    this.duel.innerHTML = `
      <p class="duel-big">Wait for the bell…</p>
      <p class="duel-small">${names.length ? `${names.join(", ")} jumped the gun. +1 second.` : "Tap too early and you get a 1 second penalty."}</p>`;
  }

  go() {
    this.phase = "go";
    this.ctx.sfx.ding();
    this.duel.className = "duel is-go";
    this.duel.innerHTML = `<p class="duel-big">Draw!</p>`;
    this.ctx.ids.forEach((id) => !(id in this.times) && this.ctx.view(id, { stage: "go" }));
    this.t.after(3, () => this.roundOver());
    this.checkAll();
  }

  input(id, data) {
    if (!(id in this.total) || id in this.times) return;
    if (this.phase === "wait" && data.early) {
      this.times[id] = EARLY_PENALTY;
      this.early.push(id);
      this.ctx.sfx.buzz();
      this.ctx.view(id, { stage: "early" });
      this.drawWait();
    } else if (this.phase === "go" && typeof data.ms === "number") {
      this.times[id] = Math.round(Math.min(MISS, Math.max(80, data.ms)));
      this.ctx.view(id, { stage: "hit", ms: this.times[id] });
      this.checkAll();
    }
  }

  checkAll() {
    if (this.phase === "go" && this.ctx.ids.every((id) => id in this.times)) this.t.after(0.4, () => this.roundOver());
  }

  roundOver() {
    if (this.phase !== "go") return;
    this.phase = "between";
    this.t.clear();
    const { ids, players } = this.ctx;
    ids.forEach((id) => {
      this.times[id] ??= MISS;
      this.total[id] += this.times[id];
    });
    const order = [...ids].sort((a, b) => this.times[a] - this.times[b]);
    const label = (id) => (this.early.includes(id) ? "Too early" : this.times[id] >= MISS ? "Asleep" : `${this.times[id]} ms`);
    this.duel.className = "duel is-between";
    this.duel.innerHTML = `
      <ol class="draw-list">
        ${order
          .map(
            (id, i) => `
          <li style="--c:${players[id].color};--i:${i}">
            <span class="draw-name">${esc(players[id].name)}</span>
            <span class="draw-time">${label(id)}</span>
          </li>`
          )
          .join("")}
      </ol>`;
    const fastest = order[0];
    if (!this.early.includes(fastest) && this.times[fastest] < MISS) {
      this.ctx.announce(`${players[fastest].name}, ${this.times[fastest]} milliseconds!`);
    }
    ids.forEach((id) => this.ctx.view(id, { stage: "between", label: label(id) }));
    this.t.after(3.5, () => this.nextRound());
  }

  end() {
    this.ctx.finish(rankBy(this.ctx.ids, (id) => this.total[id], (id) => `${this.total[id]} ms total`));
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "wait") {
    el.innerHTML = `
      <button class="draw-pad is-wait">
        <span class="ph-kicker">Round ${view.round} of ${view.rounds}</span>
        <span class="ph-big">Wait for the bell</span>
        <span>Tap the moment it rings</span>
      </button>`;
    el.querySelector("button").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      send({ early: true });
    }, { once: true });
    return;
  }
  if (view.stage === "go") {
    navigator.vibrate?.(40);
    el.innerHTML = `<button class="draw-pad is-go"><span class="ph-mega">Tap!</span></button>`;
    let shownAt = performance.now();
    requestAnimationFrame(() => (shownAt = performance.now()));
    el.querySelector("button").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      send({ ms: performance.now() - shownAt });
    }, { once: true });
    return;
  }
  const text = {
    early: `<p class="ph-big">Too early</p><p>That’s a 1 second penalty.</p>`,
    hit: `<p class="ph-kicker">Your reaction</p><p class="ph-place">${view.ms}<small>ms</small></p>`,
    between: `<p class="ph-kicker">This round</p><p class="ph-big">${esc(view.label || "")}</p><p>Next round coming up.</p>`,
  }[view.stage];
  el.innerHTML = `<div class="ph-center">${text}</div>`;
}

export default {
  id: "quickdraw",
  title: "Quick Draw",
  how: "Tap the instant the bell rings. Too early costs you a second.",
  minPlayers: 1,
  Host,
  phone,
};
