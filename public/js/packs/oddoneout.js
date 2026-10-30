// Odd One Out: everyone answers a secret question except the faker, who has to bluff.
import { esc, sticker, shuffle, pick, cleanText, timer, Timers } from "../shared.js";
import { message, textEntry, picker } from "../ui.js";
import { head, splash, roll, standings, zeros } from "./kit.js";
import { FAKER_QUESTIONS } from "../content/faker.js";

const ANSWER_TIME = 45;
const TALK_TIME = 45;
const VOTE_TIME = 25;
const CATCH_POINTS = 500;
const ESCAPE_POINTS = 1000;

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.score = zeros(ctx.ids);
    this.used = new Set();
    this.fakers = shuffle([...ctx.ids]);
    this.rounds = Math.min(5, ctx.ids.length);
    this.round = 0;
  }

  mount(el) {
    this.el = el;
  }

  show(html) {
    this.el.innerHTML = `<div class="scene">${html}</div>`;
  }

  start() {
    this.next();
  }

  next() {
    this.t.clear();
    this.round++;
    if (this.round > this.rounds) return this.ctx.end(this.score);
    this.faker = this.fakers[(this.round - 1) % this.fakers.length];
    this.question = pick(FAKER_QUESTIONS, 1, this.used)[0];
    this.answers = {};
    this.votes = {};
    this.ready = new Set();
    this.phase = "intro";
    this.show(splash(`Round ${this.round} of ${this.rounds}`, "One of you is faking", "Everyone gets the same question. Except one person, who has to blend in."));
    this.ctx.sfx.bell();
    this.ctx.announce(`Round ${this.round}. One of you doesn’t know the question.`);
    this.ctx.viewAll({ stage: "wait", title: "Look at your phone in a second", text: "Don’t let anyone see your screen." });
    this.t.after(4, () => this.openAnswers());
  }

  openAnswers() {
    this.phase = "answer";
    this.deadline = Date.now() + ANSWER_TIME * 1000;
    this.ctx.viewAll((id) => (id === this.faker ? { stage: "answer", faker: true } : { stage: "answer", question: this.question }));
    this.drawAnswering();
    this.t.after(ANSWER_TIME, () => this.reveal());
  }

  drawAnswering() {
    this.show(`
      ${head("Odd One Out", "Answer in secret", timer(this.deadline, ANSWER_TIME))}
      <div class="secret">
        <span class="secret-icon" aria-hidden="true">?</span>
        <p>The question is only on your phones.<br>One of you got nothing.</p>
      </div>
      ${roll(this.ctx.ids, this.ctx.players, new Set(Object.keys(this.answers)))}`);
  }

  reveal() {
    if (this.phase !== "answer") return;
    this.t.clear();
    this.phase = "talk";
    this.ctx.ids.forEach((id) => (this.answers[id] ??= "(no answer)"));
    this.deadline = Date.now() + TALK_TIME * 1000;
    this.drawTalk();
    this.ctx.sfx.whoosh();
    this.ctx.announce("Here are your answers. Who’s faking it? Talk it out.");
    this.ctx.viewAll({ stage: "talk" });
    this.t.after(TALK_TIME, () => this.openVote());
  }

  drawTalk() {
    const { players } = this.ctx;
    this.show(`
      ${head("Odd One Out", "Who’s faking it?", timer(this.deadline, TALK_TIME))}
      <div class="prompt-card is-small"><small>The question was</small>${esc(this.question)}</div>
      <div class="suspects">
        ${this.ctx.ids
          .map(
            (id, i) => `
          <div class="suspect" style="--i:${i}">
            ${sticker(players[id], "md")}
            <b>${esc(players[id].name)}</b>
            <p class="suspect-answer">${esc(this.answers[id])}</p>
          </div>`
          )
          .join("")}
      </div>
      <p class="scene-foot">Argue! Voting opens when the timer ends or everyone taps “Ready to vote”. (${this.ready.size}/${this.ctx.ids.length})</p>`);
  }

  openVote() {
    if (this.phase !== "talk") return;
    this.t.clear();
    this.phase = "vote";
    this.deadline = Date.now() + VOTE_TIME * 1000;
    this.drawVote();
    this.ctx.sfx.ding();
    const { players } = this.ctx;
    this.ctx.viewAll((id) => ({
      stage: "vote",
      options: this.ctx.ids.filter((x) => x !== id).map((x) => ({ id: x, label: players[x].name, sub: this.answers[x], avatar: players[x].avatar })),
    }));
    this.t.after(VOTE_TIME, () => this.result());
  }

  drawVote() {
    this.show(`
      ${head("Odd One Out", "Vote for the faker", timer(this.deadline, VOTE_TIME))}
      <div class="prompt-card is-small"><small>The question was</small>${esc(this.question)}</div>
      ${roll(this.ctx.ids, this.ctx.players, new Set(Object.keys(this.votes)))}`);
  }

  result() {
    if (this.phase !== "vote") return;
    this.t.clear();
    this.phase = "result";
    const tally = {};
    Object.values(this.votes).forEach((v) => (tally[v] = (tally[v] || 0) + 1));
    const top = Math.max(0, ...Object.values(tally));
    const leaders = Object.keys(tally).filter((id) => tally[id] === top);
    const accused = top > 0 && leaders.length === 1 ? leaders[0] : null;
    const caught = accused === this.faker;
    const { players } = this.ctx;
    const faker = players[this.faker];
    const rightVoters = Object.keys(this.votes).filter((v) => this.votes[v] === this.faker);
    const wrongVoters = Object.keys(this.votes).filter((v) => this.votes[v] !== this.faker);

    rightVoters.forEach((id) => (this.score[id] += CATCH_POINTS));
    if (!caught) this.score[this.faker] += ESCAPE_POINTS;

    // Drumroll, then the reveal.
    this.show(`
      ${head("Odd One Out", "The faker was…")}
      <div class="drumroll">${this.ctx.ids.map((id) => sticker(players[id], "md", "is-shuffle")).join("")}</div>`);
    this.ctx.announce("The faker was…");
    this.t.after(2.5, () => {
      this.show(`
        ${head("Odd One Out", caught ? "Caught!" : "Got away!")}
        <div class="unmask ${caught ? "is-caught" : "is-escaped"}">
          ${sticker(faker, "xl", "is-bounce")}
          <p class="unmask-name">${esc(faker.name)}</p>
          <p class="unmask-answer">answered “${esc(this.answers[this.faker])}”</p>
          <span class="stamp">${caught ? "Caught" : "Got away"}</span>
        </div>
        <div class="vote-tally">
          ${this.ctx.ids
            .filter((id) => tally[id])
            .map((id) => `<span>${sticker(players[id], "xs")} ${esc(players[id].name)} <b>${tally[id]}</b></span>`)
            .join("")}
        </div>`);
      this.ctx.sfx[caught ? "ding" : "buzz"]();
      this.ctx.announce(caught ? `Caught! It was ${faker.name}.` : `${faker.name} got away with it!`);
      if (caught) this.ctx.sip(this.faker, 2, "Caught faking");
      else this.ctx.sips(wrongVoters.map((id) => ({ id, n: 1 })), "Voted for the wrong person");
      this.ctx.viewAll((id) => ({
        stage: "result",
        title: id === this.faker ? (caught ? "You got caught" : "You got away with it") : rightVoters.includes(id) ? "You spotted the faker" : "You got fooled",
        text: `${esc(faker.name)} was faking. The question was “${esc(this.question)}”.`,
      }));
      this.t.after(7, () => {
        this.show(`${head("Odd One Out", `After round ${this.round}`)}${standings(this.ctx.ids, players, this.score)}`);
        this.t.after(5, () => this.next());
      });
    });
  }

  input(id, data) {
    if (!this.ctx.ids.includes(id)) return;
    if (this.phase === "answer" && typeof data.answer === "string" && !(id in this.answers)) {
      this.answers[id] = cleanText(data.answer, 40) || "(no answer)";
      this.ctx.view(id, { stage: "wait", title: "Locked in", text: "Act natural." });
      this.drawAnswering();
      if (this.ctx.ids.every((p) => p in this.answers)) this.t.after(0.6, () => this.reveal());
    } else if (this.phase === "talk" && data.ready) {
      this.ready.add(id);
      this.drawTalk();
      if (this.ready.size === this.ctx.ids.length) this.openVote();
    } else if (this.phase === "vote" && typeof data.vote === "string" && data.vote !== id && !(id in this.votes) && this.ctx.ids.includes(data.vote)) {
      this.votes[id] = data.vote;
      this.ctx.view(id, { stage: "wait", title: "Vote locked in", text: "" });
      this.drawVote();
      if (Object.keys(this.votes).length === this.ctx.ids.length) this.t.after(0.6, () => this.result());
    }
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "answer") {
    if (view.faker) {
      return textEntry(el, {
        kicker: "You’re the faker",
        prompt: "You don’t know the question. Write something that blends in.",
        placeholder: "A believable answer",
        max: 40,
        button: "Bluff",
        onSubmit: (answer) => send({ answer }),
      });
    }
    return textEntry(el, { kicker: "Secret question", prompt: view.question, max: 40, button: "Send", onSubmit: (answer) => send({ answer }) });
  }
  if (view.stage === "talk") {
    el.innerHTML = `
      <div class="ph-center">
        <p class="ph-title">Who’s faking it?</p>
        <p class="ph-text">Discuss the answers on the TV. Vote when you’re sure.</p>
      </div>
      <div class="dock"><button class="btn btn-big" data-act="ready">Ready to vote</button></div>`;
    el.querySelector("[data-act=ready]").addEventListener("click", (e) => {
      e.target.disabled = true;
      e.target.textContent = "Waiting for the others…";
      send({ ready: true });
    });
    return;
  }
  if (view.stage === "vote") {
    return picker(el, {
      kicker: "Vote",
      title: "Who’s the faker?",
      options: view.options.map((o) => ({ id: o.id, label: o.label, sub: `“${o.sub}”`, player: { name: o.label, avatar: o.avatar } })),
      onPick: (vote) => send({ vote }),
    });
  }
  message(el, { title: view.title || "", text: view.text || "" });
}

export default {
  id: "oddoneout",
  title: "Odd One Out",
  tagline: "One of you doesn’t know the question.",
  color: "#8C6CFF",
  min: 3,
  max: 8,
  minutes: 12,
  Host,
  phone,
};
