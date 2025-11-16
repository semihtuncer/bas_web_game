// Sprite loading and animation system

export class SpriteManager {
  constructor() {
    this.sprites = new Map();
    this.loaded = false;
  }
  
  // Load a sprite sheet (non-blocking if sprite is optional)
  async loadSprite(name, path, { required = false } = {}) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.sprites.set(name, img);
        resolve(img);
      };
      img.onerror = () => {
        const message = `Sprite "${name}" failed to load from ${path}`;
        if (required) {
          console.error(message);
        } else {
          console.warn(message);
        }
        resolve(null);
      };
      img.src = path;
    });
  }
  
  // Load all sprites (characters + tiles)
  async loadAll() {
    const loads = [
      // Character sprites (optional, fallback shapes will be used if missing)
      this.loadSprite('character1_idle', 'assets/character1_idle.png'),
      this.loadSprite('character1_walk', 'assets/character1_walk.png'),
      this.loadSprite('character1_hug', 'assets/character1_hug.png'),
      this.loadSprite('character1_sit', 'assets/character1_sit.png'),
      this.loadSprite('character2_idle', 'assets/character2_idle.png'),
      this.loadSprite('character2_walk', 'assets/character2_walk.png'),
      this.loadSprite('character2_hug', 'assets/character2_hug.png'),
      this.loadSprite('character2_sit', 'assets/character2_sit.png'),
      this.loadSprite('map_background', 'assets/map.png'),
      this.loadSprite('follower_buggy_idle', 'assets/Buggy_idle.png'),
      this.loadSprite('follower_buggy_walk', 'assets/Buggy_walk.png'),
      this.loadSprite('follower_buggy', 'assets/Buggy.png'),
      this.loadSprite('pillar', 'assets/pillar.png'),
      this.loadSprite('bench', 'assets/bench.png'),
    ];
    
    await Promise.all(loads);
    this.loaded = true;
    console.log('All sprites loaded');
  }
  
  // Get sprite by name
  getSprite(name) {
    return this.sprites.get(name);
  }
  
  // Get sprite name for character and animation
  getSpriteName(character, animation) {
    return `character${character}_${animation}`;
  }

  getFollowerSpriteName(spriteKey, animation) {
    if (animation) {
      const key = `follower_${spriteKey}_${animation}`;
      if (this.sprites.has(key)) {
        return key;
      }
    }
    const fallback = `follower_${spriteKey}`;
    return this.sprites.has(fallback) ? fallback : null;
  }
}

// Animation configuration
export const ANIMATION_CONFIG = {
  IDLE: 'idle',
  WALK: 'walk',
  HUG: 'hug',
  SIT: 'sit',
  
  // Animation frame counts (assuming sprite sheets)
  FRAMES: {
    idle: 2, // Single frame or sprite sheet with frames
    walk: 2, // 4 frames for walk animation
    hug: 2, // Hug animation frames
    sit: 1, // Sit animation frames (fallback to idle if not available)
  },
  
  // Animation speeds (frames per second)
  SPEED: {
    idle: 2,
    walk: 4,
    hug: 3, // Hug animation speed
    sit: 2, // Sit animation speed
  },
};

