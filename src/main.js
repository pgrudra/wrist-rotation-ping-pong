import './style.css';
import BootScene from './BootScene.js';
import PlayScene from './PlayScene.js';
import GameOverScene from './GameOverScene.js';

class GameManager {
    constructor() {
        this.currentScene = null;
        this.handTracker = null;
        this.currentRotationSpeed = 0;
        
        this.initialize();
    }
    
    initialize() {
        // Start with boot scene
        this.showBootScene();
    }
    
    showBootScene() {
        this.cleanup();
        this.currentScene = new BootScene(this);
    }
    
    startGame(handTracker) {
        this.handTracker = handTracker;
        this.cleanup();
        this.currentScene = new PlayScene(this, handTracker);
    }
    
    endGame(finalScore) {
        this.cleanup();
        this.currentScene = new GameOverScene(this, finalScore);
    }
    
    restartGame() {
        this.cleanup();
        this.currentScene = new PlayScene(this, this.handTracker);
    }
    
    onThumbControl(data) {
        if (this.currentScene && this.currentScene.updateVirtualButtonStates) {
            // Use new virtual button system
            this.currentScene.updateVirtualButtonStates(data);
        } else if (data.handDetected && this.currentScene && this.currentScene.updateRotationSpeed) {
            // Fallback to old rotation system
            this.currentRotationSpeed = data.rotationSpeed;
            this.currentScene.updateRotationSpeed(data.rotationSpeed);
        } else {
            this.currentRotationSpeed = 0;
            if (this.currentScene && this.currentScene.updateRotationSpeed) {
                this.currentScene.updateRotationSpeed(0);
            }
        }
    }
    
    cleanup() {
        if (this.currentScene && this.currentScene.destroy) {
            this.currentScene.destroy();
        }
        this.currentScene = null;
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GameManager();
});