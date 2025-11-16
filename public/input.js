// Input handling and state management

export class InputManager {
  constructor() {
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      w: false,
      a: false,
      s: false,
      d: false,
      e: false,
      h: false,
      q: false,
    };
    
    this.inputSeq = 0;
    this.lastSentInput = null;
    this.inputBuffer = [];
    this.eKeyPressed = false; // Track if E was just pressed (edge trigger)
    this.hKeyPressed = false; // Track if H was just pressed (edge trigger)
    this.qKeyPressed = false; // Track if Q was just pressed (edge trigger)
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
    
    window.addEventListener('keyup', (e) => {
      this.handleKeyUp(e);
    });
    
      // Prevent default behavior for game keys
    window.addEventListener('keydown', (e) => {
      const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'e', 'E', 'h', 'H', 'q', 'Q'];
      if (gameKeys.includes(e.key)) {
        e.preventDefault();
      }
    });
  }
  
  handleKeyDown(e) {
    const key = e.key.toLowerCase();
    
    switch (key) {
      case 'arrowup':
      case 'w':
        this.keys.up = true;
        this.keys.w = key === 'w';
        break;
      case 'arrowdown':
      case 's':
        this.keys.down = true;
        this.keys.s = key === 's';
        break;
      case 'arrowleft':
      case 'a':
        this.keys.left = true;
        this.keys.a = key === 'a';
        break;
      case 'arrowright':
      case 'd':
        this.keys.right = true;
        this.keys.d = key === 'd';
        break;
      case 'e':
        if (!this.keys.e) {
          // Edge trigger: only set on first press
          this.eKeyPressed = true;
        }
        this.keys.e = true;
        break;
      case 'h':
        if (!this.keys.h) {
          // Edge trigger: only set on first press
          this.hKeyPressed = true;
        }
        this.keys.h = true;
        break;
      case 'q':
        if (!this.keys.q) {
          // Edge trigger: only set on first press
          this.qKeyPressed = true;
        }
        this.keys.q = true;
        break;
    }
  }
  
  handleKeyUp(e) {
    const key = e.key.toLowerCase();
    
    switch (key) {
      case 'arrowup':
      case 'w':
        this.keys.up = false;
        this.keys.w = false;
        break;
      case 'arrowdown':
      case 's':
        this.keys.down = false;
        this.keys.s = false;
        break;
      case 'arrowleft':
      case 'a':
        this.keys.left = false;
        this.keys.a = false;
        break;
      case 'arrowright':
      case 'd':
        this.keys.right = false;
        this.keys.d = false;
        break;
      case 'e':
        this.keys.e = false;
        break;
      case 'h':
        this.keys.h = false;
        break;
      case 'q':
        this.keys.q = false;
        break;
    }
  }
  
  // Get current input state
  getInput() {
    return {
      keys: { ...this.keys },
      seq: this.inputSeq++,
      timestamp: Date.now(),
    };
  }
  
  // Check if any movement key is currently pressed
  hasAnyMovementKey() {
    return this.keys.up || this.keys.down || this.keys.left || this.keys.right ||
           this.keys.w || this.keys.a || this.keys.s || this.keys.d;
  }
  
  // Check if input has changed
  hasInputChanged() {
    if (!this.lastSentInput) return true;
    
    const current = JSON.stringify(this.keys);
    const last = JSON.stringify(this.lastSentInput.keys);
    
    return current !== last;
  }
  
  // Mark input as sent
  markInputSent(input) {
    this.lastSentInput = {
      keys: { ...input.keys },
      seq: input.seq,
    };
  }
  
  // Check if E key was just pressed (edge trigger, resets after check)
  wasEPressed() {
    if (this.eKeyPressed) {
      this.eKeyPressed = false;
      return true;
    }
    return false;
  }
  
  // Check if H key was just pressed (edge trigger, resets after check)
  wasHPressed() {
    if (this.hKeyPressed) {
      this.hKeyPressed = false;
      return true;
    }
    return false;
  }
  
  // Check if Q key was just pressed (edge trigger, resets after check)
  wasQPressed() {
    if (this.qKeyPressed) {
      this.qKeyPressed = false;
      return true;
    }
    return false;
  }
}

