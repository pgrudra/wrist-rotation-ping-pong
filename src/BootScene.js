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
                        <span class="instruction-icon">🏓</span>
                        <p>Keep the yellow ball bouncing by hitting it with your paddles</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">⚡</span>
                        <p><strong>Scoring:</strong> Each paddle hit = +1 point, ball speed increases with score</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">🕳️</span>
                        <p><strong>Difficulty:</strong> Gaps appear every 3 points, red bumps every 4 points</p>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">👆</span>
                        <p><strong>Controls:</strong> Point index finger at buttons to interact</p>
                    </div>
                    
                </div>
                
                <div class="status-container">
                    <div class="status-text" id="bootStatus">Initializing camera...</div>
                    <div class="virtual-button start-game-btn" id="bootStartButton" style="display: none;">
                        <div class="btn-icon">🎮</div>
                        <div class="btn-label">Start Game</div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(bootContainer);
        this.bootContainer = bootContainer;
        this.loadingContainer = document.getElementById('loadingContainer');
        this.instructionsContainer = document.getElementById('instructionsContainer');
        this.statusElement = document.getElementById('bootStatus');
        this.startButton = document.getElementById('bootStartButton');
        
        // Gesture recognition state
        this.currentFingerPosition = null;
        this.buttonHoldStartTime = null;
        this.requiredHoldTime = 1000; // 1 second hold
        
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
                        (data) => {
                            this.gameManager.onThumbControl(data);
                            this.updateVirtualButtonStates(data);
                        }
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
        this.statusElement.textContent = "Camera ready! Point index finger at buttons to interact.";
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
    
    updateVirtualButtonStates(handData) {
        this.currentFingerPosition = handData.indexFingerPosition;
        
        if (!handData.handDetected || !handData.indexFingerPosition) {
            this.resetButtonState();
            return;
        }
        
        const fingerPos = handData.indexFingerPosition;
        const isOverButton = this.isFingerOverButton(fingerPos, this.startButton);
        
        if (isOverButton) {
            if (!this.buttonHoldStartTime) {
                this.buttonHoldStartTime = Date.now();
                this.startButton.classList.add('active');
            } else {
                const holdTime = Date.now() - this.buttonHoldStartTime;
                const progress = Math.min(holdTime / this.requiredHoldTime, 1);
                
                if (progress >= 1) {
                    this.gameManager.startGame(this.handTracker);
                } else {
                }
            }
        } else {
            this.resetButtonState();
        }
    }
    
    isFingerOverButton(fingerPos, buttonElement) {
        if (!buttonElement || !fingerPos) return false;
        
        const rect = buttonElement.getBoundingClientRect();
        const x = fingerPos.x * window.innerWidth;
        const y = fingerPos.y * window.innerHeight;
        
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    
    resetButtonState() {
        this.buttonHoldStartTime = null;
        this.startButton.classList.remove('active');
        if (this.isInitialized) {
            }
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