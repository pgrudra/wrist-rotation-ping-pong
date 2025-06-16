export default class PlayScene {
    constructor(gameManager, handTracker) {
        this.gameManager = gameManager;
        this.handTracker = handTracker;
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game properties
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.circleRadius = 250;
        this.arcLength = Math.PI / 3; // 60 degrees
        this.arcWidth = 20;
        
        // Paddle positions (in radians)
        this.paddle1Angle = 0;
        this.paddle2Angle = Math.PI;
        
        // Dynamic arc complexity based on score
        this.baseArcLength = Math.PI / 3; // 60 degrees (initial size)
        this.gapSize = Math.PI / 36;      // 5 degrees per gap
        this.bumpSize = Math.PI / 24;     // 7.5 degrees per bump (much larger)
        this.maxGaps = 3;                 // Maximum gaps per paddle
        this.maxBumps = 4;                // Maximum bumps per paddle
        
        // Ball properties - start ball moving toward first paddle
        this.ball = {
            x: this.centerX - 50, // Start slightly left of center
            y: this.centerY + (Math.random() - 0.5) * 100, // Random Y position within ±50 pixels
            radius: 8,
            vx: 2,
            vy: (Math.random() - 0.5) * 1.5, // Random vertical velocity between -0.75 and 0.75
            speed: 4
        };
        
        // Game mechanics
        this.gameOver = false;
        this.currentRotationSpeed = 0; // Current paddle rotation speed
        this.score = 0;
        this.gameRunning = true;
        
        // Frame rate independence
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.deltaTime = 1000 / this.targetFPS;
        
        this.createPlayUI();
        this.startGameLoop();
    }
    
    createPlayUI() {
        const playContainer = document.createElement('div');
        playContainer.className = 'play-scene';
        playContainer.innerHTML = `
            <div class="camera-container">
                <video id="fullscreenVideoFeed" autoplay muted playsinline webkit-playsinline></video>
            </div>
            <div class="game-canvas-container">
                <canvas id="gameCanvasOverlay" width="800" height="600"></canvas>
            </div>
            <div class="virtual-buttons">
                <div class="virtual-button clockwise-btn" id="clockwiseBtn">
                    <div class="btn-icon">⟳</div>
                    <div class="btn-label">Clockwise</div>
                </div>
                <div class="virtual-button anticlockwise-btn" id="anticlockwiseBtn">
                    <div class="btn-icon">⟲</div>
                    <div class="btn-label">Anti-clockwise</div>
                </div>
            </div>
            <div class="game-ui">
                <div class="score-display" id="playScore">Score: 0</div>
                <div class="status-display" id="playStatus">Point index finger at rotation buttons to control paddles!</div>
            </div>
        `;
        
        document.body.appendChild(playContainer);
        this.playContainer = playContainer;
        this.scoreElement = document.getElementById('playScore');
        this.statusElement = document.getElementById('playStatus');
        
        // Setup fullscreen video feed
        this.setupFullscreenVideo();
        
        // Setup game canvas overlay
        this.setupGameCanvas();
        
        // Setup virtual buttons
        this.setupVirtualButtons();
    }
    
    /**
     * [FIX 2.0] Calculates the correct scaling and offset for the video feed
     * to handle the `object-fit: cover` style. This ensures that the
     * normalized coordinates from MediaPipe map correctly to the visible
     * area of the video on screen.
     * @param {HTMLVideoElement} videoElement The video element being displayed.
     * @returns {{renderWidth: number, renderHeight: number, x: number, y: number}}
     */
    getCoordinateMappingInfo(videoElement) {
        const videoRect = videoElement.getBoundingClientRect();

        // Intrinsic dimensions of the video stream
        const videoWidth = videoElement.videoWidth;
        const videoHeight = videoElement.videoHeight;

        // Displayed dimensions of the video element on the page
        const elementWidth = videoRect.width;
        const elementHeight = videoRect.height;
        
        if (videoWidth === 0 || videoHeight === 0) {
             return { renderWidth: elementWidth, renderHeight: elementHeight, x: videoRect.left, y: videoRect.top };
        }

        const videoAspectRatio = videoWidth / videoHeight;
        const elementAspectRatio = elementWidth / elementHeight;

        let renderWidth, renderHeight, xOffset, yOffset;

        // Logic for `object-fit: cover`
        if (elementAspectRatio > videoAspectRatio) {
            // Element is WIDER than video. Scale by width. Height will be clipped.
            renderWidth = elementWidth;
            renderHeight = elementWidth / videoAspectRatio;
            xOffset = 0;
            yOffset = (elementHeight - renderHeight) / 2;
        } else {
            // Element is TALLER/SKINNIER than video. Scale by height. Width will be clipped.
            renderHeight = elementHeight;
            renderWidth = elementHeight * videoAspectRatio;
            yOffset = 0;
            xOffset = (elementWidth - renderWidth) / 2;
        }

        return {
            renderWidth,
            renderHeight,
            x: videoRect.left + xOffset,
            y: videoRect.top + yOffset,
        };
    }
    
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
    
    getPaddleConfiguration() {
        const gapCount = Math.min(Math.floor(this.score / 3), this.maxGaps);
        const bumpCount = Math.min(Math.floor(this.score / 4), this.maxBumps);
        
        return {
            arcLength: this.baseArcLength,
            gaps: gapCount,
            bumps: bumpCount
        };
    }
    
    getPaddleSegments(paddleAngle, config) {
        const halfArc = config.arcLength / 2;
        const segments = [];
        
        if (config.gaps === 0) {
            const segmentStart = paddleAngle - halfArc;
            const segmentEnd = paddleAngle + halfArc;
            
            const segmentBumps = [];
            for (let j = 0; j < config.bumps; j++) {
                const bumpPosition = segmentStart + (j + 1) * (config.arcLength / (config.bumps + 1));
                segmentBumps.push({
                    angle: bumpPosition,
                    size: this.bumpSize
                });
            }
            
            segments.push({
                start: this.normalizeAngle(segmentStart),
                end: this.normalizeAngle(segmentEnd),
                bumps: segmentBumps
            });
            
            return segments;
        }
        
        const totalGapSize = config.gaps * this.gapSize;
        const availableSpace = config.arcLength - totalGapSize;
        const segmentCount = config.gaps + 1;
        const segmentSize = availableSpace / segmentCount;
        
        for (let i = 0; i < segmentCount; i++) {
            const segmentStart = paddleAngle - halfArc + i * (segmentSize + this.gapSize);
            const segmentEnd = segmentStart + segmentSize;
            
            segments.push({
                start: this.normalizeAngle(segmentStart),
                end: this.normalizeAngle(segmentEnd),
                bumps: []
            });
        }
        
        for (let bumpIndex = 0; bumpIndex < config.bumps; bumpIndex++) {
            const segmentIndex = bumpIndex % segmentCount;
            const segment = segments[segmentIndex];
            const bumpCount = segment.bumps.length + 1;
            
            const segmentStart = paddleAngle - halfArc + segmentIndex * (segmentSize + this.gapSize);
            const bumpPosition = segmentStart + bumpCount * (segmentSize / (Math.ceil(config.bumps / segmentCount) + 1));
            
            segment.bumps.push({
                angle: bumpPosition,
                size: this.bumpSize
            });
        }
        
        return segments;
    }
    
    updateBall(currentTime) {
        if (!this.gameRunning || this.gameOver) return;
        
        // Calculate delta time for frame rate independence
        if (this.lastFrameTime === 0) {
            this.lastFrameTime = currentTime;
            return;
        }
        
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        const frameMultiplier = deltaTime / (1000 / this.targetFPS);
        
        if (this.currentRotationSpeed !== 0) {
            this.paddle1Angle -= this.currentRotationSpeed * frameMultiplier;
            this.paddle2Angle -= this.currentRotationSpeed * frameMultiplier;
        }
        
        this.ball.x += this.ball.vx * frameMultiplier;
        this.ball.y += this.ball.vy * frameMultiplier;
        
        const distFromCenter = Math.sqrt(
            Math.pow(this.ball.x - this.centerX, 2) + 
            Math.pow(this.ball.y - this.centerY, 2)
        );
        
        if (distFromCenter + this.ball.radius >= this.circleRadius) {
            const ballAngle = Math.atan2(this.ball.y - this.centerY, this.ball.x - this.centerX);
            
            const paddle1Hit = this.isBallHittingPaddle(ballAngle, this.paddle1Angle);
            const paddle2Hit = this.isBallHittingPaddle(ballAngle, this.paddle2Angle);
            
            if (paddle1Hit.hit || paddle2Hit.hit) {
                const hitSegment = paddle1Hit.hit ? paddle1Hit.segment : paddle2Hit.segment;
                
                let hitBump = false;
                let bumpAngle = 0;
                
                const ballCollisionX = this.centerX + this.circleRadius * Math.cos(ballAngle);
                const ballCollisionY = this.centerY + this.circleRadius * Math.sin(ballAngle);
                
                for (let bump of hitSegment.bumps) {
                    const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                    const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                    
                    const distance = Math.sqrt(
                        Math.pow(ballCollisionX - bumpX, 2) + 
                        Math.pow(ballCollisionY - bumpY, 2)
                    );
                    
                    if (distance <= 15) {
                        hitBump = true;
                        bumpAngle = bump.angle;
                        break;
                    }
                }
                
                if (hitBump) {
                    this.reflectBallFromBump(bumpAngle);
                } else {
                    this.reflectBall();
                }
                
                this.score++;
                this.scoreElement.textContent = `Score: ${this.score}`;
                
                this.ball.vx += (Math.random() - 0.5) * 0.2;
                this.ball.vy += (Math.random() - 0.5) * 0.2;
                
                const baseSpeed = 4 + (this.score * 0.05);
                const maxSpeed = Math.min(baseSpeed + 2, 8);
                const currentSpeed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
                
                if (currentSpeed < baseSpeed) {
                    const speedMultiplier = baseSpeed / currentSpeed;
                    this.ball.vx *= speedMultiplier;
                    this.ball.vy *= speedMultiplier;
                } else if (currentSpeed > maxSpeed) {
                    const speedMultiplier = maxSpeed / currentSpeed;
                    this.ball.vx *= speedMultiplier;
                    this.ball.vy *= speedMultiplier;
                }
                
            } else {
                this.endGame();
            }
        }
    }
    
    isAngleInRange(angle, start, end) {
        angle = angle < 0 ? angle + 2 * Math.PI : angle;
        start = start < 0 ? start + 2 * Math.PI : start;
        end = end < 0 ? end + 2 * Math.PI : end;
        
        if (start <= end) {
            return angle >= start && angle <= end;
        } else {
            return angle >= start || angle <= end;
        }
    }
    
    isBallHittingPaddle(ballAngle, paddleAngle) {
        const paddleConfig = this.getPaddleConfiguration();
        const segments = this.getPaddleSegments(paddleAngle, paddleConfig);
        
        const normalizedBallAngle = this.normalizeAngle(ballAngle);
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            if (this.isAngleInRange(normalizedBallAngle, segment.start, segment.end)) {
                return { hit: true, segment: segment };
            }
        }
        
        return { hit: false };
    }
    
    reflectBall() {
        const normal = {
            x: (this.ball.x - this.centerX) / this.circleRadius,
            y: (this.ball.y - this.centerY) / this.circleRadius
        };
        
        const dot = this.ball.vx * normal.x + this.ball.vy * normal.y;
        this.ball.vx -= 2 * dot * normal.x;
        this.ball.vy -= 2 * dot * normal.y;
        
        // Add slight randomness to reflection angle to make trajectory less predictable
        const randomFactor = 0.15; // Adjust this value to control randomness (0.1-0.3 recommended)
        this.ball.vx += (Math.random() - 0.5) * randomFactor;
        this.ball.vy += (Math.random() - 0.5) * randomFactor;
        
        this.ball.x = this.centerX + normal.x * (this.circleRadius - this.ball.radius - 5);
        this.ball.y = this.centerY + normal.y * (this.circleRadius - this.ball.radius - 5);
    }
    
    reflectBallFromBump(bumpAngle) {
        const randomDeflection = (Math.random() - 0.5) * Math.PI * 0.8;
        const deflectionAngle = bumpAngle + randomDeflection;
        
        const speed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
        const newDirection = deflectionAngle + Math.PI + (Math.random() - 0.5) * Math.PI / 6;
        
        this.ball.vx = Math.cos(newDirection) * speed * 1.3;
        this.ball.vy = Math.sin(newDirection) * speed * 1.3;
        
        const normal = {
            x: (this.ball.x - this.centerX) / this.circleRadius,
            y: (this.ball.y - this.centerY) / this.circleRadius
        };
        this.ball.x = this.centerX + normal.x * (this.circleRadius - this.ball.radius - 10);
        this.ball.y = this.centerY + normal.y * (this.circleRadius - this.ball.radius - 10);
    }
    
    drawArc(centerX, centerY, radius, startAngle, endAngle, color, width, ctx = null) {
        const context = ctx || this.ctx;
        context.beginPath();
        context.arc(centerX, centerY, radius, startAngle, endAngle);
        context.strokeStyle = color;
        context.lineWidth = width;
        context.stroke();
    }
    
    drawFingerIndicator(ctx) {
        if (!this.currentFingerPosition) return;
        
        const videoElement = document.getElementById('fullscreenVideoFeed') || document.getElementById('videoFeed');
        if (!videoElement) return;
        
        // Use the new mapping function for accurate coordinates
        const mapping = this.getCoordinateMappingInfo(videoElement);
        const xOnScreen = this.currentFingerPosition.x * mapping.renderWidth + mapping.x;
        const yOnScreen = this.currentFingerPosition.y * mapping.renderHeight + mapping.y;

        // Convert screen coordinates to canvas coordinates
        const canvas = this.overlayCanvas || this.canvas;
        const rect = canvas.getBoundingClientRect();
        const canvasX = (xOnScreen - rect.left) * (canvas.width / rect.width);
        const canvasY = (yOnScreen - rect.top) * (canvas.height / rect.height);
        
        // Draw large, highly visible finger indicator
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 15, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20;
        ctx.fill();
        
        // Draw white inner dot for better contrast
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fill();
        
        // Draw coordinate text for debugging
        ctx.shadowBlur = 0;
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#ffff00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const coordText = `(${this.currentFingerPosition.x.toFixed(2)}, ${this.currentFingerPosition.y.toFixed(2)})`;
        ctx.strokeText(coordText, canvasX + 20, canvasY - 20);
        ctx.fillText(coordText, canvasX + 20, canvasY - 20);
        
        // Draw crosshairs for precise positioning
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(canvasX - 25, canvasY);
        ctx.lineTo(canvasX + 25, canvasY);
        ctx.moveTo(canvasX, canvasY - 25);
        ctx.lineTo(canvasX, canvasY + 25);
        ctx.stroke();
        
        // Draw detection status
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#00ff00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const statusText = 'FINGER DETECTED';
        ctx.strokeText(statusText, canvasX - 60, canvasY + 40);
        ctx.fillText(statusText, canvasX - 60, canvasY + 40);
    }
    
    render() {
        // Use overlay canvas instead of original canvas
        const ctx = this.overlayCtx || this.ctx;
        const canvas = this.overlayCanvas || this.canvas;
        
        // Clear the canvas to make it fully transparent
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add a subtle translucent background only around the game elements
        ctx.fillStyle = 'rgba(0, 17, 34, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw outer circle with enhanced visibility
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.circleRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        const paddleConfig = this.getPaddleConfiguration();
        const paddle1Segments = this.getPaddleSegments(this.paddle1Angle, paddleConfig);
        const paddle2Segments = this.getPaddleSegments(this.paddle2Angle, paddleConfig);
        
        paddle1Segments.forEach(segment => {
            // Draw paddle segments with enhanced visibility
            ctx.shadowColor = '#ff0080';
            ctx.shadowBlur = 8;
            this.drawArc(
                this.centerX, this.centerY, this.circleRadius,
                segment.start, segment.end,
                '#ff0080', this.arcWidth + 2, ctx
            );
            ctx.shadowBlur = 0;
            
            segment.bumps.forEach(bump => {
                const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                ctx.beginPath();
                ctx.arc(bumpX, bumpY, 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#ff0000';
                ctx.fill();
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        });
        
        paddle2Segments.forEach(segment => {
            // Draw paddle segments with enhanced visibility
            ctx.shadowColor = '#ff0080';
            ctx.shadowBlur = 8;
            this.drawArc(
                this.centerX, this.centerY, this.circleRadius,
                segment.start, segment.end,
                '#ff0080', this.arcWidth + 2, ctx
            );
            ctx.shadowBlur = 0;
            
            segment.bumps.forEach(bump => {
                const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                ctx.beginPath();
                ctx.arc(bumpX, bumpY, 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#ff0000';
                ctx.fill();
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        });
        
        // Draw ball with enhanced visibility and larger size
        ctx.beginPath();
        ctx.arc(this.ball.x, this.ball.y, this.ball.radius + 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 15;
        ctx.fill();
        
        // Add a white inner glow for better contrast
        ctx.beginPath();
        ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        if (this.gameRunning && !this.gameOver) {
            // Draw text with enhanced visibility
            ctx.textAlign = 'center';
            
            // Speed text with background
            const speedText = this.currentRotationSpeed === 0 ? 'STOPPED' : 
                             this.currentRotationSpeed > 0 ? `CLOCKWISE ${(this.currentRotationSpeed * 1000).toFixed(1)}` :
                             `COUNTER-CLOCKWISE ${(-this.currentRotationSpeed * 1000).toFixed(1)}`;
            
            ctx.font = 'bold 18px Arial';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            const speedTextWidth = ctx.measureText(speedText).width;
            ctx.fillRect(this.centerX - speedTextWidth/2 - 10, this.centerY + 25, speedTextWidth + 20, 25);
            
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 5;
            ctx.fillText(speedText, this.centerX, this.centerY + 45);
            ctx.shadowBlur = 0;
            
            // Difficulty text with background
            const paddleConfig = this.getPaddleConfiguration();
            const difficultyLevel = Math.max(Math.floor(this.score / 3), Math.floor(this.score / 4)) + 1;
            const difficultyText = `Difficulty: Level ${difficultyLevel} | Gaps: ${paddleConfig.gaps} | Bumps: ${paddleConfig.bumps}`;
            
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            const diffTextWidth = ctx.measureText(difficultyText).width;
            ctx.fillRect(this.centerX - diffTextWidth/2 - 10, this.centerY + 55, diffTextWidth + 20, 22);
            
            ctx.fillStyle = '#ffaa00';
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 5;
            ctx.fillText(difficultyText, this.centerX, this.centerY + 70);
            ctx.shadowBlur = 0;
        }
        
        // Draw center point with enhanced visibility
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw finger position indicator
        this.drawFingerIndicator(ctx);
    }
    
    startGameLoop() {
        const gameLoop = (currentTime) => {
            if (this.gameRunning && !this.gameOver) {
                this.updateBall(currentTime);
                this.render();
                requestAnimationFrame(gameLoop);
            }
        };
        requestAnimationFrame(gameLoop);
    }
    
    endGame() {
        this.gameOver = true;
        this.gameRunning = false;
        this.gameManager.endGame(this.score);
    }
    
    updateRotationSpeed(speed) {
        this.currentRotationSpeed = speed;
        if (this.handTracker && this.statusElement) {
            this.statusElement.textContent = `Hand detected! Rotation speed: ${(speed * 1000).toFixed(1)}`;
        }
    }
    
    setupFullscreenVideo() {
        const originalVideo = document.getElementById('videoFeed');
        const fullscreenVideo = document.getElementById('fullscreenVideoFeed');
        
        if (originalVideo && fullscreenVideo) {
            // Copy the video stream to the fullscreen video element
            if (originalVideo.srcObject) {
                fullscreenVideo.srcObject = originalVideo.srcObject;
            }
            
            // Hide the original small video feed
            originalVideo.style.display = 'none';
        }
    }
    
    setupGameCanvas() {
        const overlayCanvas = document.getElementById('gameCanvasOverlay');
        if (overlayCanvas) {
            // Copy the original canvas content to the overlay canvas
            this.overlayCanvas = overlayCanvas;
            this.overlayCtx = overlayCanvas.getContext('2d');
            
            // Hide the original canvas
            this.canvas.style.display = 'none';
        }
    }
    
    setupVirtualButtons() {
        this.clockwiseBtn = document.getElementById('clockwiseBtn');
        this.anticlockwiseBtn = document.getElementById('anticlockwiseBtn');
        
        // Button interaction states
        this.buttonStates = {
            clockwise: false,
            anticlockwise: false
        };
    }
    
    updateVirtualButtonStates(handData) {
        // Store finger position for rendering
        this.currentFingerPosition = handData.indexFingerPosition;
        
        if (!handData.handDetected || !handData.indexFingerPosition) {
            this.resetButtonStates();
            return;
        }
        
        const fingerPos = handData.indexFingerPosition;
        const clockwiseHit = this.isFingerOverButton(fingerPos, this.clockwiseBtn);
        const anticlockwiseHit = this.isFingerOverButton(fingerPos, this.anticlockwiseBtn);
        
        // Update button states
        this.buttonStates.clockwise = clockwiseHit;
        this.buttonStates.anticlockwise = anticlockwiseHit;
        
        // Update visual feedback
        this.updateButtonVisuals();
        
        // Determine rotation speed
        let rotationSpeed = 0;
        if (clockwiseHit && !anticlockwiseHit) {
            rotationSpeed = 0.02;
        } else if (anticlockwiseHit && !clockwiseHit) {
            rotationSpeed = -0.02;
        }
        
        this.updateRotationSpeed(rotationSpeed);
    }
    
    isFingerOverButton(fingerPos, buttonElement) {
        if (!buttonElement || !fingerPos) return false;
        
        const videoElement = document.getElementById('fullscreenVideoFeed') || document.getElementById('videoFeed');
        if (!videoElement) return false;
        
        const buttonRect = buttonElement.getBoundingClientRect();
        
        // Use the new mapping function for accurate coordinates
        const mapping = this.getCoordinateMappingInfo(videoElement);
        const x = fingerPos.x * mapping.renderWidth + mapping.x;
        const y = fingerPos.y * mapping.renderHeight + mapping.y;
        
        return x >= buttonRect.left && x <= buttonRect.right && y >= buttonRect.top && y <= buttonRect.bottom;
    }
    
    updateButtonVisuals() {
        if (this.clockwiseBtn) {
            this.clockwiseBtn.classList.toggle('active', this.buttonStates.clockwise);
        }
        if (this.anticlockwiseBtn) {
            this.anticlockwiseBtn.classList.toggle('active', this.buttonStates.anticlockwise);
        }
    }
    
    resetButtonStates() {
        this.buttonStates.clockwise = false;
        this.buttonStates.anticlockwise = false;
        this.currentFingerPosition = null;
        this.updateButtonVisuals();
        this.updateRotationSpeed(0);
    }
    
    hide() {
        this.playContainer.style.display = 'none';
        this.canvas.style.display = 'none';
        
        // Hide fullscreen video feed
        const fullscreenVideo = document.getElementById('fullscreenVideoFeed');
        if (fullscreenVideo) {
            fullscreenVideo.style.display = 'none';
        }
        
        // Hide original video feed
        const videoFeed = document.getElementById('videoFeed');
        if (videoFeed) {
            videoFeed.style.display = 'none';
        }
    }
    
    destroy() {
        this.gameRunning = false;
        this.gameOver = true;
        
        // Remove canvas from play container and hide it
        if (this.canvas && this.canvas.parentNode === this.playContainer) {
            document.body.appendChild(this.canvas);
        }
        this.canvas.style.display = 'none';
        
        // Hide fullscreen video feed
        const fullscreenVideo = document.getElementById('fullscreenVideoFeed');
        if (fullscreenVideo) {
            fullscreenVideo.style.display = 'none';
            fullscreenVideo.srcObject = null;
        }
        
        // Hide original video feed
        const videoFeed = document.getElementById('videoFeed');
        if (videoFeed) {
            videoFeed.style.display = 'none';
        }
        
        if (this.playContainer) {
            this.playContainer.remove();
        }
    }
}
