import { PHASE } from "./data.js";

function ignoreTyping(event) {
  const t = event.target;
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || t.isContentEditable;
}

export function bindKeyboardInput(game, options = {}) {
  const onToggleFullscreen = options.onToggleFullscreen ?? (() => {});

  window.addEventListener("keydown", (event) => {
    if (ignoreTyping(event)) return;
    const key = event.key.toLowerCase();
    const snap = game.getSnapshot();

    if (key === "a") {
      event.preventDefault();
      game.cycleCard(-1);
      return;
    }

    if (key === "d") {
      event.preventDefault();
      game.cycleCard(1);
      return;
    }

    if (key === "q" || key === "w" || key === "e") {
      event.preventDefault();
      const lane = key === "q" ? 0 : key === "w" ? 1 : 2;
      game.selectLane(lane);
      return;
    }

    if (key === "arrowleft") {
      event.preventDefault();
      game.cycleLane(-1);
      return;
    }

    if (key === "arrowright") {
      event.preventDefault();
      game.cycleLane(1);
      return;
    }

    if (key >= "1" && key <= "9") {
      event.preventDefault();
      const idx = Number(key) - 1;
      if (snap.mode === PHASE.DRAFT) {
        game.selectCardByIndex(idx);
      } else {
        const selected = game.selectCardByIndex(idx);
        if (selected && snap.phase === PHASE.DEPLOY) game.playerDeploySelectedToLane(game.getSnapshot().selectedLane);
      }
      return;
    }

    if (key === " ") {
      event.preventDefault();
      if (snap.mode === PHASE.DRAFT) {
        const current = game.getSnapshot().selectedCardId;
        if (current) game.playerDraftPick(current);
        else game.selectCardByIndex(0);
      } else if (snap.mode === "playing") {
        game.playerDeploySelectedToLane(game.getSnapshot().selectedLane);
      }
      return;
    }

    if (key === "enter") {
      event.preventDefault();
      if (snap.mode === PHASE.START) game.startBattle();
      else if (snap.mode === PHASE.GAME_OVER) game.restartBattle();
      return;
    }

    if (key === "r" || key === "b") {
      event.preventDefault();
      game.restartBattle();
      return;
    }

    if (key === "f") {
      event.preventDefault();
      onToggleFullscreen();
    }
  });
}
