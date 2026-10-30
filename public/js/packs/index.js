import punchline from "./punchline.js";
import oddoneout from "./oddoneout.js";
import knowitall from "./knowitall.js";
import ticktalk from "./ticktalk.js";
import thumbwars from "./thumbwars/index.js";
import { n64Pack } from "./n64.js";
import { GAMES } from "./games.js";

// The party games are hidden for now; flip this to put them back on the shelf.
export const SHOW_PARTY_GAMES = false;

const PARTY = [punchline, oddoneout, knowitall, ticktalk, thumbwars];
// Only the games whose ROM is in roms/ go on the shelf. A game without a cover gets a label with its name.
const library = await fetch("/library.json").then((r) => r.json()).catch(() => null);
const covers = new Set(library?.covers);
const N64 = GAMES.filter((g) => !library || library.roms.includes(g.id)).map((g) => ({ ...n64Pack(g), cover: covers.has(`n64-${g.id}`) }));

export const PACKS = SHOW_PARTY_GAMES ? [...PARTY, ...N64] : N64;
export const PACKS_BY_ID = Object.fromEntries([...PARTY, ...N64].map((p) => [p.id, p]));
