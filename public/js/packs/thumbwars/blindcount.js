import { esc, rankBy, Timers, countdown } from "./common.js";

const TARGET = 7000;
const VISIBLE = 3000;
const LIMIT = 12;

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.stops = {};
    this.running = false;
  }

  mount(el) {
    const { ids, players } = this.ctx;
    el.innerHTML = `
      <div class="game blindcount">
        <header class="game-head">
          <h2 class="game-title">Blind Count</h2>
          <p class="game-sub">Stop at exactly ${(TARGET / 1000).toFixed(2)} seconds</p>
        </header>
        <div class="clock-face"><span class="clock-digits" data-clock>0.00</span></div>
        <div class="stoppers">
          ${ids.map((id) => `<span class="stopper" style="--c:${players[id].color}" data-id="${esc(id)}">${esc(players[id].name)}</span>`).join("")}
        </div>
        <div class="overlay" data-overlay></div>
      </div>`;
    this.el = el;
    this.clock = el.querySelector("[data-clock]");
  }

  start() {
    this.ctx.viewAll({ stage: "ready" });
    countdown(this.el.querySelector("[data-overlay]"), this.t, this.ctx.sfx, () => {
      this.running = true;
      this.startAt = performance.now();
      this.ctx.viewAll({ stage: "go" });
      this.t.after(LIMIT, () => this.end());
      this.tick();
    });
  }

  tick() {
    if (!this.running) return;
    const elapsed = performance.now() - this.startAt;
    if (elapsed < VISIBLE) {
      this.clock.textContent = (elapsed / 1000).toFixed(2);
    } else if (!this.clock.classList.contains("is-hidden")) {
      this.clock.classList.add("is-hidden");
      this.clock.textContent = "?.??";
      this.ctx.announce("Lights out. Keep counting.");
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }

  input(id, data) {
    if (!this.running || !this.ctx.ids.includes(id) || id in this.stops || typeof data.ms !== "number") return;
    this.stops[id] = Math.round(data.ms);
    this.el.querySelector(`.stopper[data-id="${CSS.escape(id)}"]`).classList.add("is-stopped");
    this.ctx.sfx.tick();
    this.ctx.view(id, { stage: "stopped" });
    if (this.ctx.ids.every((pid) => pid in this.stops)) this.t.after(0.6, () => this.end());
  }

  end() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frame);
    const off = (id) => (id in this.stops ? Math.abs(this.stops[id] - TARGET) : 1e9);
    this.ctx.finish(
      rankBy(this.ctx.ids, off, (id) => {
        if (!(id in this.stops)) return "Never stopped";
        const diff = (this.stops[id] - TARGET) / 1000;
        return `${(this.stops[id] / 1000).toFixed(2)} s (${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)})`;
      })
    );
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "ready") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-kicker">Blind Count</p>
        <p class="ph-big">Count to 7</p>
        <p>The clock on the TV goes dark after 3 seconds. Stop it at exactly 7.00.</p>
      </div>`;
    return;
  }
  if (view.stage === "stopped") {
    el.innerHTML = `<div class="ph-center"><p class="ph-big">Stopped</p><p>Your time is revealed after the event.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="ph-center"><button class="stop-btn">Stop</button></div>`;
  let startedAt = performance.now();
  requestAnimationFrame(() => (startedAt = performance.now()));
  el.querySelector(".stop-btn").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    navigator.vibrate?.(60);
    send({ ms: performance.now() - startedAt });
  }, { once: true });
}

export default {
  id: "blindcount",
  title: "Blind Count",
  how: "Stop your clock at exactly 7.00 seconds. The TV clock goes dark after 3.",
  minPlayers: 1,
  Host,
  phone,
};
