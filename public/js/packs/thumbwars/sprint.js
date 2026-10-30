import { esc, ordinal, rankBy, Timers, countdown } from "./common.js";

const TARGET = 60;
const LIMIT = 20;

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.taps = Object.fromEntries(ctx.ids.map((id) => [id, 0]));
    this.done = []; // { id, ms } in finishing order
    this.running = false;
  }

  mount(el) {
    const { players, ids } = this.ctx;
    el.innerHTML = `
      <div class="game sprint">
        <header class="game-head">
          <h2 class="game-title">Thumb Sprint</h2>
          <p class="game-sub">First to ${TARGET} taps hits the ropes</p>
        </header>
        <div class="lanes">
          ${ids
            .map(
              (id) => `
            <div class="lane" style="--c:${players[id].color}" data-id="${esc(id)}">
              <span class="lane-name">${esc(players[id].name)}</span>
              <div class="track"><span class="runner"></span></div>
              <span class="lane-count">0</span>
            </div>`
            )
            .join("")}
        </div>
        <div class="overlay" data-overlay></div>
      </div>`;
    this.el = el;
  }

  start() {
    this.ctx.viewAll({ stage: "ready" });
    countdown(this.el.querySelector("[data-overlay]"), this.t, this.ctx.sfx, () => {
      this.running = true;
      this.startAt = performance.now();
      this.ctx.viewAll({ stage: "go", target: TARGET });
      this.t.after(LIMIT, () => this.end());
    });
  }

  input(id, data) {
    if (!this.running || !(id in this.taps) || this.done.some((d) => d.id === id)) return;
    this.taps[id] = Math.min(TARGET, Math.max(this.taps[id], data.taps | 0));
    const lane = this.el.querySelector(`.lane[data-id="${CSS.escape(id)}"]`);
    lane.style.setProperty("--p", this.taps[id] / TARGET);
    lane.querySelector(".lane-count").textContent = this.taps[id];

    if (this.taps[id] < TARGET) return;
    this.done.push({ id, ms: performance.now() - this.startAt });
    lane.classList.add("is-done");
    this.ctx.sfx.ding();
    this.ctx.view(id, { stage: "done", place: this.done.length });
    if (this.done.length === 1) this.ctx.announce(`${this.ctx.players[id].name} hits the ropes first!`);
    if (this.done.length === this.ctx.ids.length) this.t.after(0.8, () => this.end());
  }

  end() {
    if (!this.running) return;
    this.running = false;
    const finished = Object.fromEntries(this.done.map((d) => [d.id, d.ms]));
    this.ctx.finish(
      rankBy(
        this.ctx.ids,
        (id) => finished[id] ?? 1e6 - this.taps[id],
        (id) => (id in finished ? `${(finished[id] / 1000).toFixed(2)} s` : `${this.taps[id]} taps`)
      )
    );
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "ready") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-kicker">Thumb Sprint</p>
        <p class="ph-big">Thumb on the glass</p>
        <p>Start tapping when the TV says go.</p>
      </div>`;
    return;
  }
  if (view.stage === "done") {
    navigator.vibrate?.(120);
    el.innerHTML = `<div class="ph-center"><p class="ph-kicker">You finished</p><p class="ph-place">${ordinal(view.place)}</p></div>`;
    return;
  }

  let count = 0;
  let sent = 0;
  el.innerHTML = `
    <button class="mash" aria-label="Tap as fast as you can">
      <span class="mash-count">0</span>
      <span class="mash-of">of ${view.target}</span>
      <span class="mash-label">Tap tap tap</span>
    </button>`;
  const pad = el.querySelector(".mash");
  const out = el.querySelector(".mash-count");
  const flush = () => {
    if (count !== sent) send({ taps: (sent = count) });
  };
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (count >= view.target) return;
    out.textContent = ++count;
    pad.style.setProperty("--fill", count / view.target);
    pad.classList.toggle("is-bump");
    if (count >= view.target) flush();
  });
  const iv = setInterval(flush, 100);
  return () => clearInterval(iv);
}

export default {
  id: "sprint",
  title: "Thumb Sprint",
  how: `Tap as fast as you can. First to ${TARGET} taps wins.`,
  minPlayers: 1,
  Host,
  phone,
};
