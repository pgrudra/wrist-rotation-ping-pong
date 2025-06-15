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
            y: this.centerY,
            radius: 8,
            vx: 2,
            vy: 0,
            speed: 4
        };
        
        // Game mechanics
        this.gameOver = false;
        this.currentRotationSpeed = 0; // Current paddle rotation speed
        this.score = 0;
        this.gameRunning = true;
        
        this.createPlayUI();
        this.startGameLoop();
    }
    
    createPlayUI() {
        const playContainer = document.createElement('div');
        playContainer.className = 'play-scene';
        playContainer.innerHTML = `
            <div class="game-ui">
                <div class="score-display" id="playScore">Score: 0</div>
                <div class="status-display" id="playStatus">Game started! Use hand gestures to control paddles.</div>
            </div>
        `;
        
        document.body.appendChild(playContainer);
        this.playContainer = playContainer;
        this.scoreElement = document.getElementById('playScore');
        this.statusElement = document.getElementById('playStatus');
        
        // Show and position canvas
        this.canvas.style.display = 'block';
        this.canvas.style.position = 'relative';
        this.canvas.style.zIndex = '550';
        
        // Show video feed during gameplay
        const videoFeed = document.getElementById('videoFeed');
        if (videoFeed) {
            videoFeed.style.display = 'block';
            
            // Force video dimensions for mobile screens
            if (window.innerWidth <= 768) {
                videoFeed.style.width = '120px';
                videoFeed.style.height = '160px';
                videoFeed.style.minWidth = '120px';
                videoFeed.style.minHeight = '160px';
                videoFeed.style.maxWidth = '120px';
                videoFeed.style.maxHeight = '160px';
                videoFeed.style.objectFit = 'fill';
                videoFeed.style.aspectRatio = '120/160';
            }
        }
        
        // Append canvas to play container to ensure proper layering
        this.playContainer.appendChild(this.canvas);
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
    
    updateBall() {
        if (!this.gameRunning || this.gameOver) return;
        
        if (this.currentRotationSpeed !== 0) {
            this.paddle1Angle -= this.currentRotationSpeed;
            this.paddle2Angle -= this.currentRotationSpeed;
        }
        
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        
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
    
    drawArc(centerX, centerY, radius, startAngle, endAngle, color, width) {
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.stroke();
    }
    
    render() {
        this.ctx.fillStyle = '#001122';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.circleRadius, 0, 2 * Math.PI);
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        const paddleConfig = this.getPaddleConfiguration();
        const paddle1Segments = this.getPaddleSegments(this.paddle1Angle, paddleConfig);
        const paddle2Segments = this.getPaddleSegments(this.paddle2Angle, paddleConfig);
        
        paddle1Segments.forEach(segment => {
            this.drawArc(
                this.centerX, this.centerY, this.circleRadius,
                segment.start, segment.end,
                '#ff0080', this.arcWidth
            );
            
            segment.bumps.forEach(bump => {
                const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                this.ctx.beginPath();
                this.ctx.arc(bumpX, bumpY, 8, 0, 2 * Math.PI);
                this.ctx.fillStyle = '#ff0000';
                this.ctx.fill();
                this.ctx.shadowColor = '#ff0000';
                this.ctx.shadowBlur = 8;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            });
        });
        
        paddle2Segments.forEach(segment => {
            this.drawArc(
                this.centerX, this.centerY, this.circleRadius,
                segment.start, segment.end,
                '#ff0080', this.arcWidth
            );
            
            segment.bumps.forEach(bump => {
                const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                this.ctx.beginPath();
                this.ctx.arc(bumpX, bumpY, 8, 0, 2 * Math.PI);
                this.ctx.fillStyle = '#ff0000';
                this.ctx.fill();
                this.ctx.shadowColor = '#ff0000';
                this.ctx.shadowBlur = 8;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            });
        });
        
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#ffff00';
        this.ctx.fill();
        
        this.ctx.shadowColor = '#ffff00';
        this.ctx.shadowBlur = 10;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        
        if (this.gameRunning && !this.gameOver) {
            this.ctx.fillStyle = '#00ffff';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            const speedText = this.currentRotationSpeed === 0 ? 'STOPPED' : 
                             this.currentRotationSpeed > 0 ? `CLOCKWISE ${(this.currentRotationSpeed * 1000).toFixed(1)}` :
                             `COUNTER-CLOCKWISE ${(-this.currentRotationSpeed * 1000).toFixed(1)}`;
            this.ctx.fillText(speedText, this.centerX, this.centerY + 40);
            
            const paddleConfig = this.getPaddleConfiguration();
            const difficultyLevel = Math.max(Math.floor(this.score / 3), Math.floor(this.score / 4)) + 1;
            this.ctx.fillStyle = '#ffaa00';
            this.ctx.font = '14px Arial';
            this.ctx.fillText(`Difficulty: Level ${difficultyLevel} | Gaps: ${paddleConfig.gaps} | Bumps: ${paddleConfig.bumps}`, this.centerX, this.centerY + 60);
        }
        
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 3, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#00ffff';
        this.ctx.fill();
    }
    
    startGameLoop() {
        const gameLoop = () => {
            if (this.gameRunning && !this.gameOver) {
                this.updateBall();
                this.render();
                requestAnimationFrame(gameLoop);
            }
        };
        gameLoop();
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
    
    hide() {
        this.playContainer.style.display = 'none';
        this.canvas.style.display = 'none';
        
        // Hide video feed
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
        
        // Hide video feed when game ends
        const videoFeed = document.getElementById('videoFeed');
        if (videoFeed) {
            videoFeed.style.display = 'none';
        }
        
        if (this.playContainer) {
            this.playContainer.remove();
        }
    }
}