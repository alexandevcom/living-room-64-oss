// Punchline: everyone writes answers to prompts, then the room votes on head-to-head matchups.
import { esc, sticker, shuffle, pick, cleanText, timer, Timers } from "../shared.js";
import { message, textEntry, picker } from "../ui.js";
import { head, splash, roll, standings, zeros } from "./kit.js";
import { PROMPTS, FINAL_PROMPTS } from "../content/prompts.js";

const WRITE_TIME = 90;
const VOTE_TIME = 20;
const FINAL_WRITE_TIME = 60;
const FINAL_VOTE_TIME = 25;
const NO_ANSWER = "(no answer)";

class Host {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = new Timers();
    this.score = zeros(ctx.ids);
    this.round = 0;
    this.used = new Set();
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

  nextRound() {
    this.t.clear();
    this.round++;
    if (this.round <= 2) return this.writeRound();
    if (this.round === 3) return this.finalRound();
    this.ctx.end(this.score);
  }

  /* ----- Rounds 1 and 2: matchups ----- */

  writeRound() {
    const ids = shuffle([...this.ctx.ids]);
    const prompts = pick(PROMPTS, ids.length, this.used);
    // Prompt i goes to players i and i+1, so everyone answers exactly two.
    this.matchups = prompts.map((text, i) => ({ text, a: ids[i], b: ids[(i + 1) % ids.length], answers: {}, votes: {} }));
    this.phase = "intro";
    const points = this.round * 1000;
    this.show(splash(`Round ${this.round} of 3`, this.round === 1 ? "Write something funny" : "Double points", `Answer two prompts on your phone. Every matchup is worth up to <b>${points}</b> points.`));
    this.ctx.sfx.bell();
    this.ctx.announce(this.round === 1 ? "Round one. Grab your phones and be funny." : "Round two. Everything is worth double.");
    this.ctx.viewAll({ stage: "wait", title: `Round ${this.round}`, text: "Prompts incoming…" });
    this.t.after(4, () => this.openWriting());
  }

  myPrompts(id) {
    return this.matchups.map((m, i) => ({ i, text: m.text, mine: m.a === id || m.b === id })).filter((p) => p.mine && !(id in this.matchups[p.i].answers));
  }

  openWriting() {
    this.phase = "write";
    this.deadline = Date.now() + WRITE_TIME * 1000;
    this.ctx.viewAll((id) => ({ stage: "write", prompts: this.myPrompts(id).map(({ i, text }) => ({ i, text })) }));
    this.drawWriting();
    this.t.after(WRITE_TIME, () => this.closeWriting());
  }

  doneWriting(id) {
    return this.myPrompts(id).length === 0;
  }

  drawWriting() {
    const done = new Set(this.ctx.ids.filter((id) => this.doneWriting(id)));
    this.show(`
      ${head("Punchline", "Write your answers", timer(this.deadline, WRITE_TIME))}
      <div class="write-hero">
        <p class="write-hint">Check your phone. Two prompts each. Keep it short, keep it stupid.</p>
      </div>
      ${roll(this.ctx.ids, this.ctx.players, done)}`);
  }

  closeWriting() {
    this.t.clear();
    this.matchups.forEach((m) => [m.a, m.b].forEach((id) => (m.answers[id] ??= NO_ANSWER)));
    this.index = -1;
    this.nextMatchup();
  }

  /* ----- Voting ----- */

  nextMatchup() {
    this.t.clear();
    this.index++;
    if (this.index >= this.matchups.length) return this.showScores();
    const m = this.matchups[this.index];
    this.current = m;
    this.phase = "vote";
    this.deadline = Date.now() + VOTE_TIME * 1000;
    this.voters = this.ctx.ids.filter((id) => id !== m.a && id !== m.b);
    this.drawMatchup(false);
    this.ctx.sfx.whoosh();
    this.ctx.viewAll((id) =>
      this.voters.includes(id)
        ? { stage: "vote", prompt: m.text, a: m.answers[m.a], b: m.answers[m.b] }
        : { stage: "wait", title: "Your answer is up", text: "You can’t vote on your own matchup." }
    );
    if (!this.voters.length) this.t.after(4, () => this.reveal());
    else this.t.after(VOTE_TIME, () => this.reveal());
  }

  drawMatchup(revealed) {
    const m = this.current;
    const { players } = this.ctx;
    const total = Object.keys(m.votes).length;
    const side = (key) => {
      const author = m[key];
      const voters = Object.keys(m.votes).filter((v) => m.votes[v] === key);
      const r = this.results?.[key];
      return `
        <div class="answer-card side-${key} ${revealed ? (r.won ? "is-won" : "is-lost") : ""}">
          <p class="answer-text">${esc(m.answers[author])}</p>
          ${revealed
            ? `<div class="answer-reveal">
                 <span class="answer-votes">${voters.length}<small>${voters.length === 1 ? "vote" : "votes"}</small></span>
                 <span class="answer-voters">${voters.map((v) => sticker(players[v], "xs")).join("")}</span>
                 <span class="answer-author">${sticker(players[author], "sm")}<b>${esc(players[author].name)}</b></span>
                 <span class="answer-points">+${r.points}</span>
               </div>
               ${r.sweep ? `<span class="stamp">Clean sweep!</span>` : ""}`
            : ""}
        </div>`;
    };
    this.show(`
      ${head("Punchline", `Matchup ${this.index + 1} of ${this.matchups.length}`, revealed ? "" : timer(this.deadline, VOTE_TIME))}
      <div class="prompt-card">${esc(m.text)}</div>
      <div class="matchup">${side("a")}<span class="versus">vs</span>${side("b")}</div>
      <p class="scene-foot">${revealed ? "" : `${total} of ${this.voters.length} votes in`}</p>`);
  }

  reveal() {
    if (this.phase !== "vote") return;
    this.t.clear();
    this.phase = "reveal";
    const m = this.current;
    const counts = { a: 0, b: 0 };
    Object.values(m.votes).forEach((v) => counts[v]++);
    const total = counts.a + counts.b;
    const pot = this.round * 1000;
    this.results = {};
    ["a", "b"].forEach((key) => {
      const other = key === "a" ? "b" : "a";
      const sweep = total > 1 && counts[key] === total;
      const points = (total ? Math.round((pot * counts[key]) / total) : 0) + (sweep ? 250 * this.round : 0);
      this.results[key] = { points, sweep, won: counts[key] > counts[other] };
      this.score[m[key]] += points;
    });
    this.drawMatchup(true);
    this.ctx.sfx.ding();

    const winner = counts.a === counts.b ? null : counts.a > counts.b ? "a" : "b";
    if (winner) {
      const loser = winner === "a" ? "b" : "a";
      const name = this.ctx.players[m[winner]].name;
      this.ctx.announce(this.results[winner].sweep ? `Clean sweep for ${name}!` : `${name} takes it!`);
      this.ctx.sip(m[loser], this.results[winner].sweep ? 2 : 1, this.results[winner].sweep ? "Swept in Punchline" : "Lost a Punchline matchup");
    } else {
      this.ctx.announce("It’s a tie!");
    }
    this.ctx.viewAll((id) => ({ stage: "wait", title: "Results on the TV", text: "" }));
    this.t.after(7, () => this.nextMatchup());
  }

  showScores() {
    this.phase = "scores";
    this.show(`${head("Punchline", `After round ${this.round}`)}${standings(this.ctx.ids, this.ctx.players, this.score)}`);
    this.ctx.viewAll({ stage: "wait", title: "Scores on the TV", text: "" });
    this.t.after(6, () => this.nextRound());
  }

  /* ----- Round 3: everybody answers the same prompt ----- */

  finalRound() {
    this.final = { text: pick(FINAL_PROMPTS, 1, this.used)[0], answers: {}, votes: {} };
    this.phase = "intro";
    this.show(splash("Final round", "Everybody’s punchline", "One prompt for everyone. Then vote for your favourite answer. <b>400</b> points per vote."));
    this.ctx.sfx.bell();
    this.ctx.announce("Final round. One prompt, everybody answers.");
    this.ctx.viewAll({ stage: "wait", title: "Final round", text: "Get ready…" });
    this.t.after(4, () => {
      this.phase = "final-write";
      this.deadline = Date.now() + FINAL_WRITE_TIME * 1000;
      this.ctx.viewAll({ stage: "write", prompts: [{ i: 0, text: this.final.text }] });
      this.drawFinalWriting();
      this.t.after(FINAL_WRITE_TIME, () => this.openFinalVote());
    });
  }

  drawFinalWriting() {
    this.show(`
      ${head("Punchline", "Final round", timer(this.deadline, FINAL_WRITE_TIME))}
      <div class="prompt-card">${esc(this.final.text)}</div>
      ${roll(this.ctx.ids, this.ctx.players, new Set(Object.keys(this.final.answers)))}`);
  }

  openFinalVote() {
    this.t.clear();
    this.phase = "final-vote";
    this.ctx.ids.forEach((id) => (this.final.answers[id] ??= NO_ANSWER));
    this.order = shuffle([...this.ctx.ids]);
    this.deadline = Date.now() + FINAL_VOTE_TIME * 1000;
    this.drawFinal(false);
    this.ctx.viewAll((id) => ({
      stage: "final-vote",
      prompt: this.final.text,
      options: this.order.filter((a) => a !== id && this.final.answers[a] !== NO_ANSWER).map((a) => ({ id: a, label: this.final.answers[a] })),
    }));
    this.t.after(FINAL_VOTE_TIME, () => this.finalReveal());
  }

  drawFinal(revealed) {
    const { players } = this.ctx;
    const votes = (id) => Object.values(this.final.votes).filter((v) => v === id).length;
    this.show(`
      ${head("Punchline", "Vote for your favourite", revealed ? "" : timer(this.deadline, FINAL_VOTE_TIME))}
      <div class="prompt-card is-small">${esc(this.final.text)}</div>
      <div class="final-grid">
        ${this.order
          .map(
            (id, i) => `
          <div class="answer-card is-small" style="--i:${i}">
            <p class="answer-text">${esc(this.final.answers[id])}</p>
            ${revealed ? `<div class="answer-reveal"><span class="answer-votes">${votes(id)}<small>votes</small></span><span class="answer-author">${sticker(players[id], "xs")}<b>${esc(players[id].name)}</b></span></div>` : ""}
          </div>`
          )
          .join("")}
      </div>`);
  }

  finalReveal() {
    if (this.phase !== "final-vote") return;
    this.t.clear();
    this.phase = "final-reveal";
    const tally = {};
    Object.values(this.final.votes).forEach((v) => (tally[v] = (tally[v] || 0) + 1));
    this.ctx.ids.forEach((id) => (this.score[id] += (tally[id] || 0) * 400));
    this.drawFinal(true);
    this.ctx.sfx.ding();
    this.ctx.sips(this.ctx.ids.filter((id) => !tally[id]).map((id) => ({ id, n: 1 })), "Zero votes in the final");
    this.ctx.viewAll({ stage: "wait", title: "Results on the TV", text: "" });
    this.t.after(8, () => {
      this.show(`${head("Punchline", "Final scores")}${standings(this.ctx.ids, this.ctx.players, this.score)}`);
      this.t.after(5, () => this.nextRound());
    });
  }

  /* ----- Input ----- */

  input(id, data) {
    if ((this.phase === "write" || this.phase === "final-write") && typeof data.answer === "string") {
      const answer = cleanText(data.answer, 80) || NO_ANSWER;
      if (this.phase === "final-write") {
        if (id in this.final.answers || !this.ctx.ids.includes(id)) return;
        this.final.answers[id] = answer;
        this.ctx.view(id, { stage: "wait", title: "Locked in", text: "Waiting for the others…" });
        this.drawFinalWriting();
        if (this.ctx.ids.every((p) => p in this.final.answers)) this.openFinalVote();
        return;
      }
      const m = this.matchups[data.i];
      if (!m || (m.a !== id && m.b !== id) || id in m.answers) return;
      m.answers[id] = answer;
      if (this.doneWriting(id)) this.ctx.view(id, { stage: "wait", title: "All done", text: "Waiting for the others…" });
      this.drawWriting();
      if (this.ctx.ids.every((p) => this.doneWriting(p))) this.closeWriting();
      return;
    }
    if (this.phase === "vote" && (data.vote === "a" || data.vote === "b")) {
      if (!this.voters.includes(id) || id in this.current.votes) return;
      this.current.votes[id] = data.vote;
      this.ctx.view(id, { stage: "wait", title: "Vote locked in", text: "" });
      this.drawMatchup(false);
      if (Object.keys(this.current.votes).length === this.voters.length) this.t.after(0.6, () => this.reveal());
      return;
    }
    if (this.phase === "final-vote" && typeof data.for === "string") {
      if (id in this.final.votes || data.for === id || !(data.for in this.final.answers)) return;
      this.final.votes[id] = data.for;
      this.ctx.view(id, { stage: "wait", title: "Vote locked in", text: "" });
      if (Object.keys(this.final.votes).length === this.ctx.ids.length) this.t.after(0.6, () => this.finalReveal());
    }
  }

  destroy() {
    this.t.clear();
  }
}

function phone(view, el, send) {
  if (view.stage === "write") {
    let k = 0;
    const next = () => {
      if (k >= view.prompts.length) return message(el, { title: "All done", text: "Waiting for the others…" });
      const p = view.prompts[k];
      textEntry(el, {
        kicker: view.prompts.length > 1 ? `Prompt ${k + 1} of ${view.prompts.length}` : "Your prompt",
        prompt: p.text,
        max: 80,
        button: "Send answer",
        onSubmit: (answer) => {
          send({ i: p.i, answer });
          k++;
          next();
        },
      });
    };
    return next();
  }
  if (view.stage === "vote") {
    return picker(el, {
      kicker: "Which is funnier?",
      title: view.prompt,
      options: [
        { id: "a", label: view.a, color: "var(--side-a)" },
        { id: "b", label: view.b, color: "var(--side-b)" },
      ],
      onPick: (vote) => send({ vote }),
    });
  }
  if (view.stage === "final-vote") {
    if (!view.options.length) return message(el, { title: "Nothing to vote on", text: "Sit back and watch." });
    return picker(el, { kicker: "Vote for your favourite", title: view.prompt, options: view.options, onPick: (id) => send({ for: id }) });
  }
  message(el, { title: view.title || "", text: esc(view.text || "") });
}

export default {
  id: "punchline",
  title: "Punchline",
  tagline: "Write the funniest answer. Win the vote.",
  color: "#FFC53D",
  min: 3,
  max: 8,
  minutes: 15,
  Host,
  phone,
};
