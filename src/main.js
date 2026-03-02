import { BOARD, PHASE, TEAM, UNIT_DEFS } from "./data.js";
import { BattleGame, buildAssetManifest } from "./game.js";
import { bindKeyboardInput } from "./input.js";
import { createUI } from "./ui.js";

const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;

const game = new BattleGame();

async function toggleFullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

createUI(game, { onToggleFullscreen: toggleFullscreen, canvas });
bindKeyboardInput(game, { onToggleFullscreen: toggleFullscreen });

function loadImage(path) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.src = path;
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
  });
}

async function loadAssets() {
  const manifest = buildAssetManifest();
  const structs = {};
  const units = {};
  const structEntries = Object.entries(manifest.structures);
  const unitEntries = Object.entries(manifest.units);
  const tasks = [loadImage(manifest.arenaPath)];
  for (const [, path] of structEntries) tasks.push(loadImage(path));
  for (const [, path] of unitEntries) tasks.push(loadImage(path));
  const loaded = await Promise.all(tasks);
  let idx = 0;
  const arena = loaded[idx++];
  for (const [key] of structEntries) structs[key] = loaded[idx++];
  for (const [key] of unitEntries) units[key] = loaded[idx++];
  game.setAssets({ arena, structures: structs, units, arenaPath: manifest.arenaPath });
}

function autoDraftPick() {
  const snap = game.getSnapshot();
  if (snap.mode !== PHASE.DRAFT || snap.draft.currentPicker !== TEAM.PLAYER) return;
  const choices = UNIT_DEFS.filter((u) => (snap.draft.pool[u.id] ?? 0) > 0);
  if (!choices.length) return;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  game.playerDraftPick(pick.id);
}

function autoBattlePlay() {
  const snap = game.getSnapshot();
  if (snap.mode !== "playing" || snap.phase !== PHASE.DEPLOY) return;
  const hand = snap.deckState.playerHand;
  if (!hand.length) return;
  const lane = Math.floor(Math.random() * 3);
  game.selectLane(lane);
  for (const card of hand) {
    if (game.canPlayCard(TEAM.PLAYER, card, lane)) {
      game.playerPlayCard(card, lane);
      return;
    }
  }
}

let externalStepping = false;
const params = new URLSearchParams(window.location.search);
if (params.get("autostart") === "1") game.startBattle();

if (params.get("autodemo") === "1") {
  externalStepping = true;
  game.startBattle();
  const demo = setInterval(() => {
    const snap = game.getSnapshot();
    if (snap.mode === PHASE.GAME_OVER) {
      clearInterval(demo);
      clearInterval(stepper);
      return;
    }
    autoDraftPick();
    autoBattlePlay();
  }, 280);

  const stepper = setInterval(() => {
    game.advanceTime(180);
    game.render(ctx);
  }, 120);
}

let previous = performance.now();
let acc = 0;
const fixed = 1000 / 60;
let qualitySampleMs = 0;
let qualitySampleFrames = 0;

function loop(now) {
  const dt = Math.min(100, now - previous);
  previous = now;
  acc += dt;
  qualitySampleMs += dt;
  qualitySampleFrames += 1;
  if (qualitySampleMs >= 1000) {
    const fps = (qualitySampleFrames * 1000) / qualitySampleMs;
    if (fps < 44) game.setQualityTier("low");
    else if (fps < 54) game.setQualityTier("medium");
    else game.setQualityTier("high");
    qualitySampleMs = 0;
    qualitySampleFrames = 0;
  }
  while (acc >= fixed) {
    if (!externalStepping) game.stepTick(fixed);
    acc -= fixed;
  }
  game.render(ctx);
  requestAnimationFrame(loop);
}

window.render_game_to_text = () => game.renderToText();
window.advanceTime = (ms) => {
  externalStepping = true;
  game.advanceTime(ms);
  game.render(ctx);
};
Object.defineProperty(window, "__gameDebug", {
  get() {
    return game.getSnapshot();
  },
});

canvas.width = BOARD.width;
canvas.height = BOARD.height;
game.render(ctx);
loadAssets();
requestAnimationFrame(loop);
