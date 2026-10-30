// Tick Talk: in teams, describe five words in 30 seconds without saying them.
import { esc, sticker, shuffle, pick, timer, Timers } from "../shared.js";
import { message } from "../ui.js";
import { head, splash, zeros } from "./kit.js";
import { WORDS } from "../content/words.js";

const TURN_TIME = 30;
const CARD_SIZE = 5;
const READY_TIMEOUT = 45;
const TEAMS = [
  { name: "Team Toast", color: "#F4A340" },
  { name: "Team Bubble", color: "#36A9F5" },
];

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.used = new Set();
    const ids = shuffle([...ctx.ids]);
    this.teams = TEAMS.map((team, i) => ({ ...team, ids: ids.filter((_, k) => k % 2 === i), score: 0, next: 0 }));
    // Everyone describes at least once; the smaller team repeats a describer to keep turns even.
    this.turns = 2 * Math.max(...this.teams.map((team) => team.ids.length));
    this.turn = 0;
  }

  mount(el) {
    this.el = el;
  }

  show(html) {
    this.el.innerHTML = `<div class="scene">${html}</div>`;
  }

  teamOf(id) {
    return this.teams.find((team) => team.ids.includes(id));
  }

  start() {
    this.show(`
      ${splash("Tick Talk", "Pick your team", "Describe the words on your phone without saying them. Your team shouts. 30 seconds.")}
      <div class="teams">${this.teams.map((team) => this.teamCard(team)).join("")}</div>`);
    this.ctx.sfx.bell();
    this.ctx.announce(`Here are your teams. ${this.teams[0].name} versus ${this.teams[1].name}!`);
    this.ctx.viewAll((id) => ({ stage: "team", team: this.teamOf(id).name, color: this.teamOf(id).color }));
    this.t.after(6, () => this.nextTurn());
  }

  teamCard(team, active = null) {
    return `
      <div class="team-card" style="--c:${team.color}">
        <p class="team-name">${esc(team.name)}</p>
        <p class="team-score">${team.score}</p>
        <div class="team-members">${team.ids.map((id) => `<span class="${id === active ? "is-active" : ""}">${sticker(this.ctx.players[id], "sm")}</span>`).join("")}</div>
      </div>`;
  }

  nextTurn() {
    this.t.clear();
    if (this.turn >= this.turns) return this.finish();
    this.team = this.teams[this.turn % 2];
    this.other = this.teams[(this.turn + 1) % 2];
    this.describer = this.team.ids[this.team.next % this.team.ids.length];
    this.team.next++;
    this.turn++;
    this.words = pick(WORDS, CARD_SIZE, this.used);
    this.got = new Set();
    this.phase = "ready";

    const p = this.ctx.players[this.describer];
    this.show(`
      ${head("Tick Talk", `Turn ${this.turn} of ${this.turns}`)}
      <div class="up-next" style="--c:${this.team.color}">
        ${sticker(p, "xl", "is-bounce")}
        <p class="up-next-name">${esc(p.name)}</p>
        <p class="up-next-team">describes for ${esc(this.team.name)}</p>
        <p class="scene-foot">Waiting for ${esc(p.name)} to press Start…</p>
      </div>
      <div class="teams is-small">${this.teams.map((team) => this.teamCard(team, this.describer)).join("")}</div>`);
    this.ctx.announce(`${p.name}, you’re up for ${this.team.name}.`);
    this.ctx.viewAll((id) =>
      id === this.describer
        ? { stage: "ready" }
        : this.team.ids.includes(id)
          ? { stage: "wait", title: `${p.name} is describing`, text: "Get ready to shout answers." }
          : { stage: "wait", title: `${this.team.name}’s turn`, text: "You’ll see the words so you can catch cheaters." }
    );
    this.t.after(READY_TIMEOUT, () => this.go());
  }

  go() {
    if (this.phase !== "ready") return;
    this.t.clear();
    this.phase = "turn";
    this.deadline = Date.now() + TURN_TIME * 1000;
    this.drawTurn();
    this.ctx.sfx.go();
    const p = this.ctx.players[this.describer];
    this.ctx.viewAll((id) =>
      id === this.describer
        ? { stage: "describe", words: this.words, got: [], deadline: this.deadline }
        : this.team.ids.includes(id)
          ? { stage: "guess", describer: p.name }
          : { stage: "referee", words: this.words, describer: p.name }
    );
    this.t.every(1, () => {
      const left = Math.ceil((this.deadline - Date.now()) / 1000);
      if (left <= 5 && left > 0) this.ctx.sfx.tick();
    });
    this.t.after(TURN_TIME, () => this.endTurn());
  }

  drawTurn() {
    const p = this.ctx.players[this.describer];
    this.show(`
      ${head("Tick Talk", `${esc(this.team.name)} · ${esc(p.name)} describes`)}
      <div class="turn">
        ${timer(this.deadline, TURN_TIME, "is-huge")}
        <div class="turn-count" style="--c:${this.team.color}">
          <span class="turn-got">${this.got.size}</span><small>of ${CARD_SIZE} words</small>
        </div>
      </div>
      <div class="teams is-small">${this.teams.map((team) => this.teamCard(team, this.describer)).join("")}</div>`);
  }

  endTurn() {
    if (this.phase !== "turn") return;
    this.t.clear();
    this.phase = "result";
    this.team.score += this.got.size;
    this.ctx.sfx.buzz();
    this.show(`
      ${head("Tick Talk", `${esc(this.team.name)} scores ${this.got.size}`)}
      <div class="word-reveal">
        ${this.words.map((w, i) => `<span class="word ${this.got.has(i) ? "is-got" : ""}" style="--i:${i}">${esc(w)}</span>`).join("")}
      </div>
      <div class="teams is-small">${this.teams.map((team) => this.teamCard(team)).join("")}</div>`);
    const name = this.ctx.players[this.describer].name;
    this.ctx.announce(this.got.size === CARD_SIZE ? `All five! Brilliant, ${name}!` : `Time! ${this.got.size} for ${this.team.name}.`);
    if (this.got.size === 0) this.ctx.sip(this.describer, 2, "Zero words in Tick Talk");
    this.ctx.viewAll({ stage: "wait", title: `${this.got.size} of ${CARD_SIZE}`, text: "Next turn coming up." });
    this.t.after(6, () => this.nextTurn());
  }

  finish() {
    const [a, b] = this.teams;
    const winner = a.score === b.score ? null : a.score > b.score ? a : b;
    const loser = winner === a ? b : winner === b ? a : null;
    this.show(`
      ${splash("Tick Talk", winner ? `${winner.name} wins!` : "It’s a draw!", `${a.score} – ${b.score}`)}
      <div class="teams">${this.teams.map((team) => this.teamCard(team)).join("")}</div>`);
    this.ctx.sfx.bell();
    this.ctx.announce(winner ? `${winner.name} wins Tick Talk!` : "It’s a draw!");
    if (loser) this.ctx.sips(loser.ids.map((id) => ({ id, n: 2 })), "Losing team in Tick Talk");
    // Players score their team's total, with a bonus for being on the winning team.
    const scores = zeros(this.ctx.ids);
    this.teams.forEach((team) => team.ids.forEach((id) => (scores[id] = team.score * 100 + (team === winner ? 500 : 0))));
    this.t.after(6, () => this.ctx.end(scores));
  }

  input(id, data) {
    if (id !== this.describer) return;
    if (this.phase === "ready" && data.start) return this.go();
    if (this.phase === "turn" && Array.isArray(data.got)) {
      const before = this.got.size;
      this.got = new Set(data.got.filter((i) => Number.isInteger(i) && i >= 0 && i < CARD_SIZE));
      if (this.got.size > before) this.ctx.sfx.ding();
      this.drawTurn();
      if (this.got.size === CARD_SIZE) this.t.after(0.6, () => this.endTurn());
    }
  }

  leave(id) {
    if (id === this.describer && this.phase === "ready") this.go();
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "team") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-kicker">You’re on</p>
        <p class="ph-mega" style="color:${view.color}">${esc(view.team)}</p>
        <p class="ph-text">Look at the TV to see your teammates.</p>
      </div>`;
    return;
  }
  if (view.stage === "ready") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-kicker">You’re describing</p>
        <p class="ph-title">Describe 5 words in 30 seconds</p>
        <p class="ph-text">Don’t say the word itself. Tap each word when your team gets it.</p>
      </div>
      <div class="dock"><button class="btn btn-big" data-act="start">Start the clock</button></div>`;
    el.querySelector("[data-act=start]").addEventListener("click", (e) => {
      e.target.disabled = true;
      send({ start: true });
    });
    return;
  }
  if (view.stage === "describe") {
    const got = new Set(view.got);
    el.innerHTML = `
      <div class="describe">
        <div class="describe-top"><span class="ph-kicker">Tap when they get it</span><span class="describe-time" data-deadline="${view.deadline}">30</span></div>
        <div class="word-list">
          ${view.words.map((w, i) => `<button class="word-btn" data-i="${i}">${esc(w)}</button>`).join("")}
        </div>
      </div>`;
    el.querySelectorAll(".word-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.i);
        got.has(i) ? got.delete(i) : got.add(i);
        btn.classList.toggle("is-got", got.has(i));
        navigator.vibrate?.(20);
        send({ got: [...got] });
      })
    );
    return;
  }
  if (view.stage === "guess") return message(el, { kicker: "Your team’s turn", title: "Shout!", text: `${esc(view.describer)} is describing. Guess out loud.`, big: true });
  if (view.stage === "referee") {
    el.innerHTML = `
      <div class="referee">
        <p class="ph-kicker">Keep quiet and watch for cheating</p>
        <p class="ph-text">${esc(view.describer)} may not say these words:</p>
        <ul class="ref-words">${view.words.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      </div>`;
    return;
  }
  message(el, { title: view.title || "", text: esc(view.text || "") });
}

export default {
  id: "ticktalk",
  title: "Tick Talk",
  tagline: "Describe five words in 30 seconds. In teams.",
  color: "#FF7EB6",
  min: 4,
  max: 8,
  minutes: 12,
  Host,
  phone,
};
