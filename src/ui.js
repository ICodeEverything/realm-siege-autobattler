import { CLASS_META, DRAFT_CONFIG, END_REASON, PHASE, TEAM, TURN_CONFIG, UNIT_DEFS, getCardPortraitPath } from "./data.js";

function getStructure(structures, id) {
  return structures.find((s) => s.id === id) ?? null;
}

function playUiBeep(settings, type = "soft") {
  if (!settings.sfx) return;
  const context = window.__uiAudioContext || new window.AudioContext();
  window.__uiAudioContext = context;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.connect(gain);
  gain.connect(context.destination);
  osc.type = type === "error" ? "square" : "triangle";
  osc.frequency.value = type === "error" ? 164 : 520;
  gain.gain.value = type === "error" ? 0.035 : 0.018;
  osc.start();
  osc.stop(context.currentTime + (type === "error" ? 0.08 : 0.05));
}

function applyPill(ref, hp) {
  if (!ref) return;
  ref.classList.toggle("destroyed", hp <= 0);
}

function endReasonText(snapshot) {
  if (snapshot.endReason === END_REASON.HOME_DESTROYED) {
    return snapshot.winner === TEAM.PLAYER ? "Enemy home destroyed." : "Your home was destroyed.";
  }
  if (snapshot.endReason === END_REASON.TIMER_TOWER_COUNT) return "Time expired: tower-count victory.";
  if (snapshot.endReason === END_REASON.TIMER_HP_TIEBREAKER) return "Time expired: HP tiebreak victory.";
  if (snapshot.endReason === END_REASON.TIMER_DRAW) return "Time expired: draw.";
  return snapshot.message;
}

function mkCardHtml(unit, extra = "") {
  const cls = CLASS_META[unit.class];
  const tag = unit.tag ? `<em class="unit-tag">${unit.tag}</em>` : "";
  return `
    <img src="${getCardPortraitPath(unit.id)}" alt="${unit.name} portrait" loading="lazy" />
    <span>
      <small>${cls?.short ?? unit.class}${tag}</small>
      <strong>${unit.name}</strong>
    </span>
    <span class="cost">${unit.cost}</span>
    ${extra}
  `;
}

export function createUI(game, options = {}) {
  const onToggleFullscreen = options.onToggleFullscreen ?? (() => {});
  const canvas = options.canvas ?? document.querySelector("#game-canvas");
  const settings = {
    reducedMotion: localStorage.getItem("rs_reduced_motion") === "1",
    sfx: localStorage.getItem("rs_sfx") !== "0",
  };

  const refs = {
    canvas,
    turnLabel: document.querySelector("#turn-label"),
    phaseLabel: document.querySelector("#phase-label"),
    matchTimer: document.querySelector("#match-timer"),
    deployTimer: document.querySelector("#deploy-timer"),
    manaRamp: document.querySelector("#mana-ramp"),
    cardsTitle: document.querySelector("#cards-title"),
    cardsGrid: document.querySelector("#cards-grid"),
    messageLine: document.querySelector("#message-line"),
    restartBtn: document.querySelector("#restart-btn"),
    settingsBtn: document.querySelector("#settings-btn"),
    fullscreenBtn: document.querySelector("#fullscreen-btn"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlay-title"),
    overlayText: document.querySelector("#overlay-text"),
    overlayBtn: document.querySelector("#start-btn"),
    settingsPanel: document.querySelector("#settings-panel"),
    reducedMotionToggle: document.querySelector("#toggle-reduced-motion"),
    sfxToggle: document.querySelector("#toggle-sfx"),
    playerEnergyFill: document.querySelector("#player-energy-fill"),
    playerEnergyText: document.querySelector("#player-energy-text"),
    enemyEnergyFill: document.querySelector("#enemy-energy-fill"),
    enemyEnergyText: document.querySelector("#enemy-energy-text"),
    playerTowerCount: document.querySelector("#player-tower-count"),
    enemyTowerCount: document.querySelector("#enemy-tower-count"),
    playerHandDeck: document.querySelector("#player-hand-deck"),
    playerDiscardPick: document.querySelector("#player-discard-pick"),
    hp: {
      enemyLeft: document.querySelector("#enemy-left-hp"),
      enemyCenter: document.querySelector("#enemy-center-hp"),
      enemyRight: document.querySelector("#enemy-right-hp"),
      enemyHome: document.querySelector("#enemy-home-hp"),
      playerLeft: document.querySelector("#player-left-hp"),
      playerCenter: document.querySelector("#player-center-hp"),
      playerRight: document.querySelector("#player-right-hp"),
      playerHome: document.querySelector("#player-home-hp"),
    },
    pills: {
      enemyLeft: document.querySelector("#enemy-left-pill"),
      enemyCenter: document.querySelector("#enemy-center-pill"),
      enemyRight: document.querySelector("#enemy-right-pill"),
      enemyHome: document.querySelector("#enemy-home-pill"),
      playerLeft: document.querySelector("#player-left-pill"),
      playerCenter: document.querySelector("#player-center-pill"),
      playerRight: document.querySelector("#player-right-pill"),
      playerHome: document.querySelector("#player-home-pill"),
    },
  };

  refs.reducedMotionToggle.checked = settings.reducedMotion;
  refs.sfxToggle.checked = settings.sfx;
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);

  refs.reducedMotionToggle.addEventListener("change", () => {
    settings.reducedMotion = refs.reducedMotionToggle.checked;
    localStorage.setItem("rs_reduced_motion", settings.reducedMotion ? "1" : "0");
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    playUiBeep(settings, "soft");
  });
  refs.sfxToggle.addEventListener("change", () => {
    settings.sfx = refs.sfxToggle.checked;
    localStorage.setItem("rs_sfx", settings.sfx ? "1" : "0");
  });

  refs.settingsBtn.addEventListener("click", () => refs.settingsPanel.classList.toggle("visible"));
  refs.restartBtn.addEventListener("click", () => game.restartBattle());
  refs.fullscreenBtn.addEventListener("click", () => onToggleFullscreen());
  refs.overlayBtn.addEventListener("click", () => {
    const s = game.getSnapshot();
    if (s.mode === PHASE.START) game.startBattle();
    else if (s.mode === PHASE.GAME_OVER) game.restartBattle();
    playUiBeep(settings, "soft");
  });

  const dragGhost = document.createElement("div");
  dragGhost.className = "drag-ghost";
  document.body.appendChild(dragGhost);

  let activeDrag = null;
  let handRenderKey = "";
  let draftRenderKey = "";

  function boardPoint(clientX, clientY) {
    const rect = refs.canvas.getBoundingClientRect();
    const inBounds = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!inBounds) return null;
    const x = ((clientX - rect.left) / rect.width) * refs.canvas.width;
    const y = ((clientY - rect.top) / rect.height) * refs.canvas.height;
    return { x, y };
  }

  function showGhost(clientX, clientY, label, valid, overBoard) {
    dragGhost.textContent = label;
    dragGhost.style.transform = `translate(${Math.round(clientX + 16)}px, ${Math.round(clientY - 24)}px)`;
    dragGhost.classList.add("visible");
    dragGhost.classList.toggle("invalid", !valid || !overBoard);
  }

  function clearDrag() {
    activeDrag = null;
    game.setDragState(null);
    dragGhost.classList.remove("visible", "invalid");
    document.body.classList.remove("dragging-card");
  }

  function onDragMove(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    event.preventDefault();
    const point = boardPoint(event.clientX, event.clientY);
    activeDrag.overBoard = Boolean(point);
    activeDrag.dropPoint = point;
    activeDrag.valid = false;

    if (point) {
      const resolved = game.resolveDropToLaneAndSpawn(TEAM.PLAYER, point.x, point.y);
      if (resolved) {
        activeDrag.resolved = resolved;
        activeDrag.valid = game.canPlayCard(TEAM.PLAYER, activeDrag.cardId, resolved.lane);
        if (resolved.lane !== game.getSnapshot().selectedLane) game.selectLane(resolved.lane);
      } else {
        activeDrag.resolved = null;
      }
    } else {
      activeDrag.resolved = null;
    }

    const label = activeDrag.unit ? `${activeDrag.unit.name} - Drag to lane` : "Drag";
    showGhost(event.clientX, event.clientY, label, activeDrag.valid, activeDrag.overBoard);
    game.setDragState({
      active: true,
      valid: activeDrag.valid,
      point,
      resolved: activeDrag.resolved,
    });
  }

  function onDragEnd(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    event.preventDefault();

    let ok = false;
    if (activeDrag.dropPoint && activeDrag.valid) {
      ok = game.queuePlayerDeploy(activeDrag.cardId, activeDrag.dropPoint.x, activeDrag.dropPoint.y);
    }

    if (ok) playUiBeep(settings, "soft");
    else playUiBeep(settings, "error");
    clearDrag();
  }

  function startCardDrag(event, unit) {
    const snapshot = game.getSnapshot();
    if (snapshot.mode !== "playing" || snapshot.phase !== PHASE.DEPLOY) return;

    activeDrag = {
      pointerId: event.pointerId,
      cardId: unit.id,
      unit,
      overBoard: false,
      valid: false,
      dropPoint: null,
      resolved: null,
    };

    document.body.classList.add("dragging-card");
    const label = `${unit.name} - Drag to lane`;
    showGhost(event.clientX, event.clientY, label, false, false);
    game.setDragState({
      active: true,
      valid: false,
      point: null,
      resolved: null,
    });
  }

  window.addEventListener("pointermove", onDragMove, { passive: false });
  window.addEventListener("pointerup", onDragEnd, { passive: false });
  window.addEventListener("pointercancel", onDragEnd, { passive: false });

  function wireDraftCards(snapshot) {
    const draftKey = `${snapshot.mode}|${snapshot.draft.pickIndex}|${snapshot.selectedCardId}|${Object.values(snapshot.draft.pool).join(".")}`;
    if (draftKey === draftRenderKey) return;
    draftRenderKey = draftKey;

    refs.cardsGrid.className = "cards-grid draft";
    refs.cardsTitle.textContent = `Draft Pool (${snapshot.draft.playerDeck.length}/${DRAFT_CONFIG.deckSize} vs ${snapshot.draft.enemyDeck.length}/${DRAFT_CONFIG.deckSize})`;
    const playerTurn = snapshot.draft.currentPicker === TEAM.PLAYER;
    refs.cardsGrid.innerHTML = "";
    for (const unit of UNIT_DEFS) {
      const remaining = snapshot.draft.pool[unit.id] ?? 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card-btn";
      btn.dataset.unitId = unit.id;
      btn.innerHTML = mkCardHtml(unit, `<span class="pool">x${remaining}</span>`);
      btn.classList.toggle("selected", snapshot.selectedCardId === unit.id);
      btn.disabled = !playerTurn || remaining <= 0;
      btn.title = `${unit.name} (${CLASS_META[unit.class]?.label ?? unit.class})`;
      btn.addEventListener("click", () => {
        const ok = game.playerDraftPick(unit.id);
        if (ok) playUiBeep(settings, "soft");
        else {
          btn.classList.add("invalid");
          setTimeout(() => btn.classList.remove("invalid"), 180);
          playUiBeep(settings, "error");
        }
      });
      refs.cardsGrid.appendChild(btn);
    }
  }

  function wireHandCards(snapshot) {
    const hand = snapshot.deckState.playerHand;
    const handKey = `${snapshot.mode}|${snapshot.phase}|${snapshot.selectedCardId}|${snapshot.playerEnergy}|${hand.join(".")}|${snapshot.pendingSpawns.length}`;
    if (handKey === handRenderKey) return;
    handRenderKey = handKey;

    refs.cardsGrid.className = "cards-grid hand";
    refs.cardsTitle.textContent = "Your Hand (Drag to Deploy)";
    refs.cardsGrid.innerHTML = "";

    for (const cardId of hand) {
      const unit = UNIT_DEFS.find((u) => u.id === cardId);
      if (!unit) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card-btn";
      btn.dataset.unitId = unit.id;
      btn.innerHTML = mkCardHtml(unit);
      btn.classList.toggle("selected", snapshot.selectedCardId === unit.id);

      const deployWindow = snapshot.mode === "playing" && snapshot.phase === PHASE.DEPLOY;
      const playableAnywhere = [0, 1, 2].some((lane) => game.canPlayCard(TEAM.PLAYER, unit.id, lane));
      btn.disabled = !deployWindow || !playableAnywhere;
      btn.title = `${unit.name} (${CLASS_META[unit.class]?.label ?? unit.class})`;

      btn.addEventListener("click", () => {
        game.selectCard(unit.id);
        playUiBeep(settings, "soft");
      });
      btn.addEventListener("pointerdown", (event) => {
        if (btn.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        startCardDrag(event, unit);
      });

      refs.cardsGrid.appendChild(btn);
    }
  }

  function render(snapshot = game.getSnapshot()) {
    if (activeDrag && !(snapshot.mode === "playing" && snapshot.phase === PHASE.DEPLOY)) clearDrag();
    refs.turnLabel.textContent = `Turn ${snapshot.turn}`;
    refs.phaseLabel.textContent = snapshot.mode === PHASE.DRAFT ? "Draft" : snapshot.phase === PHASE.DEPLOY ? "Deploy" : snapshot.phase === PHASE.RESOLVE ? `Resolve ${snapshot.resolveTicksRemaining}` : snapshot.phase;
    refs.matchTimer.textContent = snapshot.timeDisplay;
    refs.deployTimer.textContent =
      snapshot.mode === "playing" && snapshot.phase === PHASE.DEPLOY ? `${(snapshot.deployTimeRemainingMs / 1000).toFixed(1)}s` : "-";
    refs.manaRamp.textContent = snapshot.manaRampLabel;

    refs.playerEnergyFill.style.width = `${Math.round((snapshot.playerEnergy / TURN_CONFIG.maxEnergy) * 100)}%`;
    refs.enemyEnergyFill.style.width = `${Math.round((snapshot.enemyEnergy / TURN_CONFIG.maxEnergy) * 100)}%`;
    refs.playerEnergyText.textContent = `${snapshot.playerEnergy} / ${TURN_CONFIG.maxEnergy}`;
    refs.enemyEnergyText.textContent = `${snapshot.enemyEnergy} / ${TURN_CONFIG.maxEnergy}`;
    refs.playerTowerCount.textContent = `${snapshot.playerTowersAlive}`;
    refs.enemyTowerCount.textContent = `${snapshot.enemyTowersAlive}`;
    refs.playerHandDeck.textContent = `${snapshot.deckState.playerHand.length} / ${snapshot.deckState.playerDeckCount}`;
    refs.playerDiscardPick.textContent =
      snapshot.mode === PHASE.DRAFT
        ? `${snapshot.draft.playerDeck.length} / ${snapshot.draft.enemyDeck.length}`
        : `${snapshot.deckState.playerDiscardCount} / ${snapshot.draft.pickIndex}`;

    const enemyLeft = getStructure(snapshot.structures, "enemy-left");
    const enemyCenter = getStructure(snapshot.structures, "enemy-center");
    const enemyRight = getStructure(snapshot.structures, "enemy-right");
    const enemyHome = getStructure(snapshot.structures, "enemy-home");
    const playerLeft = getStructure(snapshot.structures, "player-left");
    const playerCenter = getStructure(snapshot.structures, "player-center");
    const playerRight = getStructure(snapshot.structures, "player-right");
    const playerHome = getStructure(snapshot.structures, "player-home");
    refs.hp.enemyLeft.textContent = `${enemyLeft?.hp ?? 0}`;
    refs.hp.enemyCenter.textContent = `${enemyCenter?.hp ?? 0}`;
    refs.hp.enemyRight.textContent = `${enemyRight?.hp ?? 0}`;
    refs.hp.enemyHome.textContent = `${enemyHome?.hp ?? 0}`;
    refs.hp.playerLeft.textContent = `${playerLeft?.hp ?? 0}`;
    refs.hp.playerCenter.textContent = `${playerCenter?.hp ?? 0}`;
    refs.hp.playerRight.textContent = `${playerRight?.hp ?? 0}`;
    refs.hp.playerHome.textContent = `${playerHome?.hp ?? 0}`;

    applyPill(refs.pills.enemyLeft, enemyLeft?.hp ?? 0);
    applyPill(refs.pills.enemyCenter, enemyCenter?.hp ?? 0);
    applyPill(refs.pills.enemyRight, enemyRight?.hp ?? 0);
    applyPill(refs.pills.enemyHome, enemyHome?.hp ?? 0);
    applyPill(refs.pills.playerLeft, playerLeft?.hp ?? 0);
    applyPill(refs.pills.playerCenter, playerCenter?.hp ?? 0);
    applyPill(refs.pills.playerRight, playerRight?.hp ?? 0);
    applyPill(refs.pills.playerHome, playerHome?.hp ?? 0);

    if (snapshot.mode === PHASE.DRAFT) {
      handRenderKey = "";
      wireDraftCards(snapshot);
    } else {
      draftRenderKey = "";
      wireHandCards(snapshot);
    }

    refs.messageLine.textContent = snapshot.message;

    if (snapshot.mode === PHASE.START) {
      refs.overlay.classList.add("is-visible");
      refs.overlayTitle.textContent = "Realm Siege Draft Alpha";
      refs.overlayText.textContent = "Draft 6 unique cards with alternating picks, then drag cards onto your side of the battlefield to summon.";
      refs.overlayBtn.textContent = "Start Draft";
      return;
    }
    if (snapshot.mode === PHASE.GAME_OVER) {
      refs.overlay.classList.add("is-visible");
      refs.overlayTitle.textContent =
        snapshot.winner === "draw" ? "Draw" : snapshot.winner === TEAM.PLAYER ? "Victory" : "Defeat";
      refs.overlayText.textContent = `${endReasonText(snapshot)} Towers ${snapshot.playerTowersAlive}-${snapshot.enemyTowersAlive}.`;
      refs.overlayBtn.textContent = "Play Again";
      return;
    }
    refs.overlay.classList.remove("is-visible");
  }

  game.subscribe(render);
  render();

  return { render, settings };
}
