// Know-It-All: a quiz show in three rounds; the last round is worth double.
import { esc, sticker, shuffle, timer, Timers } from "../shared.js";
import { message } from "../ui.js";
import { head, splash, roll, standings, zeros } from "./kit.js";
import { TRIVIA } from "../content/trivia.js";

const ROUNDS = [
  { name: "Round 1", count: 4, mult: 1 },
  { name: "Round 2", count: 4, mult: 1 },
  { name: "Final round", count: 4, mult: 2 },
];
const QUESTION_TIME = 15;
const LETTERS = ["A", "B", "C", "D"];

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.score = zeros(ctx.ids);
    // Spread the questions over as many categories as possible.
    const byCat = {};
    shuffle([...TRIVIA]).forEach((q) => (byCat[q.cat] ??= []).push(q));
    const cats = shuffle(Object.keys(byCat));
    const total = ROUNDS.reduce((n, r) => n + r.count, 0);
    this.questions = [];
    for (let i = 0; this.questions.length < total; i++) {
      const q = byCat[cats[i % cats.length]].pop();
      if (q) this.questions.push(q);
    }
    this.r = -1;
    this.qi = -1;
  }

  mount(el) {
    this.el = el;
  }

  show(html) {
    this.el.innerHTML = `<div class="scene">${html}</div>`;
  }

  start() {
    this.nextRound();
  }

  get round() {
    return ROUNDS[this.r];
  }

  nextRound() {
    this.t.clear();
    this.r++;
    if (this.r >= ROUNDS.length) return this.ctx.end(this.score);
    this.inRound = 0;
    const last = this.r === ROUNDS.length - 1;
    this.show(splash(`${this.round.name}`, last ? "Double points" : `${this.round.count} questions`, last ? "Every answer is worth twice as much. Anything can happen." : "Fast and right scores the most."));
    this.ctx.sfx.bell();
    this.ctx.announce(last ? "Final round! Everything is worth double." : `${this.round.name}. Fingers ready.`);
    this.ctx.viewAll({ stage: "wait", title: this.round.name, text: "Get ready…" });
    this.t.after(4, () => this.nextQuestion());
  }

  nextQuestion() {
    this.t.clear();
    if (this.inRound >= this.round.count) return this.showScores();
    this.inRound++;
    this.qi++;
    this.q = this.questions[this.qi];
    this.answers = {};
    this.phase = "category";
    this.show(`
      ${head("Know-It-All", `Question ${this.qi + 1} of ${this.questions.length}`)}
      <div class="category-card"><small>Category</small>${esc(this.q.cat)}</div>`);
    this.ctx.sfx.whoosh();
    this.ctx.viewAll({ stage: "wait", title: this.q.cat, text: "Question coming up…" });
    this.t.after(2.5, () => this.ask());
  }

  ask() {
    this.phase = "question";
    this.startAt = Date.now();
    this.deadline = this.startAt + QUESTION_TIME * 1000;
    this.draw(false);
    this.ctx.viewAll({ stage: "question", choices: this.q.choices });
    this.t.after(QUESTION_TIME, () => this.reveal());
  }

  draw(revealed) {
    const { ids, players } = this.ctx;
    this.show(`
      ${head("Know-It-All", `${esc(this.q.cat)} · ${this.inRound}/${this.round.count}${this.round.mult > 1 ? " · double points" : ""}`, revealed ? "" : timer(this.deadline, QUESTION_TIME))}
      <h3 class="question">${esc(this.q.q)}</h3>
      <div class="choices">
        ${this.q.choices
          .map((c, i) => {
            const pickers = ids.filter((id) => this.answers[id]?.choice === i);
            const cls = revealed ? (i === this.q.answer ? "is-right" : "is-out") : "";
            return `
            <div class="choice c${i} ${cls}">
              <span class="choice-letter">${LETTERS[i]}</span>
              <span class="choice-text">${esc(c)}</span>
              ${revealed ? `<span class="choice-pickers">${pickers.map((id) => sticker(players[id], "xs")).join("")}</span>` : ""}
            </div>`;
          })
          .join("")}
      </div>
      ${revealed ? "" : roll(ids, players, new Set(Object.keys(this.answers)))}`);
  }

  reveal() {
    if (this.phase !== "question") return;
    this.t.clear();
    this.phase = "reveal";
    const gains = {};
    const wrong = [];
    this.ctx.ids.forEach((id) => {
      const a = this.answers[id];
      if (a && a.choice === this.q.answer) {
        const speed = Math.max(0, 1 - (a.at - this.startAt) / (QUESTION_TIME * 1000));
        gains[id] = Math.round((500 + 500 * speed) * this.round.mult);
        this.score[id] += gains[id];
      } else {
        wrong.push(id);
      }
    });
    this.draw(true);
    this.ctx.sfx.ding();
    const right = Object.keys(gains);
    this.ctx.announce(right.length === 0 ? "Nobody got that one!" : right.length === this.ctx.ids.length ? "Everybody got it!" : `The answer was ${this.q.choices[this.q.answer]}.`);
    this.ctx.sips(wrong.map((id) => ({ id, n: 1 })), "Wrong answer");
    this.ctx.viewAll((id) => ({ stage: "result", right: id in gains, gain: gains[id] || 0, answer: `${LETTERS[this.q.answer]}: ${this.q.choices[this.q.answer]}` }));
    this.t.after(5, () => this.nextQuestion());
  }

  showScores() {
    this.show(`${head("Know-It-All", `After ${this.round.name.toLowerCase()}`)}${standings(this.ctx.ids, this.ctx.players, this.score)}`);
    this.ctx.viewAll({ stage: "wait", title: "Scores on the TV", text: "" });
    this.t.after(6, () => this.nextRound());
  }

  input(id, data) {
    if (this.phase !== "question" || !this.ctx.ids.includes(id) || id in this.answers) return;
    const choice = Number(data.choice);
    if (!(choice >= 0 && choice < 4)) return;
    this.answers[id] = { choice, at: Date.now() };
    this.ctx.view(id, { stage: "locked", choice, label: this.q.choices[choice] });
    this.draw(false);
    if (this.ctx.ids.every((p) => p in this.answers)) this.t.after(0.5, () => this.reveal());
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "question") {
    el.innerHTML = `
      <div class="quiz-pad">
        ${view.choices
          .map((c, i) => `<button class="quiz-key c${i}" data-choice="${i}"><span class="quiz-letter">${LETTERS[i]}</span><span class="quiz-text">${esc(c)}</span></button>`)
          .join("")}
      </div>`;
    el.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => {
        navigator.vibrate?.(25);
        el.querySelectorAll("button").forEach((b) => (b.disabled = true));
        send({ choice: Number(btn.dataset.choice) });
      })
    );
    return;
  }
  if (view.stage === "locked") return message(el, { kicker: "Locked in", title: `${LETTERS[view.choice]}: ${view.label}`, text: "Waiting for the others…" });
  if (view.stage === "result") {
    return message(el, view.right ? { kicker: "Correct", title: `+${view.gain}`, big: true } : { kicker: "Wrong", title: "Not quite", text: `It was ${esc(view.answer)}.` });
  }
  message(el, { title: view.title || "", text: esc(view.text || "") });
}

export default {
  id: "knowitall",
  title: "Know-It-All",
  tagline: "A quiz show. Last round counts double.",
  color: "#36A9F5",
  min: 1,
  max: 8,
  minutes: 10,
  Host,
  phone,
};
