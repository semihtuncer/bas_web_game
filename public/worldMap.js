export const COLLIDER_TILE_SIZE = 16;
export const CHARACTER_SPRITE_SIZE = 48;
export const FOLLOWER_SPRITE_SIZE = 32;
export const FOLLOWER_FRAME_SIZE = 48;
export const OBJECT_WIDTH_PX = 48;
export const OBJECT_HEIGHT_PX = 72;

const MAP_WIDTH_TILES = 240;
const MAP_HEIGHT_TILES = 180;

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
    sprite: 'fence_bottom',
    color: 'rgba(0, 0, 0, 0)',
    collidable: false,
  },
  G: {
    name: 'Grass',
    sprite: 'grass_green',
    color: 'rgba(0, 0, 0, 0)',
    collidable: false,
  },
};

export const DEFAULT_TILE = {
  name: 'Void',
  sprite: null,
  color: 'transparent',
  collidable: false,
};

export const TILE_RULES = {};