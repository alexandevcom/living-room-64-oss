// TV building blocks shared by the packs.
import { esc, sticker } from "../shared.js";

export function head(pack, title, right = "") {
  return `
    <header class="scene-head">
      <div><p class="scene-pack">${esc(pack)}</p><h2 class="scene-title">${title}</h2></div>
      ${right}
    </header>`;
}

export function splash(kicker, title, text = "") {
  return `
    <section class="splash">
      <p class="splash-kicker">${esc(kicker)}</p>
      <h2 class="splash-title">${esc(title)}</h2>
      ${text ? `<p class="splash-text">${text}</p>` : ""}
    </section>`;
}

// Row of player stickers; the ones in `done` get a check mark.
export function roll(ids, players, done = new Set()) {
  return `
    <div class="roll">
      ${ids
        .map((id) => `<span class="roll-item ${done.has(id) ? "is-done" : ""}">${sticker(players[id], "md")}<b>${esc(players[id].name)}</b></span>`)
        .join("")}
    </div>`;
}

export function standings(ids, players, scores, gains = {}) {
  const sorted = [...ids].sort((a, b) => scores[b] - scores[a]);
  return `
    <ol class="standings">
      ${sorted
        .map(
          (id, i) => `
        <li style="--i:${i}">
          <span class="st-rank">${i + 1}</span>${sticker(players[id], "sm")}<b>${esc(players[id].name)}</b>
          ${gains[id] ? `<span class="st-gain">+${gains[id]}</span>` : ""}
          <span class="st-score">${scores[id]}</span>
        </li>`
        )
        .join("")}
    </ol>`;
}

export const zeros = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));
