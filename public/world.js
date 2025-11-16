// World state and player management

import { OBJECT_WIDTH_PX, OBJECT_HEIGHT_PX } from './worldMap.js';

export class World {
  constructor() {
    this.players = new Map();
    this.tick = 0;
    this.lastServerTick = 0;
    this.serverTimestamp = 0;
    this.colliders = new Map();
    this.followers = new Map();
    this.objects = new Map();
  }

  tileKey(col, row) {
    return `${col},${row}`;
  }

  setColliders(colliders = []) {
    this.colliders.clear();
    colliders.forEach(({ col, row }) => {
      if (Number.isFinite(col) && Number.isFinite(row)) {
        this.colliders.set(this.tileKey(col, row), { col, row });
      }
    });
  }

  addCollider(tile) {
    if (tile && Number.isFinite(tile.col) && Number.isFinite(tile.row)) {
      this.colliders.set(this.tileKey(tile.col, tile.row), { col: tile.col, row: tile.row });
    }
  }

  removeCollider(tile) {
    if (!tile) return;
    const key = this.tileKey(tile.col, tile.row);
    this.colliders.delete(key);
  }

  getColliders() {
    return Array.from(this.colliders.values());
  }

  hasCollider(col, row) {
    return this.colliders.has(this.tileKey(col, row));
  }

  setObjects(objects = []) {
    this.objects.clear();
    objects.forEach((object) => this.addObject(object));
  }

  addObject(object) {
    if (!object || !object.id) return;
    const width = Number.isFinite(object.width) ? object.width : OBJECT_WIDTH_PX;
    const height = Number.isFinite(object.height) ? object.height : OBJECT_HEIGHT_PX;
    const copy = {
      id: object.id,
      x: Number(object.x) || 0,
      y: Number(object.y) || 0,
      width,
      height,
      imageSrc: object.imageSrc || '',
      text: object.text || '',
      createdAt: object.createdAt || Date.now(),
      updatedAt: object.updatedAt || Date.now(),
    };
    this.objects.set(copy.id, copy);
  }

  removeObject(id) {
    this.objects.delete(id);
  }

  getObjects() {
    return Array.from(this.objects.values());
  }

  getObjectAtPosition(x, y) {
    for (const object of this.objects.values()) {
      const width = Number.isFinite(object.width) ? object.width : OBJECT_WIDTH_PX;
      const height = Number.isFinite(object.height) ? object.height : OBJECT_HEIGHT_PX;
      const left = object.x - width / 2;
      const right = left + width;
      const top = object.y - height;
      const bottom = object.y;
      if (x >= left && x <= right && y >= top && y <= bottom) {
        return object;
      }
    }
    return null;
  }

  setFollowers(followers = []) {
    this.followers.clear();
    followers.forEach((follower) => {
      if (!follower || !follower.id) return;
      this.followers.set(follower.id, { ...follower });
    });
  }

  updateFollower(follower) {
    if (!follower || !follower.id) return;
    this.followers.set(follower.id, { ...follower });
  }

  getFollowers() {
    return Array.from(this.followers.values());
  }
  
  // Update player from server state
  updatePlayer(playerData) {
    const existing = this.players.get(playerData.id);
    
    if (existing) {
      // Update existing player
      existing.serverX = playerData.x;
      existing.serverY = playerData.y;
      existing.serverVx = playerData.vx;
      existing.serverVy = playerData.vy;
      existing.hugging = playerData.hugging || false;
      existing.hugEndTime = playerData.hugEndTime || 0;
      existing.sitting = playerData.sitting || false;
      // Always update character from server if provided
      if (playerData.character !== undefined && playerData.character !== null) {
        existing.character = playerData.character;
      }
      existing.lastServerUpdate = Date.now();
      
      // Store server state for interpolation
      if (!existing.interpolationStart) {
        existing.interpolationStart = {
          x: existing.renderX || existing.serverX,
          y: existing.renderY || existing.serverY,
          time: Date.now(),
        };
      }
    } else {
      // Create new player
      this.players.set(playerData.id, {
        id: playerData.id,
        name: playerData.name,
        character: playerData.character || '1',
        serverX: playerData.x,
        serverY: playerData.y,
        serverVx: playerData.vx,
        serverVy: playerData.vy,
        renderX: playerData.x,
        renderY: playerData.y,
        hugging: playerData.hugging || false,
        hugEndTime: playerData.hugEndTime || 0,
        sitting: playerData.sitting || false,
        lastServerUpdate: Date.now(),
        interpolationStart: null,
      });
    }
  }
  
  // Remove player
  removePlayer(playerId) {
    this.players.delete(playerId);
  }
  
  // Get player by ID
  getPlayer(playerId) {
    return this.players.get(playerId);
  }
  
  // Get all players
  getAllPlayers() {
    return Array.from(this.players.values());
  }
  
  // Update world state from server message
  updateFromServer(message) {
    this.tick = message.tick;
    this.serverTimestamp = message.timestamp;
    
    // Update all players
    if (message.players) {
      message.players.forEach(playerData => {
        this.updatePlayer(playerData);
      });
    }

    if (Array.isArray(message.colliders)) {
      this.setColliders(message.colliders);
    }

    if (Array.isArray(message.followers)) {
      this.setFollowers(message.followers);
    }

    if (Array.isArray(message.objects)) {
      this.setObjects(message.objects);
    }
  }
}

