// Thumb Wars: four quick reaction events in a row.
import { esc, sticker, colorOf, shuffle, ordinal, Timers } from "../../shared.js";
import { message } from "../../ui.js";
import { zeros } from "../kit.js";
import sprint from "./sprint.js";
import quickdraw from "./quickdraw.js";
import blindcount from "./blindcount.js";
import hotpotato from "./hotpotato.js";

const EVENTS = [sprint, quickdraw, blindcount, hotpotato];
const EVENTS_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
const POINTS = [500, 350, 250, 175, 125, 100, 75, 50];

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.score = zeros(ctx.ids);
    this.playlist = shuffle(EVENTS.filter((e) => e.minPlayers <= ctx.ids.length));
    this.i = -1;
    // The events read players[id].color; the hub stores avatars, so derive it on the fly.
    this.players = {};
    ctx.ids.forEach((id) => Object.defineProperty(this.players, id, { get: () => ({ ...ctx.players[id], color: colorOf(ctx.players[id]) }) }));
  }

  mount(el) {
    this.el = el;
  }

  start() {
    this.next();
  }

  next() {
    this.t.clear();
    this.i++;
    if (this.i >= this.playlist.length) return this.ctx.end(this.score);
    const E = this.playlist[this.i];
    this.el.innerHTML = `
      <div class="scene tw-intro">
        <p class="splash-kicker">Event ${this.i + 1} of ${this.playlist.length}</p>
        <h2 class="tw-title">${esc(E.title)}</h2>
        <p class="splash-text">${esc(E.how)}</p>
      </div>`;
    this.ctx.sfx.bell();
    this.ctx.announce(`Event ${this.i + 1}: ${E.title}! ${E.how}`);
    this.ctx.viewAll({ stage: "intro", title: E.title, how: E.how, n: this.i + 1, of: this.playlist.length });
    this.t.after(6, () => this.run(E));
  }

  run(E) {
    const ids = this.ctx.ids.filter((id) => this.ctx.players[id].online);
    const view = (id, data) => this.ctx.view(id, { event: E.id, ...data });
    this.el.innerHTML = `<div class="scene tw-arena"></div>`;
    this.game = new E.Host({
      ids,
      players: this.players,
      view,
      viewAll: (data) => ids.forEach((id) => view(id, typeof data === "function" ? data(id) : data)),
      finish: (ranking) => this.results(E, ranking),
      announce: this.ctx.announce,
      sfx: this.ctx.sfx,
    });
    this.game.mount(this.el.querySelector(".tw-arena"));
    this.game.start();
  }

  results(E, ranking) {
    this.game.destroy();
    this.game = null;
    const rows = ranking.map((r) => ({ ...r, points: POINTS[r.rank - 1] ?? 25 }));
    rows.forEach((r) => (this.score[r.id] += r.points));
    const { players } = this.ctx;
    this.el.innerHTML = `
      <div class="scene">
        <header class="scene-head"><div><p class="scene-pack">Thumb Wars</p><h2 class="scene-title">${esc(E.title)} results</h2></div></header>
        <ol class="standings">
          ${rows
            .map(
              (r, i) => `
            <li style="--i:${i}">
              <span class="st-rank">${r.rank}</span>${sticker(players[r.id], "sm")}<b>${esc(players[r.id].name)}</b>
              <span class="st-label">${esc(r.label)}</span>
              <span class="st-gain">+${r.points}</span>
              <span class="st-score">${this.score[r.id]}</span>
            </li>`
            )
            .join("")}
        </ol>
      </div>`;
    const winners = rows.filter((r) => r.rank === 1).map((r) => players[r.id].name);
    this.ctx.sfx.bell();
    this.ctx.announce(`${winners.join(" and ")} ${winners.length > 1 ? "take" : "takes"} ${E.title}!`);
    const worst = Math.max(...rows.map((r) => r.rank));
    if (rows.length > 1) this.ctx.sips(rows.filter((r) => r.rank === worst).map((r) => ({ id: r.id, n: 1 })), `Last place in ${E.title}`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    this.ctx.viewAll((id) => (byId[id] ? { stage: "results", title: E.title, ...byId[id] } : { stage: "wait" }));
    this.t.after(7, () => this.next());
  }

  input(id, data) {
    this.game?.input(id, data);
  }

  leave(id) {
    this.game?.leave?.(id);
  }

  destroy() {
    this.t.clear();
    this.game?.destroy();
  }
}

function phone(view, el, send) {
  if (view.event) return EVENTS_BY_ID[view.event].phone(view, el, send);
  if (view.stage === "intro") return message(el, { kicker: `Event ${view.n} of ${view.of}`, title: view.title, text: esc(view.how) });
  if (view.stage === "results") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-kicker">${esc(view.title)}</p>
        <p class="ph-place">${ordinal(view.rank)}</p>
        <p class="ph-text">${esc(view.label)}</p>
        <p class="ph-points">+${view.points}</p>
      </div>`;
    return;
  }
  message(el, { title: "Watch the TV" });
}

export default {
  id: "thumbwars",
  title: "Thumb Wars",
  tagline: "Four lightning-fast reaction events.",
  color: "#FF5A4E",
  min: 1,
  max: 8,
  minutes: 6,
  Host,
  phone,
};
