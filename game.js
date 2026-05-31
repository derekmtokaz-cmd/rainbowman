"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const healthBarEl = document.getElementById("healthBar");
const rainbowBarEl = document.getElementById("rainbowBar");

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
const PUBLISHED_LEVEL_URLS = ["levels/level-1.json", "levels/level-2.json"];

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
let ignoreNextLandingDamage = true;
let currentGroundSpace = null;
let enemies = [];
let ridingEnemy = null;
let colorLockedMote = null;
let damageTextTimer = 0;
let damageText = "Ow!";
let levelStartTime = 0;
let currentLevelIndex = 0;

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
  ignoreNextLandingDamage = true;
  currentGroundSpace = null;
  damageTextTimer = 0;
  levelStartTime = performance.now();
  clearMoteRidingState();
  validatePlatformDensity(LEVEL.platforms);
  validatePlatformReachability(LEVEL.platforms);
  validatePlatformClearance(LEVEL.platforms);
  buildPlatforms();
  resetGoal();
  resetEnemies();
  updateStatus();
  updateHealthBar();
  updateRainbowBar();
}

function buildPlatforms() {
  platforms = LEVEL.platforms.map(createPlatform);
}

function createPlatform(spec) {
  let offset = 0;
  const blocks = spec.blocks.map((block, blockIndex) => {
    const normalized = {
      x: spec.x + offset,
      y: spec.y,
      w: block.w,
      h: TILE,
      colorIndex: normalizeBlockColorIndex(block.colorIndex),
      blockIndex,
    };
    offset += block.w;
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
  const space = getPlatformSpaceAtX(platform, x + w / 2);

  return {
    platform,
    x,
    y: platform.y - h,
    w,
    h,
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

function randomActiveColorIndex() {
  return Math.floor(Math.random() * LEVEL.activePalette.length);
}

async function loadPublishedLevel(index) {
  const url = PUBLISHED_LEVEL_URLS[index];

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

    console.info(`Rainbowman: loaded published level ${url}.`);
    return level;
  } catch {
    console.warn(`Rainbowman: could not fetch ${url}; using default level.`);
    return null;
  }
}

function sanitizeRuntimeLevel(level) {
  if (!level || typeof level !== "object") return null;
  const activePalette = sanitizeActivePalette(level.activePalette);

  return {
    activePalette,
    start: sanitizeStart(level.start),
    goal: level.goal && typeof level.goal === "object" ? { ...level.goal } : null,
    platforms: sanitizePlatformSpecs(level.platforms, activePalette.length),
    enemies: sanitizeEnemySpecs(level.enemies, activePalette.length),
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
        .map((block) => ({
          w: clamp(Number(block?.w) || COLOR_SPACE_WIDTH, TILE, WIDTH),
          colorIndex: sanitizeBlockColorIndex(block?.colorIndex, activePaletteLength),
        }))
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

function isGoalColor(colorIndex) {
  return colorIndex === GOAL_COLOR_INDEX;
}

function isRotatingColor(colorIndex) {
  return colorIndex === ROTATING_COLOR_INDEX;
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
  return currentLevelIndex < PUBLISHED_LEVEL_URLS.length - 1;
}

async function continueToNextLevel() {
  if (!won || !hasNextLevel()) return;

  const nextLevelIndex = currentLevelIndex + 1;
  const nextLevel = await loadPublishedLevel(nextLevelIndex);
  if (!nextLevel) return;

  startLevel(nextLevelIndex, nextLevel);
}

function startLevel(index, level) {
  currentLevelIndex = index;
  LEVEL = level;
  resetGame();
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

    if (enemy.x <= enemy.platform.x) {
      enemy.x = enemy.platform.x;
      reverseEnemy(enemy);
    } else if (enemy.x + enemy.w >= enemy.platform.x + enemy.platform.w) {
      enemy.x = enemy.platform.x + enemy.platform.w - enemy.w;
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

  for (const enemy of enemies) {
    if (!enemy.alive || enemy === ridingEnemy || !rectsOverlap(player, enemy)) continue;

    const landingOnEnemy = player.vy >= 0 && previousBottom <= enemy.y + 6;

    if (landingOnEnemy) {
      resolveEnemyTopCollision(enemy);
    } else {
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
  player.x += player.vx;

  for (const p of platforms) {
    if (!rectsOverlap(player, p)) continue;

    if (player.vx > 0) {
      player.x = p.x - player.w;
    } else if (player.vx < 0) {
      player.x = p.x + p.w;
    }

    player.vx = 0;
  }

  player.x = clamp(player.x, 0, WIDTH - player.w);
}

function moveVertically() {
  const wasGrounded = player.grounded;
  player.y += player.vy;
  player.grounded = false;
  let landedPlatform = null;

  for (const p of platforms) {
    if (!rectsOverlap(player, p)) continue;

    if (player.vy > 0) {
      player.y = p.y - player.h;
      player.grounded = true;
      if (!wasGrounded) {
        checkLandingColor(p);
      }
      landedPlatform = p;
    } else if (player.vy < 0) {
      player.y = p.y + p.h;
    }

    player.vy = 0;
  }

  if (landedPlatform && !wasGrounded) {
    currentGroundSpace = getSpaceForPlatform(landedPlatform);
  }
}

function checkLandingColor(platform) {
  if (ignoreNextLandingDamage) {
    ignoreNextLandingDamage = false;
    return;
  }

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

  if (
    currentGroundSpace &&
    (currentGroundSpace.platform !== groundSpace.platform ||
      currentGroundSpace.spaceIndex !== groundSpace.spaceIndex) &&
    !isGoalColor(groundSpace.colorIndex) &&
    groundSpace.colorIndex !== colorIndex &&
    groundSpace.colorIndex !== currentGroundSpace.colorIndex
  ) {
    damagePlayer();
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
    const withinX = centerX >= p.x && centerX < p.x + p.w;
    const onTop = Math.abs(feetY - p.y) <= 1;

    if (withinX && onTop) {
      return getSpaceForPlatform(p);
    }
  }

  return null;
}

function getSpaceForPlatform(platform) {
  const centerX = player.x + player.w / 2;
  const space = getPlatformSpaceAtX(platform, centerX);

  return {
    platform,
    spaceIndex: space.spaceIndex,
    colorIndex: space.colorIndex,
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

      ctx.fillStyle = color;
      ctx.fillRect(x, p.y, block.w, p.h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
      ctx.fillRect(x + 5, p.y + 4, Math.max(0, block.w - 10), 4);
      ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
      ctx.fillRect(x, p.y + p.h - 7, block.w, 7);
      ctx.strokeStyle = "#07101c";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, p.y + 1, block.w - 2, p.h - 2);

      if (isRotatingColor(block.colorIndex)) {
        ctx.fillStyle = "rgba(248, 251, 255, 0.82)";
        ctx.fillRect(x + block.w - 9, p.y + 5, 4, 4);
        ctx.fillRect(x + block.w - 14, p.y + 5, 4, 4);
        ctx.fillRect(x + block.w - 9, p.y + 10, 4, 4);
      }
    }
  }
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

  if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
    jump();
  }

  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

initGame();
