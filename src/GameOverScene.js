export default class GameOverScene {
    constructor(gameManager, finalScore) {
        this.gameManager = gameManager;
        this.finalScore = finalScore;
        
        // Gesture recognition state
        this.currentFingerPosition = null;
        this.buttonHoldStartTime = null;
        this.activeButton = null;
        this.requiredHoldTime = 1000; // 1 second hold
        
        this.createGameOverUI();
        this.setupRestartButton();
        
        // Connect to hand tracker if available
        if (this.gameManager.handTracker) {
            this.gameManager.handTracker.onThumbControl = (data) => {
                this.gameManager.onThumbControl(data);
                this.updateVirtualButtonStates(data);
            };
        }
    }
    
    createGameOverUI() {
        const gameOverContainer = document.createElement('div');
        gameOverContainer.className = 'gameover-scene';
        gameOverContainer.innerHTML = `
            <div class="gameover-content">
                <div class="game-over-header">
                    <h1 class="game-over-title">🎮 Game Over!</h1>
                    <div class="final-score">
                        <span class="score-label">Final Score</span>
                        <span class="score-value">${this.finalScore}</span>
                    </div>
                </div>
                
                
                
                
                <div class="action-container">
                    <div class="virtual-button restart-game-btn" id="gameOverRestartButton">
                        <div class="btn-icon">🔄</div>
                        <div class="btn-label">Play Again</div>
                    </div>
                    <div class="virtual-button menu-btn" id="gameOverMenuButton">
                        <div class="btn-icon">🏠</div>
                        <div class="btn-label">Main Menu</div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(gameOverContainer);
        this.gameOverContainer = gameOverContainer;
        this.restartButton = document.getElementById('gameOverRestartButton');
        this.menuButton = document.getElementById('gameOverMenuButton');
    }
    
    
    setupRestartButton() {
        this.restartButton.addEventListener('click', () => {
            this.gameManager.restartGame();
        });
        
        this.menuButton.addEventListener('click', () => {
            this.gameManager.showBootScene();
        });
    }
    
    updateVirtualButtonStates(handData) {
        this.currentFingerPosition = handData.indexFingerPosition;
        
        if (!handData.handDetected || !handData.indexFingerPosition) {
            this.resetButtonStates();
            return;
        }
        
        const fingerPos = handData.indexFingerPosition;
        const restartHit = this.isFingerOverButton(fingerPos, this.restartButton);
        const menuHit = this.isFingerOverButton(fingerPos, this.menuButton);
        
        let currentButton = null;
        let action = null;
        
        if (restartHit) {
            currentButton = this.restartButton;
            action = () => this.gameManager.restartGame();
        } else if (menuHit) {
            currentButton = this.menuButton;
            action = () => this.gameManager.showBootScene();
        }
        
        if (currentButton) {
            if (this.activeButton !== currentButton) {
                this.resetButtonStates();
                this.activeButton = currentButton;
                this.buttonHoldStartTime = Date.now();
                currentButton.classList.add('active');
            } else {
                const holdTime = Date.now() - this.buttonHoldStartTime;
                const progress = Math.min(holdTime / this.requiredHoldTime, 1);
                
                if (progress >= 1) {
                    action();
                }
            }
        } else {
            this.resetButtonStates();
        }
    }
    
    isFingerOverButton(fingerPos, buttonElement) {
        if (!buttonElement || !fingerPos) return false;
        
        const rect = buttonElement.getBoundingClientRect();
        const x = fingerPos.x * window.innerWidth;
        const y = fingerPos.y * window.innerHeight;
        
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    
    resetButtonStates() {
        this.buttonHoldStartTime = null;
        this.activeButton = null;
        this.restartButton.classList.remove('active');
        this.menuButton.classList.remove('active');
    }
    
    hide() {
        this.gameOverContainer.style.display = 'none';
    }
    
    show() {
        this.gameOverContainer.style.display = 'block';
    }
    
    destroy() {
        if (this.gameOverContainer) {
            this.gameOverContainer.remove();
        }
    }
}