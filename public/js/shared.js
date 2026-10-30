// Avatars are character stickers. Each one owns a color, which becomes the player's color.
export const AVATARS = [
  { id: "toast", name: "Toast", color: "#F4A340" },
  { id: "avocado", name: "Avocado", color: "#8BD346" },
  { id: "donut", name: "Donut", color: "#FF7EB6" },
  { id: "duck", name: "Duck", color: "#FFD43B" },
  { id: "popcorn", name: "Popcorn", color: "#FF5A4E" },
  { id: "pizza", name: "Pizza", color: "#FF9A3C" },
  { id: "cactus", name: "Cactus", color: "#2FBF8F" },
  { id: "sock", name: "Sock", color: "#8C6CFF" },
  { id: "dice", name: "Dice", color: "#36A9F5" },
  { id: "remote", name: "Remote", color: "#6F7EA3" },
  { id: "cupcake", name: "Cupcake", color: "#E58CFF" },
  { id: "egg", name: "Egg", color: "#F2E6C9" },
];
export const AVATARS_BY_ID = Object.fromEntries(AVATARS.map((a) => [a.id, a]));

export function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// A die-cut sticker of the player's avatar. Falls back to their initial until the image exists.
export function sticker(player, size = "md", extra = "") {
  const a = AVATARS_BY_ID[player?.avatar];
  const color = a?.color || "#cfd3e6";
  const initial = esc((player?.name || "?")[0].toUpperCase());
  const img = a ? `<img src="/assets/avatars/${a.id}.webp" alt="" onerror="this.remove()">` : "";
  return `<span class="sticker s-${size} ${extra}" style="--c:${color}"><b>${initial}</b>${img}</span>`;
}

export function colorOf(player) {
  return AVATARS_BY_ID[player?.avatar]?.color || "#cfd3e6";
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick(arr, n, used = new Set()) {
  const fresh = shuffle(arr.filter((x) => !used.has(x)));
  const out = (fresh.length >= n ? fresh : shuffle([...arr])).slice(0, n);
  out.forEach((x) => used.add(x));
  return out;
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function cleanText(str, max = 80) {
  return String(str ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Lower value is better. Equal values share a rank.
export function rankBy(ids, value, label) {
  const sorted = [...ids].sort((a, b) => value(a) - value(b));
  let rank = 0;
  let prev;
  return sorted.map((id, i) => {
    const v = value(id);
    if (i === 0 || v !== prev) rank = i + 1;
    prev = v;
    return { id, rank, label: label(id) };
  });
}

export class Timers {
  list = [];
  after(seconds, fn) {
    this.list.push(setTimeout(fn, seconds * 1000));
  }
  every(seconds, fn) {
    this.list.push(setInterval(fn, seconds * 1000));
  }
  clear() {
    this.list.forEach((t) => (clearTimeout(t), clearInterval(t)));
    this.list = [];
  }
}

// A ring timer that drains over `seconds`. Survives re-renders through a negative delay.
export function timer(deadline, seconds, size = "") {
  const left = Math.max(0, deadline - Date.now()) / 1000;
  return `
    <span class="timer ${size}" style="--dur:${seconds}s;--delay:-${seconds - left}s">
      <span data-deadline="${deadline}">${Math.ceil(left)}</span>
    </span>`;
}

setInterval(() => {
  document.querySelectorAll("[data-deadline]").forEach((el) => {
    const s = Math.max(0, Math.ceil((Number(el.dataset.deadline) - Date.now()) / 1000));
    if (el.textContent !== String(s)) el.textContent = s;
    el.closest(".timer")?.classList.toggle("is-hurry", s <= 5);
  });
}, 200);

// Headline letters in the four colours of the N64 logo. A newline starts a new line.
export function logoText(text) {
  let n = 0;
  return text
    .split("\n")
    .map((line) => [...line].map((ch) => (ch === " " ? " " : `<span class="l${n++ % 4}">${esc(ch)}</span>`)).join(""))
    .join("<br>");
}

// An in-page dialog instead of confirm()/alert(), which would knock the browser out of full screen.
// Resolves true for the main button, false for Cancel, Escape or a tap outside. Pass cancel: null for a notice.
export function ask({ title, text = "", ok = "OK", cancel = "Cancel" }) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "dialog";
    el.innerHTML = `
      <div class="dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <p class="dialog-title" id="dialog-title">${esc(title)}</p>
        ${text ? `<p class="dialog-text">${esc(text)}</p>` : ""}
        <div class="dialog-actions">
          ${cancel ? `<button class="btn btn-ghost" data-answer="no">${esc(cancel)}</button>` : ""}
          <button class="btn" data-answer="yes">${esc(ok)}</button>
        </div>
      </div>`;
    const done = (answer) => {
      el.remove();
      removeEventListener("keydown", onKey, true);
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      done(e.key === "Enter");
    };
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-answer]");
      if (btn) done(btn.dataset.answer === "yes");
      else if (e.target === el) done(false);
    });
    addEventListener("keydown", onKey, true);
    document.body.append(el);
    el.querySelector('[data-answer="yes"]').focus();
  });
}
