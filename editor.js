"use strict";

const canvas = document.getElementById("editor");
const ctx = canvas.getContext("2d");
const paletteOptionsEl = document.getElementById("paletteOptions");
const paintColorsEl = document.getElementById("paintColors");
const assetTrayEl = document.getElementById("assetTray");
const enemyDirectionEl = document.getElementById("enemyDirection");
const eraseModeButton = document.getElementById("eraseModeButton");
const undoButton = document.getElementById("undoButton");
const clearButton = document.getElementById("clearButton");
const levelNameEl = document.getElementById("levelName");
const savedLevelsEl = document.getElementById("savedLevels");
const saveLevelButton = document.getElementById("saveLevelButton");
const loadLevelButton = document.getElementById("loadLevelButton");
const renameLevelButton = document.getElementById("renameLevelButton");
const deleteLevelButton = document.getElementById("deleteLevelButton");
const exportButton = document.getElementById("exportButton");
const importButton = document.getElementById("importButton");
const levelJsonEl = document.getElementById("levelJson");
const editorStatusEl = document.getElementById("editorStatus");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const TILE = 32;
const PLAYER_W = 26;
const PLAYER_H = 34;
const ENEMY_W = 28;
const ENEMY_H = 24;
const PICK_TOLERANCE = 10;
const LEVEL_LIBRARY_STORAGE_KEY = "rainbowman.levels.v1";
const GOAL_COLOR_INDEX = "goal";
const ROTATING_COLOR_INDEX = "rotate";
const SLOPE_DOWN_RIGHT_TYPE = "slopeDownRight";
const SLOPE_DOWN_LEFT_TYPE = "slopeDownLeft";

const MASTER_COLORS = [
  { name: "Red", value: "#ff3b30" },
  { name: "Orange", value: "#ff9500" },
  { name: "Yellow", value: "#ffcc00" },
  { name: "Green", value: "#34c759" },
  { name: "Blue", value: "#007aff" },
  { name: "Indigo", value: "#4b49c9" },
  { name: "Violet", value: "#af52de" },
];

const DEFAULT_START = { x: 64, y: 606 };
let draft = {
  activePalette: [0, 2, 4],
  blocks: [],
  start: { ...DEFAULT_START },
  enemies: [],
};

let activeColorIndex = 0;
let dragState = null;
let selectedAsset = null;
let eraseMode = false;
let nextBlockId = 1;
const undoStack = [];

function init() {
  if (!validateEditorElements()) return;
  ensureBlockIds();
  renderPaletteOptions();
  renderPaintColors();
  bindControls();
  renderSavedLevelList();
  exportLevel(false);
  draw();
  setStatus("Blank level ready. Drag assets from the tray.");
}

function validateEditorElements() {
  const required = [
    canvas,
    ctx,
    paletteOptionsEl,
    paintColorsEl,
    assetTrayEl,
    enemyDirectionEl,
    eraseModeButton,
    undoButton,
    clearButton,
    levelNameEl,
    savedLevelsEl,
    saveLevelButton,
    loadLevelButton,
    renameLevelButton,
    deleteLevelButton,
    exportButton,
    importButton,
    levelJsonEl,
    editorStatusEl,
  ];

  if (required.every(Boolean)) return true;

  const message = "Editor failed to start: a required page element is missing.";
  if (editorStatusEl) {
    editorStatusEl.textContent = message;
  } else {
    document.body.insertAdjacentHTML("afterbegin", `<p style="color: white; background: #b00020; padding: 12px;">${message}</p>`);
  }
  return false;
}

function bindControls() {
  for (const tile of assetTrayEl.querySelectorAll("[data-asset]")) {
    tile.addEventListener("pointerdown", (event) => beginTrayDrag(createTrayAsset(tile), event));
  }

  eraseModeButton.addEventListener("click", toggleEraseMode);
  undoButton.addEventListener("click", undo);
  clearButton.addEventListener("click", clearDraft);
  saveLevelButton.addEventListener("click", saveNamedLevel);
  loadLevelButton.addEventListener("click", loadSelectedLevel);
  renameLevelButton.addEventListener("click", renameSelectedLevel);
  deleteLevelButton.addEventListener("click", deleteSelectedLevelRecord);
  savedLevelsEl.addEventListener("change", syncSelectedLevelName);
  exportButton.addEventListener("click", () => exportLevel(true));
  importButton.addEventListener("click", importLevel);
  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("pointermove", updateDrag);
  document.addEventListener("pointerup", finishDrag);
  window.addEventListener("keydown", onKeyDown);
}

function renderPaletteOptions() {
  paletteOptionsEl.innerHTML = "";

  MASTER_COLORS.forEach((color, masterIndex) => {
    const label = document.createElement("label");
    label.className = "palette-choice";
    label.style.setProperty("--swatch", color.value);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = draft.activePalette.includes(masterIndex);
    input.addEventListener("change", () => togglePaletteColor(masterIndex, input.checked));

    label.append(input, document.createTextNode(color.name));
    paletteOptionsEl.append(label);
  });
}

function togglePaletteColor(masterIndex, enabled) {
  pushUndo();

  if (enabled && !draft.activePalette.includes(masterIndex)) {
    draft.activePalette.push(masterIndex);
    draft.activePalette.sort((a, b) => a - b);
  } else if (!enabled && draft.activePalette.length > 1) {
    const removedPosition = draft.activePalette.indexOf(masterIndex);
    draft.activePalette = draft.activePalette.filter((index) => index !== masterIndex);
    draft.blocks = draft.blocks.map((block) => ({
      ...block,
      colorIndex: clampColorIndexAfterRemoval(block.colorIndex, removedPosition),
    }));
    draft.enemies = draft.enemies.map((enemy) => ({
      ...enemy,
      colorIndex: clampColorIndexAfterRemoval(enemy.colorIndex, removedPosition),
    }));
  } else {
    renderPaletteOptions();
  }

  activeColorIndex = isSpecialPlatformColor(activeColorIndex)
    ? activeColorIndex
    : Math.min(activeColorIndex, draft.activePalette.length - 1);
  normalizeColorIndexes();
  renderPaintColors();
  drawTrayPreviews();
  exportLevel(false);
  draw();
}

function clampColorIndexAfterRemoval(colorIndex, removedPosition) {
  if (isSpecialPlatformColor(colorIndex)) return colorIndex;
  if (removedPosition < 0) return Math.min(colorIndex, draft.activePalette.length - 1);
  if (colorIndex > removedPosition) return colorIndex - 1;
  return Math.min(colorIndex, draft.activePalette.length - 1);
}

function normalizeColorIndexes() {
  draft.blocks = draft.blocks.map((block) => ({
    ...block,
    colorIndex: isSpecialPlatformColor(block.colorIndex)
      ? block.colorIndex
      : Math.min(block.colorIndex, draft.activePalette.length - 1),
  }));
  draft.enemies = draft.enemies.map((enemy) => ({
    ...enemy,
    colorIndex: Math.min(enemy.colorIndex, draft.activePalette.length - 1),
  }));
}

function renderPaintColors() {
  paintColorsEl.innerHTML = "";

  draft.activePalette.forEach((masterIndex, paletteIndex) => {
    const color = MASTER_COLORS[masterIndex];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `paint-swatch${paletteIndex === activeColorIndex ? " active" : ""}`;
    button.style.backgroundColor = color.value;
    button.title = color.name;
    button.addEventListener("click", () => {
      activeColorIndex = paletteIndex;
      renderPaintColors();
      drawTrayPreviews();
      setStatus(`Paint color: ${color.name}`);
    });
    paintColorsEl.append(button);
  });

  const goalButton = document.createElement("button");
  goalButton.type = "button";
  goalButton.className = `paint-swatch goal-swatch${activeColorIndex === GOAL_COLOR_INDEX ? " active" : ""}`;
  goalButton.title = "Goal";
  goalButton.addEventListener("click", () => {
    activeColorIndex = GOAL_COLOR_INDEX;
    renderPaintColors();
    drawTrayPreviews();
    setStatus("Paint color: goal");
  });
  paintColorsEl.append(goalButton);

  const rotatingButton = document.createElement("button");
  rotatingButton.type = "button";
  rotatingButton.className = `paint-swatch rotating-swatch${activeColorIndex === ROTATING_COLOR_INDEX ? " active" : ""}`;
  rotatingButton.title = "Rotating";
  rotatingButton.addEventListener("click", () => {
    activeColorIndex = ROTATING_COLOR_INDEX;
    renderPaintColors();
    drawTrayPreviews();
    setStatus("Paint color: rotating");
  });
  paintColorsEl.append(rotatingButton);

  drawTrayPreviews();
}

function drawTrayPreviews() {
  const color = getPaintPreviewBackground(activeColorIndex);
  const startColor = getActiveColorValue(0);

  for (const preview of assetTrayEl.querySelectorAll(".platform-preview")) {
    preview.style.background = color;
  }
  for (const preview of assetTrayEl.querySelectorAll(".slope-preview")) {
    preview.style.background = isSpecialPlatformColor(activeColorIndex) ? getActiveColorValue(0) : color;
  }
  for (const preview of assetTrayEl.querySelectorAll(".mini-enemy")) {
    preview.style.background = isSpecialPlatformColor(activeColorIndex) ? getActiveColorValue(0) : color;
  }
  for (const preview of assetTrayEl.querySelectorAll(".mini-character")) {
    preview.style.background = startColor;
  }
}

function toggleEraseMode() {
  eraseMode = !eraseMode;
  eraseModeButton.classList.toggle("active", eraseMode);
  setStatus(eraseMode ? "Erase mode active." : "Erase mode off.");
}

function beginTrayDrag(template, event) {
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);

  selectedAsset = null;
  dragState = {
    source: "tray",
    kind: template.kind,
    pointerId: event.pointerId,
    template,
    preview: makePreview(template, getPointerPoint(event)),
    moved: false,
  };

  setStatus(`Dragging ${getAssetLabel(template.kind)}.`);
  draw();
}

function onCanvasPointerDown(event) {
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);

  const point = getPointerPoint(event);

  if (event.button === 2 || eraseMode) {
    pushUndo();
    const erased = eraseAt(point);
    exportLevel(false);
    draw();
    if (!erased) setStatus("Nothing to erase.");
    return;
  }

  const asset = pickAssetAt(point, PICK_TOLERANCE);
  if (!asset) {
    selectedAsset = null;
    setStatus("Nothing selected.");
    draw();
    return;
  }

  beginCanvasDrag(asset, point, event);
}

function beginCanvasDrag(asset, point, event) {
  selectedAsset = asset;
  dragState = {
    source: "canvas",
    kind: asset.kind,
    pointerId: event.pointerId,
    asset,
    offsetX: point.x - asset.rect.x,
    offsetY: point.y - asset.rect.y,
    moved: false,
    undoPushed: false,
  };
  setStatus(`Selected ${getAssetLabel(asset.kind)}.`);
  draw();
}

function updateDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  event.preventDefault();
  const point = getPointerPoint(event);

  if (dragState.source === "tray") {
    dragState.preview = makePreview(dragState.template, point);
    dragState.moved = true;
    draw();
    return;
  }

  if (!dragState.undoPushed) {
    pushUndo();
    dragState.undoPushed = true;
  }

  const moved = moveAsset(dragState.asset, point, dragState.offsetX, dragState.offsetY);
  if (moved) {
    dragState.moved = true;
    exportLevel(false);
    draw();
  }
}

function finishDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  event.preventDefault();

  if (dragState.source === "tray") {
    if (dragState.moved && isClientInsideCanvas(event)) {
      pushUndo();
      selectedAsset = commitTrayAsset(dragState.template, getPointerPoint(event));
      exportLevel(false);
      setStatus(`Placed ${getAssetLabel(dragState.kind)}.`);
    } else {
      setStatus("Drag canceled.");
    }
  } else if (dragState.moved) {
    setStatus(`Moved ${getAssetLabel(dragState.kind)}.`);
  }

  dragState = null;
  draw();
}

function createTrayAsset(tile) {
  const kind = tile.dataset.asset;

  if (kind === "block") {
    const type = normalizeBlockType(tile.dataset.type);
    return {
      kind,
      w: isSlopeType(type) ? TILE : Number(tile.dataset.width),
      h: TILE,
      colorIndex: type && isSpecialPlatformColor(activeColorIndex) ? 0 : activeColorIndex,
      type,
    };
  }

  if (kind === "enemy") {
    return {
      kind,
      w: ENEMY_W,
      h: ENEMY_H,
      direction: Number(enemyDirectionEl.value),
      colorIndex: isSpecialPlatformColor(activeColorIndex) ? 0 : activeColorIndex,
    };
  }

  if (kind === "start") return { kind, w: PLAYER_W, h: PLAYER_H };
  return { kind, w: TILE, h: TILE };
}

function makePreview(template, point) {
  const rect = getSnappedRect(template, point, template.w / 2, template.h / 2);
  return { ...template, ...rect };
}

function commitTrayAsset(template, point) {
  const rect = getSnappedRect(template, point, template.w / 2, template.h / 2);

  if (template.kind === "block") {
    const block = createBlock({
      x: rect.x,
      y: rect.y,
      w: template.w,
      colorIndex: template.colorIndex,
      type: template.type,
    });
    draft.blocks = draft.blocks.filter((existing) => !blocksOverlap(existing, block));
    draft.blocks.push(block);
    sortBlocks();
    return { kind: "block", blockId: block.id, block, rect: block };
  }

  if (template.kind === "start") {
    draft.start = { x: rect.x, y: rect.y };
    return { kind: "start", rect: playerRect() };
  }

  const enemy = {
    x: rect.x,
    y: rect.y,
    direction: template.direction,
    colorIndex: template.colorIndex,
  };
  draft.enemies.push(enemy);
  return { kind: "enemy", enemy, rect: enemyRect(enemy) };
}

function moveAsset(asset, point, offsetX, offsetY) {
  const rect = getSnappedRect(asset, point, offsetX, offsetY);

  if (asset.kind === "block") {
    const block = findBlockById(asset.blockId);
    if (!block) return false;
    if (block.x === rect.x && block.y === rect.y) return false;
    Object.assign(block, { x: rect.x, y: rect.y });
    sortBlocks();
    refreshBlockAsset(asset);
    return true;
  }

  if (asset.kind === "start") {
    if (draft.start.x === rect.x && draft.start.y === rect.y) return false;
    draft.start = { x: rect.x, y: rect.y };
    return true;
  }

  if (asset.kind === "enemy") {
    if (asset.enemy.x === rect.x && asset.enemy.y === rect.y) return false;
    Object.assign(asset.enemy, { x: rect.x, y: rect.y });
    return true;
  }

  return false;
}

function pickAssetAt(point, tolerance) {
  for (let i = draft.enemies.length - 1; i >= 0; i--) {
    const rect = enemyRect(draft.enemies[i]);
    if (pointInRect(point, expandRect(rect, tolerance))) {
      return { kind: "enemy", enemy: draft.enemies[i], rect };
    }
  }

  if (pointInRect(point, expandRect(playerRect(), tolerance))) return { kind: "start", rect: playerRect() };

  for (let i = draft.blocks.length - 1; i >= 0; i--) {
    const rect = blockRect(draft.blocks[i]);
    if (pointInRect(point, expandRect(rect, tolerance))) {
      return {
        kind: "block",
        blockId: draft.blocks[i].id,
        block: draft.blocks[i],
        rect,
      };
    }
  }

  return null;
}

function eraseAt(point) {
  const asset = pickAssetAt(point, PICK_TOLERANCE);
  if (!asset) return false;

  selectedAsset = asset;
  deleteSelectedAsset(false);
  return true;
}

function onKeyDown(event) {
  if (event.code !== "Delete" && event.code !== "Backspace") return;
  if (!selectedAsset) return;

  event.preventDefault();
  pushUndo();
  deleteSelectedAsset(true);
  exportLevel(false);
  draw();
}

function deleteSelectedAsset(showStatus) {
  if (!selectedAsset) return false;

  const kind = selectedAsset.kind;

  if (kind === "block") {
    draft.blocks = draft.blocks.filter((block) => block.id !== selectedAsset.blockId);
  } else if (kind === "enemy") {
    draft.enemies = draft.enemies.filter((enemy) => enemy !== selectedAsset.enemy);
  } else if (kind === "start") {
    draft.start = { ...DEFAULT_START };
  }

  selectedAsset = null;
  if (showStatus) setStatus(`Deleted ${getAssetLabel(kind)}.`);
  return true;
}

function exportLevel(showStatus) {
  const level = buildExportLevel();
  levelJsonEl.value = JSON.stringify(level, null, 2);
  if (showStatus) setStatus("Exported level JSON.");
}

function buildExportLevel() {
  const platforms = buildPlatformClusters();
  const level = {
    activePalette: [...draft.activePalette],
    start: { ...draft.start },
    platforms,
    enemies: draft.enemies.map((enemy) => ({
      x: enemy.x,
      y: enemy.y,
      direction: enemy.direction,
      colorIndex: enemy.colorIndex,
    })),
  };

  return level;
}

function importLevel() {
  let level;

  try {
    level = JSON.parse(levelJsonEl.value);
  } catch {
    setStatus("Import failed: JSON is not valid.");
    return;
  }

  pushUndo();
  applyLevel(level);
  exportLevel(false);
  setStatus("Imported level JSON.");
}

function applyLevel(level) {
  draft.activePalette = sanitizePalette(level.activePalette);
  draft.blocks = flattenPlatforms(level.platforms || []);
  draft.start = level.start || { ...DEFAULT_START };
  convertLegacyGoalToBlock(level);

  draft.enemies = (level.enemies || []).map((enemy) => ({
    x: enemy.x,
    y: enemy.y,
    direction: enemy.direction || 1,
    colorIndex: Math.min(enemy.colorIndex ?? 0, draft.activePalette.length - 1),
  }));

  selectedAsset = null;
  dragState = null;
  activeColorIndex = 0;
  renderPaletteOptions();
  renderPaintColors();
  draw();
}

function convertLegacyGoalToBlock(level) {
  if (!level.goal || hasGoalBlocks()) return;

  const w = TILE * 2;
  const platform = Number.isInteger(level.goal.platformIndex)
    ? level.platforms?.[level.goal.platformIndex]
    : null;
  const x = snap(level.goal.x ?? DEFAULT_START.x);
  const y = platform ? platform.y - TILE : snap(level.goal.y ?? DEFAULT_START.y);

  draft.blocks.push(createBlock({
    x: clamp(x, 0, WIDTH - w),
    y: clamp(y, 0, HEIGHT - TILE),
    w,
    colorIndex: GOAL_COLOR_INDEX,
  }));
  sortBlocks();
}

function hasGoalBlocks() {
  return draft.blocks.some((block) => isGoalColor(block.colorIndex));
}

function readLevelLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEVEL_LIBRARY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLevelLibrary(levels) {
  localStorage.setItem(LEVEL_LIBRARY_STORAGE_KEY, JSON.stringify(levels));
}

function renderSavedLevelList(selectedId) {
  const levels = readLevelLibrary().sort((a, b) => a.name.localeCompare(b.name));
  savedLevelsEl.innerHTML = "";

  for (const record of levels) {
    const option = document.createElement("option");
    option.value = record.id;
    option.textContent = record.name;
    option.title = record.updatedAt ? `Updated ${new Date(record.updatedAt).toLocaleString()}` : record.name;
    option.selected = record.id === selectedId;
    savedLevelsEl.append(option);
  }
}

function saveNamedLevel() {
  const name = getLevelName();
  if (!name) {
    setStatus("Enter a level name before saving.");
    return;
  }

  const levels = readLevelLibrary();
  const existing = levels.find((record) => normalizeLevelName(record.name) === normalizeLevelName(name));
  const updatedAt = new Date().toISOString();
  let savedId;

  if (existing) {
    existing.name = name;
    existing.updatedAt = updatedAt;
    existing.level = buildExportLevel();
    savedId = existing.id;
  } else {
    const record = {
      id: createLevelId(),
      name,
      updatedAt,
      level: buildExportLevel(),
    };
    levels.push(record);
    savedId = record.id;
  }

  writeLevelLibrary(levels);
  renderSavedLevelList(savedId);
  exportLevel(false);
  setStatus(`Saved "${name}".`);
}

function loadSelectedLevel() {
  const record = getSelectedLevelRecord();
  if (!record) {
    setStatus("Select a saved level to load.");
    return;
  }

  pushUndo();
  applyLevel(record.level);
  levelNameEl.value = record.name;
  exportLevel(false);
  setStatus(`Loaded "${record.name}".`);
}

function renameSelectedLevel() {
  const record = getSelectedLevelRecord();
  if (!record) {
    setStatus("Select a saved level to rename.");
    return;
  }

  const name = getLevelName();
  if (!name) {
    setStatus("Enter a new level name before renaming.");
    return;
  }

  const levels = readLevelLibrary();
  const duplicate = levels.find(
    (candidate) =>
      candidate.id !== record.id &&
      normalizeLevelName(candidate.name) === normalizeLevelName(name),
  );

  if (duplicate) {
    setStatus(`A level named "${name}" already exists.`);
    return;
  }

  const target = levels.find((candidate) => candidate.id === record.id);
  if (!target) return;

  target.name = name;
  target.updatedAt = new Date().toISOString();
  writeLevelLibrary(levels);
  renderSavedLevelList(target.id);
  setStatus(`Renamed level to "${name}".`);
}

function deleteSelectedLevelRecord() {
  const record = getSelectedLevelRecord();
  if (!record) {
    setStatus("Select a saved level to delete.");
    return;
  }

  if (!window.confirm(`Delete saved level "${record.name}"?`)) return;

  const levels = readLevelLibrary().filter((candidate) => candidate.id !== record.id);
  writeLevelLibrary(levels);
  renderSavedLevelList();
  setStatus(`Deleted "${record.name}".`);
}

function syncSelectedLevelName() {
  const record = getSelectedLevelRecord();
  if (record) levelNameEl.value = record.name;
}

function getSelectedLevelRecord() {
  const id = savedLevelsEl.value;
  return readLevelLibrary().find((record) => record.id === id) || null;
}

function getLevelName() {
  return levelNameEl.value.trim();
}

function normalizeLevelName(name) {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function createLevelId() {
  return `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPlatformClusters() {
  const sorted = [...draft.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const platforms = [];

  for (const block of sorted) {
    const exportBlock = createExportBlock(block);
    const last = platforms[platforms.length - 1];
    const lastRight = last ? last.x + last.blocks.reduce((total, item) => total + item.w, 0) : 0;

    if (last && last.y === block.y && lastRight === block.x) {
      last.blocks.push(exportBlock);
    } else {
      platforms.push({ x: block.x, y: block.y, blocks: [exportBlock] });
    }
  }

  return platforms;
}

function createExportBlock(block) {
  const exported = { w: block.w, colorIndex: block.colorIndex };
  if (isSlopeBlock(block)) exported.type = block.type;
  return exported;
}

function flattenPlatforms(platforms) {
  const blocks = [];

  for (const platform of platforms) {
    let x = platform.x;

    for (const block of platform.blocks || []) {
      blocks.push({
        ...createBlock({
          x,
          y: platform.y,
          w: block.w,
          colorIndex: normalizeBlockColorIndex(block.colorIndex),
          type: normalizeBlockType(block.type),
        }),
      });
      x += block.w;
    }
  }

  return blocks;
}

function sanitizePalette(palette) {
  const indexes = Array.isArray(palette) ? palette.filter((index) => MASTER_COLORS[index]) : [0, 2, 4];
  return indexes.length > 0 ? [...new Set(indexes)] : [0];
}

function createBlock(data) {
  const type = normalizeBlockType(data.type);
  return {
    id: data.id ?? nextBlockId++,
    x: data.x,
    y: data.y,
    w: isSlopeType(type) ? TILE : data.w,
    h: TILE,
    colorIndex: normalizeBlockColorIndex(data.colorIndex),
    type,
  };
}

function normalizeBlockColorIndex(colorIndex) {
  if (isGoalColor(colorIndex)) return GOAL_COLOR_INDEX;
  if (isRotatingColor(colorIndex)) return ROTATING_COLOR_INDEX;
  return Math.min(colorIndex ?? 0, draft.activePalette.length - 1);
}

function normalizeBlockType(type) {
  return isSlopeType(type) ? type : null;
}

function ensureBlockIds() {
  let highestId = 0;

  draft.blocks = draft.blocks.map((block) => {
    const withId = block.id ? block : createBlock(block);
    highestId = Math.max(highestId, withId.id);
    return withId;
  });

  nextBlockId = Math.max(nextBlockId, highestId + 1);
}

function findBlockById(id) {
  return draft.blocks.find((block) => block.id === id);
}

function refreshBlockAsset(asset) {
  if (asset.kind !== "block") return;
  const block = findBlockById(asset.blockId);
  asset.block = block;
  asset.rect = block ? blockRect(block) : null;
}

function pushUndo() {
  undoStack.push(JSON.stringify(draft));
  if (undoStack.length > 80) undoStack.shift();
}

function undo() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;

  draft = JSON.parse(snapshot);
  ensureBlockIds();
  selectedAsset = null;
  dragState = null;
  activeColorIndex = isSpecialPlatformColor(activeColorIndex)
    ? activeColorIndex
    : Math.min(activeColorIndex, draft.activePalette.length - 1);
  renderPaletteOptions();
  renderPaintColors();
  exportLevel(false);
  draw();
  setStatus("Undid last action.");
}

function clearDraft() {
  if (!window.confirm("Clear this draft level?")) return;
  pushUndo();
  draft.blocks = [];
  draft.enemies = [];
  draft.start = { ...DEFAULT_START };
  selectedAsset = null;
  dragState = null;
  exportLevel(false);
  draw();
  setStatus("Cleared to blank level.");
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawBlocks();
  drawEnemies();
  drawStart();
  drawSelection();
  drawDragPreview();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#162235");
  sky.addColorStop(1, "#0b111c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let x = 0; x < WIDTH; x += TILE) ctx.fillRect(x, 0, 1, HEIGHT);
  for (let y = 0; y < HEIGHT; y += TILE) ctx.fillRect(0, y, WIDTH, 1);
}

function drawBlocks() {
  for (const block of draft.blocks) {
    drawPlatformBlock(block.x, block.y, block.w, block.colorIndex, 1, block.type);
  }
}

function drawPlatformBlock(x, y, w, colorIndex, alpha, type = null) {
  ctx.save();
  ctx.globalAlpha = alpha;

  if (isSlopeType(type)) {
    drawSlopeBlock(x, y, getActiveColorValue(colorIndex), type);
  } else if (isRotatingColor(colorIndex)) {
    drawRotatingPlatformBlock(x, y, w);
    ctx.globalAlpha = alpha;
  } else {
    ctx.fillStyle = isGoalColor(colorIndex) ? "#f8fbff" : getActiveColorValue(colorIndex);
    ctx.fillRect(x, y, w, TILE);
  }

  if (!isRotatingColor(colorIndex) && !isSlopeType(type)) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
    ctx.fillRect(x + 5, y + 4, Math.max(0, w - 10), 4);
  }

  if (!isSlopeType(type)) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
    ctx.fillRect(x, y + TILE - 7, w, 7);
    ctx.strokeStyle = "#07101c";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, TILE - 2);
  }

  ctx.restore();
}

function drawSlopeBlock(x, y, color, type) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isSlopeDownLeftType(type)) {
    ctx.moveTo(x + TILE, y);
    ctx.lineTo(x + TILE, y + TILE);
    ctx.lineTo(x, y + TILE);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + TILE, y + TILE);
    ctx.lineTo(x, y + TILE);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#07101c";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (isSlopeDownLeftType(type)) {
    ctx.moveTo(x + TILE - 4, y + 5);
    ctx.lineTo(x + 5, y + TILE - 4);
  } else {
    ctx.moveTo(x + 4, y + 5);
    ctx.lineTo(x + TILE - 5, y + TILE - 4);
  }
  ctx.stroke();
}

function drawRotatingPlatformBlock(x, y, w) {
  const stripeWidth = Math.max(8, Math.ceil(w / draft.activePalette.length));

  for (let i = 0; i < Math.ceil(w / stripeWidth); i++) {
    ctx.fillStyle = getActiveColorValue(i % draft.activePalette.length);
    ctx.fillRect(x + i * stripeWidth, y, Math.min(stripeWidth, w - i * stripeWidth), TILE);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
  ctx.fillRect(x + 5, y + 4, Math.max(0, w - 10), 4);
}

function getPaintPreviewBackground(colorIndex) {
  if (isGoalColor(colorIndex)) return "#f8fbff";
  if (isRotatingColor(colorIndex)) {
    return `linear-gradient(90deg, ${draft.activePalette
      .map((_, index) => getActiveColorValue(index))
      .join(", ")})`;
  }
  return getActiveColorValue(colorIndex);
}

function drawStart() {
  drawCharacter(draft.start.x, draft.start.y, getActiveColorValue(0), 1);
}

function drawCharacter(x, y, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y + 8, 18, 20);
  ctx.fillRect(x + 8, y, 14, 10);
  ctx.fillRect(x + 2, y + 18, 22, 8);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(x + 15, y + 4, 4, 4);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of draft.enemies) {
    drawEnemy(enemy.x, enemy.y, enemy.colorIndex, enemy.direction, 1);
  }
}

function drawEnemy(x, y, colorIndex, direction, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = getActiveColorValue(colorIndex);
  ctx.fillRect(x + 3, y + 6, ENEMY_W - 6, ENEMY_H - 6);
  ctx.fillRect(x + 7, y, ENEMY_W - 14, 8);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(x + (direction > 0 ? 17 : 7), y + 8, 4, 4);
  ctx.restore();
}

function drawSelection() {
  if (!selectedAsset) return;
  const rect = getAssetRect(selectedAsset);
  if (!rect) return;

  ctx.save();
  ctx.strokeStyle = "#f8fbff";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8);
  ctx.restore();
}

function drawDragPreview() {
  if (!dragState || dragState.source !== "tray" || !dragState.preview) return;
  const preview = dragState.preview;

  if (preview.kind === "block") {
    drawPlatformBlock(preview.x, preview.y, preview.w, preview.colorIndex, 0.68, preview.type);
  } else if (preview.kind === "enemy") {
    drawEnemy(preview.x, preview.y, preview.colorIndex, preview.direction, 0.68);
  } else if (preview.kind === "start") {
    drawCharacter(preview.x, preview.y, getActiveColorValue(0), 0.68);
  }
}

function getPointerPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * WIDTH, 0, WIDTH),
    y: clamp(((event.clientY - rect.top) / rect.height) * HEIGHT, 0, HEIGHT),
  };
}

function isClientInsideCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function getSnappedRect(asset, point, offsetX, offsetY) {
  const width = getAssetWidth(asset);
  const height = getAssetHeight(asset);
  return clampPoint({ x: snap(point.x - offsetX), y: snap(point.y - offsetY) }, width, height);
}

function snap(value) {
  return Math.round(value / TILE) * TILE;
}

function clampPoint(rect, w, h) {
  return {
    ...rect,
    x: Math.max(0, Math.min(WIDTH - w, rect.x)),
    y: Math.max(0, Math.min(HEIGHT - h, rect.y)),
  };
}

function blocksOverlap(a, b) {
  return a.y === b.y && a.x < b.x + b.w && a.x + a.w > b.x;
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function expandRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  };
}

function getAssetRect(asset) {
  if (asset.kind === "block") return asset.block ? blockRect(asset.block) : null;
  if (asset.kind === "enemy") return enemyRect(asset.enemy);
  if (asset.kind === "start") return playerRect();
  return null;
}

function blockRect(block) {
  return { x: block.x, y: block.y, w: block.w, h: TILE };
}

function getAssetWidth(asset) {
  if (asset.kind === "block") return asset.w ?? asset.block?.w ?? TILE;
  if (asset.kind === "enemy") return ENEMY_W;
  if (asset.kind === "start") return PLAYER_W;
  return TILE;
}

function getAssetHeight(asset) {
  if (asset.kind === "block") return TILE;
  if (asset.kind === "enemy") return ENEMY_H;
  if (asset.kind === "start") return PLAYER_H;
  return TILE;
}

function getAssetLabel(kind) {
  if (kind === "start") return "start";
  if (kind === "enemy") return "mote";
  return "block";
}

function playerRect() {
  return { ...draft.start, w: PLAYER_W, h: PLAYER_H };
}

function enemyRect(enemy) {
  return { x: enemy.x, y: enemy.y, w: ENEMY_W, h: ENEMY_H };
}

function sortBlocks() {
  draft.blocks.sort((a, b) => a.y - b.y || a.x - b.x);
}

function getActiveColorValue(activeIndex = activeColorIndex) {
  if (isGoalColor(activeIndex)) return "#f8fbff";
  if (isRotatingColor(activeIndex)) return getActiveColorValue(0);
  const masterIndex = draft.activePalette[activeIndex] ?? draft.activePalette[0] ?? 0;
  return MASTER_COLORS[masterIndex].value;
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

function isSpecialPlatformColor(colorIndex) {
  return isGoalColor(colorIndex) || isRotatingColor(colorIndex);
}

function setStatus(message) {
  editorStatusEl.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

init();
