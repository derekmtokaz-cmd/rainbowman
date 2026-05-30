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

const MASTER_COLORS = [
  { name: "Red", value: "#ff3b30" },
  { name: "Orange", value: "#ff9500" },
  { name: "Yellow", value: "#ffcc00" },
  { name: "Green", value: "#34c759" },
  { name: "Blue", value: "#007aff" },
  { name: "Indigo", value: "#4b49c9" },
  { name: "Violet", value: "#af52de" },
];

const LEVEL = {
  activePalette: [0, 2, 4],
  start: { x: 50, y: 606 },
  goal: { platformIndex: 9, x: 1060, w: 42, h: 74, gap: 4 },
  platforms: [
    { x: 0, y: 640, spaces: 5 },
    { x: 290, y: 570, spaces: 3 },
    { x: 540, y: 500, spaces: 3 },
    { x: 785, y: 500, spaces: 2 },
    { x: 700, y: 430, spaces: 3 },
    { x: 915, y: 360, spaces: 3 },
    { x: 680, y: 290, spaces: 2 },
    { x: 900, y: 290, spaces: 3 },
    { x: 770, y: 220, spaces: 3 },
    { x: 1000, y: 150, spaces: 3 },
  ],
  enemies: [
    { platformIndex: 2, offset: 54, direction: 1 },
    { platformIndex: 4, offset: 92, direction: -1 },
    { platformIndex: 8, offset: 38, direction: 1 },
  ],
};

const keys = new Set();
let colorIndex = 0;
let won = false;
let gameOver = false;
let hp = MAX_HP;
let ignoreNextLandingDamage = true;
let currentGroundSpace = null;
let enemies = [];
let ridingEnemy = null;

const player = {
  x: LEVEL.start.x,
  y: LEVEL.start.y,
  w: 26,
  h: 34,
  vx: 0,
  vy: 0,
  grounded: false,
};

let platforms = [];

let goal = null;
const PLAYER_ACCEL = 0.72;
const PLAYER_MAX_SPEED = 5.4;
const RIDING_ACCEL = PLAYER_ACCEL / 2;
const RIDING_MAX_SPEED = PLAYER_MAX_SPEED / 2;
const PLAYER_FRICTION = 0.78;
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
  ridingEnemy = null;
  validatePlatformDensity(LEVEL.platforms);
  validatePlatformReachability(LEVEL.platforms);
  validatePlatformClearance(LEVEL.platforms);
  randomizePlatformColors();
  resetGoal();
  resetEnemies();
  updateStatus();
  updateHealthBar();
  updateRainbowBar();
}

function randomizePlatformColors() {
  platforms = LEVEL.platforms.map((spec) => platform(spec.x, spec.y, spec.spaces));
}

function platform(x, y, spaces) {
  const colors = Array.from({ length: spaces }, () => randomActiveColorIndex());
  return { x, y, w: spaces * COLOR_SPACE_WIDTH, h: TILE, colors };
}

function resetGoal() {
  const platform = platforms[LEVEL.goal.platformIndex];
  const gap = LEVEL.goal.gap ?? 4;
  const y = clamp(platform.y - LEVEL.goal.h - gap, 0, HEIGHT - LEVEL.goal.h);

  goal = {
    x: LEVEL.goal.x,
    y,
    w: LEVEL.goal.w,
    h: LEVEL.goal.h,
  };
}

function getPlatformSpaces(platformSpec, platformIndex) {
  return Array.from({ length: platformSpec.spaces }, (_, spaceIndex) => {
    const x = platformSpec.x + spaceIndex * COLOR_SPACE_WIDTH;

    return {
      platformIndex,
      spaceIndex,
      x,
      y: platformSpec.y,
      w: COLOR_SPACE_WIDTH,
      centerX: x + COLOR_SPACE_WIDTH / 2,
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
      startCenterX <= spec.x + spec.spaces * COLOR_SPACE_WIDTH
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
  const aRight = a.x + a.spaces * COLOR_SPACE_WIDTH;
  const bRight = b.x + b.spaces * COLOR_SPACE_WIDTH;
  return a.x < bRight && aRight > b.x;
}

function resetEnemies() {
  enemies = LEVEL.enemies.map(createEnemy);
}

function createEnemy(spec) {
  const platform = platforms[spec.platformIndex];
  const w = 28;
  const h = 24;
  const x = platform.x + clamp(spec.offset, 0, platform.w - w);
  const space = getPlatformSpaceAtX(platform, x + w / 2);

  return {
    platform,
    x,
    y: platform.y - h,
    w,
    h,
    dx: 0,
    direction: spec.direction,
    speed: 1.1,
    colorIndex: randomActiveColorIndex(),
    currentSpaceIndex: space.spaceIndex,
    currentPlatformColorIndex: space.colorIndex,
    alive: true,
  };
}

function randomActiveColorIndex() {
  return Math.floor(Math.random() * LEVEL.activePalette.length);
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
    statusEl.textContent = "You reached the prism. Press R to play again.";
  } else if (gameOver) {
    statusEl.textContent = "Game over. Press R to restart.";
  } else {
    statusEl.textContent = `Current color: ${getActiveColorName()} | HP: ${hp}/${MAX_HP}`;
  }
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

function jump() {
  if (!player.grounded || won || gameOver) return;

  player.vy = -13.6;
  player.grounded = false;
  ridingEnemy = null;
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
  if (!won && !gameOver) {
    const previousPlayerY = player.y;

    if (ridingEnemy && ridingEnemy.alive) {
      applyHorizontalInput(RIDING_ACCEL, RIDING_MAX_SPEED);
      player.vy = 0;
      player.grounded = true;
      currentGroundSpace = null;
    } else {
      ridingEnemy = null;

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

    if (rectsOverlap(player, goal)) {
      won = true;
      updateStatus();
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
    enemy.colorIndex = (enemy.colorIndex + 1) % LEVEL.activePalette.length;
  }

  enemy.currentSpaceIndex = space.spaceIndex;
  enemy.currentPlatformColorIndex = space.colorIndex;
}

function carryRidingPlayer() {
  if (!ridingEnemy || !ridingEnemy.alive) {
    ridingEnemy = null;
    return;
  }

  player.x = clamp(player.x + ridingEnemy.dx, 0, WIDTH - player.w);
  player.y = ridingEnemy.y - player.h;
  player.vy = 0;
  player.grounded = true;
  currentGroundSpace = null;
}

function moveRidingPlayerHorizontally() {
  if (!ridingEnemy || !ridingEnemy.alive) return;

  player.x = clamp(player.x + player.vx, 0, WIDTH - player.w);

  if (!isPlayerSupportedByEnemy(ridingEnemy)) {
    ridingEnemy = null;
    player.grounded = false;
    return;
  }

  player.y = ridingEnemy.y - player.h;
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
  player.y = enemy.y - player.h;
  player.vy = 0;
  player.vx = 0;
  player.grounded = true;
  currentGroundSpace = null;
  ridingEnemy = enemy;
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

  if (
    currentGroundSpace &&
    (currentGroundSpace.platform !== groundSpace.platform ||
      currentGroundSpace.spaceIndex !== groundSpace.spaceIndex) &&
    groundSpace.colorIndex !== colorIndex &&
    groundSpace.colorIndex !== currentGroundSpace.colorIndex
  ) {
    damagePlayer();
  }

  currentGroundSpace = groundSpace;
}

function damagePlayer() {
  hp = Math.max(0, hp - 1);
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
  const rawIndex = Math.floor((x - platform.x) / COLOR_SPACE_WIDTH);
  const spaceIndex = clamp(rawIndex, 0, platform.colors.length - 1);

  return {
    spaceIndex,
    colorIndex: platform.colors[spaceIndex],
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawGoal();
  drawPlatforms();
  drawEnemies();
  drawPlayer();

  if (won) {
    drawMessage("Prism reached!", "Press R to restart");
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
    const blocks = p.colors.length;

    for (let i = 0; i < blocks; i++) {
      const color = getActiveColorValue(p.colors[i]);
      const x = p.x + i * COLOR_SPACE_WIDTH;

      ctx.fillStyle = color;
      ctx.fillRect(x, p.y, COLOR_SPACE_WIDTH, p.h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
      ctx.fillRect(x + 5, p.y + 4, COLOR_SPACE_WIDTH - 10, 4);
      ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
      ctx.fillRect(x, p.y + p.h - 7, COLOR_SPACE_WIDTH, 7);
      ctx.strokeStyle = "#07101c";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, p.y + 1, COLOR_SPACE_WIDTH - 2, p.h - 2);
    }
  }
}

function drawPlayer() {
  const color = getActiveColorValue();
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

function drawGoal() {
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(goal.x - 7, goal.y - 10, goal.w + 14, goal.h + 18);

  const stripeHeight = goal.h / MASTER_COLORS.length;
  for (let i = 0; i < MASTER_COLORS.length; i++) {
    ctx.fillStyle = MASTER_COLORS[i].value;
    ctx.fillRect(goal.x, goal.y + i * stripeHeight, goal.w, stripeHeight + 1);
  }

  ctx.strokeStyle = "#f8fbff";
  ctx.lineWidth = 3;
  ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);

  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(goal.x + 12, goal.y - 18, 18, 18);
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

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyR") {
    resetGame();
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

resetGame();
loop();
