export const TEAM = {
  PLAYER: "player",
  ENEMY: "enemy",
};

export const PHASE = {
  START: "start",
  DRAFT: "draft",
  DEPLOY: "deploy",
  ENEMY_DEPLOY: "enemyDeploy",
  RESOLVE: "resolve",
  GAME_OVER: "gameOver",
};

export const END_REASON = {
  HOME_DESTROYED: "home_destroyed",
  TIMER_TOWER_COUNT: "timer_tower_count",
  TIMER_HP_TIEBREAKER: "timer_hp_tiebreak",
  TIMER_DRAW: "timer_draw",
};

export const BOARD = {
  width: 390,
  height: 520,
  laneCount: 3,
  laneCenters: [65, 195, 325],
  laneEdges: [0, 130, 260, 390],
  laneTop: 12,
  laneBottom: 508,
};

export const TURN_CONFIG = {
  tickMs: 1000 / 60,
  deployWindowMs: 14000,
  deployTelegraphMs: 1200,
  dropSnapRadius: 170,
  noDropBoundaryY: 260,
  resolveTicks: 210,
  matchDurationMs: 180000,
  startEnergy: 4,
  maxEnergy: 12,
  laneUnitCap: 14,
};

export const DRAFT_CONFIG = {
  deckSize: 6,
  handSize: 4,
  copiesPerCard: 1,
};

export const MANA_RAMP = [
  { elapsedMs: 0, gain: 2, label: "x2" },
  { elapsedMs: 60000, gain: 3, label: "x3" },
  { elapsedMs: 120000, gain: 4, label: "x4" },
];

export const CLASS_META = {
  melee: { label: "Melee", short: "MEL", color: "#cc9250" },
  ranged: { label: "Ranged", short: "RNG", color: "#7ad0af" },
  air: { label: "Air", short: "AIR", color: "#8bc2ff" },
  dark: { label: "Dark", short: "DRK", color: "#9a7cff" },
  light: { label: "Light", short: "LIT", color: "#ffd76f" },
};

export const LANE_LABELS = ["Left", "Center", "Right"];

export const TOWER_STATS = {
  left: {
    hp: 700,
    attack: 11,
    attackRange: 114,
    attackCooldownTicks: 14,
  },
  center: {
    hp: 760,
    attack: 12,
    attackRange: 126,
    attackCooldownTicks: 14,
  },
  right: {
    hp: 700,
    attack: 11,
    attackRange: 114,
    attackCooldownTicks: 14,
  },
  home: {
    hp: 900,
    attack: 10,
    attackRange: 106,
    attackCooldownTicks: 18,
  },
};

// Advantage matrix:
// light > dark, dark > ranged, ranged > air, air > melee, melee > light
const DEFAULT_CLASS_MOD = 1;
const ADV = 1.3;
const WEAK = 0.78;
export const CLASS_VS_CLASS_MOD = {
  melee: { light: ADV, air: WEAK },
  ranged: { air: ADV, dark: WEAK },
  air: { melee: ADV, ranged: WEAK },
  dark: { ranged: ADV, light: WEAK },
  light: { dark: ADV, melee: WEAK },
};

export function classVsClassModifier(attackerClass, targetClass) {
  return CLASS_VS_CLASS_MOD[attackerClass]?.[targetClass] ?? DEFAULT_CLASS_MOD;
}

export function getManaGain(elapsedMs) {
  if (elapsedMs >= 120000) return 4;
  if (elapsedMs >= 60000) return 3;
  return 2;
}

export function getManaRampLabel(elapsedMs) {
  if (elapsedMs >= 120000) return "x4";
  if (elapsedMs >= 60000) return "x3";
  return "x2";
}

export const UNIT_DEFS = [
  {
    id: "dwarf_brute",
    class: "melee",
    tag: "DB",
    squad: "dwarves",
    name: "Dwarf Brute",
    cost: 3,
    hp: 262,
    attack: 18,
    attackRange: 24,
    attackCooldownTicks: 9,
    moveSpeedPerTick: 2.1,
    targetType: "ground",
    isAir: false,
  },
  {
    id: "human_warrior",
    class: "melee",
    tag: "HW",
    squad: "human warriors",
    name: "Human Warrior",
    cost: 3,
    hp: 236,
    attack: 17,
    attackRange: 24,
    attackCooldownTicks: 8,
    moveSpeedPerTick: 2.2,
    targetType: "ground",
    isAir: false,
  },
  {
    id: "slime_golem",
    class: "melee",
    tag: "SG",
    squad: "slime golems",
    name: "Slime Golem",
    cost: 5,
    hp: 404,
    attack: 26,
    attackRange: 26,
    attackCooldownTicks: 12,
    moveSpeedPerTick: 1.55,
    targetType: "ground",
    isAir: false,
  },
  {
    id: "elf_archer",
    class: "ranged",
    tag: "EA",
    squad: "elves",
    name: "Elf Archer",
    cost: 3,
    hp: 154,
    attack: 13,
    attackRange: 142,
    attackCooldownTicks: 8,
    moveSpeedPerTick: 1.95,
    targetType: "both",
    isAir: false,
  },
  {
    id: "skeleton_juggler",
    class: "ranged",
    tag: "SJ",
    squad: "skeleton jugglers",
    name: "Skeleton Juggler",
    cost: 2,
    hp: 138,
    attack: 11,
    attackRange: 126,
    attackCooldownTicks: 7,
    moveSpeedPerTick: 2.1,
    targetType: "both",
    isAir: false,
  },
  {
    id: "mage_adept",
    class: "ranged",
    tag: "MA",
    squad: "mages",
    name: "Mage Adept",
    cost: 4,
    hp: 172,
    attack: 20,
    attackRange: 132,
    attackCooldownTicks: 10,
    moveSpeedPerTick: 1.88,
    targetType: "both",
    isAir: false,
  },
  {
    id: "sky_bird",
    class: "air",
    tag: "SB",
    squad: "birds",
    name: "Sky Bird",
    cost: 2,
    hp: 122,
    attack: 10,
    attackRange: 76,
    attackCooldownTicks: 6,
    moveSpeedPerTick: 2.35,
    targetType: "both",
    isAir: true,
  },
  {
    id: "storm_drake",
    class: "air",
    tag: "SD",
    squad: "dragons",
    name: "Storm Drake",
    cost: 4,
    hp: 236,
    attack: 18,
    attackRange: 92,
    attackCooldownTicks: 9,
    moveSpeedPerTick: 2.15,
    targetType: "both",
    isAir: true,
  },
  {
    id: "ember_dragon",
    class: "air",
    tag: "ED",
    squad: "dragons",
    name: "Ember Dragon",
    cost: 5,
    hp: 304,
    attack: 24,
    attackRange: 98,
    attackCooldownTicks: 11,
    moveSpeedPerTick: 1.95,
    targetType: "both",
    isAir: true,
  },
  {
    id: "evil_spirit",
    class: "dark",
    tag: "ES",
    squad: "dark troops",
    name: "Evil Spirit",
    cost: 2,
    hp: 110,
    attack: 12,
    attackRange: 124,
    attackCooldownTicks: 6,
    moveSpeedPerTick: 2.2,
    targetType: "both",
    isAir: true,
  },
  {
    id: "corrupted_mage",
    class: "dark",
    tag: "CM",
    squad: "dark troops",
    name: "Corrupted Mage",
    cost: 4,
    hp: 186,
    attack: 22,
    attackRange: 136,
    attackCooldownTicks: 10,
    moveSpeedPerTick: 1.9,
    targetType: "both",
    isAir: true,
  },
  {
    id: "cursed_bee",
    class: "dark",
    tag: "CB",
    squad: "dark troops",
    name: "Cursed Bee",
    cost: 3,
    hp: 142,
    attack: 15,
    attackRange: 112,
    attackCooldownTicks: 6,
    moveSpeedPerTick: 2.35,
    targetType: "both",
    isAir: true,
  },
  {
    id: "fire_of_the_good",
    class: "light",
    tag: "FG",
    squad: "light troops",
    name: "Fire of the Good",
    cost: 2,
    hp: 158,
    attack: 12,
    attackRange: 94,
    attackCooldownTicks: 6,
    moveSpeedPerTick: 2.05,
    targetType: "dark_towers",
    isAir: false,
  },
  {
    id: "ghost_of_king_arthur",
    class: "light",
    tag: "GA",
    squad: "light troops",
    name: "Ghost of King Arthur",
    cost: 4,
    hp: 236,
    attack: 18,
    attackRange: 98,
    attackCooldownTicks: 9,
    moveSpeedPerTick: 1.85,
    targetType: "dark_towers",
    isAir: false,
  },
  {
    id: "cloaked_hero",
    class: "light",
    tag: "CH",
    squad: "light troops",
    name: "The Cloaked Hero",
    cost: 5,
    hp: 286,
    attack: 24,
    attackRange: 96,
    attackCooldownTicks: 10,
    moveSpeedPerTick: 1.7,
    targetType: "dark_towers",
    isAir: false,
  },
];

export function getUnitDef(unitId) {
  return UNIT_DEFS.find((unit) => unit.id === unitId) ?? null;
}

export function getLaneCenter(lane) {
  return BOARD.laneCenters[Math.max(0, Math.min(BOARD.laneCount - 1, lane))];
}

export function createInitialStructures() {
  const playerTowerY = 412;
  const enemyTowerY = 108;
  const playerHomeY = 486;
  const enemyHomeY = 34;

  return [
    {
      id: "player-left",
      team: TEAM.PLAYER,
      towerType: "left",
      lane: 0,
      x: getLaneCenter(0),
      y: playerTowerY,
      ...TOWER_STATS.left,
      maxHp: TOWER_STATS.left.hp,
      cooldown: 0,
      isStructure: true,
      isTower: true,
    },
    {
      id: "player-center",
      team: TEAM.PLAYER,
      towerType: "center",
      lane: 1,
      x: getLaneCenter(1),
      y: playerTowerY,
      ...TOWER_STATS.center,
      maxHp: TOWER_STATS.center.hp,
      cooldown: 0,
      isStructure: true,
      isTower: true,
    },
    {
      id: "player-home",
      team: TEAM.PLAYER,
      towerType: "home",
      lane: 1,
      x: getLaneCenter(1),
      y: playerHomeY,
      ...TOWER_STATS.home,
      maxHp: TOWER_STATS.home.hp,
      cooldown: 0,
      isStructure: true,
      isTower: false,
    },
    {
      id: "player-right",
      team: TEAM.PLAYER,
      towerType: "right",
      lane: 2,
      x: getLaneCenter(2),
      y: playerTowerY,
      ...TOWER_STATS.right,
      maxHp: TOWER_STATS.right.hp,
      cooldown: 0,
      isStructure: true,
      isTower: true,
    },
    {
      id: "enemy-left",
      team: TEAM.ENEMY,
      towerType: "left",
      lane: 0,
      x: getLaneCenter(0),
      y: enemyTowerY,
      ...TOWER_STATS.left,
      maxHp: TOWER_STATS.left.hp,
      cooldown: 0,
      isStructure: true,
      isTower: true,
    },
    {
      id: "enemy-center",
      team: TEAM.ENEMY,
      towerType: "center",
      lane: 1,
      x: getLaneCenter(1),
      y: enemyTowerY,
      ...TOWER_STATS.center,
      maxHp: TOWER_STATS.center.hp,
      cooldown: 0,
      isStructure: true,
      isTower: true,
    },
    {
      id: "enemy-home",
      team: TEAM.ENEMY,
      towerType: "home",
      lane: 1,
      x: getLaneCenter(1),
      y: enemyHomeY,
      ...TOWER_STATS.home,
      maxHp: TOWER_STATS.home.hp,
      cooldown: 0,
      isStructure: true,
      isTower: false,
    },
    {
      id: "enemy-right",
      team: TEAM.ENEMY,
      towerType: "right",
      lane: 2,
      x: getLaneCenter(2),
      y: enemyTowerY,
      ...TOWER_STATS.right,
      maxHp: TOWER_STATS.right.hp,
      cooldown: 0,
      isStructure: true,
      isTower: true,
    },
  ];
}

export function getSpawnPoint(team, lane, structures) {
  const isPlayer = team === TEAM.PLAYER;
  const sideShift = isPlayer ? 14 : -14;
  const towerType = lane === 0 ? "left" : lane === 2 ? "right" : "home";

  const structure = structures.find((item) => item.team === team && item.towerType === towerType);
  if (!structure) {
    return {
      x: getLaneCenter(lane),
      y: isPlayer ? BOARD.laneBottom - 16 : BOARD.laneTop + 16,
    };
  }

  return {
    x: structure.x,
    y: structure.y + sideShift,
  };
}

export function getUnitSpritePath(unitId, state, frameIndex) {
  return `assets/sprites/units/${unitId}_${state}_${frameIndex}.png`;
}

export function getCardPortraitPath(unitId) {
  return `assets/cards/${unitId}.png`;
}

export function getStructureSpritePath(team, towerType, destroyed = false) {
  const suffix = destroyed ? "_destroyed" : "";
  return `assets/sprites/structures/${team}_${towerType}${suffix}.png`;
}

export const ARENA_SPRITE_PATH = "assets/arena/arena_overhead_v4.png";
