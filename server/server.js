import { WebSocketServer, WebSocket } from 'ws';
import {
  GAME_CONFIG,
  MESSAGE_TYPES,
  createPlayerState,
  createGameState,
  createFollowerState,
} from './schema.js';
import {
  loadState,
  saveState,
  loadColliders,
  saveColliders,
  loadObjects,
  saveObjects,
} from './store.js';
import {
  isCollidable,
  addColliderTile,
  removeColliderTile,
  getColliders,
  setColliders,
  addObjectCollider,
  removeObjectCollider,
  clearObjectColliders,
} from './worldMap.js';

const PORT = process.env.PORT || 3001;
const SPAWN_POINTS = [
  { col: 20, row: 10 },
  { col: 21, row: 10 },
];

const FOLLOWER_TEMPLATES = [
  { id: 'follower_buggy', sprite: 'buggy' },
];

// Game state
let gameState = createGameState();
let wss = null;

// Initialize game state from persistence
async function initializeGame() {
  const savedState = await loadState();
  if (savedState && savedState.players) {
    // Restore player positions but mark as disconnected
    for (const [id, player] of Object.entries(savedState.players)) {
      const playerState = createPlayerState(id, player.name, player.character || '1');
      playerState.x = player.x || 0;
      playerState.y = player.y || 0;
      playerState.connected = false;
      gameState.players.set(id, playerState);
    }
  }
}

async function initializeColliders() {
  const colliders = await loadColliders();
  if (Array.isArray(colliders)) {
    setColliders(colliders);
  }
}

async function initializeObjects() {
  const objects = await loadObjects();
  gameState.objects.clear();
  clearObjectColliders();
  objects.forEach((object) => {
    const normalized = normalizeObjectData(object);
    if (!normalized || gameState.objects.has(normalized.id)) {
      return;
    }
    gameState.objects.set(normalized.id, normalized);
    addObjectCollider(normalized);
  });
  await saveObjects(gameState.objects).catch(console.error);
}

function initializeFollowers() {
  FOLLOWER_TEMPLATES.forEach((template) => {
    if (!gameState.followers.has(template.id)) {
      const follower = createFollowerState(template.id, template.sprite);
      // Start followers near the first spawn point
      const spawn = SPAWN_POINTS[0];
      follower.x = spawn.col * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2;
      follower.y = (spawn.row + 1) * GAME_CONFIG.TILE_SIZE;
      gameState.followers.set(template.id, follower);
    }
  });
}

function getConnectedPlayers() {
  return Array.from(gameState.players.values()).filter((player) => player.connected);
}

function assignFollowersToPlayers() {
  const connectedPlayers = getConnectedPlayers();
  if (connectedPlayers.length === 0) {
    gameState.followers.forEach((follower) => {
      follower.targetPlayerId = null;
      follower.vx = 0;
      follower.vy = 0;
    });
    return;
  }

  const playerIds = connectedPlayers.map((player) => player.id);
  const followers = Array.from(gameState.followers.values());

  followers.forEach((follower, index) => {
    const targetId = playerIds[index % playerIds.length];
    if (follower.targetPlayerId !== targetId) {
      follower.targetPlayerId = targetId;
      const targetPlayer = gameState.players.get(targetId);
      if (targetPlayer) {
        follower.x = targetPlayer.x;
        follower.y = targetPlayer.y;
      }
    }
    follower.slot = index;
  });
}

function clampToWorld(entity) {
  entity.x = Math.max(0, Math.min(GAME_CONFIG.WORLD_WIDTH, entity.x));
  entity.y = Math.max(0, Math.min(GAME_CONFIG.WORLD_HEIGHT, entity.y));
}

function getObjectBounds(object) {
  const width = Number.isFinite(object.width) ? object.width : GAME_CONFIG.OBJECT_WIDTH;
  const height = Number.isFinite(object.height) ? object.height : GAME_CONFIG.OBJECT_HEIGHT;
  return {
    left: object.x - width / 2,
    right: object.x + width / 2,
    top: object.y - height,
    bottom: object.y,
    width,
    height,
  };
}

function objectsOverlap(objectA, objectB) {
  const a = getObjectBounds(objectA);
  const b = getObjectBounds(objectB);
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function pointInObject(x, y, object) {
  const bounds = getObjectBounds(object);
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}

function normalizeObjectData(raw) {
  if (!raw) {
    return null;
  }

  const id = typeof raw.id === 'string'
    ? raw.id
    : `object_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let x = Number(raw.x);
  let y = Number(raw.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const col = Number.isFinite(Number(raw.col)) ? Number(raw.col) : null;
    const row = Number.isFinite(Number(raw.row)) ? Number(raw.row) : null;
    if (col !== null && row !== null) {
      x = (col + 0.5) * GAME_CONFIG.TILE_SIZE;
      y = (row + 1) * GAME_CONFIG.TILE_SIZE;
    }
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const width = Number.isFinite(raw.width) ? raw.width : GAME_CONFIG.OBJECT_WIDTH;
  const height = Number.isFinite(raw.height) ? raw.height : GAME_CONFIG.OBJECT_HEIGHT;

  return {
    id,
    x,
    y,
    width,
    height,
    imageSrc: typeof raw.imageSrc === 'string' ? raw.imageSrc : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

function updateFollowers(deltaSeconds) {
  gameState.followers.forEach((follower) => {
    if (!follower.targetPlayerId) {
      follower.vx = 0;
      follower.vy = 0;
      return;
    }

    const target = gameState.players.get(follower.targetPlayerId);
    if (!target || !target.connected) {
      follower.targetPlayerId = null;
      follower.vx = 0;
      follower.vy = 0;
      return;
    }

    // Increase following distance by 4x if target player is sitting
    const distanceMultiplier = target.sitting ? 4 : 1.3;
    
    const baseOffset = GAME_CONFIG.TILE_SIZE * 1.8 * distanceMultiplier;
    const trailingFactor = 0.25;
    const angle = follower.slot % 2 === 0 ? Math.PI / 6 : -Math.PI / 6;
    const targetSpeed = Math.hypot(target.vx, target.vy);

    const offsetX = -Math.cos(angle) * baseOffset - target.vx * trailingFactor;
    const offsetY = -Math.sin(angle) * baseOffset - target.vy * trailingFactor;
    const targetX = target.x + offsetX;
    const targetY = target.y + offsetY;

    const dx = targetX - follower.x;
    const dy = targetY - follower.y;
    const distance = Math.hypot(dx, dy);
    const desiredDistance = GAME_CONFIG.TILE_SIZE * 0.8 * distanceMultiplier;

    const speed = Math.max(60, GAME_CONFIG.FOLLOWER_SPEED - targetSpeed * 0.15);
    const maxStep = speed * deltaSeconds;

    if (distance <= desiredDistance) {
      follower.vx *= 0.4;
      follower.vy *= 0.4;
      if (Math.abs(follower.vx) < 2) follower.vx = 0;
      if (Math.abs(follower.vy) < 2) follower.vy = 0;
      return;
    }

    if (distance > 0) {
      const move = Math.min(maxStep, Math.max(0, distance - desiredDistance));
      const ux = dx / distance;
      const uy = dy / distance;
      follower.x += ux * move;
      follower.y += uy * move;
      follower.vx = ux * speed;
      follower.vy = uy * speed;
      if (move < 1.5) {
        follower.vx = 0;
        follower.vy = 0;
      }
      clampToWorld(follower);
    }
  });
}

// Player collision radius (for checking collisions)
const PLAYER_RADIUS = 10; // Half of typical player sprite size

/**
 * Check if a player can move to a position (collision detection)
 */
function canMoveTo(x, y) {
  // Check multiple points around the player for better collision detection
  const checkPoints = [
    { x: x, y: y }, // Center
    { x: x - PLAYER_RADIUS, y: y }, // Left
    { x: x + PLAYER_RADIUS, y: y }, // Right
    { x: x, y: y - PLAYER_RADIUS }, // Top
    { x: x, y: y + PLAYER_RADIUS * 0.01 }, // Bottom
    { x: x - PLAYER_RADIUS * 0.7, y: y - PLAYER_RADIUS * 0.4 }, // Top-left
    { x: x + PLAYER_RADIUS * 0.7, y: y - PLAYER_RADIUS * 0.4 }, // Top-right
    { x: x - PLAYER_RADIUS * 0.7, y: y + PLAYER_RADIUS * 0.01 }, // Bottom-left
    { x: x + PLAYER_RADIUS * 0.7, y: y + PLAYER_RADIUS * 0.01 }, // Bottom-right
  ];
  
  // Check all points - if any are collidable, movement is blocked
  for (const point of checkPoints) {
    if (isCollidable(point.x, point.y)) {
      return false;
    }
  }
  
  return true;
}

// Process player input and update position
function processPlayerInput(player, input) {
  const { keys, seq } = input;
  const deltaTime = GAME_CONFIG.TICK_INTERVAL / 1000; // Convert to seconds
  
  // Update velocity based on input
  let vx = 0;
  let vy = 0;
  
  if (keys.up || keys.w) vy -= GAME_CONFIG.PLAYER_SPEED;
  if (keys.down || keys.s) vy += GAME_CONFIG.PLAYER_SPEED;
  if (keys.left || keys.a) vx -= GAME_CONFIG.PLAYER_SPEED;
  if (keys.right || keys.d) vx += GAME_CONFIG.PLAYER_SPEED;
  
  // Normalize diagonal movement
  if (vx !== 0 && vy !== 0) {
    const length = Math.sqrt(vx * vx + vy * vy);
    vx = (vx / length) * GAME_CONFIG.PLAYER_SPEED;
    vy = (vy / length) * GAME_CONFIG.PLAYER_SPEED;
  }
  
  // Update velocity
  player.vx = vx;
  player.vy = vy;
  
  // Calculate new position
  const newX = player.x + vx * deltaTime;
  const newY = player.y + vy * deltaTime;
  
  // Check collisions and update position
  let finalX = player.x;
  let finalY = player.y;
  
  // Try to move in X direction first
  if (vx !== 0) {
    if (canMoveTo(newX, player.y)) {
      finalX = newX;
    } else {
      // Stop X movement if collision
      player.vx = 0;
    }
  }
  
  // Then try to move in Y direction
  if (vy !== 0) {
    if (canMoveTo(finalX, newY)) {
      finalY = newY;
    } else {
      // Stop Y movement if collision
      player.vy = 0;
    }
  }
  
  // Apply final position
  player.x = finalX;
  player.y = finalY;
  
  // Basic boundary checks (keep player within world bounds)
  player.x = Math.max(0, Math.min(GAME_CONFIG.WORLD_WIDTH, player.x));
  player.y = Math.max(0, Math.min(GAME_CONFIG.WORLD_HEIGHT, player.y));
  
  player.lastInputSeq = Math.max(player.lastInputSeq, seq);
  player.lastUpdate = Date.now();
}

// Game tick - runs at 20 TPS
function gameTick() {
  const now = Date.now();
  const deltaTime = now - gameState.lastTick;
  const clampedDelta = Math.min(Math.max(deltaTime, GAME_CONFIG.TICK_INTERVAL), GAME_CONFIG.TICK_INTERVAL * 4);
  const deltaSeconds = clampedDelta / 1000;
  
  // Check for ending hugs
  for (const player of gameState.players.values()) {
    if (player.connected && player.hugging && player.hugEndTime > 0 && now >= player.hugEndTime) {
      player.hugging = false;
      player.hugEndTime = 0;
      broadcastHugEnded(player.id);
    }
  }
  
  // Process inputs for all connected players
  for (const player of gameState.players.values()) {
    if (player.connected) {
      // Don't process movement input if hugging or sitting
      if (player.hugging || player.sitting) {
        player.vx = 0;
        player.vy = 0;
        continue;
      }
      
      if (player.lastInput) {
        // Process the last known input state continuously during each tick
        processPlayerInput(player, player.lastInput);
      } else {
        // No input - stop movement
        player.vx = 0;
        player.vy = 0;
      }
    }
  }

  updateFollowers(deltaSeconds);
  
  gameState.tick++;
  gameState.lastTick = now;
  
  // Broadcast state to all connected clients
  broadcastState();
}

// Broadcast game state to all connected clients
function broadcastState() {
  if (!wss) return;
  
  const state = {
    type: MESSAGE_TYPES.STATE_UPDATE,
    tick: gameState.tick,
    timestamp: Date.now(),
    players: Array.from(gameState.players.values())
      .filter(p => p.connected)
      .map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: Math.round(p.x * 100) / 100, // Round to 2 decimal places
        y: Math.round(p.y * 100) / 100,
        vx: p.vx,
        vy: p.vy,
        hugging: p.hugging || false,
        hugEndTime: p.hugEndTime || 0,
        sitting: p.sitting || false,
      })),
    followers: Array.from(gameState.followers.values()),
    objects: Array.from(gameState.objects.values()),
    colliders: getColliders(),
  };
  
  const message = JSON.stringify(state);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.playerId) {
      client.send(message);
    }
  });
}

function broadcastColliderPlaced(tile) {
  if (!wss) return;

  const message = JSON.stringify({
    type: MESSAGE_TYPES.COLLIDER_PLACED,
    collider: tile,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastColliderRemoved(tile) {
  if (!wss) return;

  const message = JSON.stringify({
    type: MESSAGE_TYPES.COLLIDER_REMOVED,
    collider: tile,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastObjectPlaced(object) {
  if (!wss) return;
  const message = JSON.stringify({
    type: MESSAGE_TYPES.OBJECT_PLACED,
    object,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastObjectRemoved(objectId) {
  if (!wss) return;
  const message = JSON.stringify({
    type: MESSAGE_TYPES.OBJECT_REMOVED,
    objectId,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Handle incoming messages
function handleMessage(client, message) {
  try {
    const data = JSON.parse(message);
    switch (data.type) {
      case MESSAGE_TYPES.JOIN:
        handleJoin(client, data);
        break;
        
      case MESSAGE_TYPES.INPUT:
        handleInput(client, data);
        break;
        
      case MESSAGE_TYPES.RESET_POSITION:
        handleResetPosition(client);
        break;
        
      case MESSAGE_TYPES.PLACE_COLLIDER:
        handlePlaceCollider(client, data);
        break;
        
      case MESSAGE_TYPES.REMOVE_COLLIDER:
        handleRemoveCollider(client, data);
        break;

      case MESSAGE_TYPES.PLACE_OBJECT:
        handlePlaceObject(client, data);
        break;

      case MESSAGE_TYPES.REMOVE_OBJECT:
        handleRemoveObject(client, data);
        break;
        
      case MESSAGE_TYPES.HUG:
        handleHug(client, data);
        break;
        
      case MESSAGE_TYPES.BENCH_SIT:
        handleBenchSit(client, data);
        break;
        
      case MESSAGE_TYPES.BENCH_STAND:
        handleBenchStand(client, data);
        break;
        
      default:
        console.warn('Unknown message type:', data.type);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
    sendError(client, 'Invalid message format');
  }
}

// Handle player join
function handleJoin(client, data) {
  const { name, character } = data;
  
  // Validate character
  const validCharacter = (character === '1' || character === '2') ? character : '1';
  
  // Check if room is full
  const connectedCount = Array.from(gameState.players.values())
    .filter(p => p.connected).length;
  
  if (connectedCount >= GAME_CONFIG.MAX_PLAYERS) {
    sendError(client, 'Room is full. Maximum 2 players allowed.');
    return;
  }
  
  // Generate or reuse player ID
  let playerId = data.playerId;
  if (!playerId || !gameState.players.has(playerId)) {
    playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Get or create player state
  let player = gameState.players.get(playerId);
  if (!player) {
    player = createPlayerState(playerId, name || 'Player', validCharacter);
    // Start at different positions for multiple players
    const existingPlayers = Array.from(gameState.players.values()).filter(p => p.connected);
    const spawnIndex = Math.min(existingPlayers.length, SPAWN_POINTS.length - 1);
    const spawn = SPAWN_POINTS[spawnIndex] || SPAWN_POINTS[SPAWN_POINTS.length - 1];
    player.x = spawn.col * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2;
    player.y = (spawn.row + 1) * GAME_CONFIG.TILE_SIZE;
  } else {
    // Reconnecting player - update name and character if provided
    player.connected = true;
    player.name = name || player.name;
    // Always update character if provided (validCharacter is always set from validation)
    player.character = validCharacter;
  }
  
  gameState.players.set(playerId, player);
  client.playerId = playerId;
  assignFollowersToPlayers();
  
  // Send welcome message
  const welcome = {
    type: MESSAGE_TYPES.WELCOME,
    playerId: playerId,
    gameState: {
      tick: gameState.tick,
      players: Array.from(gameState.players.values())
        .filter(p => p.connected)
        .map(p => ({
          id: p.id,
          name: p.name,
          character: p.character,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
        })),
      followers: Array.from(gameState.followers.values()),
      objects: Array.from(gameState.objects.values()),
      colliders: getColliders(),
    },
  };
  
  client.send(JSON.stringify(welcome));
  
  // Broadcast player joined to others
  const playerJoined = {
    type: MESSAGE_TYPES.PLAYER_JOINED,
      player: {
        id: player.id,
        name: player.name,
        character: player.character,
        x: player.x,
        y: player.y,
      },
  };
  
  broadcastToOthers(client, playerJoined);
  
  // Save state
  saveState(gameState).catch(console.error);
  
  console.log(`Player ${playerId} (${player.name}) joined with character ${player.character}. Total: ${connectedCount + 1}`);
}

// Handle player input
function handleInput(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }
  
  const player = gameState.players.get(client.playerId);
  if (!player || !player.connected) {
    sendError(client, 'Player not found');
    return;
  }
  
  // Store the last input for continuous processing during game ticks
  player.lastInput = data.input;
  
  // Save state periodically (every 10 ticks = 0.5 seconds)
  if (gameState.tick % 10 === 0) {
    saveState(gameState).catch(console.error);
  }
}

function handlePlaceCollider(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }

  const col = Number(data?.col);
  const row = Number(data?.row);

  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    sendError(client, 'Invalid collider coordinates');
    return;
  }

  const added = addColliderTile(col, row);
  if (!added) {
    return;
  }

  broadcastColliderPlaced({ col, row });
  saveColliders(getColliders()).catch(console.error);
}

function handleRemoveCollider(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }

  const col = Number(data?.col);
  const row = Number(data?.row);

  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    sendError(client, 'Invalid collider coordinates');
    return;
  }

  const removed = removeColliderTile(col, row);
  if (!removed) {
    return;
  }

  broadcastColliderRemoved({ col, row });
  saveColliders(getColliders()).catch(console.error);
}

function handlePlaceObject(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }

  const objectData = normalizeObjectData({
    x: data?.x,
    y: data?.y,
    col: data?.col,
    row: data?.row,
    imageSrc: data?.imageSrc,
    text: data?.text,
    width: data?.width,
    height: data?.height,
  });

  if (!objectData) {
    sendError(client, 'Invalid object coordinates');
    return;
  }

  if (
    objectData.x < 0 ||
    objectData.x > GAME_CONFIG.WORLD_WIDTH ||
    objectData.y < 0 ||
    objectData.y > GAME_CONFIG.WORLD_HEIGHT
  ) {
    sendError(client, 'Object coordinates out of bounds');
    return;
  }

  const overlaps = Array.from(gameState.objects.values()).some((existing) =>
    objectsOverlap(existing, objectData),
  );

  if (overlaps) {
    return;
  }

  const now = Date.now();
  objectData.createdAt = now;
  objectData.updatedAt = now;

  gameState.objects.set(objectData.id, objectData);
  addObjectCollider(objectData);

  broadcastObjectPlaced(objectData);

  saveObjects(gameState.objects).catch(console.error);
}

function handleRemoveObject(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }

  const id = typeof data?.id === 'string' ? data.id : null;
  let object = id ? gameState.objects.get(id) : null;

  if (
    !object &&
    Number.isFinite(Number(data?.x)) &&
    Number.isFinite(Number(data?.y))
  ) {
    const x = Number(data.x);
    const y = Number(data.y);
    object = Array.from(gameState.objects.values()).find(
      (entry) => pointInObject(x, y, entry),
    );
  }

  if (
    !object &&
    Number.isInteger(Number(data?.col)) &&
    Number.isInteger(Number(data?.row))
  ) {
    const col = Number(data.col);
    const row = Number(data.row);
    const x = (col + 0.5) * GAME_CONFIG.TILE_SIZE;
    const y = (row + 1) * GAME_CONFIG.TILE_SIZE;
    object = Array.from(gameState.objects.values()).find(
      (entry) => pointInObject(x, y, entry),
    );
  }

  if (!object) {
    return;
  }

  gameState.objects.delete(object.id);
  removeObjectCollider(object.id);

  broadcastObjectRemoved(object.id);

  saveObjects(gameState.objects).catch(console.error);
}

// Hug proximity threshold (in pixels)
const HUG_PROXIMITY_THRESHOLD = 60; // Players must be within 60 pixels
const HUG_DURATION = 2000; // Hug lasts 2 seconds

function handleHug(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }
  
  const player = gameState.players.get(client.playerId);
  if (!player || !player.connected) {
    return;
  }
  
  // Don't allow hugging if already hugging
  if (player.hugging) {
    return;
  }
  
  // Find the other connected player
  const otherPlayers = Array.from(gameState.players.values())
    .filter(p => p.connected && p.id !== player.id);
  
  if (otherPlayers.length === 0) {
    return; // No other player to hug
  }
  
  const otherPlayer = otherPlayers[0];
  
  // Check if players are close enough
  const dx = player.x - otherPlayer.x;
  const dy = player.y - otherPlayer.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > HUG_PROXIMITY_THRESHOLD) {
    return; // Too far away
  }
  
  // Don't allow if other player is already hugging
  if (otherPlayer.hugging) {
    return;
  }
  
  // Start hug animation for both players
  const now = Date.now();
  const hugEndTime = now + HUG_DURATION;
  
  // Synchronize Y positions (use average)
  const avgY = (player.y + otherPlayer.y) / 2;
  player.y = avgY;
  otherPlayer.y = avgY;
  
  // Set hugging state
  player.hugging = true;
  player.hugEndTime = hugEndTime;
  otherPlayer.hugging = true;
  otherPlayer.hugEndTime = hugEndTime;
  
  // Stop movement
  player.vx = 0;
  player.vy = 0;
  otherPlayer.vx = 0;
  otherPlayer.vy = 0;
  
  // Broadcast hug started
  broadcastHugStarted(player.id, otherPlayer.id);
}

function broadcastHugStarted(playerId1, playerId2) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: MESSAGE_TYPES.HUG_STARTED,
    playerId1,
    playerId2,
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastHugEnded(playerId) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: MESSAGE_TYPES.HUG_ENDED,
    playerId,
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function handleBenchSit(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }
  
  const player = gameState.players.get(client.playerId);
  if (!player || !player.connected) {
    sendError(client, 'Player not found');
    return;
  }
  
  // Check if player is already sitting
  if (player.sitting) {
    return;
  }
  
  // Bench position and seat offsets (2-seated bench)
  const BENCH_X = 2760;
  const BENCH_Y = 1511;
  const BENCH_SEAT_OFFSET = 14; // X offset for each seat
  
  // Check if player is near bench
  const dx = player.x - BENCH_X;
  const dy = player.y - BENCH_Y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 100) {
    return; // Too far from bench
  }
  
  // Count how many players are currently sitting
  let sittingCount = 0;
  for (const p of gameState.players.values()) {
    if (p.connected && p.sitting) {
      sittingCount++;
    }
  }
  
  // Check if bench is full (2 seats)
  if (sittingCount >= 2) {
    return; // Bench is full
  }
  
  // Determine which seat to use:
  // First player sits on the right (positive offset)
  // Second player sits on the left (negative offset)
  const seatOffset = sittingCount === 0 ? BENCH_SEAT_OFFSET : -BENCH_SEAT_OFFSET;
  
  // Teleport player to bench seat position
  player.x = BENCH_X + seatOffset;
  player.y = BENCH_Y;
  player.vx = 0;
  player.vy = 0;
  player.sitting = true;
  player.lastUpdate = Date.now();
  
  // Immediately broadcast updated state
  broadcastState();
}

function handleBenchStand(client, data) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }
  
  const player = gameState.players.get(client.playerId);
  if (!player || !player.connected) {
    sendError(client, 'Player not found');
    return;
  }
  
  // Check if player is sitting
  if (!player.sitting) {
    return;
  }
  
  // Stand up - move player slightly forward from bench
  const BENCH_X = 2760;
  const BENCH_Y = 1511;
  const STAND_OFFSET = 50; // Distance to stand in front of bench
  
  // Determine direction to stand (based on which side of bench they're on)
  const dx = player.x - BENCH_X;
  const standX = dx < 0 ? BENCH_X - STAND_OFFSET : BENCH_X + STAND_OFFSET;
  
  player.x = standX;
  player.y = BENCH_Y;
  player.vx = 0;
  player.vy = 0;
  player.sitting = false;
  player.lastUpdate = Date.now();
  
  // Immediately broadcast updated state
  broadcastState();
}

function handleResetPosition(client) {
  if (!client.playerId) {
    sendError(client, 'Not authenticated');
    return;
  }

  const player = gameState.players.get(client.playerId);
  if (!player || !player.connected) {
    sendError(client, 'Player not found');
    return;
  }

  player.vx = 0;
  player.vy = 0;
  player.x = 1604.97 ;
  player.y = 802.74;
  player.lastUpdate = Date.now();

  // Immediately broadcast updated state so clients snap to new position
  broadcastState();
}

// Broadcast message to all clients except sender
function broadcastToOthers(sender, message) {
  if (!wss) return;
  
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Send error message
function sendError(client, error) {
  const message = {
    type: MESSAGE_TYPES.ERROR,
    error: error,
  };
  
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

// Handle client disconnect
function handleDisconnect(client) {
  if (client.playerId) {
    const player = gameState.players.get(client.playerId);
    if (player) {
      player.connected = false;
      
      // Broadcast player left
      const playerLeft = {
        type: MESSAGE_TYPES.PLAYER_LEFT,
        playerId: client.playerId,
      };
      
      broadcastToOthers(client, playerLeft);
      assignFollowersToPlayers();
      
      // Save state on disconnect
      saveState(gameState).catch(console.error);
      
      console.log(`Player ${client.playerId} disconnected`);
    }
  }
}

// Start WebSocket server
async function startServer() {
  await initializeGame();
  await initializeColliders();
  await initializeObjects();
  initializeFollowers();
  assignFollowersToPlayers();
  
  wss = new WebSocketServer({ port: PORT });
  
  wss.on('error', (error) => {
    if (error.code === 'EACCES') {
      console.error(`\nError: Permission denied on port ${PORT}`);
      console.error('This port may require elevated permissions or is already in use.');
      console.error(`Try using a different port: PORT=3001 npm start\n`);
    } else if (error.code === 'EADDRINUSE') {
      console.error(`\nError: Port ${PORT} is already in use.`);
      console.error(`Try using a different port: PORT=3001 npm start\n`);
    } else {
      console.error('WebSocket server error:', error);
    }
    process.exit(1);
  });
  
  wss.on('connection', (client) => {
    console.log('Client connected');
    
    client.on('message', (message) => {
      handleMessage(client, message);
    });
    
    client.on('close', () => {
      handleDisconnect(client);
    });
    
    client.on('error', (error) => {
      console.error('WebSocket client error:', error);
    });
  });
  
  // Start game loop
  setInterval(gameTick, GAME_CONFIG.TICK_INTERVAL);
  
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Game tick rate: ${GAME_CONFIG.TICK_RATE} TPS`);
  console.log(`Connect clients to: ws://localhost:${PORT}`);
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, saving state...');
  await saveState(gameState);
  await saveColliders(getColliders());
  await saveObjects(gameState.objects);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, saving state...');
  await saveState(gameState);
  await saveColliders(getColliders());
  await saveObjects(gameState.objects);
  process.exit(0);
});

startServer().catch(console.error);

