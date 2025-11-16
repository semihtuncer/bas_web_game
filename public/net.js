// Network communication with WebSocket

// Message types (must match server)
const MESSAGE_TYPES = {
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

export class NetworkManager {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.serverUrl = null;
    this.onStateUpdate = null;
    this.onWelcome = null;
    this.onError = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onColliderPlaced = null;
    this.onColliderRemoved = null;
    this.onObjectPlaced = null;
    this.onObjectRemoved = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }
  
  connect(serverUrl) {
    this.serverUrl = serverUrl || `ws://localhost:8080`;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
          console.log('Connected to server');
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onclose = () => {
          console.log('Disconnected from server');
          this.connected = false;
          this.attemptReconnect();
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case MESSAGE_TYPES.WELCOME:
          this.playerId = message.playerId;
          if (this.onWelcome) {
            this.onWelcome(message);
          }
          break;
          
        case MESSAGE_TYPES.STATE_UPDATE:
          if (this.onStateUpdate) {
            this.onStateUpdate(message);
          }
          break;
          
        case MESSAGE_TYPES.PLAYER_JOINED:
          if (this.onPlayerJoined) {
            this.onPlayerJoined(message);
          }
          break;
          
        case MESSAGE_TYPES.PLAYER_LEFT:
          if (this.onPlayerLeft) {
            this.onPlayerLeft(message);
          }
          break;

        case MESSAGE_TYPES.COLLIDER_PLACED:
          if (this.onColliderPlaced) {
            this.onColliderPlaced(message);
          }
          break;

        case MESSAGE_TYPES.COLLIDER_REMOVED:
          if (this.onColliderRemoved) {
            this.onColliderRemoved(message);
          }
          break;

        case MESSAGE_TYPES.OBJECT_PLACED:
          if (this.onObjectPlaced) {
            this.onObjectPlaced(message);
          }
          break;

        case MESSAGE_TYPES.OBJECT_REMOVED:
          if (this.onObjectRemoved) {
            this.onObjectRemoved(message);
          }
          break;
          
        case MESSAGE_TYPES.HUG_STARTED:
          if (this.onHugStarted) {
            this.onHugStarted(message);
          }
          break;
          
        case MESSAGE_TYPES.HUG_ENDED:
          if (this.onHugEnded) {
            this.onHugEnded(message);
          }
          break;
          
        case MESSAGE_TYPES.ERROR:
          console.error('Server error:', message.error);
          if (this.onError) {
            this.onError(message.error);
          }
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
  
  sendJoin(name, character, playerId = null) {
    if (!this.connected || !this.ws) return;
    
    const message = {
      type: MESSAGE_TYPES.JOIN,
      name,
      character,
      playerId,
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  sendInput(input) {
    if (!this.connected || !this.ws) return;
    
    const message = {
      type: MESSAGE_TYPES.INPUT,
      input,
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  sendResetPosition() {
    if (!this.connected || !this.ws) return;
    
    const message = {
      type: MESSAGE_TYPES.RESET_POSITION,
    };
    
    this.ws.send(JSON.stringify(message));
  }

  sendPlaceCollider(col, row) {
    if (!this.connected || !this.ws) return;

    const message = {
      type: MESSAGE_TYPES.PLACE_COLLIDER,
      col,
      row,
    };

    this.ws.send(JSON.stringify(message));
  }

  sendRemoveCollider(col, row) {
    if (!this.connected || !this.ws) return;

    const message = {
      type: MESSAGE_TYPES.REMOVE_COLLIDER,
      col,
      row,
    };

    this.ws.send(JSON.stringify(message));
  }

  sendPlaceObject(x, y) {
    if (!this.connected || !this.ws) return;

    const message = {
      type: MESSAGE_TYPES.PLACE_OBJECT,
      x,
      y,
    };

    this.ws.send(JSON.stringify(message));
  }

  sendRemoveObject(id) {
    if (!this.connected || !this.ws || !id) return;

    const message = {
      type: MESSAGE_TYPES.REMOVE_OBJECT,
      id,
    };

    this.ws.send(JSON.stringify(message));
  }
  
  sendHug() {
    if (!this.connected || !this.ws) return;
    
    const message = {
      type: MESSAGE_TYPES.HUG,
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  sendBenchSit() {
    if (!this.connected || !this.ws) return;
    
    const message = {
      type: MESSAGE_TYPES.BENCH_SIT,
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  sendBenchStand() {
    if (!this.connected || !this.ws) return;
    
    const message = {
      type: MESSAGE_TYPES.BENCH_STAND,
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`Attempting to reconnect in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect(this.serverUrl).catch(console.error);
    }, delay);
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}