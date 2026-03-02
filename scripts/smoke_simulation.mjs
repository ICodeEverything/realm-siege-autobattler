import { BattleGame } from "../src/game.js";
import { END_REASON, PHASE, TEAM } from "../src/data.js";

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

const game = new BattleGame();
game.startBattle();

// Draft loop.
while (game.getSnapshot().mode === PHASE.DRAFT) {
  const snap = game.getSnapshot();
  if (snap.draft.currentPicker !== TEAM.PLAYER) {
    game.advanceTime(1000 / 60);
    continue;
  }
  const choices = Object.entries(snap.draft.pool)
    .filter(([, n]) => n > 0)
    .map(([id]) => id);
  assert(choices.length > 0, "No draft choices available.");
  game.playerDraftPick(choices[0]);
}

// Battle loop.
for (let i = 0; i < 400; i += 1) {
  const snap = game.getSnapshot();
  if (snap.mode !== "playing") break;
  if (snap.phase === PHASE.DEPLOY) {
    const lane = i % 3;
    game.selectLane(lane);
    const hand = snap.deckState.playerHand;
    let played = false;
    for (const card of hand) {
      if (game.canPlayCard(TEAM.PLAYER, card, lane)) {
        game.playerPlayCard(card, lane);
        played = true;
        break;
      }
    }
    if (!played) game.advanceTime(8200);
  } else {
    game.advanceTime(500);
  }
}

const end = game.getSnapshot();
assert(end.turn >= 3, "Expected multiple turns.");
assert(end.manaGainPerTurn >= 2 && end.manaGainPerTurn <= 4, "Mana gain tier out of range.");
assert(end.deckState.playerDeckCount >= 0, "Deck state invalid.");
assert(end.mode === "playing" || end.mode === PHASE.GAME_OVER, "Mode invalid after simulation.");
assert(!(end.endReason === END_REASON.TIMER_DRAW && end.winner === "draw"), "Unexpected timer draw in smoke baseline.");

console.log("SIMULATION_SMOKE_OK");
console.log(`MODE=${end.mode}`);
console.log(`TURN=${end.turn}`);
console.log(`WINNER=${String(end.winner)}`);
console.log(`END_REASON=${String(end.endReason)}`);
