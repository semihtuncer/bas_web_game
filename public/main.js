// Main game loop and coordination

import { InputManager } from './input.js';
import { NetworkManager } from './net.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { COLLIDER_TILE_SIZE, MAP_COLS, MAP_ROWS } from './worldMap.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new Renderer(this.canvas);
    this.world = new World();
    this.inputManager = new InputManager();
    this.networkManager = new NetworkManager();
    
    this.playerId = null;
    this.running = false;
    this.lastInputSend = 0;
    this.inputSendInterval = 50; // Send input every 50ms (20 times per second)
    this.handleCanvasClick = this.handleCanvasClick.bind(this);
    this.handleCanvasContextMenu = this.handleCanvasContextMenu.bind(this);
    
    // Image viewer elements
    this.imageViewer = document.getElementById('imageViewer');
    this.viewerImage = document.getElementById('viewerImage');
    this.viewerDescription = document.getElementById('viewerDescription');
    this.imageViewerOpen = false;
    
    // Interaction hint element
    this.interactionHint = document.getElementById('interactionHint');
    
    // Seated hint element
    this.seatedHint = document.getElementById('seatedHint');
    
    // Flipbook elements
    this.flipbook = document.getElementById('flipbook');
    this.flipbookOpen = false;
    
    // Object placing mode toggle
    this.objectPlacingMode = false; // false = colliders, true = objects
    
    this.setupNetworkHandlers();
  }
  
  setupNetworkHandlers() {
    // Handle welcome message
    this.networkManager.onWelcome = (message) => {
      console.log('Welcome! Player ID:', message.playerId);
      this.playerId = message.playerId;
      localStorage.setItem('playerId', this.playerId);
      this.renderer.setMyPlayerId(this.playerId);
      
      // Initialize world with server state
      if (message.gameState && message.gameState.players) {
        message.gameState.players.forEach(playerData => {
          this.world.updatePlayer(playerData);
        });
      }
      if (message.gameState && Array.isArray(message.gameState.followers)) {
        this.world.setFollowers(message.gameState.followers);
      }
      if (message.gameState && Array.isArray(message.gameState.colliders)) {
        this.world.setColliders(message.gameState.colliders);
      }
    };
    
    // Handle state updates
    this.networkManager.onStateUpdate = (message) => {
      this.world.updateFromServer(message);
    };
    this.networkManager.onColliderPlaced = (message) => {
      if (message?.collider) {
        this.world.addCollider(message.collider);
      }
    };
    this.networkManager.onColliderRemoved = (message) => {
      if (message?.collider) {
        this.world.removeCollider(message.collider);
      }
    };
    
    // Handle player joined
    this.networkManager.onPlayerJoined = (message) => {
      console.log('Player joined:', message.player.name);
      this.world.updatePlayer(message.player);
    };
    
    // Handle player left
    this.networkManager.onPlayerLeft = (message) => {
      console.log('Player left:', message.playerId);
      this.world.removePlayer(message.playerId);
    };
    
    // Handle errors
    this.networkManager.onError = (error) => {
      console.error('Network error:', error);
      alert(`Error: ${error}`);
    };
  }
  
  async start(serverUrl, playerName, playerCharacter) {
    try {
      // Load sprites first
      await this.renderer.loadSprites();
      
      // Connect to server
      await this.networkManager.connect(serverUrl);
      
      // Try to restore player ID from localStorage
      const savedPlayerId = localStorage.getItem('playerId');
      
      // Send join message with name and character
      this.networkManager.sendJoin(playerName, playerCharacter, savedPlayerId);
      
      // Save player ID when we receive it
      if (savedPlayerId) {
        this.playerId = savedPlayerId;
      }
      
      // Set up renderer
      this.renderer.setWorld(this.world);
      this.renderer.start();
      this.canvas.addEventListener('click', this.handleCanvasClick);
      this.canvas.addEventListener('contextmenu', this.handleCanvasContextMenu);
      
      // Start game loop
      this.running = true;
      this.gameLoop();
      
    } catch (error) {
      console.error('Failed to start game:', error);
      alert('Failed to connect to server. Make sure the server is running.');
      // Show modal again on error
      document.getElementById('joinModal').classList.remove('hidden');
      document.getElementById('gameContainer').classList.add('hidden');
    }
  }
  
  gameLoop() {
    if (!this.running) return;
    
    const now = Date.now();
    
    // Handle Q key press for flipbook
    if (this.inputManager.wasQPressed()) {
      this.toggleFlipbook();
    }
    
    // Handle E key press for image viewer or bench interaction
    if (this.inputManager.wasEPressed()) {
      if (this.flipbookOpen) {
        // Close flipbook instead if it's open
        this.closeFlipbook();
      } else if (this.renderer.isNearBench()) {
        // Interact with bench
        this.toggleBenchSit();
      } else {
        this.toggleImageViewer();
      }
    }
    
    // Handle H key press for hug
    if (this.inputManager.wasHPressed()) {
      this.attemptHug();
    }
    
    // Update interaction hint visibility
    this.updateInteractionHint();
    
    // Send input to server at regular intervals while any movement key is held
    if (now - this.lastInputSend >= this.inputSendInterval) {
      // Check if player is sitting
      const player = this.world.getPlayer(this.playerId);
      const isSitting = player && player.sitting;
      
      // Block movement if image viewer or flipbook is open, or if sitting
      if (!this.imageViewerOpen && !this.flipbookOpen && !isSitting) {
        // Check if any movement key is currently pressed
        const hasMovementInput = this.inputManager.hasAnyMovementKey();
        
        // Send input if it changed OR if movement keys are held (for continuous movement)
        if (this.inputManager.hasInputChanged() || hasMovementInput) {
          const input = this.inputManager.getInput();
          this.networkManager.sendInput(input);
          this.inputManager.markInputSent(input);
        }
      } else {
        // Viewer or flipbook is open - send stop input to prevent movement
        const stopInput = {
          keys: {
            up: false,
            down: false,
            left: false,
            right: false,
            w: false,
            a: false,
            s: false,
            d: false,
            e: false,
          },
          seq: this.inputManager.inputSeq++,
          timestamp: Date.now(),
        };
        this.networkManager.sendInput(stopInput);
        this.inputManager.markInputSent(stopInput);
      }
      this.lastInputSend = now;
    }
    
    // Continue loop
    requestAnimationFrame(() => this.gameLoop());
  }
  
  toggleImageViewer() {
    if (this.imageViewerOpen) {
      // Close viewer
      this.imageViewerOpen = false;
      this.imageViewer.classList.add('hidden');
      this.viewerImage.src = '';
      this.viewerImage.classList.remove('loaded');
      this.viewerDescription.textContent = '';
    } else {
      // Try to open viewer with closest object
      const closestObject = this.renderer.getClosestInteractableObject();
      if (closestObject && closestObject.imageSrc) {
        this.imageViewerOpen = true;
        // Reset image state
        this.viewerImage.classList.remove('loaded');
        this.viewerImage.src = '';
        this.viewerDescription.textContent = closestObject.text || '';
        this.imageViewer.classList.remove('hidden');
        
        // Load image and fade in when loaded
        const img = new Image();
        const handleLoad = () => {
          this.viewerImage.src = closestObject.imageSrc;
          // Small delay to ensure opacity transition works
          setTimeout(() => {
            this.viewerImage.classList.add('loaded');
          }, 10);
        };
        
        img.onload = handleLoad;
        img.onerror = () => {
          this.viewerImage.src = closestObject.imageSrc;
          setTimeout(() => {
            this.viewerImage.classList.add('loaded');
          }, 10);
        };
        
        // Set src and check if already cached
        img.src = closestObject.imageSrc;
        if (img.complete) {
          // Image was cached, onload might not fire
          handleLoad();
        }
      }
    }
  }
  
  updateInteractionHint() {
    // Don't show hint if image viewer or flipbook is open
    if (this.imageViewerOpen || this.flipbookOpen) {
      this.interactionHint.classList.add('hidden');
      this.seatedHint.classList.add('hidden');
      return;
    }
    
    // Check if player is sitting
    const player = this.world.getPlayer(this.playerId);
    const isSitting = player && player.sitting;
    
    // Show seated hint at top when sitting and flipbook is not open
    if (isSitting) {
      this.seatedHint.classList.remove('hidden');
      // Show stand up hint at bottom
      this.interactionHint.textContent = '"E"ye bas kalkmak için.';
      this.interactionHint.classList.remove('hidden');
      return;
    } else {
      this.seatedHint.classList.add('hidden');
    }
    
    // Check if player is near bench
    const isNearBench = this.renderer.isNearBench();
    if (isNearBench) {
      this.interactionHint.textContent = '"E"ye bas oturmak için.';
      this.interactionHint.classList.remove('hidden');
      return;
    }
    
    // Show hint if there's a closest interactable object
    const closestObject = this.renderer.getClosestInteractableObject();
    if (closestObject) {
      this.interactionHint.textContent = '"E"ye bas bitanem.';
      this.interactionHint.classList.remove('hidden');
    } else {
      this.interactionHint.classList.add('hidden');
    }
  }
  
  toggleFlipbook() {
    if (this.flipbookOpen) {
      this.closeFlipbook();
    } else {
      this.openFlipbook();
    }
  }
  
  openFlipbook() {
    if (!this.flipbook) return;
    
    // Check if player is sitting - flipbook can only be opened when seated
    const player = this.world.getPlayer(this.playerId);
    if (!player || !player.sitting) {
      return; // Player must be sitting to open flipbook
    }
    
    this.flipbookOpen = true;
    this.flipbook.classList.remove('hidden');
    // Reset all checkboxes to close state
    this.resetFlipbookState();
  }
  
  closeFlipbook() {
    if (!this.flipbook) return;
    this.flipbookOpen = false;
    this.flipbook.classList.add('hidden');
    // Reset all checkboxes to close state
    this.resetFlipbookState();
  }
  
  resetFlipbookState() {
    // Uncheck all checkboxes to reset flipbook state
    const checkboxes = [
      'cover_checkbox',
      'page1_checkbox',
      'page2_checkbox',
      'page3_checkbox',
      'page4_checkbox',
      'page5_checkbox',
      'page6_checkbox',
      'page7_checkbox',
      'page8_checkbox',
      'page9_checkbox',
      'page10_checkbox',
      'page11_checkbox',
      'page12_checkbox',
      'page13_checkbox',
    ];
    
    checkboxes.forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = false;
      }
    });
  }
  
  toggleBenchSit() {
    if (!this.playerId || this.imageViewerOpen || this.flipbookOpen) return;
    
    const player = this.world.getPlayer(this.playerId);
    if (!player) return;
    
    // Toggle sitting state
    if (player.sitting) {
      // Stand up
      this.networkManager.sendBenchStand();
    } else {
      // Sit down
      this.networkManager.sendBenchSit();
    }
  }
  
  attemptHug() {
    if (!this.playerId || this.imageViewerOpen || this.flipbookOpen) return;
    
    // Check if there's another player nearby
    const myPlayer = this.world.players.get(this.playerId);
    if (!myPlayer) return;
    
    // Find other players
    const otherPlayers = Array.from(this.world.players.values())
      .filter(p => p.id !== this.playerId);
    
    if (otherPlayers.length === 0) return;
    
    const otherPlayer = otherPlayers[0];
    
    // Check proximity (same threshold as server: 60 pixels)
    // Use serverX/serverY for accurate position
    const dx = myPlayer.serverX - otherPlayer.serverX;
    const dy = myPlayer.serverY - otherPlayer.serverY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance <= 60) {
      // Send hug request to server
      this.networkManager.sendHug();
    }
  }
  
  stop() {
    this.running = false;
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.handleCanvasContextMenu);
    this.networkManager.disconnect();
  }
  
  resetPlayerPosition() {
    if (!this.running) return;
    this.networkManager.sendResetPosition();
  }

  handleCanvasClick(event) {
    // Placement disabled
    return;
    
    if (!this.running) return;
    const coords = this.renderer.screenToWorld(event.clientX, event.clientY);
    if (!coords) return;
    const { x, y } = coords;
    
    if (this.objectPlacingMode) {
      // Place objects mode
      if (x < 0 || x > this.renderer.mapWidth || y < 0 || y > this.renderer.mapHeight) {
        return;
      }

      if (this.world.getObjectAtPosition(x, y)) {
        return;
      }

      this.networkManager.sendPlaceObject(x, y);
    } else {
      // Place colliders mode
      const col = Math.floor(x / COLLIDER_TILE_SIZE);
      const row = Math.floor(y / COLLIDER_TILE_SIZE);
      if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) {
        return;
      }

      if (this.world.hasCollider(col, row)) {
        return;
      }

      this.networkManager.sendPlaceCollider(col, row);
    }
  }

  handleCanvasContextMenu(event) {
    // Removal disabled
    event.preventDefault();
    return;
    
    if (!this.running) return;
    const coords = this.renderer.screenToWorld(event.clientX, event.clientY);
    if (!coords) return;
    const { x, y } = coords;
    
    if (this.objectPlacingMode) {
      // Remove objects mode
      if (x < 0 || x > this.renderer.mapWidth || y < 0 || y > this.renderer.mapHeight) {
        return;
      }

      const object = this.world.getObjectAtPosition(x, y);
      if (object) {
        this.networkManager.sendRemoveObject(object.id);
        return;
      }

      // Fall through to collider removal if no object found
      const col = Math.floor(x / COLLIDER_TILE_SIZE);
      const row = Math.floor(y / COLLIDER_TILE_SIZE);
      if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) {
        return;
      }

      if (this.world.hasCollider(col, row)) {
        this.networkManager.sendRemoveCollider(col, row);
      }
    } else {
      // Remove colliders mode
      const col = Math.floor(x / COLLIDER_TILE_SIZE);
      const row = Math.floor(y / COLLIDER_TILE_SIZE);
      if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) {
        return;
      }

      if (!this.world.hasCollider(col, row)) {
        return;
      }

      this.networkManager.sendRemoveCollider(col, row);
    }
  }
  
  toggleObjectPlacingMode() {
    this.objectPlacingMode = !this.objectPlacingMode;
    console.log('Object placing mode:', this.objectPlacingMode ? 'Objects' : 'Colliders');
  }
}

// Initialize game when page loads
let game = null;

window.addEventListener('DOMContentLoaded', () => {
  const joinModal = document.getElementById('joinModal');
  const gameContainer = document.getElementById('gameContainer');
  const joinButton = document.getElementById('joinButton');
  const playerNameInput = document.getElementById('playerName');
  const playerCharacterSelect = document.getElementById('playerCharacter');
  const serverUrlInput = document.getElementById('serverUrl');
  const imgBackdrop = document.getElementById('img-backdrop');

  // Try to restore saved preferences
  const savedName = localStorage.getItem('playerName') || 'Player';
  const savedCharacter = localStorage.getItem('playerCharacter') || '1';
  const savedServerUrl = localStorage.getItem('serverUrl') || 'ws://localhost:3001';
  
  playerNameInput.value = savedName;
  playerCharacterSelect.value = savedCharacter;
  serverUrlInput.value = savedServerUrl;
  
  // Handle join button click
  joinButton.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim() || 'Player';
    const playerCharacter = playerCharacterSelect.value;
    const serverUrl = serverUrlInput.value.trim() || 'ws://localhost:3001';
    
    // Validate character
    if (playerCharacter !== '1' && playerCharacter !== '2') {
      alert('Please select a valid character (1 or 2)');
      return;
    }
    
    // Save preferences
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('playerCharacter', playerCharacter);
    localStorage.setItem('serverUrl', serverUrl);
    
    // Hide modal and show game
    joinModal.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    imgBackdrop.classList.add('hidden');
    // Create and start game
    game = new Game();
    game.start(serverUrl, playerName, playerCharacter).catch((error) => {
      console.error('Failed to start game:', error);
      // Show modal again on error
      joinModal.classList.remove('hidden');
      gameContainer.classList.add('hidden');
      imgBackdrop.classList.remove('hidden');
    });
  });
  
  // Allow Enter key to join
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinButton.click();
    }
  });
  
  serverUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinButton.click();
    }
  });
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (game) {
    game.stop();
  }
});

// Center player on Enter during gameplay
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && game && game.running) {
    game.resetPlayerPosition();
  }
  // Toggle object placing mode with 'P' key
  if (e.key === 'p' || e.key === 'P') {
    if (game && game.running) {
      game.toggleObjectPlacingMode();
      e.preventDefault();
    }
  }
});

