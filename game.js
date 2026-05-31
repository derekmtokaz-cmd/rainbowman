"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const healthBarEl = document.getElementById("healthBar");
const rainbowBarEl = document.getElementById("rainbowBar");
const levelListEl = document.getElementById("levelList");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const TILE = 32;
const COLOR_SPACE_WIDTH = TILE * 2;
const MAX_HP = 10;
const PLAYER_WIDTH = 26;
const PLAYER_HEIGHT = 34;
const ENEMY_WIDTH = 28;
const ENEMY_HEIGHT = 24;
const GOAL_COLOR_INDEX = "goal";
const ROTATING_COLOR_INDEX = "rotate";
const SLOPE_DOWN_RIGHT_TYPE = "slopeDownRight";
const SLOPE_DOWN_LEFT_TYPE = "slopeDownLeft";
const LEVEL_MANIFEST_URL = "levels/levels.json";
const PUBLISHED_LEVEL_URLS = ["levels/level-1.json", "levels/level-2.json"];
const FALLBACK_LEVEL_SELECTOR_ITEMS = [
  { id: "level-1", name: "Level 1", url: "levels/level-1.json", live: true },
  { id: "level-2", name: "Level 2", url: "levels/level-2.json", live: true },
];

const MASTER_COLORS = [
  { name: "Red", value: "#ff3b30" },
  { name: "Orange", value: "#ff9500" },
  { name: "Yellow", value: "#ffcc00" },
  { name: "Green", value: "#34c759" },
  { name: "Blue", value: "#007aff" },
  { name: "Indigo", value: "#4b49c9" },
  { name: "Violet", value: "#af52de" },
];

const DEFAULT_LEVEL = {
  activePalette: [0, 2, 4],
  start: { x: 64, y: 606 },
  goal: { platformIndex: 9, x: 1056, w: 42, h: 74, gap: 4 },
  platforms: [
    { x: 0, y: 640, blocks: [{ w: 64, colorIndex: 0 }, { w: 64, colorIndex: 1 }, { w: 64, colorIndex: 1 }, { w: 64, colorIndex: 2 }, { w: 64, colorIndex: 2 }] },
    { x: 288, y: 570, blocks: [{ w: 64, colorIndex: 0 }, { w: 64, colorIndex: 1 }, { w: 64, colorIndex: 1 }] },
    { x: 544, y: 500, blocks: [{ w: 64, colorIndex: 2 }, { w: 64, colorIndex: 0 }, { w: 64, colorIndex: 1 }] },
    { x: 800, y: 500, blocks: [{ w: 64, colorIndex: 1 }, { w: 64, colorIndex: 2 }] },
    { x: 704, y: 430, blocks: [{ w: 64, colorIndex: 2 }, { w: 64, colorIndex: 2 }, { w: 64, colorIndex: 1 }] },
    { x: 928, y: 360, blocks: [{ w: 64, colorIndex: 0 }, { w: 64, colorIndex: 2 }, { w: 64, colorIndex: 2 }] },
    { x: 672, y: 290, blocks: [{ w: 64, colorIndex: 1 }, { w: 64, colorIndex: 2 }] },
    { x: 896, y: 290, blocks: [{ w: 64, colorIndex: 0 }, { w: 64, colorIndex: 0 }, { w: 64, colorIndex: 1 }] },
    { x: 768, y: 220, blocks: [{ w: 64, colorIndex: 2 }, { w: 64, colorIndex: 2 }, { w: 64, colorIndex: 1 }] },
    { x: 992, y: 150, blocks: [{ w: 64, colorIndex: 0 }, { w: 64, colorIndex: "goal" }, { w: 64, colorIndex: 1 }] },
  ],
  enemies: [
    { x: 608, y: 476, direction: 1, colorIndex: 2 },
    { x: 800, y: 406, direction: -1, colorIndex: 1 },
    { x: 800, y: 196, direction: 1, colorIndex: 2 },
  ],
};

let LEVEL = DEFAULT_LEVEL;

const keys = new Set();
let colorIndex = 0;
let won = false;
let gameOver = false;
let hp = MAX_HP;
let currentGroundSpace = null;
let enemies = [];
let ridingEnemy = null;
let colorLockedMote = null;
let damageTextTimer = 0;
let damageText = "Ow!";
let levelStartTime = 0;
let currentLevelIndex = 0;
let currentLevelUrl = PUBLISHED_LEVEL_URLS[0];
let levelSelectorItems = [];

const player = {
  x: LEVEL.start.x,
  y: LEVEL.start.y,
  w: PLAYER_WIDTH,
  h: PLAYER_HEIGHT,
  vx: 0,
  vy: 0,
  grounded: false,
};

const jumpSound = new Audio("sounds/jump.mp3");
const damageSound = new Audio("sounds/damage.mp3");
const winSound = new Audio("sounds/win.mp3");
const loseSound = new Audio("sounds/lose.mp3");
const gameSounds = [jumpSound, damageSound, winSound, loseSound];

for (const sound of gameSounds) {
  sound.volume = 0.5;
}

let platforms = [];
const PLAYER_ACCEL = 1.0;
const PLAYER_MAX_SPEED = 5.2;
const RIDING_ACCEL = PLAYER_ACCEL / 2;
const RIDING_MAX_SPEED = PLAYER_MAX_SPEED / 2;
const PLAYER_FRICTION = 0.55;
const PLAYER_STOP_EPSILON = 0.08;
const DAMAGE_TEXT_DURATION = 30;
const DAMAGE_TEXT_OPTIONS = ["Ow!", "Ouch!", "Owie!"];
const ROTATING_COLOR_INTERVAL = 5000;
const SLOPE_SLIDE_SPEED = 0.31;
const SLOPE_SNAP_BUFFER = 1;
const MAX_REACHABLE_JUMP_HEIGHT = 150;
const MAX_REACHABLE_DROP = 120;
const MAX_REACHABLE_JUMP_DISTANCE = 220;
const MIN_LANDING_WINDOW = 26 + 8;
const PLAYER_CLEARANCE_HEIGHT = 34 + 4;
const MIN_PLATFORM_VERTICAL_GAP = TILE + PLAYER_CLEARANCE_HEIGHT;

function resetGame() {
  player.x = LEVEL.start.x;
  player.y = LEVEL.start.y;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  colorIndex = 0;
  won = false;
  gameOver = false;
  hp = MAX_HP;
  currentGroundSpace = null;
  damageTextTimer = 0;
  levelStartTime = performance.now();
  clearMoteRidingState();
  validatePlatformDensity(LEVEL.platforms);
  validatePlatformReachability(LEVEL.platforms);
  validatePlatformClearance(LEVEL.platforms);
  buildPlatforms();
  resetGoal();
  initializeStartingGround();
  resetEnemies();
  updateStatus();
  updateHealthBar();
  updateRainbowBar();
}

function initializeStartingGround() {
  const groundSpace = findCurrentGroundSpace();

  if (!groundSpace) return;

  player.grounded = true;
  currentGroundSpace = groundSpace;
}

function buildPlatforms() {
  platforms = LEVEL.platforms.map(createPlatform);
}

function createPlatform(spec) {
  let offset = 0;
  const blocks = spec.blocks.map((block, blockIndex) => {
    const type = normalizeBlockType(block.type);
    const w = isSlopeType(type) ? TILE : block.w;
    const normalized = {
      x: spec.x + offset,
      y: spec.y,
      w,
      h: TILE,
      colorIndex: normalizeBlockColorIndex(block.colorIndex),
      type,
      blockIndex,
    };
    offset += w;
    return normalized;
  });

  return { x: spec.x, y: spec.y, w: offset, h: TILE, blocks };
}

function resetGoal() {
  if (hasGoalBlocks() || !LEVEL.goal) return;

  const platform = platforms[LEVEL.goal.platformIndex];
  const x = clamp(LEVEL.goal.x ?? 0, 0, WIDTH - COLOR_SPACE_WIDTH);
  const y = platform
    ? clamp(platform.y - TILE, 0, HEIGHT - TILE)
    : clamp(LEVEL.goal.y ?? 0, 0, HEIGHT - TILE);

  platforms.push({
    x,
    y,
    w: COLOR_SPACE_WIDTH,
    h: TILE,
    blocks: [{ x, y, w: COLOR_SPACE_WIDTH, h: TILE, colorIndex: GOAL_COLOR_INDEX, blockIndex: 0 }],
  });
}

function getPlatformSpaces(platformSpec, platformIndex) {
  let offset = 0;

  return platformSpec.blocks.map((block, spaceIndex) => {
    const x = platformSpec.x + offset;
    offset += block.w;

    return {
      platformIndex,
      spaceIndex,
      x,
      y: platformSpec.y,
      w: block.w,
      centerX: x + block.w / 2,
    };
  });
}

function isSpaceReachableFromSpace(source, target) {
  const verticalRise = source.y - target.y;
  const horizontalDistance = Math.abs(source.centerX - target.centerX);

  return (
    verticalRise >= -MAX_REACHABLE_DROP &&
    verticalRise <= MAX_REACHABLE_JUMP_HEIGHT &&
    horizontalDistance <= MAX_REACHABLE_JUMP_DISTANCE &&
    target.w >= MIN_LANDING_WINDOW
  );
}

function validatePlatformReachability(platformSpecs) {
  const spaces = platformSpecs.flatMap((spec, index) => getPlatformSpaces(spec, index));
  const reachablePlatforms = new Set();
  const startCenterX = LEVEL.start.x + player.w / 2;

  for (let i = 0; i < platformSpecs.length; i++) {
    const spec = platformSpecs[i];
    const playerFeetY = LEVEL.start.y + player.h;

    if (
      playerFeetY === spec.y &&
      startCenterX >= spec.x &&
      startCenterX <= spec.x + getPlatformSpecWidth(spec)
    ) {
      reachablePlatforms.add(i);
    }
  }

  let changed = true;

  while (changed) {
    changed = false;

    for (const target of spaces) {
      if (reachablePlatforms.has(target.platformIndex)) continue;

      const canReachTarget = spaces.some(
        (source) =>
          reachablePlatforms.has(source.platformIndex) &&
          isSpaceReachableFromSpace(source, target),
      );

      if (canReachTarget) {
        reachablePlatforms.add(target.platformIndex);
        changed = true;
      }
    }
  }

  const unreachable = spaces.filter((space) => !reachablePlatforms.has(space.platformIndex));

  if (unreachable.length > 0) {
    console.warn(
      "Unreachable platform spaces:",
      unreachable.map((space) => `platform ${space.platformIndex}, space ${space.spaceIndex}`),
    );
  }
}

function validatePlatformClearance(platformSpecs) {
  const violations = [];

  for (let i = 0; i < platformSpecs.length; i++) {
    for (let j = i + 1; j < platformSpecs.length; j++) {
      const a = platformSpecs[i];
      const b = platformSpecs[j];
      const upper = a.y < b.y ? a : b;
      const lower = a.y < b.y ? b : a;

      if (!platformsHorizontallyOverlap(upper, lower)) continue;

      const verticalGap = lower.y - upper.y;
      const clearance = lower.y - (upper.y + TILE);

      if (verticalGap < MIN_PLATFORM_VERTICAL_GAP || clearance < PLAYER_CLEARANCE_HEIGHT) {
        violations.push(
          `platform ${platformSpecs.indexOf(upper)} over platform ${platformSpecs.indexOf(lower)}`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.warn("Platform clearance violations:", violations);
  }
}

function validatePlatformDensity(platformSpecs) {
  if (platformSpecs.length > 12) {
    console.warn(`Platform density warning: ${platformSpecs.length} platform clusters.`);
  }

  const rows = new Map();

  for (const spec of platformSpecs) {
    rows.set(spec.y, (rows.get(spec.y) || 0) + 1);
  }

  const crowdedRows = [...rows.entries()].filter(([, count]) => count > 2);

  if (crowdedRows.length > 0) {
    console.warn(
      "Row density warnings:",
      crowdedRows.map(([y, count]) => `row y=${y} has ${count} platform clusters`),
    );
  }
}

function platformsHorizontallyOverlap(a, b) {
  const aRight = a.x + getPlatformSpecWidth(a);
  const bRight = b.x + getPlatformSpecWidth(b);
  return a.x < bRight && aRight > b.x;
}

function getPlatformSpecWidth(spec) {
  return spec.blocks.reduce((total, block) => total + block.w, 0);
}

function resetEnemies() {
  enemies = LEVEL.enemies.map(createEnemy).filter(Boolean);
}

function createEnemy(spec) {
  const w = ENEMY_WIDTH;
  const h = ENEMY_HEIGHT;
  const platform = findEnemyPlatform(spec) || platforms[0];
  if (!platform) return null;

  const x = clamp(spec.x ?? platform.x, platform.x, platform.x + platform.w - w);
  const walkBounds = getEnemyWalkBounds(platform, x + w / 2);
  if (!walkBounds) return null;
  const boundedX = clamp(x, walkBounds.left, walkBounds.right - w);
  const space = getPlatformSpaceAtX(platform, boundedX + w / 2);

  return {
    platform,
    x: boundedX,
    y: platform.y - h,
    w,
    h,
    walkBounds,
    dx: 0,
    direction: spec.direction || 1,
    speed: 1.1,
    colorIndex: clamp(spec.colorIndex ?? randomActiveColorIndex(), 0, LEVEL.activePalette.length - 1),
    currentSpaceIndex: space.spaceIndex,
    currentPlatformColorIndex: space.colorIndex,
    alive: true,
  };
}

function findEnemyPlatform(spec) {
  if (Number.isInteger(spec.platformIndex) && platforms[spec.platformIndex]) {
    return platforms[spec.platformIndex];
  }

  const enemyCenterX = (spec.x ?? 0) + ENEMY_WIDTH / 2;
  const feetY = (spec.y ?? 0) + ENEMY_HEIGHT;

  return platforms.find(
    (platform) =>
      enemyCenterX >= platform.x &&
      enemyCenterX <= platform.x + platform.w &&
      Math.abs(feetY - platform.y) <= TILE,
  );
}

function getEnemyWalkBounds(platform, centerX) {
  const normalBlocks = platform.blocks.filter((block) => !isSlopeBlock(block));
  if (normalBlocks.length === 0) return null;

  let containingBlock = normalBlocks.find((block) => isXWithinBlock(centerX, block));

  if (!containingBlock) {
    containingBlock = normalBlocks.reduce((closest, block) => {
      const blockCenter = block.x + block.w / 2;
      const closestCenter = closest.x + closest.w / 2;
      return Math.abs(blockCenter - centerX) < Math.abs(closestCenter - centerX) ? block : closest;
    }, normalBlocks[0]);
  }

  let left = containingBlock.x;
  let right = containingBlock.x + containingBlock.w;
  let expanded = true;

  while (expanded) {
    expanded = false;

    for (const block of normalBlocks) {
      const blockLeft = block.x;
      const blockRight = block.x + block.w;

      if (blockRight === left) {
        left = blockLeft;
        expanded = true;
      } else if (blockLeft === right) {
        right = blockRight;
        expanded = true;
      }
    }
  }

  return { left, right };
}

function randomActiveColorIndex() {
  return Math.floor(Math.random() * LEVEL.activePalette.length);
}

async function loadPublishedLevel(index) {
  const url = PUBLISHED_LEVEL_URLS[index];
  return loadLevelFromUrl(url, "published level");
}

async function loadLevelFromUrl(url, label = "level") {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      console.warn(
        `Rainbowman: failed to load ${url} (${response.status}); using default level.`,
      );
      return null;
    }

    const level = sanitizeRuntimeLevel(await response.json());
    if (!level) {
      console.warn(`Rainbowman: ${url} is invalid; using default level.`);
      return null;
    }

    console.info(`Rainbowman: loaded ${label} ${url}.`);
    return level;
  } catch {
    console.warn(`Rainbowman: could not fetch ${url}; using default level.`);
    return null;
  }
}

async function loadLevelSelectorItems() {
  try {
    const response = await fetch(LEVEL_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      console.warn(`Rainbowman: failed to load ${LEVEL_MANIFEST_URL}; using fallback selector.`);
      return [...FALLBACK_LEVEL_SELECTOR_ITEMS];
    }

    const parsed = await response.json();
    const items = sanitizeLevelSelectorItems(parsed);
    return items.length > 0 ? items : [...FALLBACK_LEVEL_SELECTOR_ITEMS];
  } catch {
    console.warn(`Rainbowman: could not fetch ${LEVEL_MANIFEST_URL}; using fallback selector.`);
    return [...FALLBACK_LEVEL_SELECTOR_ITEMS];
  }
}

function sanitizeLevelSelectorItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === "object" && item.live === true)
    .map((item) => ({
      id: String(item.id || item.url || ""),
      name: String(item.name || item.id || "Level"),
      url: String(item.url || ""),
      live: true,
    }))
    .filter((item) => item.id && item.url);
}

async function initLevelSelector() {
  if (!levelListEl) return;

  levelSelectorItems = await loadLevelSelectorItems();
  renderLevelSelector();
}

function renderLevelSelector() {
  if (!levelListEl) return;

  levelListEl.innerHTML = "";

  for (const item of levelSelectorItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `level-button${item.url === currentLevelUrl ? " active" : ""}`;
    button.textContent = item.name;
    button.addEventListener("click", () => selectLevel(item));
    levelListEl.append(button);
  }
}

async function selectLevel(item) {
  const level = await loadLevelFromUrl(item.url, "selected level");
  if (!level) {
    statusEl.textContent = `Could not load ${item.name}.`;
    return;
  }

  startLevel(getProgressionIndexForUrl(item.url), level, item.url);
}

function getProgressionIndexForUrl(url) {
  return PUBLISHED_LEVEL_URLS.indexOf(url);
}

function sanitizeRuntimeLevel(level) {
  if (!level || typeof level !== "object") return null;
  const activePalette = sanitizeActivePalette(level.activePalette);
  const moteSpecs = Array.isArray(level.motes) ? level.motes : level.enemies;

  return {
    activePalette,
    start: sanitizeStart(level.start),
    goal: level.goal && typeof level.goal === "object" ? { ...level.goal } : null,
    platforms: sanitizePlatformSpecs(level.platforms, activePalette.length),
    enemies: sanitizeEnemySpecs(moteSpecs, activePalette.length),
  };
}

function sanitizeActivePalette(palette) {
  if (!Array.isArray(palette)) return [...DEFAULT_LEVEL.activePalette];

  const indexes = [...new Set(palette)]
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && MASTER_COLORS[index]);

  return indexes.length > 0 ? indexes : [...DEFAULT_LEVEL.activePalette];
}

function sanitizeStart(start) {
  if (!start || typeof start !== "object") return { ...DEFAULT_LEVEL.start };

  return {
    x: clamp(Number(start.x) || 0, 0, WIDTH - PLAYER_WIDTH),
    y: clamp(Number(start.y) || 0, 0, HEIGHT - PLAYER_HEIGHT),
  };
}

function sanitizePlatformSpecs(platforms, activePaletteLength) {
  if (!Array.isArray(platforms)) return [];

  return platforms
    .map((platform) => {
      if (!platform || typeof platform !== "object") return null;

      const sourceBlocks = Array.isArray(platform.blocks)
        ? platform.blocks
        : Array.from({ length: Math.max(0, Number(platform.spaces) || 0) }, () => ({
            w: COLOR_SPACE_WIDTH,
            colorIndex: 0,
          }));

      const blocks = sourceBlocks
        .map((block) => {
          const type = sanitizeBlockType(block?.type);
          return {
            w: isSlopeType(type)
              ? TILE
              : clamp(Number(block?.w) || COLOR_SPACE_WIDTH, TILE, WIDTH),
            colorIndex: sanitizeBlockColorIndex(block?.colorIndex, activePaletteLength),
            type,
          };
        })
        .filter((block) => block.w > 0);

      if (blocks.length === 0) return null;

      return {
        x: clamp(Number(platform.x) || 0, 0, WIDTH),
        y: clamp(Number(platform.y) || 0, 0, HEIGHT - TILE),
        blocks,
      };
    })
    .filter(Boolean);
}

function sanitizeEnemySpecs(enemies, activePaletteLength) {
  if (!Array.isArray(enemies)) return [];

  return enemies.map((enemy) => ({
    x: clamp(Number(enemy?.x) || 0, 0, WIDTH - ENEMY_WIDTH),
    y: clamp(Number(enemy?.y) || 0, 0, HEIGHT - ENEMY_HEIGHT),
    direction: Number(enemy?.direction) < 0 ? -1 : 1,
    colorIndex: clamp(Number(enemy?.colorIndex) || 0, 0, activePaletteLength - 1),
  }));
}

function sanitizeBlockColorIndex(colorIndex, activePaletteLength) {
  if (isGoalColor(colorIndex)) return GOAL_COLOR_INDEX;
  if (isRotatingColor(colorIndex)) return ROTATING_COLOR_INDEX;
  return clamp(Number(colorIndex) || 0, 0, activePaletteLength - 1);
}

function normalizeBlockColorIndex(colorIndex) {
  if (isGoalColor(colorIndex)) return GOAL_COLOR_INDEX;
  if (isRotatingColor(colorIndex)) return ROTATING_COLOR_INDEX;
  return clamp(colorIndex, 0, LEVEL.activePalette.length - 1);
}

function sanitizeBlockType(type) {
  return isSlopeType(type) ? type : null;
}

function normalizeBlockType(type) {
  return isSlopeType(type) ? type : null;
}

function isGoalColor(colorIndex) {
  return colorIndex === GOAL_COLOR_INDEX;
}

function isRotatingColor(colorIndex) {
  return colorIndex === ROTATING_COLOR_INDEX;
}

function isSlopeDownRightType(type) {
  return type === SLOPE_DOWN_RIGHT_TYPE;
}

function isSlopeDownLeftType(type) {
  return type === SLOPE_DOWN_LEFT_TYPE;
}

function isSlopeType(type) {
  return isSlopeDownRightType(type) || isSlopeDownLeftType(type);
}

function isSlopeBlock(block) {
  return isSlopeType(block.type);
}

function getRotatingColorIndex() {
  const elapsed = Math.max(0, performance.now() - levelStartTime);
  return Math.floor(elapsed / ROTATING_COLOR_INTERVAL) % LEVEL.activePalette.length;
}

function getEffectiveBlockColorIndex(colorIndex) {
  if (isRotatingColor(colorIndex)) return getRotatingColorIndex();
  return colorIndex;
}

function getEffectiveBlockColorValue(colorIndex) {
  if (isGoalColor(colorIndex)) return "#f8fbff";
  return getActiveColorValue(getEffectiveBlockColorIndex(colorIndex));
}

function hasGoalBlocks() {
  return platforms.some((platform) => platform.blocks.some((block) => isGoalColor(block.colorIndex)));
}

function getActiveColor(activeIndex = colorIndex) {
  return MASTER_COLORS[LEVEL.activePalette[activeIndex]];
}

function getActiveColorName(activeIndex = colorIndex) {
  return getActiveColor(activeIndex).name;
}

function getActiveColorValue(activeIndex = colorIndex) {
  return getActiveColor(activeIndex).value;
}

function updateStatus() {
  if (won) {
    statusEl.textContent = `You reached the goal. ${getWinPrompt()}`;
  } else if (gameOver) {
    statusEl.textContent = "Game over. Press R to restart.";
  } else {
    statusEl.textContent = `Current color: ${getActiveColorName()} | HP: ${hp}/${MAX_HP}`;
  }
}

function winLevel() {
  if (won) return;

  playSound(winSound);
  won = true;
  player.vx = 0;
  player.vy = 0;
  updateStatus();
}

function hasNextLevel() {
  return currentLevelIndex >= 0 && currentLevelIndex < PUBLISHED_LEVEL_URLS.length - 1;
}

async function continueToNextLevel() {
  if (!won || !hasNextLevel()) return;

  const nextLevelIndex = currentLevelIndex + 1;
  const nextLevel = await loadPublishedLevel(nextLevelIndex);
  if (!nextLevel) return;

  startLevel(nextLevelIndex, nextLevel);
}

function startLevel(index, level, url = PUBLISHED_LEVEL_URLS[index] || "") {
  currentLevelIndex = index;
  currentLevelUrl = url;
  LEVEL = level;
  resetGame();
  renderLevelSelector();
}

function getWinPrompt() {
  return hasNextLevel() ? "Press C to continue." : "Press R to restart.";
}

function updateHealthBar() {
  healthBarEl.innerHTML = "";

  for (let i = 0; i < MAX_HP; i++) {
    const segment = document.createElement("span");
    segment.className = `health-segment${i < hp ? " filled" : ""}`;
    healthBarEl.append(segment);
  }
}

function updateRainbowBar() {
  rainbowBarEl.innerHTML = "";

  for (let i = 0; i < LEVEL.activePalette.length; i++) {
    const color = getActiveColor(i);
    const segment = document.createElement("span");
    segment.className = `rainbow-segment${i === colorIndex ? " active" : ""}`;
    segment.style.backgroundColor = color.value;
    segment.title = color.name;
    rainbowBarEl.append(segment);
  }
}

function isDown(...codes) {
  return codes.some((code) => keys.has(code));
}

function playSound(sound) {
  sound.currentTime = 0;
  const playPromise = sound.play();
  if (playPromise) {
    playPromise.catch(() => {});
  }
}

function jump() {
  if (!player.grounded || won || gameOver) return;

  playSound(jumpSound);
  player.vy = -13.6;
  player.grounded = false;
  clearMoteRidingState();
  currentGroundSpace = null;
  colorIndex = (colorIndex + 1) % LEVEL.activePalette.length;
  updateStatus();
  updateRainbowBar();
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function update() {
  if (damageTextTimer > 0) {
    damageTextTimer--;
  }

  if (!won && !gameOver) {
    const previousPlayerY = player.y;

    if (ridingEnemy && ridingEnemy.alive) {
      applyHorizontalInput(RIDING_ACCEL, RIDING_MAX_SPEED);
      player.vy = 0;
      player.grounded = true;
      currentGroundSpace = null;
    } else {
      clearMoteRidingState();

      applyHorizontalInput(PLAYER_ACCEL, PLAYER_MAX_SPEED);
      player.vy = clamp(player.vy + 0.62, -16, 15);

      moveHorizontally();
      moveVertically();
      applySlopeGroundAdjustment();
      checkGroundMovementColor();
    }

    updateEnemies();
    carryRidingPlayer();
    moveRidingPlayerHorizontally();
    checkEnemyCollisions(previousPlayerY);

    if (player.y > HEIGHT + 90) {
      resetGame();
    }

  } else {
    player.vx *= 0.86;
  }
}

function applyHorizontalInput(accel, maxSpeed) {
  const movingLeft = isDown("ArrowLeft", "KeyA");
  const movingRight = isDown("ArrowRight", "KeyD");

  if (movingLeft) player.vx -= accel;
  if (movingRight) player.vx += accel;
  if (!movingLeft && !movingRight) player.vx *= PLAYER_FRICTION;

  player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
  if (Math.abs(player.vx) < PLAYER_STOP_EPSILON) player.vx = 0;
}

function updateEnemies() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const oldX = enemy.x;
    enemy.x += enemy.speed * enemy.direction;
    const bounds = enemy.walkBounds || { left: enemy.platform.x, right: enemy.platform.x + enemy.platform.w };

    if (enemy.x <= bounds.left) {
      enemy.x = bounds.left;
      reverseEnemy(enemy);
    } else if (enemy.x + enemy.w >= bounds.right) {
      enemy.x = bounds.right - enemy.w;
      reverseEnemy(enemy);
    }

    enemy.y = enemy.platform.y - enemy.h;
    enemy.dx = enemy.x - oldX;
    updateEnemyPlatformColorTracking(enemy);
  }
}

function updateEnemyPlatformColorTracking(enemy) {
  const space = getPlatformSpaceAtX(enemy.platform, enemy.x + enemy.w / 2);

  if (space.colorIndex !== enemy.currentPlatformColorIndex) {
    if (!(enemy === ridingEnemy && enemy === colorLockedMote)) {
      enemy.colorIndex = (enemy.colorIndex + 1) % LEVEL.activePalette.length;

      if (enemy === ridingEnemy && enemy.colorIndex !== colorIndex) {
        damagePlayer();
      }
    }
  }

  enemy.currentSpaceIndex = space.spaceIndex;
  enemy.currentPlatformColorIndex = space.colorIndex;
}

function carryRidingPlayer() {
  if (!ridingEnemy || !ridingEnemy.alive) {
    clearMoteRidingState();
    return;
  }

  moveRidingPlayerX(ridingEnemy.dx, false);
  player.y = ridingEnemy.y - player.h;
  player.vy = 0;
  player.grounded = true;
  currentGroundSpace = null;
}

function moveRidingPlayerHorizontally() {
  if (!ridingEnemy || !ridingEnemy.alive) return;

  moveRidingPlayerX(player.vx, true);

  if (!isPlayerSupportedByEnemy(ridingEnemy)) {
    clearMoteRidingState();
    player.grounded = false;
    return;
  }

  player.y = ridingEnemy.y - player.h;
}

function moveRidingPlayerX(deltaX, stopPlayerVelocityOnBlock) {
  if (deltaX === 0) return;

  player.x += deltaX;

  for (const p of platforms) {
    if (!rectsOverlap(player, p)) continue;

    if (deltaX > 0) {
      player.x = p.x - player.w;
    } else {
      player.x = p.x + p.w;
    }

    if (stopPlayerVelocityOnBlock) {
      player.vx = 0;
    }
  }

  player.x = clamp(player.x, 0, WIDTH - player.w);
}

function isPlayerSupportedByEnemy(enemy) {
  const playerCenterX = player.x + player.w / 2;
  return playerCenterX >= enemy.x && playerCenterX <= enemy.x + enemy.w;
}

function checkEnemyCollisions(previousPlayerY) {
  const previousBottom = previousPlayerY + player.h;
  const currentBottom = player.y + player.h;

  for (const enemy of enemies) {
    if (!enemy.alive || enemy === ridingEnemy) continue;

    const horizontallyOverlaps = player.x < enemy.x + enemy.w && player.x + player.w > enemy.x;
    if (!horizontallyOverlaps) continue;

    const crossedEnemyTop = previousBottom <= enemy.y + 6 && currentBottom >= enemy.y;
    const landingOnEnemy = player.vy >= 0 && crossedEnemyTop;

    if (landingOnEnemy) {
      resolveEnemyTopCollision(enemy);
    } else if (rectsOverlap(player, enemy)) {
      resolveEnemyBump(enemy);
    }
  }
}

function resolveEnemyTopCollision(enemy) {
  const matchingMoteColor = enemy.colorIndex === colorIndex;

  player.y = enemy.y - player.h;
  player.vy = 0;
  player.vx = 0;
  player.grounded = true;
  currentGroundSpace = null;
  ridingEnemy = enemy;

  if (matchingMoteColor) {
    colorLockedMote = enemy;
  } else {
    colorLockedMote = null;
    damagePlayer();
  }
}

function resolveEnemyBump(enemy) {
  if (enemy.direction > 0) {
    player.x = enemy.x + enemy.w + 2;
  } else {
    player.x = enemy.x - player.w - 2;
  }

  player.x = clamp(player.x, 0, WIDTH - player.w);
  player.vx = enemy.speed * enemy.direction;
}

function reverseEnemy(enemy) {
  enemy.direction *= -1;
}

function clearMoteRidingState() {
  ridingEnemy = null;
  colorLockedMote = null;
}

function moveHorizontally() {
  const previousX = player.x;
  const previousPlayer = { ...player, x: previousX };
  player.x += player.vx;

  if (getSlopeBodyPenetration()) {
    player.x = previousX;
    player.vx = 0;
    return;
  }

  if (isOverlappingBlockedSlope()) {
    player.x = previousX;
    player.vx = 0;
    return;
  }

  for (const p of platforms) {
    for (const block of p.blocks) {
      if (isSlopeBlock(block) || !rectsOverlap(player, block)) continue;
      if (wasAlreadyOverlappingBlock(previousPlayer, block)) continue;
      if (isTopSupportedByBlock(block)) continue;

      if (player.vx > 0) {
        player.x = block.x - player.w;
      } else if (player.vx < 0) {
        player.x = block.x + block.w;
      }

      player.vx = 0;
    }
  }

  player.x = clamp(player.x, 0, WIDTH - player.w);
}

function getSlopeBodyPenetration() {
  for (const platform of platforms) {
    for (const block of platform.blocks) {
      if (!isSlopeBlock(block) || !rectsOverlap(player, block)) continue;

      const leftProbeX = clamp(player.x + 2, block.x, block.x + block.w);
      const rightProbeX = clamp(player.x + player.w - 2, block.x, block.x + block.w);
      const probeY = player.y + player.h - 3;
      const leftPenetrates = probeY > getSlopeSurfaceY(block, leftProbeX) + 1;
      const rightPenetrates = probeY > getSlopeSurfaceY(block, rightProbeX) + 1;

      if (leftPenetrates || rightPenetrates) {
        return { platform, block };
      }
    }
  }

  return null;
}

function isOverlappingBlockedSlope() {
  if (isSupportedBySolidBlock()) return false;

  for (const platform of platforms) {
    for (const block of platform.blocks) {
      if (isSlopeBlock(block) && isMovingUpSlope(block) && rectsOverlap(player, block)) {
        return true;
      }
    }
  }

  return false;
}

function wasAlreadyOverlappingBlock(previousPlayer, block) {
  return rectsOverlap(previousPlayer, block);
}

function isTopSupportedByBlock(block) {
  const feetY = player.y + player.h;
  const horizontallySupported = player.x < block.x + block.w && player.x + player.w > block.x;
  const verticallySupported = Math.abs(feetY - block.y) <= 2;

  return horizontallySupported && verticallySupported;
}

function isSupportedBySolidBlock() {
  const feetY = player.y + player.h;

  for (const platform of platforms) {
    for (const block of platform.blocks) {
      if (isSlopeBlock(block)) continue;

      if (isTopSupportedByBlock(block)) {
        return true;
      }
    }
  }

  return false;
}

function isMovingUpSlope(block) {
  return (
    (isSlopeDownRightType(block.type) && player.vx < 0) ||
    (isSlopeDownLeftType(block.type) && player.vx > 0)
  );
}

function moveVertically() {
  const wasGrounded = player.grounded;
  const previousFeetY = player.y + player.h;
  player.y += player.vy;
  player.grounded = false;
  let landedPlatform = null;

  for (const p of platforms) {
    for (const block of p.blocks) {
      if (isSlopeBlock(block) || !rectsOverlap(player, block)) continue;

      if (player.vy > 0) {
        player.y = block.y - player.h;
        player.grounded = true;
        if (!wasGrounded) {
          checkLandingColor(p);
        }
        landedPlatform = p;
      } else if (player.vy < 0) {
        player.y = block.y + block.h;
      }

      player.vy = 0;
    }
  }

  if (player.vy > 0) {
    const slopeLanding = getSlopeLanding(previousFeetY);

    if (slopeLanding) {
      player.y = slopeLanding.surfaceY - player.h;
      player.grounded = true;
      if (!wasGrounded) {
        checkLandingColor(slopeLanding.platform);
      }
      landedPlatform = slopeLanding.platform;
      player.vy = 0;
    }
  }

  if (landedPlatform && !wasGrounded) {
    currentGroundSpace = getSpaceForPlatform(landedPlatform);
  }
}

function getSlopeLanding(previousFeetY) {
  const centerX = player.x + player.w / 2;
  const currentFeetY = player.y + player.h;

  for (const platform of platforms) {
    for (const block of platform.blocks) {
      if (!isSlopeBlock(block) || !isXWithinBlock(centerX, block)) continue;

      const surfaceY = getSlopeSurfaceY(block, centerX);
      const crossedSurface = previousFeetY <= surfaceY && currentFeetY >= surfaceY;

      if (crossedSurface) {
        return { platform, block, surfaceY };
      }
    }
  }

  return null;
}

function applySlopeGroundAdjustment() {
  if (won || gameOver || ridingEnemy) return;

  const wasGroundedOnSlope = isSlopeType(currentGroundSpace?.blockType);
  if (!player.grounded && !wasGroundedOnSlope) return;

  const snapDistance = Math.max(1, Math.abs(player.vx) + SLOPE_SLIDE_SPEED + SLOPE_SNAP_BUFFER);
  const slopeGround = findCurrentSlopeGroundSpace(snapDistance);
  if (!slopeGround) return;

  snapPlayerToSlope(slopeGround);

  const previousX = player.x;
  const slideSpeed = isPressingUpSlope(slopeGround.block) ? SLOPE_SLIDE_SPEED / 2 : SLOPE_SLIDE_SPEED;
  player.x = clamp(player.x + getSlopeSlideDirection(slopeGround.block) * slideSpeed, 0, WIDTH - player.w);

  if (isOverlappingSolidBlock()) {
    player.x = previousX;
    return;
  }

  const newSlopeGround = findCurrentSlopeGroundSpace(slideSpeed + SLOPE_SNAP_BUFFER);
  if (!newSlopeGround) return;

  snapPlayerToSlope(newSlopeGround);
}

function snapPlayerToSlope(slopeGround) {
  player.y = slopeGround.surfaceY - player.h;
  player.vy = 0;
  player.grounded = true;
}

function isOverlappingSolidBlock() {
  for (const platform of platforms) {
    for (const block of platform.blocks) {
      if (!isSlopeBlock(block) && rectsOverlap(player, block)) {
        return true;
      }
    }
  }

  return false;
}

function checkLandingColor(platform) {
  const centerX = player.x + player.w / 2;
  const landedColorIndex = getColorAtPlatformX(platform, centerX);

  if (isGoalColor(landedColorIndex)) {
    winLevel();
    return;
  }

  if (landedColorIndex === colorIndex) return;

  damagePlayer();
}

function checkGroundMovementColor() {
  if (won || gameOver || !player.grounded) {
    currentGroundSpace = null;
    return;
  }

  const groundSpace = findCurrentGroundSpace();

  if (!groundSpace) {
    currentGroundSpace = null;
    return;
  }

  if (isGoalColor(groundSpace.colorIndex)) {
    currentGroundSpace = groundSpace;
    winLevel();
    return;
  }

  if (currentGroundSpace) {
    const changedGroundSpace =
      currentGroundSpace.platform !== groundSpace.platform ||
      currentGroundSpace.spaceIndex !== groundSpace.spaceIndex;
    const changedGroundColor = groundSpace.colorIndex !== currentGroundSpace.colorIndex;

    if (
      (changedGroundSpace || changedGroundColor) &&
      !isGoalColor(groundSpace.colorIndex) &&
      groundSpace.colorIndex !== colorIndex &&
      changedGroundColor
    ) {
      damagePlayer();
    }
  }

  currentGroundSpace = groundSpace;
}

function damagePlayer() {
  const previousHp = hp;
  hp = Math.max(0, hp - 1);

  if (hp < previousHp) {
    damageTextTimer = DAMAGE_TEXT_DURATION;
    damageText = DAMAGE_TEXT_OPTIONS[Math.floor(Math.random() * DAMAGE_TEXT_OPTIONS.length)];
    playSound(hp === 0 ? loseSound : damageSound);
  }

  updateHealthBar();

  if (hp === 0) {
    gameOver = true;
    player.vx = 0;
    player.vy = 0;
  }

  updateStatus();
}

function findCurrentGroundSpace() {
  const centerX = player.x + player.w / 2;
  const feetY = player.y + player.h;

  for (const p of platforms) {
    for (const block of p.blocks) {
      if (!isXWithinBlock(centerX, block)) continue;

      const surfaceY = isSlopeBlock(block)
        ? getSlopeSurfaceY(block, centerX)
        : block.y;
      const onTop = Math.abs(feetY - surfaceY) <= 1;

      if (onTop) {
        return getSpaceForPlatform(p);
      }
    }
  }

  return null;
}

function findCurrentSlopeGroundSpace(tolerance) {
  const centerX = player.x + player.w / 2;
  const feetY = player.y + player.h;

  for (const platform of platforms) {
    for (const block of platform.blocks) {
      if (!isSlopeBlock(block) || !isXWithinBlock(centerX, block)) continue;

      const surfaceY = getSlopeSurfaceY(block, centerX);
      const snapDownDistance = surfaceY - feetY;

      if (snapDownDistance >= 0 && snapDownDistance <= tolerance) {
        return { platform, block, surfaceY };
      }
    }
  }

  return null;
}

function isXWithinBlock(x, block) {
  return x >= block.x && x < block.x + block.w;
}

function getSlopeSurfaceY(block, x) {
  if (isSlopeDownLeftType(block.type)) {
    return block.y + clamp(block.x + block.w - x, 0, block.w);
  }

  return block.y + clamp(x - block.x, 0, block.w);
}

function getSlopeSlideDirection(block) {
  return isSlopeDownLeftType(block.type) ? -1 : 1;
}

function isPressingUpSlope(block) {
  if (isSlopeDownRightType(block.type)) {
    return isDown("ArrowLeft", "KeyA");
  }

  if (isSlopeDownLeftType(block.type)) {
    return isDown("ArrowRight", "KeyD");
  }

  return false;
}

function getSpaceForPlatform(platform) {
  const centerX = player.x + player.w / 2;
  const space = getPlatformSpaceAtX(platform, centerX);

  return {
    platform,
    spaceIndex: space.spaceIndex,
    colorIndex: space.colorIndex,
    blockType: space.blockType,
  };
}

function getColorAtPlatformX(platform, x) {
  return getPlatformSpaceAtX(platform, x).colorIndex;
}

function getPlatformSpaceAtX(platform, x) {
  const block =
    platform.blocks.find((candidate) => x >= candidate.x && x < candidate.x + candidate.w) ||
    (x < platform.x ? platform.blocks[0] : null) ||
    platform.blocks[platform.blocks.length - 1];

  return {
    spaceIndex: block.blockIndex,
    colorIndex: getEffectiveBlockColorIndex(block.colorIndex),
    blockType: block.type,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawPlatforms();
  drawEnemies();
  drawPlayer();
  drawDamageText();

  if (won) {
    drawMessage("Prism reached!", getWinPrompt());
  } else if (gameOver) {
    drawMessage("Game over", "Press R to try again");
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const ex = Math.round(enemy.x);
    const ey = Math.round(enemy.y);

    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(ex + 3, ey + enemy.h + 3, enemy.w - 4, 5);

    ctx.fillStyle = getActiveColorValue(enemy.colorIndex);
    ctx.fillRect(ex + 3, ey + 6, enemy.w - 6, enemy.h - 6);
    ctx.fillRect(ex + 7, ey, enemy.w - 14, 8);

    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(ex + (enemy.direction > 0 ? 17 : 7), ey + 8, 4, 4);

    ctx.fillStyle = "#07101c";
    ctx.fillRect(ex + 5, ey + enemy.h - 4, 6, 4);
    ctx.fillRect(ex + enemy.w - 11, ey + enemy.h - 4, 6, 4);
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#162235");
  sky.addColorStop(1, "#0b111c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let x = 0; x < WIDTH; x += TILE) {
    ctx.fillRect(x, 0, 1, HEIGHT);
  }
  for (let y = 20; y < HEIGHT; y += TILE) {
    ctx.fillRect(0, y, WIDTH, 1);
  }

}

function drawPlatforms() {
  for (const p of platforms) {
    for (const block of p.blocks) {
      const color = getEffectiveBlockColorValue(block.colorIndex);
      const x = block.x;

      if (isSlopeBlock(block)) {
        drawSlopeBlock(block, color);
        continue;
      }

      ctx.fillStyle = color;
      ctx.fillRect(x, p.y, block.w, p.h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
      ctx.fillRect(x + 5, p.y + 4, Math.max(0, block.w - 10), 4);
      ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
      ctx.fillRect(x, p.y + p.h - 7, block.w, 7);
      ctx.strokeStyle = "#07101c";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, p.y + 1, block.w - 2, p.h - 2);
    }
  }
}

function drawSlopeBlock(block, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isSlopeDownLeftType(block.type)) {
    ctx.moveTo(block.x + block.w, block.y);
    ctx.lineTo(block.x + block.w, block.y + block.h);
    ctx.lineTo(block.x, block.y + block.h);
  } else {
    ctx.moveTo(block.x, block.y);
    ctx.lineTo(block.x + block.w, block.y + block.h);
    ctx.lineTo(block.x, block.y + block.h);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#07101c";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (isSlopeDownLeftType(block.type)) {
    ctx.moveTo(block.x + block.w - 4, block.y + 5);
    ctx.lineTo(block.x + 5, block.y + block.h - 4);
  } else {
    ctx.moveTo(block.x + 4, block.y + 5);
    ctx.lineTo(block.x + block.w - 5, block.y + block.h - 4);
  }
  ctx.stroke();
}

function drawPlayer() {
  const color = won ? "#f8fbff" : getActiveColorValue();
  const px = Math.round(player.x);
  const py = Math.round(player.y);

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(px + 3, py + player.h + 4, player.w - 4, 5);

  ctx.fillStyle = color;
  ctx.fillRect(px + 4, py + 8, 18, 20);
  ctx.fillRect(px + 8, py, 14, 10);
  ctx.fillRect(px + 2, py + 18, 22, 8);

  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(px + 15, py + 4, 4, 4);

  ctx.fillStyle = "#101722";
  ctx.fillRect(px + 7, py + 28, 6, 6);
  ctx.fillRect(px + 17, py + 28, 6, 6);
}

function drawDamageText() {
  if (damageTextTimer <= 0) return;

  const x = clamp(player.x + player.w + 8, 4, WIDTH - 56);
  const y = clamp(player.y + 8, 18, HEIGHT - 8);

  ctx.font = "16px 'Trebuchet MS', Verdana, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#07101c";
  ctx.fillText(damageText, x + 2, y + 2);

  ctx.fillStyle = "#f8fbff";
  ctx.fillText(damageText, x, y);

  ctx.textBaseline = "alphabetic";
}

function drawMessage(title, subtitle) {
  ctx.fillStyle = "rgba(7, 11, 18, 0.82)";
  ctx.fillRect(250, 174, 460, 120);

  ctx.strokeStyle = "#f8fbff";
  ctx.lineWidth = 3;
  ctx.strokeRect(250, 174, 460, 120);

  ctx.fillStyle = "#f8fbff";
  ctx.font = "28px 'Trebuchet MS', Verdana, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, WIDTH / 2, 224);

  ctx.fillStyle = "#9cadc4";
  ctx.font = "16px 'Trebuchet MS', Verdana, sans-serif";
  ctx.fillText(subtitle, WIDTH / 2, 258);
  ctx.textAlign = "start";
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

async function initGame() {
  startLevel(0, (await loadPublishedLevel(0)) || DEFAULT_LEVEL);
  await initLevelSelector();
  loop();
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyR") {
    resetGame();
    return;
  }

  if (event.code === "KeyC") {
    continueToNextLevel();
    return;
  }

  if ((event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") && !event.repeat) {
    jump();
  }

  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

initGame();
