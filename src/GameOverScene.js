export default class GameOverScene {
    constructor(gameManager, finalScore) {
        this.gameManager = gameManager;
        this.finalScore = finalScore;
        
        this.createGameOverUI();
        this.setupRestartButton();
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
                
                <div class="performance-stats">
                    ${this.getPerformanceMessage()}
                </div>
                
                <div class="tips-container">
                    <h3>💡 Pro Tips for Next Time</h3>
                    <div class="tip-item">
                        <span class="tip-icon">🎯</span>
                        <p>Watch for gaps in paddles - they appear every 3 points!</p>
                    </div>
                    <div class="tip-item">
                        <span class="tip-icon">⚡</span>
                        <p>Red bumps create chaotic bounces - use them strategically!</p>
                    </div>
                    <div class="tip-item">
                        <span class="tip-icon">🌪️</span>
                        <p>Smooth wrist rotations work better than jerky movements</p>
                    </div>
                    <div class="tip-item">
                        <span class="tip-icon">⏱️</span>
                        <p>Ball speed increases with score - stay calm!</p>
                    </div>
                </div>
                
                <div class="action-container">
                    <button class="restart-button" id="gameOverRestartButton">
                        🔄 Play Again
                    </button>
                    <button class="menu-button" id="gameOverMenuButton">
                        🏠 Main Menu
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(gameOverContainer);
        this.gameOverContainer = gameOverContainer;
        this.restartButton = document.getElementById('gameOverRestartButton');
        this.menuButton = document.getElementById('gameOverMenuButton');
    }
    
    getPerformanceMessage() {
        const score = this.finalScore;
        let message = '';
        let emoji = '';
        let description = '';
        
        if (score === 0) {
            emoji = '🌱';
            message = 'Every Expert Was Once a Beginner!';
            description = 'Don\'t worry - the first hit is always the hardest. Try positioning yourself so the camera can see your thumb clearly.';
        } else if (score < 5) {
            emoji = '🎯';
            message = 'Getting the Hang of It!';
            description = 'Great start! You\'re learning the basics. Focus on smooth, controlled movements.';
        } else if (score < 10) {
            emoji = '🔥';
            message = 'Building Momentum!';
            description = 'Nice work! You\'re getting comfortable with the controls. Watch out for those gaps starting to appear.';
        } else if (score < 20) {
            emoji = '⭐';
            message = 'Impressive Skills!';
            description = 'You\'re handling the increasing difficulty well! Those bumps are starting to make things interesting.';
        } else if (score < 30) {
            emoji = '🏆';
            message = 'Ping Pong Master!';
            description = 'Outstanding performance! You\'ve mastered the advanced mechanics with gaps and bumps.';
        } else {
            emoji = '👑';
            message = 'Legendary Champion!';
            description = 'Incredible! You\'ve achieved a legendary score. Your wrist rotation skills are unmatched!';
        }
        
        return `
            <div class="performance-message">
                <div class="performance-emoji">${emoji}</div>
                <h2 class="performance-title">${message}</h2>
                <p class="performance-description">${description}</p>
            </div>
        `;
    }
    
    setupRestartButton() {
        this.restartButton.addEventListener('click', () => {
            this.gameManager.restartGame();
        });
        
        this.menuButton.addEventListener('click', () => {
            this.gameManager.showBootScene();
        });
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