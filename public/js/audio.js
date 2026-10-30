// All sounds are synthesized, so there are no audio files to ship.
// The announcer uses the browser's built-in speech voice.
let ctx = null;
let voice = null;
let muted = false;
let caption = "";
const listeners = new Set();

export function unlockAudio() {
  ctx ??= new AudioContext();
  ctx.resume();
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
}

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  // Neural "Natural" voices (Edge on Windows) sound far better than the classic robot voices.
  voice =
    voices.find((v) => /Natural/i.test(v.name) && /Andrew|Guy|Ryan|Brian|Christopher/i.test(v.name)) ||
    voices.find((v) => /Natural/i.test(v.name)) ||
    voices.find((v) => /Google UK English Male|Daniel|Guy|Ryan|David/i.test(v.name)) ||
    voices[0] ||
    null;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (muted) speechSynthesis?.cancel();
  return muted;
}

export function onCaption(fn) {
  listeners.add(fn);
}

export function currentCaption() {
  return caption;
}

// The browser voices sound robotic, so the announcer only shows captions. Set to true to hear it again.
const SPEAK = false;

export function announce(text) {
  caption = text;
  listeners.forEach((fn) => fn(text));
  if (!SPEAK || muted || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const line = new SpeechSynthesisUtterance(text);
  line.voice = voice;
  line.rate = 1.05;
  speechSynthesis.speak(line);
}

function tone(freq, dur, { type = "sine", gain = 0.2, at = 0, slide } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(dur, gain) {
  if (!ctx || muted) return;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = 900;
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start();
}

const ring = (at) => {
  tone(1318, 1.4, { at, gain: 0.22 });
  tone(1975, 0.9, { at, gain: 0.08 });
  tone(659, 1.6, { at, gain: 0.1 });
};

export const sfx = {
  bell: () => (ring(0), ring(0.32)),
  ding: () => ring(0),
  tick: () => tone(1700, 0.05, { type: "square", gain: 0.05 }),
  go: () => tone(880, 0.35, { type: "square", gain: 0.08 }),
  join: () => (tone(523, 0.12, { type: "triangle" }), tone(784, 0.2, { type: "triangle", at: 0.1 })),
  whoosh: () => tone(260, 0.22, { type: "sawtooth", gain: 0.05, slide: 1400 }),
  buzz: () => tone(110, 0.45, { type: "sawtooth", gain: 0.12 }),
  boom: () => (noise(1.4, 0.9), tone(90, 1.1, { gain: 0.5, slide: 30 })),
  fanfare: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.45, { type: "triangle", at: i * 0.16, gain: 0.14 })),
};
