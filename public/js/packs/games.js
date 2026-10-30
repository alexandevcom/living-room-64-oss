// The N64 games on the shelf. Each ROM lives in /roms/<id>.zip (outside public/).
// `ram` is only known for Mario Party 2 (Europe); it lets the phones show whose turn it is.

const MARIO_PARTY_2_RAM = {
  // Game code the boot process copies to 0x80000400; used to find the N64's memory inside the emulator.
  marker: [0x3c08800d, 0x25084bc0, 0x3c090003, 0x2529ba50],
  turn: 0x800f71c7, // u8: slot of the player whose turn it is
  board: 0x800ccf05, // u8: 2 while a board is being played, 0 in menus and mini-games
  players: 0x800fb0c0, // 4 slots of 0x34 bytes in turn order: +3 port, +4 character, +7 flags (bit 0 = computer), +8 coins, +0xE stars
  size: 0x34,
};

export const GAMES = [
  { id: "marioparty2", title: "Mario Party 2", tagline: "Board game chaos. Stars, coins and Bowser.", color: "#2F6FE0", minutes: 60, ram: MARIO_PARTY_2_RAM },
  { id: "marioparty3", title: "Mario Party 3", tagline: "More boards, more mini-games, more betrayal.", color: "#8C6CFF", minutes: 60 },
  { id: "mariokart64", title: "Mario Kart 64", tagline: "Four-player races and balloon battles.", color: "#E8443A", minutes: 20 },
  { id: "smash", title: "Super Smash Bros.", tagline: "Knock your friends off the stage.", color: "#FF9A3C", minutes: 15 },
  { id: "mariotennis", title: "Mario Tennis", tagline: "Doubles from the couch.", color: "#2E9E68", minutes: 20 },
  { id: "mariogolf", title: "Mario Golf", tagline: "Take turns. Talk trash.", color: "#36A9F5", minutes: 40 },
  { id: "bomberman64", title: "Bomberman 64", tagline: "Blow each other up in battle mode.", color: "#FF5A4E", minutes: 15 },
  { id: "pokemonstadium", title: "Pokémon Stadium", tagline: "Mini-games and battles with rental Pokémon.", color: "#FFC53D", minutes: 30 },
  { id: "pokemonstadium2", title: "Pokémon Stadium 2", tagline: "More mini-games, Gold and Silver Pokémon.", color: "#E58CFF", minutes: 30 },
  { id: "goldeneye", title: "GoldenEye 007", tagline: "Split-screen classic. Aiming with thumbs is hard mode.", color: "#6F7EA3", minutes: 20 },
];
