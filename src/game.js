import {
  ARENA_SPRITE_PATH,
  BOARD,
  CLASS_META,
  DRAFT_CONFIG,
  END_REASON,
  LANE_LABELS,
  PHASE,
  TEAM,
  TURN_CONFIG,
  UNIT_DEFS,
  classVsClassModifier,
  createInitialStructures,
  getLaneCenter,
  getManaGain,
  getManaRampLabel,
  getSpawnPoint,
  getStructureSpritePath,
  getUnitDef,
  getUnitSpritePath,
} from "./data.js";

const SPRITE_FRAMES = { idle: 4, walk: 4, attack: 3 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function teamLabel(team) {
  return team === TEAM.PLAYER ? "Player" : "Enemy";
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draftPickerAt(idx) {
  return idx % 2 === 0 ? TEAM.PLAYER : TEAM.ENEMY;
}

function canTargetUnit(attacker, target) {
  if (target.hp <= 0 || attacker.team === target.team) return false;
  if (target.class === "light" && attacker.class !== "melee" && attacker.class !== "dark") return false;
  if (attacker.class === "light" && target.class !== "dark") return false;
  if (attacker.targetType === "ground" && target.isAir) return false;
  return true;
}

export class BattleGame {
  constructor() {
    this.listeners = new Set();
    this.assets = { arena: null, structures: {}, units: {}, arenaPath: ARENA_SPRITE_PATH };
    this.seed = 1337;
    this.reset(this.seed);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) fn(snap);
  }

  setAssets(assets) {
    this.assets = assets;
    this.emit();
  }

  setQualityTier(tier) {
    if (!tier || this.qualityTier === tier) return;
    this.qualityTier = tier;
    this.emit();
  }

  setDragState(state) {
    this.dragState = state ?? null;
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.mode = PHASE.START;
    this.phase = PHASE.START;
    this.turn = 1;
    this.winner = null;
    this.endReason = null;
    this.message = "Build your deck in draft.";
    this.selectedLane = 1;
    this.selectedCardId = null;

    this.player = { energy: TURN_CONFIG.startEnergy, deployedThisTurn: false };
    this.enemy = { energy: TURN_CONFIG.startEnergy };
    this.matchTimeRemainingMs = TURN_CONFIG.matchDurationMs;
    this.deployTimeRemainingMs = TURN_CONFIG.deployWindowMs;
    this.resolveTicksRemaining = TURN_CONFIG.resolveTicks;
    this.manaGainPerTurn = 2;
    this.manaRampLabel = "x2";

    this.structures = createInitialStructures().map((s) => ({ ...s, animTicks: 0, recentlyHitTicks: 0 }));
    this.units = [];
    this.pendingSpawns = [];
    this.nextUnitId = 1;
    this.nextPendingId = 1;
    this.hitEffects = [];
    this.shotEffects = [];
    this.slashEffects = [];
    this.dragState = null;
    this.animTick = 0;
    this.qualityTier = "high";

    this.draft = {
      pickIndex: 0,
      playerDeck: [],
      enemyDeck: [],
      pool: Object.fromEntries(UNIT_DEFS.map((u) => [u.id, DRAFT_CONFIG.copiesPerCard])),
    };
    this.decks = {
      player: { fullDeck: [], drawPile: [], hand: [], discard: [] },
      enemy: { fullDeck: [], drawPile: [], hand: [], discard: [] },
    };
    this.emit();
  }

  startBattle() {
    this.mode = PHASE.DRAFT;
    this.phase = PHASE.DRAFT;
    this.selectedCardId = UNIT_DEFS[0]?.id ?? null;
    this.message = "Draft phase: your pick.";
    this.advanceDraftIfAi();
    this.emit();
  }

  restartBattle() {
    this.reset(this.seed + 1);
    this.startBattle();
  }

  currentDraftPicker() {
    return draftPickerAt(this.draft.pickIndex);
  }

  canDraftCard(cardId) {
    return (this.draft.pool[cardId] ?? 0) > 0;
  }

  isDraftDone() {
    return (
      this.draft.playerDeck.length >= DRAFT_CONFIG.deckSize && this.draft.enemyDeck.length >= DRAFT_CONFIG.deckSize
    );
  }

  applyDraftPick(team, cardId) {
    if (!this.canDraftCard(cardId)) return false;
    if (team === TEAM.PLAYER && this.draft.playerDeck.length >= DRAFT_CONFIG.deckSize) return false;
    if (team === TEAM.ENEMY && this.draft.enemyDeck.length >= DRAFT_CONFIG.deckSize) return false;
    this.draft.pool[cardId] -= 1;
    if (team === TEAM.PLAYER) this.draft.playerDeck.push(cardId);
    else this.draft.enemyDeck.push(cardId);
    this.draft.pickIndex += 1;
    return true;
  }

  chooseAiDraftCard() {
    const remaining = UNIT_DEFS.filter((u) => this.canDraftCard(u.id));
    if (!remaining.length) return null;
    const classCounts = this.draft.enemyDeck.reduce((acc, id) => {
      const c = getUnitDef(id)?.class;
      if (c) acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    const weighted = remaining.map((u) => {
      let w = 1;
      w += Math.max(0, 2 - (classCounts[u.class] ?? 0));
      if (u.cost <= 3) w += 0.75;
      if (this.draft.enemyDeck.length > 4 && u.cost >= 4) w += 0.55;
      return { unit: u.id, weight: w };
    });
    return this.pickWeighted(weighted);
  }

  advanceDraftIfAi() {
    while (this.mode === PHASE.DRAFT && this.currentDraftPicker() === TEAM.ENEMY && !this.isDraftDone()) {
      const pick = this.chooseAiDraftCard();
      if (!pick || !this.applyDraftPick(TEAM.ENEMY, pick)) break;
      this.message = `Enemy drafted ${getUnitDef(pick)?.name ?? pick}.`;
    }
    if (this.mode === PHASE.DRAFT && this.isDraftDone()) this.beginMatch();
  }

  playerDraftPick(cardId) {
    if (this.mode !== PHASE.DRAFT || this.currentDraftPicker() !== TEAM.PLAYER) return false;
    if (!this.applyDraftPick(TEAM.PLAYER, cardId)) return false;
    this.message = `${getUnitDef(cardId)?.name ?? cardId} drafted.`;
    if (this.isDraftDone()) this.beginMatch();
    else this.advanceDraftIfAi();
    this.emit();
    return true;
  }

  beginMatch() {
    this.mode = "playing";
    this.phase = PHASE.DEPLOY;
    this.turn = 1;
    this.player.energy = TURN_CONFIG.startEnergy;
    this.enemy.energy = TURN_CONFIG.startEnergy;
    this.player.deployedThisTurn = false;
    this.matchTimeRemainingMs = TURN_CONFIG.matchDurationMs;
    this.deployTimeRemainingMs = TURN_CONFIG.deployWindowMs;
    this.resolveTicksRemaining = TURN_CONFIG.resolveTicks;
    this.manaGainPerTurn = 2;
    this.manaRampLabel = "x2";

    this.initDeck(TEAM.PLAYER, this.draft.playerDeck);
    this.initDeck(TEAM.ENEMY, this.draft.enemyDeck);
    this.drawCards(TEAM.PLAYER, DRAFT_CONFIG.handSize);
    this.drawCards(TEAM.ENEMY, DRAFT_CONFIG.handSize);
    this.selectedCardId = this.decks.player.hand[0] ?? null;
    this.message = "Battle started. Play one card per turn.";
  }

  initDeck(team, ids) {
    const k = team === TEAM.PLAYER ? "player" : "enemy";
    this.decks[k].fullDeck = [...ids];
    this.decks[k].drawPile = this.shuffle([...ids]);
    this.decks[k].hand = [];
    this.decks[k].discard = [];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  drawCards(team, n) {
    const deck = this.decks[team === TEAM.PLAYER ? "player" : "enemy"];
    for (let i = 0; i < n; i += 1) {
      if (deck.hand.length >= DRAFT_CONFIG.handSize) break;
      if (!deck.drawPile.length) {
        if (!deck.discard.length) break;
        deck.drawPile = this.shuffle([...deck.discard]);
        deck.discard = [];
      }
      const next = deck.drawPile.shift();
      if (next) deck.hand.push(next);
    }
  }

  discardFromHand(team, cardId) {
    const deck = this.decks[team === TEAM.PLAYER ? "player" : "enemy"];
    const idx = deck.hand.indexOf(cardId);
    if (idx < 0) return false;
    const [removed] = deck.hand.splice(idx, 1);
    deck.discard.push(removed);
    return true;
  }

  getTowerStructures(team) {
    return this.structures.filter((s) => s.team === team && s.isTower);
  }

  getHomeStructure(team) {
    return this.structures.find((s) => s.team === team && s.towerType === "home");
  }

  getElapsedMs() {
    return TURN_CONFIG.matchDurationMs - this.matchTimeRemainingMs;
  }

  canPlayCard(team, cardId, lane) {
    const def = getUnitDef(cardId);
    if (!def) return false;
    const energy = team === TEAM.PLAYER ? this.player.energy : this.enemy.energy;
    if (energy < def.cost) return false;
    const activeInLane = this.units.filter((u) => u.team === team && u.lane === lane && u.hp > 0).length;
    const pendingInLane = this.pendingSpawns.filter((u) => u.team === team && u.lane === lane).length;
    const inLane = activeInLane + pendingInLane;
    if (inLane >= TURN_CONFIG.laneUnitCap) return false;
    const hand = this.decks[team === TEAM.PLAYER ? "player" : "enemy"].hand;
    return hand.includes(cardId);
  }

  canDeploy(team, cardId, lane) {
    return this.canPlayCard(team, cardId, lane);
  }

  resolveDropToLaneAndSpawn(team, x, y) {
    if (x < 0 || y < 0 || x > BOARD.width || y > BOARD.height) return null;
    if (team === TEAM.PLAYER && y < TURN_CONFIG.noDropBoundaryY) return null;
    if (team === TEAM.ENEMY && y > TURN_CONFIG.noDropBoundaryY) return null;

    const points = [0, 1, 2].map((lane) => {
      const spawn = getSpawnPoint(team, lane, this.structures);
      const d = Math.hypot(spawn.x - x, spawn.y - y);
      return { lane, x: spawn.x, y: spawn.y, distance: d };
    });
    points.sort((a, b) => a.distance - b.distance);
    if (!points.length || points[0].distance > TURN_CONFIG.dropSnapRadius) return null;
    return points[0];
  }

  queueDeploy(team, cardId, lane, spawnX, spawnY) {
    const def = getUnitDef(cardId);
    if (!def || !this.canPlayCard(team, cardId, lane)) return false;
    const side = team === TEAM.PLAYER ? this.player : this.enemy;
    if (side.energy < def.cost) return false;
    side.energy -= def.cost;
    this.pendingSpawns.push({
      id: `summon-${this.nextPendingId++}`,
      team,
      cardId,
      lane,
      x: spawnX,
      y: spawnY,
      etaMs: TURN_CONFIG.deployTelegraphMs,
      totalMs: TURN_CONFIG.deployTelegraphMs,
    });
    return true;
  }

  queuePlayerDeploy(cardId, dropX, dropY) {
    if (this.mode !== "playing" || this.phase !== PHASE.DEPLOY) return false;
    const point = this.resolveDropToLaneAndSpawn(TEAM.PLAYER, dropX, dropY);
    if (!point) return false;
    if (!this.queueDeploy(TEAM.PLAYER, cardId, point.lane, point.x, point.y)) return false;
    this.discardFromHand(TEAM.PLAYER, cardId);
    this.selectedLane = point.lane;
    this.selectedCardId = this.decks.player.hand[0] ?? null;
    this.player.deployedThisTurn = true;
    this.message = `${getUnitDef(cardId)?.name ?? cardId} summoned in ${LANE_LABELS[point.lane]} lane (${(
      TURN_CONFIG.deployTelegraphMs / 1000
    ).toFixed(1)}s).`;
    this.finishPlayerAction();
    return true;
  }

  queueEnemyDeploy(cardId, lane) {
    const spawn = getSpawnPoint(TEAM.ENEMY, lane, this.structures);
    if (!this.queueDeploy(TEAM.ENEMY, cardId, lane, spawn.x, spawn.y)) return false;
    this.discardFromHand(TEAM.ENEMY, cardId);
    this.message = `Enemy is summoning ${getUnitDef(cardId)?.name ?? cardId}.`;
    return true;
  }

  selectLane(lane) {
    this.selectedLane = clamp(lane, 0, BOARD.laneCount - 1);
    this.emit();
  }

  cycleLane(delta) {
    this.selectedLane = (this.selectedLane + delta + BOARD.laneCount) % BOARD.laneCount;
    this.emit();
  }

  selectCard(cardId) {
    if (!getUnitDef(cardId)) return false;
    this.selectedCardId = cardId;
    this.emit();
    return true;
  }

  selectCardByIndex(index) {
    if (this.mode === PHASE.DRAFT) return index >= 0 && index < UNIT_DEFS.length ? this.playerDraftPick(UNIT_DEFS[index].id) : false;
    const hand = this.decks.player.hand;
    if (index < 0 || index >= hand.length) return false;
    this.selectedCardId = hand[index];
    this.emit();
    return true;
  }

  cycleCard(delta) {
    if (this.mode === PHASE.DRAFT) {
      const choices = UNIT_DEFS.filter((u) => this.canDraftCard(u.id)).map((u) => u.id);
      if (!choices.length) return;
      const cur = Math.max(0, choices.indexOf(this.selectedCardId));
      this.selectedCardId = choices[(cur + delta + choices.length) % choices.length];
      this.emit();
      return;
    }
    const hand = this.decks.player.hand;
    if (!hand.length) return;
    const cur = Math.max(0, hand.indexOf(this.selectedCardId));
    this.selectedCardId = hand[(cur + delta + hand.length) % hand.length];
    this.emit();
  }

  playerPlayCard(cardId, lane = this.selectedLane) {
    if (this.mode !== "playing" || this.phase !== PHASE.DEPLOY) return false;
    if (!this.canPlayCard(TEAM.PLAYER, cardId, lane)) return false;
    const spawn = getSpawnPoint(TEAM.PLAYER, lane, this.structures);
    return this.queuePlayerDeploy(cardId, spawn.x, spawn.y);
  }

  playerDeployByCard(cardId, lane = this.selectedLane) {
    this.selectedCardId = cardId;
    return this.playerPlayCard(cardId, lane);
  }

  playerDeploySelectedToLane(lane = this.selectedLane) {
    return this.selectedCardId ? this.playerPlayCard(this.selectedCardId, lane) : false;
  }

  finishPlayerAction() {
    this.phase = PHASE.ENEMY_DEPLOY;
    this.enemyDeploy();
    this.phase = PHASE.RESOLVE;
    this.resolveTicksRemaining = TURN_CONFIG.resolveTicks;
    this.emit();
  }

  enemyDeploy() {
    const laneThreat = [0, 1, 2].map((lane) =>
      this.units
        .filter((u) => u.team === TEAM.PLAYER && u.lane === lane && u.hp > 0)
        .reduce((sum, u) => sum + u.attack * 0.2 + u.hp * 0.012, 0)
    );
    let lane = laneThreat.indexOf(Math.max(...laneThreat));
    let card = this.chooseEnemyCardForLane(lane);
    if (!card) {
      for (const alt of [1, 0, 2]) {
        card = this.chooseEnemyCardForLane(alt);
        if (card) {
          lane = alt;
          break;
        }
      }
    }
    if (!card) {
      this.message = "Enemy passes this turn.";
      return;
    }
    this.queueEnemyDeploy(card, lane);
  }

  chooseEnemyCardForLane(lane) {
    const hand = this.decks.enemy.hand;
    const opts = hand.filter((id) => this.canPlayCard(TEAM.ENEMY, id, lane));
    if (!opts.length) return null;
    const enemies = this.units.filter((u) => u.team === TEAM.PLAYER && u.lane === lane && u.hp > 0);
    const weights = opts.map((id) => {
      const def = getUnitDef(id);
      let w = 1;
      for (const e of enemies) w += (classVsClassModifier(def.class, e.class) - 1) * 2;
      if (this.matchTimeRemainingMs < 50000 && def.cost >= 4) w += 1;
      if (def.class === "dark") w += 0.3;
      if (def.class === "light") w += 0.2;
      return { unit: id, weight: Math.max(0.3, w) };
    });
    return this.pickWeighted(weights);
  }

  pickWeighted(weighted) {
    const total = weighted.reduce((s, w) => s + w.weight, 0);
    if (total <= 0) return weighted[0]?.unit ?? null;
    let r = this.rng() * total;
    for (const item of weighted) {
      r -= item.weight;
      if (r <= 0) return item.unit;
    }
    return weighted[weighted.length - 1]?.unit ?? null;
  }

  spawnCard(team, cardId, lane) {
    const def = getUnitDef(cardId);
    if (!def) return false;
    const side = team === TEAM.PLAYER ? this.player : this.enemy;
    if (side.energy < def.cost) return false;
    side.energy -= def.cost;
    const spawn = getSpawnPoint(team, lane, this.structures);
    return this.spawnUnit(team, lane, def, spawn.x, spawn.y);
  }

  spawnUnit(team, lane, def, x, y) {
    this.units.push({
      id: `${team}-${this.nextUnitId++}`,
      team,
      lane,
      unitId: def.id,
      class: def.class,
      tag: def.tag ?? def.name.split(" ").map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
      name: def.name,
      squad: def.squad,
      x: x + (this.rng() - 0.5) * 5,
      y,
      hp: def.hp,
      maxHp: def.hp,
      attack: def.attack,
      attackRange: def.attackRange,
      attackCooldownTicks: def.attackCooldownTicks,
      cooldown: 0,
      moveSpeedPerTick: def.moveSpeedPerTick,
      targetType: def.targetType,
      isAir: def.isAir,
      spawnLockTicks: 5,
      spriteBob: this.rng() * Math.PI * 2,
      animTicks: 0,
      walkTicks: 0,
      recentlyHitTicks: 0,
      driftTowardCenter: false,
    });
    return true;
  }

  stepTick(stepMs = TURN_CONFIG.tickMs) {
    let changed = false;
    this.animTick += 1;

    if (this.mode === "playing") {
      if (this.stepPendingSpawns(stepMs)) changed = true;
      this.matchTimeRemainingMs = Math.max(0, this.matchTimeRemainingMs - stepMs);
      const elapsed = this.getElapsedMs();
      this.manaGainPerTurn = getManaGain(elapsed);
      this.manaRampLabel = getManaRampLabel(elapsed);

      if (this.phase === PHASE.DEPLOY) {
        this.deployTimeRemainingMs = Math.max(0, this.deployTimeRemainingMs - stepMs);
        changed = true;
        if (this.deployTimeRemainingMs <= 0) this.autoPassPlayer();
      } else if (this.phase === PHASE.RESOLVE) {
        this.runCombatTick();
        this.resolveTicksRemaining -= 1;
        changed = true;
        if (this.mode === "playing" && this.resolveTicksRemaining <= 0) this.completeTurn();
      }

      if (this.mode === "playing" && this.matchTimeRemainingMs <= 0) {
        this.adjudicateTimer();
        changed = true;
      }
    }
    if (this.tickEffects()) changed = true;
    if (changed) this.emit();
  }

  autoPassPlayer() {
    if (this.phase !== PHASE.DEPLOY) return;
    this.message = "Turn passed. No card played in time.";
    this.finishPlayerAction();
  }

  advanceTime(ms) {
    const steps = Math.max(1, Math.round(ms / TURN_CONFIG.tickMs));
    for (let i = 0; i < steps; i += 1) this.stepTick(TURN_CONFIG.tickMs);
  }

  stepPendingSpawns(stepMs) {
    if (!this.pendingSpawns.length) return false;
    let changed = false;
    for (const summon of this.pendingSpawns) {
      summon.etaMs = Math.max(0, summon.etaMs - stepMs);
      changed = true;
    }

    const ready = this.pendingSpawns.filter((summon) => summon.etaMs <= 0);
    if (!ready.length) return changed;

    for (const summon of ready) {
      const def = getUnitDef(summon.cardId);
      if (!def) continue;
      this.spawnUnit(summon.team, summon.lane, def, summon.x, summon.y);
      this.message = `${teamLabel(summon.team)} deployed ${def.name}.`;
    }
    this.pendingSpawns = this.pendingSpawns.filter((summon) => summon.etaMs > 0);
    return true;
  }

  runCombatTick() {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      if (u.cooldown > 0) u.cooldown -= 1;
      if (u.spawnLockTicks > 0) u.spawnLockTicks -= 1;
      if (u.animTicks > 0) u.animTicks -= 1;
      if (u.walkTicks > 0) u.walkTicks -= 1;
      if (u.recentlyHitTicks > 0) u.recentlyHitTicks -= 1;
      u.spriteBob += 0.12;
    }
    for (const s of this.structures) {
      if (s.hp <= 0) continue;
      if (s.cooldown > 0) s.cooldown -= 1;
      if (s.animTicks > 0) s.animTicks -= 1;
      if (s.recentlyHitTicks > 0) s.recentlyHitTicks -= 1;
    }

    const acting = [...this.units].filter((u) => u.hp > 0).sort((a, b) => (a.team === TEAM.PLAYER ? b.y - a.y : a.y - b.y));
    for (const u of acting) {
      if (u.hp <= 0 || u.spawnLockTicks > 0) continue;
      const target = this.findTargetInRange(u);
      if (target && u.cooldown <= 0) {
        const dmg = target.isStructure ? this.damageToStructure(u, target) : this.damageToUnit(u, target);
        this.applyDamage(u, target, dmg);
        u.cooldown = u.attackCooldownTicks;
        u.animTicks = 10;
      } else if (!target) {
        this.moveUnit(u);
      }
    }

    for (const s of this.structures) {
      if (s.hp <= 0 || s.cooldown > 0) continue;
      const t = this.findTowerTarget(s);
      if (!t) continue;
      this.applyDamage(s, t, s.attack * 0.6);
      s.cooldown = s.attackCooldownTicks;
      s.animTicks = 8;
    }

    this.units = this.units.filter((u) => u.hp > 0);
    this.checkHomeKill();
  }

  damageToUnit(attacker, target) {
    return attacker.attack * classVsClassModifier(attacker.class, target.class);
  }

  damageToStructure(attacker, target) {
    let mult = 1.65;
    if (attacker.class === "light") mult = 2.0;
    if (attacker.class === "dark") mult = 1.85;
    if (target?.towerType === "home") mult *= 0.62;
    return attacker.attack * mult;
  }

  moveUnit(u) {
    const dir = u.team === TEAM.PLAYER ? -1 : 1;
    u.y = clamp(u.y + dir * u.moveSpeedPerTick, BOARD.laneTop, BOARD.laneBottom);
    const enemyTeam = u.team === TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
    const tower = this.structures.find((s) => s.team === enemyTeam && s.isTower && s.lane === u.lane);
    if (tower && tower.hp <= 0 && u.lane !== 1) u.driftTowardCenter = true;
    const targetX = u.driftTowardCenter ? getLaneCenter(1) : getLaneCenter(u.lane);
    u.x += clamp(targetX - u.x, -0.35, 0.35);
    u.walkTicks = 8;
  }

  canAttackStructure(u, s) {
    if (!s || s.hp <= 0 || s.team === u.team) return false;
    if (s.towerType === "home") {
      const gateTower = this.structures.find((tower) => tower.team === s.team && tower.isTower && tower.lane === u.lane);
      if (!gateTower || gateTower.hp > 0) return false;
      return u.lane === 1 || u.driftTowardCenter;
    }
    return s.lane === u.lane;
  }

  findTargetInRange(u) {
    const units = this.units
      .filter((e) => (e.lane === u.lane || u.driftTowardCenter) && canTargetUnit(u, e))
      .map((e) => ({ entity: e, p: 1, d: dist(u, e) }))
      .filter((x) => x.d <= u.attackRange);
    const structs = this.structures
      .filter((s) => this.canAttackStructure(u, s))
      .map((s) => ({ entity: s, p: 2, d: dist(u, s) }))
      .filter((x) => x.d <= u.attackRange);
    const all = [...units, ...structs].sort((a, b) => (a.p !== b.p ? a.p - b.p : a.d - b.d));
    return all[0]?.entity ?? null;
  }

  findTowerTarget(s) {
    const cand = this.units
      .filter((u) => u.hp > 0 && u.team !== s.team && (s.towerType === "home" || u.lane === s.lane))
      .map((u) => ({ u, d: dist(s, u) }))
      .filter((x) => x.d <= s.attackRange)
      .sort((a, b) => a.d - b.d);
    return cand[0]?.u ?? null;
  }

  applyDamage(attacker, target, amount) {
    const d = Math.max(1, Math.round(amount));
    target.hp = Math.max(0, target.hp - d);
    target.recentlyHitTicks = 10;
    const isPlayer = attacker.team === TEAM.PLAYER;
    const attackClass = attacker.class ?? "tower";
    const colorByClass = {
      melee: isPlayer ? "#9de9ff" : "#ffc5a3",
      ranged: isPlayer ? "#9ee8c5" : "#ffcf8c",
      air: isPlayer ? "#97d3ff" : "#ffb8d7",
      dark: isPlayer ? "#ceb0ff" : "#ce9dff",
      light: isPlayer ? "#ffe694" : "#fff1bd",
      tower: isPlayer ? "#8ce2ff" : "#ffb693",
    };
    const beamColor = colorByClass[attackClass] ?? colorByClass.tower;

    this.hitEffects.push({ x: target.x, y: target.y, ttl: 14, color: beamColor });
    if (attackClass === "dark" || attackClass === "light") {
      this.hitEffects.push({ x: target.x, y: target.y, ttl: 18, color: attackClass === "dark" ? "#b993ff" : "#ffe889" });
    }

    if (attackClass === "melee" || attackClass === "light") {
      this.slashEffects.push({
        x: target.x + (this.rng() - 0.5) * 6,
        y: target.y + (this.rng() - 0.5) * 6,
        ttl: 10,
        radius: 10 + this.rng() * 5,
        color: beamColor,
      });
      return;
    }

    this.shotEffects.push({
      x1: attacker.x,
      y1: attacker.y,
      x2: target.x + (this.rng() - 0.5) * 2,
      y2: target.y + (this.rng() - 0.5) * 2,
      ttl: 10,
      color: beamColor,
    });
  }

  checkHomeKill() {
    const ph = this.getHomeStructure(TEAM.PLAYER);
    const eh = this.getHomeStructure(TEAM.ENEMY);
    if (!ph || !eh) return;
    const pDown = ph.hp <= 0;
    const eDown = eh.hp <= 0;
    if (!pDown && !eDown) return;
    if (pDown && eDown) this.finishGame("draw", END_REASON.HOME_DESTROYED, "Both home bases collapsed.");
    else if (pDown) this.finishGame(TEAM.ENEMY, END_REASON.HOME_DESTROYED, "Enemy destroyed your home base.");
    else this.finishGame(TEAM.PLAYER, END_REASON.HOME_DESTROYED, "You destroyed the enemy home base.");
  }

  adjudicateTimer() {
    const pT = this.getTowerStructures(TEAM.PLAYER);
    const eT = this.getTowerStructures(TEAM.ENEMY);
    const pAlive = pT.filter((t) => t.hp > 0).length;
    const eAlive = eT.filter((t) => t.hp > 0).length;
    if (pAlive !== eAlive) {
      const w = pAlive > eAlive ? TEAM.PLAYER : TEAM.ENEMY;
      this.finishGame(w, END_REASON.TIMER_TOWER_COUNT, `Time up: ${teamLabel(w)} wins on towers (${pAlive}-${eAlive}).`);
      return;
    }
    const pHp = pT.reduce((s, t) => s + Math.max(0, t.hp), 0);
    const eHp = eT.reduce((s, t) => s + Math.max(0, t.hp), 0);
    if (pHp !== eHp) {
      const w = pHp > eHp ? TEAM.PLAYER : TEAM.ENEMY;
      this.finishGame(w, END_REASON.TIMER_HP_TIEBREAKER, `Time up: ${teamLabel(w)} wins on tower HP (${pHp}-${eHp}).`);
      return;
    }
    const pHome = Math.max(0, this.getHomeStructure(TEAM.PLAYER)?.hp ?? 0);
    const eHome = Math.max(0, this.getHomeStructure(TEAM.ENEMY)?.hp ?? 0);
    if (pHome !== eHome) {
      const w = pHome > eHome ? TEAM.PLAYER : TEAM.ENEMY;
      this.finishGame(w, END_REASON.TIMER_HP_TIEBREAKER, `Time up: ${teamLabel(w)} wins on home HP (${pHome}-${eHome}).`);
      return;
    }
    this.finishGame("draw", END_REASON.TIMER_DRAW, "Time up: draw.");
  }

  finishGame(winner, reason, msg) {
    this.winner = winner;
    this.endReason = reason;
    this.mode = PHASE.GAME_OVER;
    this.phase = PHASE.GAME_OVER;
    this.message = msg;
    this.pendingSpawns = [];
    this.dragState = null;
    this.resolveTicksRemaining = 0;
    this.deployTimeRemainingMs = 0;
  }

  completeTurn() {
    if (this.mode !== "playing") return;
    this.turn += 1;
    this.phase = PHASE.DEPLOY;
    this.player.deployedThisTurn = false;
    this.player.energy = Math.min(TURN_CONFIG.maxEnergy, this.player.energy + this.manaGainPerTurn);
    this.enemy.energy = Math.min(TURN_CONFIG.maxEnergy, this.enemy.energy + this.manaGainPerTurn);
    this.drawCards(TEAM.PLAYER, 1);
    this.drawCards(TEAM.ENEMY, 1);
    if (!this.selectedCardId || !this.decks.player.hand.includes(this.selectedCardId)) this.selectedCardId = this.decks.player.hand[0] ?? null;
    this.deployTimeRemainingMs = TURN_CONFIG.deployWindowMs;
    this.message = "Play one card from your hand.";
  }

  tickEffects() {
    let changed = false;
    if (this.hitEffects.length) {
      changed = true;
      for (const fx of this.hitEffects) fx.ttl -= 1;
      this.hitEffects = this.hitEffects.filter((fx) => fx.ttl > 0);
    }
    if (this.shotEffects.length) {
      changed = true;
      for (const fx of this.shotEffects) fx.ttl -= 1;
      this.shotEffects = this.shotEffects.filter((fx) => fx.ttl > 0);
    }
    if (this.slashEffects.length) {
      changed = true;
      for (const fx of this.slashEffects) fx.ttl -= 1;
      this.slashEffects = this.slashEffects.filter((fx) => fx.ttl > 0);
    }
    return changed;
  }

  getStructureSprite(s) {
    const key = `${s.team}_${s.towerType}${s.hp <= 0 ? "_destroyed" : ""}`;
    return this.assets.structures[key] ?? null;
  }

  getUnitSprite(u) {
    const state = u.animTicks > 0 ? "attack" : u.walkTicks > 0 ? "walk" : "idle";
    const frame = Math.floor(this.animTick / 8) % (SPRITE_FRAMES[state] ?? 1);
    return this.assets.units[`${u.unitId}_${state}_${frame}`] ?? this.assets.units[`${u.unitId}_idle_0`] ?? null;
  }

  drawHealthBar(ctx, x, y, w, hp, maxHp, team) {
    const ratio = maxHp <= 0 ? 0 : clamp(hp / maxHp, 0, 1);
    ctx.fillStyle = "#07131d";
    ctx.fillRect(x - w / 2, y - 2, w, 5);
    ctx.fillStyle = team === TEAM.PLAYER ? "#7de6ff" : "#ffb399";
    ctx.fillRect(x - w / 2 + 1, y - 1, (w - 2) * ratio, 3);
    ctx.strokeStyle = "#ffffff58";
    ctx.strokeRect(x - w / 2, y - 2, w, 5);
  }

  drawUnitBadge(ctx, u, bob, size) {
    const cls = CLASS_META[u.class];
    const tag = (u.tag ?? u.name ?? "?").toUpperCase();
    const w = Math.max(20, 8 + tag.length * 6);
    const h = 11;
    const x = Math.round(u.x - w / 2);
    const y = Math.round(u.y - size * 0.38 + bob);
    ctx.fillStyle = "#07131dda";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = cls?.color ?? "#dde6ee";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = cls?.color ?? "#f1f5f9";
    ctx.font = "700 8px 'Trebuchet MS'";
    ctx.textAlign = "center";
    ctx.fillText(tag, u.x, y + 8);
  }

  render(ctx) {
    ctx.clearRect(0, 0, BOARD.width, BOARD.height);
    if (this.assets.arena) ctx.drawImage(this.assets.arena, 0, 0, BOARD.width, BOARD.height);
    else {
      ctx.fillStyle = "#1b2b39";
      ctx.fillRect(0, 0, BOARD.width, BOARD.height);
    }
    if (this.dragState?.active) {
      const boundaryY = TURN_CONFIG.noDropBoundaryY;
      ctx.fillStyle = "#d84b4b44";
      ctx.fillRect(0, 0, BOARD.width, boundaryY);
      ctx.fillStyle = "#7ac98d20";
      ctx.fillRect(0, boundaryY, BOARD.width, BOARD.height - boundaryY);
      ctx.strokeStyle = "#ffd2d2a0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, boundaryY);
      ctx.lineTo(BOARD.width, boundaryY);
      ctx.stroke();
    }
    if (this.mode === "playing" && this.phase === PHASE.DEPLOY) {
      const a = BOARD.laneEdges[this.selectedLane];
      const b = BOARD.laneEdges[this.selectedLane + 1];
      ctx.fillStyle = "#fbe8bb30";
      ctx.fillRect(a, 0, b - a, BOARD.height);
      const s = getSpawnPoint(TEAM.PLAYER, this.selectedLane, this.structures);
      const p = (Math.sin(this.animTick * 0.14) + 1) * 0.5;
      ctx.strokeStyle = `rgba(255,230,162,${0.3 + p * 0.5})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 15 + p * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#e9f7efcc";
    ctx.font = "700 11px 'Trebuchet MS'";
    ctx.textAlign = "center";
    for (let lane = 0; lane < 3; lane += 1) ctx.fillText(LANE_LABELS[lane], getLaneCenter(lane), BOARD.height * 0.5 + 4);

    for (const s of [...this.structures].sort((a, b) => a.y - b.y)) {
      const sprite = this.getStructureSprite(s);
      ctx.save();
      ctx.globalAlpha = s.recentlyHitTicks > 0 ? 0.72 : 1;
      if (sprite) {
        const size = s.towerType === "home" ? 56 : 50;
        ctx.drawImage(sprite, s.x - size / 2, s.y - size / 2 + (s.animTicks > 0 ? -2 : 0), size, size);
      } else {
        ctx.fillStyle = s.team === TEAM.PLAYER ? "#88dfff" : "#ffaf9a";
        ctx.fillRect(s.x - 12, s.y - 12, 24, 24);
      }
      ctx.restore();
      this.drawHealthBar(ctx, s.x, s.y - 26, 36, s.hp, s.maxHp, s.team);
    }

    for (const summon of this.pendingSpawns) {
      const ratio = summon.totalMs <= 0 ? 0 : summon.etaMs / summon.totalMs;
      const alpha = 0.42 + (1 - ratio) * 0.52;
      const ring = 12 + (1 - ratio) * 16;
      ctx.save();
      ctx.strokeStyle = summon.team === TEAM.PLAYER ? "#9cecff" : "#ffc7a7";
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(summon.x, summon.y, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(summon.x, summon.y, 8 + Math.sin(this.animTick * 0.2) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = "#f3fff8";
      ctx.font = "700 11px 'Trebuchet MS'";
      ctx.textAlign = "center";
      ctx.fillText(`${(summon.etaMs / 1000).toFixed(1)}s`, summon.x, summon.y - 18);
      ctx.restore();
    }

    for (const u of [...this.units].sort((a, b) => a.y - b.y)) {
      const sprite = this.getUnitSprite(u);
      const bob = u.isAir ? Math.sin(u.spriteBob) * 3 : 0;
      const classColor = CLASS_META[u.class]?.color ?? "#ffffff";
      const size = u.unitId === "slime_golem" ? 52 : u.isAir ? 46 : 44;
      ctx.save();
      ctx.globalAlpha = u.recentlyHitTicks > 0 ? 0.64 : 1;
      if (sprite) {
        ctx.drawImage(sprite, u.x - size / 2, u.y - size / 2 + bob, size, size);
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = classColor;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(u.x, u.y + bob + 1, size * 0.22, size * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = u.team === TEAM.PLAYER ? "#9aefff88" : "#ffbf9f88";
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.ellipse(u.x, u.y + bob + 1, size * 0.29, size * 0.17, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = CLASS_META[u.class]?.color ?? "#ddd";
        ctx.beginPath();
        ctx.arc(u.x, u.y + bob, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      this.drawHealthBar(ctx, u.x, u.y - 20 + bob, 24, u.hp, u.maxHp, u.team);
      this.drawUnitBadge(ctx, u, bob, size);
    }

    if (this.dragState?.active) {
      const previewPoint = this.dragState.point;
      const resolved = this.dragState.resolved;
      const valid = Boolean(this.dragState.valid && resolved);
      if (previewPoint) {
        ctx.save();
        ctx.strokeStyle = valid ? "#90ffb8" : "#ff9f9f";
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.95;
        if (resolved) {
          ctx.beginPath();
          ctx.arc(resolved.x, resolved.y, 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(resolved.x, resolved.y, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = valid ? "#defde8" : "#ffd5d5";
          ctx.font = "700 11px 'Trebuchet MS'";
          ctx.textAlign = "center";
          ctx.fillText(valid ? `Drop: ${LANE_LABELS[resolved.lane]}` : "No Drop", resolved.x, resolved.y - 19);
        } else {
          ctx.beginPath();
          ctx.arc(previewPoint.x, previewPoint.y, 13, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(previewPoint.x - 6, previewPoint.y - 6);
          ctx.lineTo(previewPoint.x + 6, previewPoint.y + 6);
          ctx.moveTo(previewPoint.x + 6, previewPoint.y - 6);
          ctx.lineTo(previewPoint.x - 6, previewPoint.y + 6);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    const projectilePool = this.qualityTier === "low" ? this.shotEffects.slice(-12) : this.shotEffects;
    for (const fx of projectilePool) {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = fx.ttl / 10;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const slashPool = this.qualityTier === "low" ? this.slashEffects.slice(-10) : this.slashEffects;
    for (const fx of slashPool) {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = fx.ttl / 10;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius - fx.ttl * 0.4, Math.PI * 0.2, Math.PI * 1.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const hitPool = this.qualityTier === "low" ? this.hitEffects.slice(-18) : this.hitEffects;
    for (const fx of hitPool) {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = fx.ttl / 18;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 14 - fx.ttl * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  getSnapshot() {
    const pT = this.getTowerStructures(TEAM.PLAYER);
    const eT = this.getTowerStructures(TEAM.ENEMY);
    const lanePressures = [0, 1, 2].map((lane) =>
      this.units.filter((u) => u.team === TEAM.ENEMY && u.lane === lane && u.hp > 0).reduce((s, u) => s + u.attack * 0.2 + u.hp * 0.02, 0)
    );
    return {
      mode: this.mode,
      phase: this.phase,
      turn: this.turn,
      winner: this.winner,
      endReason: this.endReason,
      message: this.message,
      selectedCardId: this.selectedCardId,
      selectedLane: this.selectedLane,
      playerEnergy: this.player.energy,
      enemyEnergy: this.enemy.energy,
      playerDeployedThisTurn: this.player.deployedThisTurn,
      matchTimeRemainingMs: this.matchTimeRemainingMs,
      deployTimeRemainingMs: this.deployTimeRemainingMs,
      resolveTicksRemaining: this.resolveTicksRemaining,
      playerTowersAlive: pT.filter((t) => t.hp > 0).length,
      enemyTowersAlive: eT.filter((t) => t.hp > 0).length,
      manaGainPerTurn: this.manaGainPerTurn,
      manaRampLabel: this.manaRampLabel,
      qualityTier: this.qualityTier,
      dropBoundaryY: TURN_CONFIG.noDropBoundaryY,
      timeDisplay: fmtClock(this.matchTimeRemainingMs),
      draft: {
        active: this.mode === PHASE.DRAFT,
        pickIndex: this.draft.pickIndex,
        currentPicker: this.currentDraftPicker(),
        playerDeck: [...this.draft.playerDeck],
        enemyDeck: [...this.draft.enemyDeck],
        pool: { ...this.draft.pool },
      },
      deckState: {
        playerDeckCount: this.decks.player.drawPile.length,
        enemyDeckCount: this.decks.enemy.drawPile.length,
        playerDiscardCount: this.decks.player.discard.length,
        enemyDiscardCount: this.decks.enemy.discard.length,
        playerHand: [...this.decks.player.hand],
        enemyHandCount: this.decks.enemy.hand.length,
      },
      pendingSpawns: this.pendingSpawns.map((summon) => ({
        id: summon.id,
        team: summon.team,
        cardId: summon.cardId,
        lane: summon.lane,
        x: Number(summon.x.toFixed(1)),
        y: Number(summon.y.toFixed(1)),
        etaMs: Math.round(summon.etaMs),
      })),
      dragState: this.dragState
        ? {
            active: Boolean(this.dragState.active),
            valid: Boolean(this.dragState.valid),
            point: this.dragState.point
              ? {
                  x: Number(this.dragState.point.x.toFixed(1)),
                  y: Number(this.dragState.point.y.toFixed(1)),
                }
              : null,
            resolved: this.dragState.resolved
              ? {
                  lane: this.dragState.resolved.lane,
                  x: Number(this.dragState.resolved.x.toFixed(1)),
                  y: Number(this.dragState.resolved.y.toFixed(1)),
                }
              : null,
          }
        : null,
      lanePressures,
      structures: this.structures,
      units: this.units,
    };
  }

  renderToText() {
    const pT = this.getTowerStructures(TEAM.PLAYER);
    const eT = this.getTowerStructures(TEAM.ENEMY);
    return JSON.stringify({
      mode: this.mode,
      phase: this.phase,
      turn: this.turn,
      coordinate_system: "origin top-left, x rightward, y downward, board=390x520",
      timers: {
        match_time_remaining_ms: Math.round(this.matchTimeRemainingMs),
        deploy_time_remaining_ms: Math.round(this.deployTimeRemainingMs),
        resolve_ticks_remaining: this.resolveTicksRemaining,
      },
      draft_state: {
        pick_index: this.draft.pickIndex,
        current_picker: this.currentDraftPicker(),
        player_picks: [...this.draft.playerDeck],
        enemy_picks: [...this.draft.enemyDeck],
        available_pool_count: Object.values(this.draft.pool).reduce((s, n) => s + n, 0),
      },
      deck_state: {
        player_deck_ids: [...this.decks.player.fullDeck],
        player_hand_ids: [...this.decks.player.hand],
        player_discard_count: this.decks.player.discard.length,
        enemy_deck_ids: [...this.decks.enemy.fullDeck],
        enemy_hand_count: this.decks.enemy.hand.length,
        enemy_discard_count: this.decks.enemy.discard.length,
      },
      mana_ramp_tier: this.manaRampLabel,
      quality_tier: this.qualityTier,
      no_drop_boundary_y: TURN_CONFIG.noDropBoundaryY,
      structures_alive_count: {
        player_towers_alive: pT.filter((t) => t.hp > 0).length,
        enemy_towers_alive: eT.filter((t) => t.hp > 0).length,
      },
      energy: { player: this.player.energy, enemy: this.enemy.energy, max: TURN_CONFIG.maxEnergy },
      selected: { card: this.selectedCardId, lane: this.selectedLane },
      pending_spawns: this.pendingSpawns.map((summon) => ({
        id: summon.id,
        team: summon.team,
        card_id: summon.cardId,
        lane: summon.lane,
        eta_ms: Math.round(summon.etaMs),
        x: Number(summon.x.toFixed(1)),
        y: Number(summon.y.toFixed(1)),
      })),
      drag_state: this.dragState
        ? {
            active: Boolean(this.dragState.active),
            valid: Boolean(this.dragState.valid),
            point: this.dragState.point
              ? {
                  x: Number(this.dragState.point.x.toFixed(1)),
                  y: Number(this.dragState.point.y.toFixed(1)),
                }
              : null,
            resolved: this.dragState.resolved
              ? {
                  lane: this.dragState.resolved.lane,
                  x: Number(this.dragState.resolved.x.toFixed(1)),
                  y: Number(this.dragState.resolved.y.toFixed(1)),
                }
              : null,
          }
        : null,
      winner: this.winner,
      end_reason: this.endReason,
      message: this.message,
      structures: this.structures.map((s) => ({
        id: s.id, team: s.team, towerType: s.towerType, lane: s.lane, hp: s.hp, maxHp: s.maxHp,
        x: Number(s.x.toFixed(1)), y: Number(s.y.toFixed(1)),
      })),
      units: this.units.map((u) => ({
        id: u.id, unitId: u.unitId, team: u.team, class: u.class, name: u.name, lane: u.lane,
        hp: u.hp, maxHp: u.maxHp, x: Number(u.x.toFixed(1)), y: Number(u.y.toFixed(1)), cooldown: u.cooldown, isAir: u.isAir,
      })),
    });
  }
}

export function buildAssetManifest() {
  const structures = {};
  for (const team of [TEAM.PLAYER, TEAM.ENEMY]) {
    for (const towerType of ["left", "center", "right", "home"]) {
      structures[`${team}_${towerType}`] = getStructureSpritePath(team, towerType, false);
      structures[`${team}_${towerType}_destroyed`] = getStructureSpritePath(team, towerType, true);
    }
  }
  const units = {};
  for (const unit of UNIT_DEFS) {
    for (const state of Object.keys(SPRITE_FRAMES)) {
      for (let frame = 0; frame < SPRITE_FRAMES[state]; frame += 1) {
        units[`${unit.id}_${state}_${frame}`] = getUnitSpritePath(unit.id, state, frame);
      }
    }
  }
  return { arenaPath: ARENA_SPRITE_PATH, structures, units };
}
