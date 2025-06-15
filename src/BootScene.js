import HandTracker from './HandTracker.js';

export default class BootScene {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.handTracker = null;
        this.videoElement = document.getElementById('hiddenVideo');
        this.videoFeed = document.getElementById('videoFeed');
        this.isInitialized = false;
        
        this.createBootUI();
        this.initializeHandTracking();
    }
    
    createBootUI() {
        const bootContainer = document.createElement('div');
        bootContainer.className = 'boot-scene';
        bootContainer.innerHTML = `
            <div class="boot-content">
                <h1 class="game-title">👉👈 Spin Control</h1>
                
                <div class="loading-container" id="loadingContainer">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading game assets...</div>
                </div>
                
                <div class="instructions-container" id="instructionsContainer" style="display: none;">
                    <h2>How to Play</h2>
                    <div class="instruction-item">
                        <span class="instruction-icon">👉</span>
                        <p><strong>Left Hand Index Finger Pointing Right</strong> = Paddles rotate clockwise</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">👈</span>
                        <p><strong>Right Hand Index Finger Pointing Left</strong> = Paddles rotate anti-clockwise</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">✋</span>
                        <p><strong>No Hands or Both Hands</strong> = Paddles stop moving</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">🎯</span>
                        <p>Keep the ball bouncing inside the circle with your paddles</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">⚡</span>
                        <p>Each successful paddle hit increases your score</p>
                    </div>
                    
                </div>
                
                <div class="status-container">
                    <div class="status-text" id="bootStatus">Initializing camera...</div>
                    <button class="start-button" id="bootStartButton" style="display: none;">🎮 Start Game</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(bootContainer);
        this.bootContainer = bootContainer;
        this.loadingContainer = document.getElementById('loadingContainer');
        this.instructionsContainer = document.getElementById('instructionsContainer');
        this.statusElement = document.getElementById('bootStatus');
        this.startButton = document.getElementById('bootStartButton');
        
        this.setupStartButton();
    }
    
    async initializeHandTracking() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    facingMode: 'user',
                    frameRate: { ideal: 30, max: 60 }
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.videoElement.srcObject = stream;
            this.videoFeed.srcObject = stream;
            
            this.videoElement.setAttribute('playsinline', true);
            this.videoElement.setAttribute('webkit-playsinline', true);
            this.videoFeed.setAttribute('playsinline', true);
            this.videoFeed.setAttribute('webkit-playsinline', true);
            
            this.videoElement.onloadedmetadata = async () => {
                try {
                    await this.videoElement.play();
                    await this.videoFeed.play();
                    
                    this.handTracker = new HandTracker(
                        this.videoElement, 
                        this.gameManager.onThumbControl.bind(this.gameManager)
                    );
                    
                    await this.handTracker.start();
                    this.onCameraReady();
                } catch (playError) {
                    console.error('Error playing video:', playError);
                    this.onCameraError("Camera loaded but video playback failed. Game will work with keyboard controls.");
                }
            };
            
            this.videoElement.onerror = (error) => {
                console.error('Video element error:', error);
                this.onCameraError("Video error. Game will work with keyboard controls.");
            };
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.onCameraError("Camera access denied. Game will work with keyboard controls.");
        }
        
        // Fallback timeout
        setTimeout(() => {
            if (!this.isInitialized) {
                this.onCameraError("Ready to play! Click Start Game to begin.");
            }
        }, 5000);
    }
    
    onCameraReady() {
        this.isInitialized = true;
        this.loadingContainer.style.display = 'none';
        this.instructionsContainer.style.display = 'block';
        this.statusElement.textContent = "Camera ready! Click Start Game to begin.";
        this.startButton.style.display = 'block';
    }
    
    onCameraError(message) {
        this.isInitialized = true;
        this.loadingContainer.style.display = 'none';
        this.instructionsContainer.style.display = 'block';
        this.statusElement.textContent = message;
        this.startButton.style.display = 'block';
    }
    
    setupStartButton() {
        this.startButton.addEventListener('click', () => {
            this.gameManager.startGame(this.handTracker);
        });
    }
    
    hide() {
        this.bootContainer.style.display = 'none';
    }
    
    show() {
        this.bootContainer.style.display = 'block';
    }
    
    destroy() {
        if (this.bootContainer) {
            this.bootContainer.remove();
        }
    }
}