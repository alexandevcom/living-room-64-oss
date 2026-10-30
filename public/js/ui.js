// Phone building blocks. Every screen asks for exactly one thing.
import { esc, sticker } from "./shared.js";

export function message(el, { kicker = "", title = "", text = "", big = false }) {
  el.innerHTML = `
    <div class="ph-center">
      ${kicker ? `<p class="ph-kicker">${esc(kicker)}</p>` : ""}
      ${title ? `<p class="${big ? "ph-mega" : "ph-title"}">${esc(title)}</p>` : ""}
      ${text ? `<p class="ph-text">${text}</p>` : ""}
    </div>`;
}

export function textEntry(el, { kicker = "", prompt, placeholder = "Type your answer", max = 60, button = "Send", onSubmit }) {
  el.innerHTML = `
    <form class="entry">
      ${kicker ? `<p class="ph-kicker">${esc(kicker)}</p>` : ""}
      <p class="entry-prompt">${esc(prompt)}</p>
      <textarea name="answer" maxlength="${max}" rows="3" placeholder="${esc(placeholder)}" autocomplete="off" required></textarea>
      <p class="entry-count"><span>0</span> / ${max}</p>
      <button class="btn">${esc(button)}</button>
    </form>`;
  const form = el.querySelector("form");
  const input = form.answer;
  const count = form.querySelector(".entry-count span");
  input.addEventListener("input", () => (count.textContent = input.value.length));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value) onSubmit(value);
  });
  setTimeout(() => input.focus(), 50);
}

// options: [{ id, label, sub?, player?, color? }]
export function picker(el, { kicker = "", title = "", options, onPick, layout = "list" }) {
  el.innerHTML = `
    <div class="pick">
      ${kicker ? `<p class="ph-kicker">${esc(kicker)}</p>` : ""}
      ${title ? `<p class="pick-title">${esc(title)}</p>` : ""}
      <div class="pick-options is-${layout}">
        ${options
          .map(
            (o) => `
          <button class="pick-option" data-id="${esc(o.id)}" ${o.color ? `style="--c:${o.color}"` : ""} ${o.disabled ? "disabled" : ""}>
            ${o.player ? sticker(o.player, "sm") : ""}
            ${o.badge ? `<span class="pick-badge">${esc(o.badge)}</span>` : ""}
            <span class="pick-label">${esc(o.label)}</span>
            ${o.sub ? `<span class="pick-sub">${esc(o.sub)}</span>` : ""}
          </button>`
          )
          .join("")}
      </div>
    </div>`;
  el.querySelectorAll(".pick-option").forEach((btn) =>
    btn.addEventListener("click", () => {
      navigator.vibrate?.(20);
      el.querySelectorAll(".pick-option").forEach((b) => (b.disabled = true));
      btn.classList.add("is-picked");
      onPick(btn.dataset.id);
    })
  );
}
