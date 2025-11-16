// Game state schemas and constants

import { COLLIDER_TILE_SIZE, MAP_COLS, MAP_ROWS } from './worldMap.js';

export const GAME_CONFIG = {
  TICK_RATE: 20, // 20 TPS
  TICK_INTERVAL: 1000 / 20, // 50ms
  PLAYER_SPEED: 125, // pixels per second
  FOLLOWER_SPEED: 110,
  MAX_PLAYERS: 2,
  TILE_SIZE: COLLIDER_TILE_SIZE,
  WORLD_COLS: MAP_COLS,
  WORLD_ROWS: MAP_ROWS,
  OBJECT_WIDTH: 48,
  OBJECT_HEIGHT: 72,
};

GAME_CONFIG.WORLD_WIDTH = GAME_CONFIG.WORLD_COLS * GAME_CONFIG.TILE_SIZE;
GAME_CONFIG.WORLD_HEIGHT = GAME_CONFIG.WORLD_ROWS * GAME_CONFIG.TILE_SIZE;

export const MESSAGE_TYPES = {
  // Client -> Server
  JOIN: 'join',
  INPUT: 'input',
  DISCONNECT: 'disconnect',
  RESET_POSITION: 'reset_position',
  PLACE_COLLIDER: 'place_collider',
  REMOVE_COLLIDER: 'remove_collider',
  PLACE_OBJECT: 'place_object',
  REMOVE_OBJECT: 'remove_object',
  HUG: 'hug',
  BENCH_SIT: 'bench_sit',
  BENCH_STAND: 'bench_stand',
  
  // Server -> Client
  WELCOME: 'welcome',
  STATE_UPDATE: 'state_update',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  COLLIDER_PLACED: 'collider_placed',
  COLLIDER_REMOVED: 'collider_removed',
  OBJECT_PLACED: 'object_placed',
  OBJECT_REMOVED: 'object_removed',
  HUG_STARTED: 'hug_started',
  HUG_ENDED: 'hug_ended',
  ERROR: 'error',
};

export function createPlayerState(playerId, name = 'Player', character = '1') {
  return {
    id: playerId,
    name: name,
    character: character, // Player character: '1' or '2'
    x: 0,
    y: 0,
    vx: 0, // velocity x
    vy: 0, // velocity y
    lastInputSeq: 0,
    lastInput: null, // Store last input for continuous processing
    connected: true,
    lastUpdate: Date.now(),
    hugging: false, // Whether player is currently hugging
    hugEndTime: 0, // When the hug animation should end
    sitting: false, // Whether player is sitting on bench
  };
}

export function createFollowerState(id, spriteKey) {
  return {
    id,
    sprite: spriteKey,
    slot: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetPlayerId: null,
  };
}

export function createGameState() {
  return {
    players: new Map(),
    objects: new Map(),
    followers: new Map(),
    tick: 0,
    lastTick: Date.now(),
  };
}

