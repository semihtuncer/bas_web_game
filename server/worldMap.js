// World map configuration for server-side collision detection

export const COLLIDER_TILE_SIZE = 16;

const MAP_WIDTH_TILES = 240;
const MAP_HEIGHT_TILES = 180;
const dynamicColliders = new Set();
const objectColliders = new Map();
const staticColliders = new Map();
const OBJECT_DEFAULT_WIDTH = 48;
const OBJECT_DEFAULT_HEIGHT = 72;

// Static bench collider
const BENCH_X = 2760;
const BENCH_Y = 1511;
const BENCH_SCALE = 2.5;
const BENCH_WIDTH = 64 * BENCH_SCALE;
const BENCH_HEIGHT = 32 * BENCH_SCALE;
const BENCH_COLLISION_SCALE = 0.4; // Collision box is 80% of visual size

// Initialize static bench collider
staticColliders.set('bench', {
  id: 'bench',
  left: BENCH_X - (BENCH_WIDTH * BENCH_COLLISION_SCALE) / 2,
  top: BENCH_Y - BENCH_HEIGHT * BENCH_COLLISION_SCALE - 5,
  width: BENCH_WIDTH * BENCH_COLLISION_SCALE,
  height: BENCH_HEIGHT * BENCH_COLLISION_SCALE,
});

function tileKey(col, row) {
  return `${col},${row}`;
}

function toTileCoords(worldX, worldY) {
  return {
    col: Math.floor(worldX / COLLIDER_TILE_SIZE),
    row: Math.floor(worldY / COLLIDER_TILE_SIZE),
  };
}

const TOP_BOTTOM_ROW = '#'.repeat(MAP_WIDTH_TILES);
const MIDDLE_ROW = `#${'G'.repeat(MAP_WIDTH_TILES - 2)}#`;

export const WORLD_MAP = [
  TOP_BOTTOM_ROW,
  ...Array.from({ length: MAP_HEIGHT_TILES - 2 }, () => MIDDLE_ROW),
  TOP_BOTTOM_ROW,
];

export const MAP_ROWS = WORLD_MAP.length;
export const MAP_COLS = WORLD_MAP[0].length;

export const TILE_DEFINITIONS = {
  '#': {
    name: 'Fence',
    collidable: false,
  },
  G: {
    name: 'Grass',
    collidable: false,
  },
};

export const DEFAULT_TILE = {
  name: 'Void',
  collidable: false,
};

export function addColliderTile(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) {
    return false;
  }
  dynamicColliders.add(tileKey(col, row));
  return true;
}

export function removeColliderTile(col, row) {
  return dynamicColliders.delete(tileKey(col, row));
}

export function setColliders(colliders = []) {
  dynamicColliders.clear();
  colliders.forEach(({ col, row }) => {
    if (Number.isInteger(col) && Number.isInteger(row)) {
      if (col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS) {
        dynamicColliders.add(tileKey(col, row));
      }
    }
  });
}

export function hasColliderTile(col, row) {
  return dynamicColliders.has(tileKey(col, row));
}

export function getColliders() {
  return Array.from(dynamicColliders.values()).map((key) => {
    const [col, row] = key.split(',').map(Number);
    return { col, row };
  });
}

export function clearObjectColliders() {
  objectColliders.clear();
}

export function addObjectCollider(object) {
  if (!object || !object.id) {
    return;
  }
  const width = Number.isFinite(object.width) ? object.width : OBJECT_DEFAULT_WIDTH;
  const height = Number.isFinite(object.height) ? object.height : OBJECT_DEFAULT_HEIGHT;
  const centerX = Number(object.x);
  const baseY = Number(object.y);
  if (!Number.isFinite(centerX) || !Number.isFinite(baseY)) {
    return;
  }

  // Reduce collision box size (70% of visual size)
  const collisionScale = 0.6;
  const collisionWidth = width * collisionScale;
  const collisionHeight = height * collisionScale;

  objectColliders.set(object.id, {
    id: object.id,
    left: centerX - collisionWidth / 2,
    top: baseY - collisionHeight, // Keep bottom aligned with visual object
    width: collisionWidth,
    height: collisionHeight,
  });
}

export function removeObjectCollider(id) {
  objectColliders.delete(id);
}

export function getTileAt(worldX, worldY) {
  const { col, row } = toTileCoords(worldX, worldY);
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) {
    return null;
  }
  return WORLD_MAP[row][col];
}

export function getTileDefinition(worldX, worldY) {
  const tileChar = getTileAt(worldX, worldY);
  if (tileChar === null) {
    return DEFAULT_TILE;
  }
  return TILE_DEFINITIONS[tileChar] || DEFAULT_TILE;
}

export function isCollidable(worldX, worldY) {
  const { col, row } = toTileCoords(worldX, worldY);
  if (hasColliderTile(col, row)) {
    return true;
  }
  const tileChar = getTileAt(worldX, worldY);
  if (tileChar === null) {
    return false;
  }
  const definition = TILE_DEFINITIONS[tileChar];
  if (definition?.collidable) {
    return true;
  }

  // Check static colliders (like bench)
  for (const collider of staticColliders.values()) {
    if (
      worldX >= collider.left &&
      worldX <= collider.left + collider.width &&
      worldY >= collider.top &&
      worldY <= collider.top + collider.height
    ) {
      return true;
    }
  }

  // Check dynamic object colliders
  for (const collider of objectColliders.values()) {
    if (
      worldX >= collider.left &&
      worldX <= collider.left + collider.width &&
      worldY >= collider.top &&
      worldY <= collider.top + collider.height
    ) {
      return true;
    }
  }

  return false;
}

