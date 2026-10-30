export { esc, ordinal, rankBy, Timers } from "../../shared.js";

// 3, 2, 1 over the stage, then calls done().
export function countdown(el, timers, sfx, done) {
  [3, 2, 1].forEach((n, i) =>
    timers.after(i, () => {
      el.innerHTML = `<span class="count-num">${n}</span>`;
      sfx.tick();
    })
  );
  timers.after(3, () => {
    el.innerHTML = `<span class="count-num count-go">Go</span>`;
    sfx.go();
    done();
  });
  timers.after(3.7, () => (el.innerHTML = ""));
}
