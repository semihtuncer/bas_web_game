import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, 'game-state.json');
const COLLIDERS_FILE = path.join(__dirname, 'colliders.json');
const OBJECTS_FILE = path.join(__dirname, 'display-objects.json');

// Load game state from disk
export async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return null
      return null;
    }
    console.error('Error loading state:', error);
    return null;
  }
}

// Save game state to disk
export async function saveState(gameState) {
  try {
    // Convert Map to object for JSON serialization
    const players = {};
    for (const [id, player] of gameState.players.entries()) {
      players[id] = {
        id: player.id,
        name: player.name,
        character: player.character,
        x: player.x,
        y: player.y,
        // Don't save velocity or connection state
      };
    }
    
    const state = {
      players: players,
      lastSaved: Date.now(),
    };
    
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

export async function loadColliders() {
  try {
    const data = await fs.readFile(COLLIDERS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.colliders)) {
      return parsed.colliders;
    }
    return [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading colliders:', error);
    return [];
  }
}

export async function saveColliders(colliders) {
  try {
    const payload = {
      colliders: Array.isArray(colliders) ? colliders : [],
      lastSaved: Date.now(),
    };
    await fs.writeFile(COLLIDERS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving colliders:', error);
  }
}

export async function loadObjects() {
  try {
    const data = await fs.readFile(OBJECTS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.objects)) {
      return parsed.objects;
    }
    return [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading display objects:', error);
    return [];
  }
}

export async function saveObjects(objects) {
  try {
    const list = Array.isArray(objects)
      ? objects
      : Array.from(objects.values ? objects.values() : []);
    const payload = {
      objects: list,
      lastSaved: Date.now(),
    };
    await fs.writeFile(OBJECTS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving display objects:', error);
  }
}

