// Rendering with interpolation for smooth movement

import { SpriteManager, ANIMATION_CONFIG } from './assets/sprites.js';
import {
  WORLD_MAP,
  TILE_DEFINITIONS,
  DEFAULT_TILE,
  COLLIDER_TILE_SIZE,
  CHARACTER_SPRITE_SIZE,
  FOLLOWER_SPRITE_SIZE,
  FOLLOWER_FRAME_SIZE,
  OBJECT_WIDTH_PX,
  OBJECT_HEIGHT_PX,
  MAP_COLS,
  MAP_ROWS,
} from './worldMap.js';

const BASE_VIEWPORT_TILES_W = 100;
const BASE_VIEWPORT_TILES_H = 50;
const MIN_VIEWPORT_TILES_W = 8;
const MIN_VIEWPORT_TILES_H = 6;
const DEFAULT_ZOOM_LEVEL = 2.4;
const MAP_BACKGROUND_SCALE = 1.3;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.world = null;
    this.myPlayerId = null;
    this.spriteManager = new SpriteManager();
    this.mapBackground = null;
    this.objectImageCache = new Map();
    
    // Map configuration
    this.tileSize = COLLIDER_TILE_SIZE;
    this.mapWidth = MAP_COLS * COLLIDER_TILE_SIZE;
    this.mapHeight = MAP_ROWS * COLLIDER_TILE_SIZE;
    this.zoomLevel = DEFAULT_ZOOM_LEVEL;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.camera = { x: 0, y: 0 };
    
    // Interpolation settings
    this.interpolationDelay = 20; // ms to delay rendering for interpolation
    this.scale = 1; // Pixel art scale
    
    // Animation state
    this.animationTime = 0;
    
    // Heart particles system
    this.heartParticles = [];
    this.lastParticleSpawn = 0;
    this.particleSpawnInterval = 300; // Spawn a particle every 300ms
    
    // Player sprite dimensions
    this.spriteWidth = CHARACTER_SPRITE_SIZE;
    this.spriteHeight = CHARACTER_SPRITE_SIZE;
    this.followerSize = FOLLOWER_SPRITE_SIZE;
    this.objectBaseWidth = OBJECT_WIDTH_PX;
    this.objectBaseHeight = OBJECT_HEIGHT_PX;
    
    // Resize canvas
    this.updateMapDimensions();
    this.updateViewportSize(window.innerWidth, window.innerHeight);
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }
  
  // Load all sprites
  async loadSprites() {
    await this.spriteManager.loadAll();
    this.mapBackground = this.spriteManager.getSprite('map_background') || null;
    this.updateMapDimensions();
    this.updateViewportSize(window.innerWidth, window.innerHeight);
    this.resizeCanvas();
  }

  updateMapDimensions() {
    const backgroundWidth = this.mapBackground?.width ?? 0;
    const backgroundHeight = this.mapBackground?.height ?? 0;

    const scaledBackgroundWidth = backgroundWidth * MAP_BACKGROUND_SCALE;
    const scaledBackgroundHeight = backgroundHeight * MAP_BACKGROUND_SCALE;

    this.mapWidth = Math.max(MAP_COLS * this.tileSize, scaledBackgroundWidth);
    this.mapHeight = Math.max(MAP_ROWS * this.tileSize, scaledBackgroundHeight);
  }

  updateViewportSize(availableWidth, availableHeight) {
    const maxTilesWide = Math.max(1, Math.floor(this.mapWidth / this.tileSize));
    const maxTilesHigh = Math.max(1, Math.floor(this.mapHeight / this.tileSize));

    const defaultTilesWide = Math.max(MIN_VIEWPORT_TILES_W, Math.round(BASE_VIEWPORT_TILES_W / this.zoomLevel));
    const defaultTilesHigh = Math.max(MIN_VIEWPORT_TILES_H, Math.round(BASE_VIEWPORT_TILES_H / this.zoomLevel));

    const targetRatio = (availableWidth && availableHeight)
      ? availableWidth / availableHeight
      : defaultTilesWide / defaultTilesHigh;

    let tilesHigh = Math.min(maxTilesHigh, defaultTilesHigh);
    let tilesWide = Math.round(tilesHigh * targetRatio);

    if (tilesWide < MIN_VIEWPORT_TILES_W) {
      tilesWide = MIN_VIEWPORT_TILES_W;
      tilesHigh = Math.round(tilesWide / targetRatio);
    }

    if (tilesWide > maxTilesWide) {
      tilesWide = maxTilesWide;
      tilesHigh = Math.round(tilesWide / targetRatio);
    }

    tilesHigh = Math.min(maxTilesHigh, Math.max(MIN_VIEWPORT_TILES_H, tilesHigh));
    tilesWide = Math.min(maxTilesWide, Math.max(MIN_VIEWPORT_TILES_W, tilesWide));

    this.viewportWidth = tilesWide * this.tileSize;
    this.viewportHeight = tilesHigh * this.tileSize;
  }

  resizeCanvas() {
    const availableWidth = window.innerWidth ?? (this.viewportWidth || this.mapWidth);
    const availableHeight = window.innerHeight ?? (this.viewportHeight || this.mapHeight);

    this.updateViewportSize(availableWidth, availableHeight);

    const widthPixels = this.viewportWidth || this.mapWidth;
    const heightPixels = this.viewportHeight || this.mapHeight;

    const scaleX = availableWidth / widthPixels;
    const scaleY = availableHeight / heightPixels;
    const scale = Math.min(scaleX, scaleY);

    this.scale = Number.isFinite(scale) && scale > 0 ? scale : 1;

    this.canvas.width = widthPixels;
    this.canvas.height = heightPixels;
    this.canvas.style.width = `${availableWidth}px`;
    this.canvas.style.height = `${availableHeight}px`;
    this.canvas.style.imageRendering = 'pixelated';
    this.ctx.imageSmoothingEnabled = false;
  }
  
  setWorld(world) {
    this.world = world;
  }
  
  setMyPlayerId(playerId) {
    this.myPlayerId = playerId;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    return {
      x: canvasX + this.camera.x,
      y: canvasY + this.camera.y,
    };
  }
  
  // Interpolate between two positions
  interpolate(start, end, startTime, endTime, currentTime) {
    const elapsed = currentTime - startTime;
    const duration = endTime - startTime;
    
    if (duration <= 0) return end;
    
    const t = Math.min(1, elapsed / duration);
    return start + (end - start) * t;
  }
  
  // Update render positions with interpolation
  updateRenderPositions() {
    const now = Date.now();
    const renderTime = now - this.interpolationDelay;
    
    this.world.getAllPlayers().forEach(player => {
      if (!player.interpolationStart) {
        player.renderX = player.serverX;
        player.renderY = player.serverY;
        return;
      }
      
      // Interpolate position
      const targetTime = player.lastServerUpdate - this.interpolationDelay;
      
      if (renderTime >= targetTime) {
        // We've caught up, use server position
        player.renderX = player.serverX;
        player.renderY = player.serverY;
        player.interpolationStart = null;
      } else {
        // Interpolate
        const startTime = player.interpolationStart.time;
        player.renderX = this.interpolate(
          player.interpolationStart.x,
          player.serverX,
          startTime,
          targetTime,
          renderTime
        );
        player.renderY = this.interpolate(
          player.interpolationStart.y,
          player.serverY,
          startTime,
          targetTime,
          renderTime
        );
      }
    });
  }
  
  // Get current animation for player
  getPlayerAnimation(player) {
    // Check if player is sitting
    if (player.sitting) {
      return ANIMATION_CONFIG.SIT;
    }
    // Check if player is hugging
    if (player.hugging) {
      return ANIMATION_CONFIG.HUG;
    }
    // Check if player is moving
    const isMoving = (player.serverVx !== 0 || player.serverVy !== 0);
    return isMoving ? ANIMATION_CONFIG.WALK : ANIMATION_CONFIG.IDLE;
  }
  
  // Get current animation frame
  getAnimationFrame(animation, time, player = null) {
    const frameCount = ANIMATION_CONFIG.FRAMES[animation] || 1;
    const speed = ANIMATION_CONFIG.SPEED[animation] || 1;
    const frameTime = 1000 / speed; // milliseconds per frame
    
    // Special handling for hug animation - play once then stay on last frame
    if (animation === ANIMATION_CONFIG.HUG && player && player.hugging && player.hugEndTime) {
      const HUG_DURATION = 2000; // 2 seconds
      const hugStartTime = player.hugEndTime - HUG_DURATION;
      const elapsed = Date.now() - hugStartTime;
      const animationDuration = frameCount * frameTime;
      
      // If animation has completed, stay on last frame
      if (elapsed >= animationDuration) {
        return frameCount - 1;
      }
      // Otherwise, play through normally
      return Math.floor((elapsed / frameTime) % frameCount);
    }
    
    // Default: loop the animation
    const frame = Math.floor((time / frameTime) % frameCount);
    return frame;
  }
  
  // Render a player
  renderPlayer(player, flipHorizontal = false) {
    const x = Math.round(player.renderX);
    const y = Math.round(player.renderY);
    // Draw shadow ellipse under player (before sprite)
    this.ctx.save();
    this.ctx.globalAlpha = 0.2; // Low alpha for shadow
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    // Ellipse shadow: wider than tall, positioned at player's feet
    this.ctx.ellipse(x+0.5, y-2, this.spriteWidth * 0.25, this.spriteWidth * 0.08, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    // Get character and animation
    const character = player.character || '1';
    const animation = this.getPlayerAnimation(player);
    const frame = this.getAnimationFrame(animation, this.animationTime, player);
    
    // Get sprite name
    let spriteName = this.spriteManager.getSpriteName(character, animation);
    let sprite = this.spriteManager.getSprite(spriteName);
    
    // Fallback to idle if sit sprite doesn't exist
    if (!sprite && animation === ANIMATION_CONFIG.SIT) {
      spriteName = this.spriteManager.getSpriteName(character, ANIMATION_CONFIG.IDLE);
      sprite = this.spriteManager.getSprite(spriteName);
    }
    
    if (sprite) {
      // Calculate sprite sheet position (assuming horizontal sprite sheet)
      const frameWidth = sprite.width / ANIMATION_CONFIG.FRAMES[animation];
      const sx = frame * frameWidth;
      const sy = 0;
      
      // Save context for flipping
      this.ctx.save();
      
      if (flipHorizontal) {
        // Flip horizontally around the player's X position
        this.ctx.translate(x, 0);
        this.ctx.scale(-1, 1);
        this.ctx.translate(-x, 0);
      }
      
      // Draw sprite with bottom anchor (bottom center of sprite at player position)
      this.ctx.drawImage(
        sprite,
        sx, sy, frameWidth, this.spriteHeight, // Source rectangle
        x - this.spriteWidth / 2, y - this.spriteHeight, // Destination position (bottom anchor)
        this.spriteWidth, this.spriteHeight // Destination size
      );
      
      // Restore context
      this.ctx.restore();
    } else {
      // Fallback: draw colored rectangle if sprite not loaded (also bottom anchored)
      this.ctx.save();
      
      if (flipHorizontal) {
        // Flip horizontally around the player's X position
        this.ctx.translate(x, 0);
        this.ctx.scale(-1, 1);
        this.ctx.translate(-x, 0);
      }
      
      const colorHex = character === '1' ? '#00ff00' : '#ff0000';
      this.ctx.fillStyle = colorHex;
      this.ctx.fillRect(x - this.spriteWidth / 2, y - this.spriteHeight, this.spriteWidth, this.spriteHeight);
      
      this.ctx.restore();
    }
    
    // Draw name label above sprite
    if (player.name) {
      this.ctx.fillStyle = '#ffffffb3';
      this.ctx.font = '8px monospace';
      this.ctx.textAlign = 'center';
      // Position name above the sprite (sprite is bottom anchored)
      this.ctx.fillText(player.character === '1' ? 'Badem' : 'Semih', x, y - this.spriteHeight - 2);
    }
  }
  
  // Render layers - lower number = bottom layer, higher number = top layer
  static RENDER_LAYERS = {
    BACKGROUND: 0,
    COLLIDERS: 1,
    OBJECTS: 2,
    GRID: 3,
    FOLLOWERS: 4,
    PLAYERS: 5,
    HEART_PARTICLES: 6,
    OBJECT_PREVIEWS: 7,
    UI: 8,
  };
  
  updateCamera() {
    if (!this.world || !this.myPlayerId) return;
    const player = this.world.getPlayer(this.myPlayerId);
    if (!player) return;

    const px = Number.isFinite(player.renderX) ? player.renderX : player.serverX;
    const pyFeet = Number.isFinite(player.renderY) ? player.renderY : player.serverY;
    if (!Number.isFinite(px) || !Number.isFinite(pyFeet)) return;

    const py = pyFeet - this.spriteHeight / 2;
    const halfWidth = this.viewportWidth / 2;
    const halfHeight = this.viewportHeight / 2;

    const maxCameraX = Math.max(0, this.mapWidth - this.viewportWidth);
    const maxCameraY = Math.max(0, this.mapHeight - this.viewportHeight) + 15;

    const targetX = px - halfWidth;
    const targetY = py - halfHeight;

    this.camera.x = Math.max(0, Math.min(targetX, maxCameraX));
    this.camera.y = Math.max(0, Math.min(targetY, maxCameraY));
  }

  getVisibleTileRange() {
    const startCol = Math.max(0, Math.floor(this.camera.x / this.tileSize) - 1);
    const startRow = Math.max(0, Math.floor(this.camera.y / this.tileSize) - 1);
    const endCol = Math.min(MAP_COLS, Math.ceil((this.camera.x + this.viewportWidth) / this.tileSize) + 1);
    const endRow = Math.min(MAP_ROWS, Math.ceil((this.camera.y + this.viewportHeight) / this.tileSize) + 1);
    return { startCol, endCol, startRow, endRow };
  }
  
  // Main render loop with proper layer ordering
  render() {
    // Update animation time
    this.animationTime = (this.animationTime + 16) % 1000000; // Reset every ~16 seconds to prevent overflow
    
    // Clear canvas
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (!this.world) return;
    
    // Update interpolated positions before camera so camera uses latest state
    this.updateRenderPositions();
    
    this.updateCamera();

    const cameraX = Math.round(this.camera.x);
    const cameraY = Math.round(this.camera.y);

    this.ctx.save();
    this.ctx.translate(-cameraX, -cameraY);

    // Render in layer order: bottom to top (world-space layers)
    this.renderLayer(Renderer.RENDER_LAYERS.BACKGROUND);
    this.renderLayer(Renderer.RENDER_LAYERS.COLLIDERS);
    this.renderLayer(Renderer.RENDER_LAYERS.OBJECTS);
    this.renderLayer(Renderer.RENDER_LAYERS.GRID);
    this.renderLayer(Renderer.RENDER_LAYERS.FOLLOWERS);
    this.renderLayer(Renderer.RENDER_LAYERS.PLAYERS);
    this.renderLayer(Renderer.RENDER_LAYERS.HEART_PARTICLES);
    this.renderLayer(Renderer.RENDER_LAYERS.OBJECT_PREVIEWS);

    this.ctx.restore();

    // UI layer (screen-space)
    this.renderLayer(Renderer.RENDER_LAYERS.UI);
  }
  
  // Render a specific layer
  renderLayer(layer) {
    switch (layer) {
      case Renderer.RENDER_LAYERS.BACKGROUND:
        this.renderBackground();
        break;

      case Renderer.RENDER_LAYERS.COLLIDERS:
        this.renderColliders();
        break;

      case Renderer.RENDER_LAYERS.OBJECTS:
        this.renderObjects();
        this.renderBench();
        break;
        
      case Renderer.RENDER_LAYERS.FOLLOWERS:
        this.renderFollowers();
        break;
        
      case Renderer.RENDER_LAYERS.GRID:
        // this.drawGrid();
        break;
        
      case Renderer.RENDER_LAYERS.PLAYERS:
        // Players layer
        // Render all players
        const players = this.world.getAllPlayers();
        // Check if any players are hugging
        const huggingPlayers = players.filter(p => p.hugging);
        let rightmostPlayer = null;
        let rightmostX = -Infinity;
        
        // Only find rightmost player if there are hugging players
        if (huggingPlayers.length > 0) {
          huggingPlayers.forEach(player => {
            const playerX = player.renderX || player.serverX || 0;
            if (playerX > rightmostX) {
              rightmostX = playerX;
              rightmostPlayer = player;
            }
          });
        }
        
        // Render all players, flipping the rightmost one only during hug
        players.forEach(player => {
          const isRightmost = huggingPlayers.length > 0 && rightmostPlayer && player.id === rightmostPlayer.id;
          this.renderPlayer(player, isRightmost);
        });
        break;
        
      case Renderer.RENDER_LAYERS.HEART_PARTICLES:
        // Heart particles - render above players
        this.updateHeartParticles();
        this.renderHeartParticles();
        break;
        
      case Renderer.RENDER_LAYERS.OBJECT_PREVIEWS:
        // Object preview images - render on top of players
        this.renderObjectPreviews();
        break;
        
      case Renderer.RENDER_LAYERS.UI:
        // UI layer - interaction hint is handled via HTML element
        break;
    }
  }
  
  // Draw a simple grid
  drawGrid() {
    this.ctx.strokeStyle = '#2a2a3e';
    this.ctx.lineWidth = 1;
    
    const { startCol, endCol, startRow, endRow } = this.getVisibleTileRange();
    
    for (let col = startCol; col <= endCol; col++) {
      const x = col * this.tileSize;
      this.ctx.beginPath();
      this.ctx.moveTo(x, startRow * this.tileSize);
      this.ctx.lineTo(x, endRow * this.tileSize);
      this.ctx.stroke();
    }
    
    for (let row = startRow; row <= endRow; row++) {
      const y = row * this.tileSize;
      this.ctx.beginPath();
      this.ctx.moveTo(startCol * this.tileSize, y);
      this.ctx.lineTo(endCol * this.tileSize, y);
      this.ctx.stroke();
    }
  }
  
  // Get tile character at map coordinates (with bounds checking)
  getTileCharAt(col, row) {
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) {
      return null;
    }
    return WORLD_MAP[row][col];
  }

  renderBackground() {
    const { startCol, endCol, startRow, endRow } = this.getVisibleTileRange();

    if (this.mapBackground) {
      const width = this.mapBackground.width * MAP_BACKGROUND_SCALE;
      const height = this.mapBackground.height * MAP_BACKGROUND_SCALE;
      this.ctx.drawImage(
        this.mapBackground,
        0,
        0,
        this.mapBackground.width,
        this.mapBackground.height,
        0,
        0,
        width,
        height,
      );
    }

    for (let row = startRow; row < endRow; row++) {
      const line = WORLD_MAP[row];
      for (let col = startCol; col < endCol; col++) {
        const tileChar = line[col];
        const tileDef = TILE_DEFINITIONS[tileChar] || DEFAULT_TILE;
        const dx = col * this.tileSize;
        const dy = row * this.tileSize;
        const sprite = tileDef.sprite ? this.spriteManager.getSprite(tileDef.sprite) : null;

        if (sprite) {
          this.ctx.drawImage(sprite, dx, dy, this.tileSize, this.tileSize);
        } else {
          this.ctx.fillStyle = tileDef.color || DEFAULT_TILE.color;
          this.ctx.fillRect(dx, dy, this.tileSize, this.tileSize);
        }
      }
    }
  }

  renderColliders() {
    if (!this.world || typeof this.world.getColliders !== 'function') {
      return;
    }

    const colliders = this.world.getColliders();
    if (!colliders || colliders.length === 0) {
      return;
    }

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(199, 26, 26, 0)';

    colliders.forEach(({ col, row }) => {
      const dx = col * this.tileSize;
      const dy = row * this.tileSize;
      this.ctx.fillRect(dx, dy, this.tileSize, this.tileSize);
    });

    this.ctx.restore();
  }

  renderObjects() {
    if (!this.world || typeof this.world.getObjects !== 'function') {
      return;
    }

    const objects = [...this.world.getObjects()];
    if (!objects || objects.length === 0) {
      return;
    }

    objects
      .sort((a, b) => (a.y || 0) - (b.y || 0))
      .forEach((object) => this.renderObject(object));
  }
  
  renderBench() {
    const benchX = 2760;
    const benchY = 1511;
    const benchSprite = this.spriteManager.getSprite('bench');
    const BENCH_SCALE = 2.4;
    
    if (!benchSprite) return;
    
    // Get sprite dimensions and scale by 2.5
    const benchWidth = (benchSprite.width || 64) * BENCH_SCALE;
    const benchHeight = (benchSprite.height || 32) * BENCH_SCALE;
    
    // Calculate position (benchY is the bottom of the bench, like other objects)
    const spriteX = Math.round(benchX - benchWidth / 2);
    const spriteY = Math.round(benchY - benchHeight);
    
    // Draw shadow
    this.ctx.save();
    this.ctx.globalAlpha = 0.22;
    this.ctx.fillStyle = '#000000';
    const shadowWidth = benchWidth * 0.6;
    const shadowHeight = benchHeight * 0.16;
    this.ctx.beginPath();
    this.ctx.ellipse(benchX, benchY - benchHeight * 0.1, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    
    // Draw bench sprite
    this.ctx.drawImage(benchSprite, spriteX, spriteY, benchWidth, benchHeight);
  }
  
  renderObjectPreviews() {
    if (!this.world || typeof this.world.getObjects !== 'function') {
      return;
    }

    const objects = [...this.world.getObjects()];
    if (!objects || objects.length === 0) {
      return;
    }

    // Get the closest interactable object to highlight it
    const closestObject = this.getClosestInteractableObject();

    objects.forEach((object) => {
      const centerX = Number.isFinite(object.x) ? object.x : 0;
      const baseY = Number.isFinite(object.y) ? object.y : 0;
      const spriteWidth = Number.isFinite(object.width) ? object.width : this.objectBaseWidth;
      const spriteHeight = Number.isFinite(object.height) ? object.height : this.objectBaseHeight;
      const spriteY = Math.round(baseY - spriteHeight);

      const image = this.getObjectImage(object.imageSrc);
      if (!image) return;

      // Check if this is the closest interactable object
      const isClosest = closestObject && closestObject.id === object.id;
      const basePreviewSize = Math.max(spriteWidth * 0.4, this.tileSize);
      const previewSize = isClosest ? basePreviewSize * 2.5 : basePreviewSize; // Make closest object 1.5x bigger
      
      const basePreviewY = spriteY - previewSize + this.tileSize * 2;
      
      // Floating animation using sine wave
      const floatSpeed = 0.001; // Animation speed
      const floatAmplitude = 4; // Pixels to float up and down
      const floatOffset = Math.sin(this.animationTime * floatSpeed) * floatAmplitude - 3;
      const previewY = basePreviewY + floatOffset;

      this.ctx.save();

      const aspect = image.width / image.height || 1;
      let drawWidth = previewSize;
      let drawHeight = drawWidth / aspect;
      if (drawHeight > previewSize) {
        drawHeight = previewSize;
        drawWidth = drawHeight * aspect;
      }
      const drawX = centerX - drawWidth / 2;
      const drawY = previewY + (previewSize - drawHeight) / 2;
      
      // Enable smooth rendering for preview image
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      // Restore pixel art rendering for other elements
      this.ctx.imageSmoothingEnabled = false;
      
      this.ctx.restore();
    });
  }

  renderObject(object) {
    const centerX = Number.isFinite(object.x) ? object.x : 0;
    const baseY = Number.isFinite(object.y) ? object.y : 0;

    const spriteWidth = Number.isFinite(object.width) ? object.width : this.objectBaseWidth;
    const spriteHeight = Number.isFinite(object.height) ? object.height : this.objectBaseHeight;
    const spriteX = Math.round(centerX - spriteWidth / 2);
    const spriteY = Math.round(baseY - spriteHeight);

    this.ctx.save();
    this.ctx.globalAlpha = 0.22;
    this.ctx.fillStyle = '#000000';
    const shadowWidth = spriteWidth * 0.35;
    const shadowHeight = spriteHeight * 0.16;
    this.ctx.beginPath();
    this.ctx.ellipse(centerX, baseY - spriteHeight * 0.1, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Draw pillar base sprite
    const pillarSprite = this.spriteManager.getSprite('pillar');
    if (pillarSprite) {
      this.ctx.drawImage(pillarSprite, spriteX, spriteY, spriteWidth, spriteHeight);
    } else {
      // Fallback to colored rectangle if pillar sprite not loaded
      this.ctx.save();
      this.ctx.fillStyle = '#5c4c3a';
      this.ctx.fillRect(spriteX, spriteY, spriteWidth, spriteHeight);
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = '#352a1f';
      this.ctx.strokeRect(spriteX, spriteY, spriteWidth, spriteHeight);
      this.ctx.restore();
    }
  }

  getObjectImage(src) {
    if (!src) return null;
    let entry = this.objectImageCache.get(src);
    if (!entry) {
      const img = new Image();
      entry = { img, loaded: false, error: false };
      img.onload = () => {
        entry.loaded = true;
      };
      img.onerror = () => {
        entry.error = true;
      };
      img.src = src;
      this.objectImageCache.set(src, entry);
    }
    if (entry.error || !entry.loaded) {
      return null;
    }
    return entry.img;
  }

  getNearestPlayerDistance(x, y) {
    if (!this.world || typeof this.world.getAllPlayers !== 'function') {
      return Infinity;
    }
    let closest = Infinity;
    this.world.getAllPlayers().forEach((player) => {
      const px = Number.isFinite(player.renderX) ? player.renderX : player.serverX;
      const py = Number.isFinite(player.renderY) ? player.renderY : player.serverY;
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        return;
      }
      const dx = px - x;
      const dy = py - y;
      const distance = Math.hypot(dx, dy);
      if (distance < closest) {
        closest = distance;
      }
    });
    return closest;
  }
  
  // Check if player is near the bench
  isNearBench() {
    if (!this.world || !this.myPlayerId || typeof this.world.getPlayer !== 'function') {
      return false;
    }
    
    const player = this.world.getPlayer(this.myPlayerId);
    if (!player) return false;
    
    const px = Number.isFinite(player.renderX) ? player.renderX : player.serverX;
    const py = Number.isFinite(player.renderY) ? player.renderY : player.serverY;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return false;
    }
    
    const BENCH_X = 2760;
    const BENCH_Y = 1511;
    const BENCH_INTERACTION_DISTANCE = 100; // Distance to interact with bench
    
    const dx = px - BENCH_X;
    const dy = py - BENCH_Y;
    const distance = Math.hypot(dx, dy);
    
    return distance < BENCH_INTERACTION_DISTANCE;
  }
  
  // Find the closest object to the current player
  getClosestInteractableObject() {
    if (!this.world || !this.myPlayerId || typeof this.world.getPlayer !== 'function') {
      return null;
    }
    
    const player = this.world.getPlayer(this.myPlayerId);
    if (!player) return null;
    
    const px = Number.isFinite(player.renderX) ? player.renderX : player.serverX;
    const py = Number.isFinite(player.renderY) ? player.renderY : player.serverY;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return null;
    }
    
    const objects = this.world.getObjects();
    if (!objects || objects.length === 0) {
      return null;
    }
    
    let closestObject = null;
    let closestDistance = Infinity;
    const interactionDistance = 150; // Distance to interact with objects
    
    objects.forEach((object) => {
      const centerX = Number.isFinite(object.x) ? object.x : 0;
      const baseY = Number.isFinite(object.y) ? object.y : 0;
      const dx = px - centerX;
      const dy = py - baseY;
      const distance = Math.hypot(dx, dy);
      
      if (distance < interactionDistance && distance < closestDistance && object.imageSrc) {
        closestDistance = distance;
        closestObject = object;
      }
    });
    
    return closestObject;
  }

  drawRoundedRect(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  renderFollowers() {
    if (!this.world || typeof this.world.getFollowers !== 'function') {
      return;
    }

    const followers = this.world.getFollowers();
    followers.forEach((follower) => this.renderFollower(follower));
  }

  renderFollower(follower) {
    const x = Math.round(follower.x);
    const y = Math.round(follower.y);

    const speed = Math.hypot(follower.vx || 0, follower.vy || 0);
    const animation = speed > 10 ? ANIMATION_CONFIG.WALK : ANIMATION_CONFIG.IDLE;

    let spriteName = this.spriteManager.getFollowerSpriteName(follower.sprite, animation);
    let sprite = spriteName ? this.spriteManager.getSprite(spriteName) : null;

    if (!sprite) {
      spriteName = this.spriteManager.getFollowerSpriteName(follower.sprite);
      sprite = spriteName ? this.spriteManager.getSprite(spriteName) : null;
    }

    // Draw subtle shadow like players
    this.ctx.save();
    this.ctx.globalAlpha = 0.22;
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    const shadowWidth = this.followerSize * 0.3;
    const shadowHeight = this.followerSize * 0.12;
    const shadowY = y - this.followerSize * 0.1;
    this.ctx.ellipse(x, y, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    let drawWidth = this.followerSize;
    let drawHeight = this.followerSize;

    if (sprite) {
      let frameWidth = FOLLOWER_FRAME_SIZE;
      let frameCount = Math.floor(sprite.width / frameWidth);
      if (!Number.isFinite(frameCount) || frameCount < 1 || sprite.width % frameWidth !== 0) {
        frameWidth = sprite.width;
        frameCount = 1;
      }

      const frameHeight = sprite.height;
      const frameIndex = frameCount > 1
        ? this.getAnimationFrame(animation, this.animationTime) % frameCount
        : 0;
      const sx = frameIndex * frameWidth;
      const sy = 0;

      drawHeight = Math.round(drawWidth * (frameHeight / frameWidth));

      this.ctx.save();
      this.ctx.translate(x, y);
      if (follower.vx < -1) {
        this.ctx.scale(-1, 1);
      }

      this.ctx.drawImage(
        sprite,
        sx,
        sy,
        frameWidth,
        frameHeight,
        -drawWidth / 2,
        -drawHeight,
        drawWidth,
        drawHeight
      );
      this.ctx.restore();
    } else {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
      this.ctx.beginPath();
      this.ctx.arc(x, y - drawHeight / 3, drawWidth / 3, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }
  
  // Update heart particles
  updateHeartParticles() {
    const now = Date.now();
    
    // Find hugging players
    const players = this.world.getAllPlayers();
    const huggingPlayers = players.filter(p => p.hugging);
    
    // Spawn new particles if players are hugging
    if (huggingPlayers.length >= 2) {
      const player1 = huggingPlayers[0];
      const player2 = huggingPlayers[1];
      
      const x1 = player1.renderX || player1.serverX || 0;
      const y1 = player1.renderY || player1.serverY || 0;
      const x2 = player2.renderX || player2.serverX || 0;
      const y2 = player2.renderY || player2.serverY || 0;
      
      // Calculate middle point between players
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      
      // Spawn new particle if enough time has passed
      if (now - this.lastParticleSpawn >= this.particleSpawnInterval) {
        this.heartParticles.push({
          x: midX + (Math.random() - 0.5) * 20, // Small random offset
          y: midY - 45 + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 10, // Random horizontal velocity
          vy: -20 - Math.random() * 10, // Upward velocity
          size: 8 + Math.random() * 4, // Random size
          life: 1.0, // Full life
          maxLife: 1.0,
          createdAt: now,
        });
        this.lastParticleSpawn = now;
      }
    }
    
    // Update existing particles
    this.heartParticles = this.heartParticles.filter(particle => {
      // Update position
      particle.x += particle.vx * 0.016; // Assuming ~60fps
      particle.y += particle.vy * 0.016;
      
      // Apply gravity
      particle.vy += 30 * 0.016; // Gravity
      
      // Fade out over time
      const age = now - particle.createdAt;
      particle.life = Math.max(0, 1 - (age / 1000)); // Fade over 1 second
      
      // Remove if dead
      return particle.life > 0;
    });
  }
  
  // Render heart particles
  renderHeartParticles() {
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true; // Smooth hearts
    
    this.heartParticles.forEach(particle => {
      const x = Math.round(particle.x);
      const y = Math.round(particle.y);
      const size = particle.size;
      const alpha = particle.life;
      
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = '#ff69b4'; // Pink color
      this.ctx.strokeStyle = '#ff1493'; // Darker pink for outline
      this.ctx.lineWidth = 1;
      
      // Draw heart shape (simplified)
      this.ctx.beginPath();
      const hSize = size * 0.5;
      // Top left curve
      this.ctx.moveTo(x, y + hSize * 0.3);
      this.ctx.bezierCurveTo(x, y, x - hSize, y, x - hSize, y + hSize * 0.3);
      // Bottom left
      this.ctx.bezierCurveTo(x - hSize, y + hSize * 0.5, x - hSize * 0.5, y + hSize * 0.7, x, y + hSize * 0.9);
      // Bottom right
      this.ctx.bezierCurveTo(x + hSize * 0.5, y + hSize * 0.7, x + hSize, y + hSize * 0.5, x + hSize, y + hSize * 0.3);
      // Top right curve
      this.ctx.bezierCurveTo(x + hSize, y, x, y, x, y + hSize * 0.3);
      
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    });
    
    this.ctx.restore();
    this.ctx.imageSmoothingEnabled = false; // Reset for pixel art
  }
  
  // Start render loop
  start() {
    const renderLoop = () => {
      this.render();
      requestAnimationFrame(renderLoop);
    };
    
    renderLoop();
  }
}

