import './style.css';
import HandTracker from './HandTracker.js';

class CircularPingPong {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.videoElement = document.getElementById('hiddenVideo');
        this.videoFeed = document.getElementById('videoFeed');
        this.scoreElement = document.getElementById('score');
        this.statusElement = document.getElementById('status');
        this.restartButton = document.getElementById('restartButton');
        
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
        
        // Ball properties
        this.ball = {
            x: this.centerX,
            y: this.centerY,
            radius: 8,
            vx: 3,
            vy: 2,
            speed: 4
        };
        
        // Game mechanics
        this.gameOver = false;
        this.currentRotationSpeed = 0; // Current paddle rotation speed
        
        // Game state
        this.score = 0;
        this.gameRunning = false;
        
        // Hand tracking
        this.handTracker = null;
        
        this.initializeHandTracking();
        this.setupKeyboardControls();
        this.setupRestartButton();
        this.gameLoop();
    }
    
    async initializeHandTracking() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            
            this.videoElement.srcObject = stream;
            this.videoFeed.srcObject = stream;
            
            this.videoElement.onloadedmetadata = async () => {
                this.videoElement.play();
                this.videoFeed.play();
                
                this.handTracker = new HandTracker(
                    this.videoElement, 
                    this.onThumbControl.bind(this)
                );
                
                await this.handTracker.start();
                this.statusElement.textContent = "Camera ready. Show your hand to start!";
            };
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.statusElement.textContent = "Camera access denied. Game will work with keyboard controls.";
        }
    }
    
    onThumbControl(data) {
        if (data.handDetected && !this.gameOver) {
            // Set current rotation speed based on thumb position
            this.currentRotationSpeed = data.rotationSpeed;
            
            if (!this.gameRunning) {
                this.gameRunning = true;
                this.statusElement.textContent = `Hand detected! Confidence: ${(data.confidence * 100).toFixed(0)}% - Game started!`;
            }
        } else {
            // No hand detected, stop rotation
            this.currentRotationSpeed = 0;
        }
    }
    
    
    
    normalizeAngle(angle) {
        // Normalize to [-PI, PI] range
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
    
    getPaddleConfiguration() {
        // Add gaps every 3 points, bumps every 4 points
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
        
        // Handle the simple case first: no gaps (score 0-2)
        if (config.gaps === 0) {
            const segmentStart = paddleAngle - halfArc;
            const segmentEnd = paddleAngle + halfArc;
            
            // Add bumps for the full paddle
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
        
        // Handle complex case: gaps present
        const totalGapSize = config.gaps * this.gapSize;
        const availableSpace = config.arcLength - totalGapSize;
        const segmentCount = config.gaps + 1;
        const segmentSize = availableSpace / segmentCount;
        
        // First, create all segments without bumps
        for (let i = 0; i < segmentCount; i++) {
            const segmentStart = paddleAngle - halfArc + i * (segmentSize + this.gapSize);
            const segmentEnd = segmentStart + segmentSize;
            
            segments.push({
                start: this.normalizeAngle(segmentStart),
                end: this.normalizeAngle(segmentEnd),
                bumps: []
            });
        }
        
        // Then distribute bumps across segments (round-robin style)
        for (let bumpIndex = 0; bumpIndex < config.bumps; bumpIndex++) {
            const segmentIndex = bumpIndex % segmentCount;
            const segment = segments[segmentIndex];
            const bumpCount = segment.bumps.length + 1;
            
            // Calculate bump position within this segment
            const segmentStart = paddleAngle - halfArc + segmentIndex * (segmentSize + this.gapSize);
            const bumpPosition = segmentStart + bumpCount * (segmentSize / (Math.ceil(config.bumps / segmentCount) + 1));
            
            segment.bumps.push({
                angle: bumpPosition,
                size: this.bumpSize
            });
        }
        
        return segments;
    }
    
    setupRestartButton() {
        this.restartButton.addEventListener('click', () => {
            if (this.gameOver) {
                this.resetGame();
            }
        });
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (this.gameOver) return; // Don't allow controls when game is over
            
            const rotationAmount = 0.1;
            switch(e.key) {
                case 'ArrowLeft':
                    this.paddle1Angle -= rotationAmount;
                    this.paddle2Angle -= rotationAmount;
                    break;
                case 'ArrowRight':
                    this.paddle1Angle += rotationAmount;
                    this.paddle2Angle += rotationAmount;
                    break;
            }
            if (!this.gameRunning) {
                this.gameRunning = true;
                this.statusElement.textContent = "Game started! Use arrow keys to control paddles.";
            }
        });
    }
    
    updateBall() {
        if (!this.gameRunning || this.gameOver) return;
        
        // Apply continuous rotation based on thumb position
        if (this.currentRotationSpeed !== 0) {
            this.paddle1Angle += this.currentRotationSpeed;
            this.paddle2Angle += this.currentRotationSpeed;
        }
        
        // Update ball position
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        
        // Check collision with circle boundary
        const distFromCenter = Math.sqrt(
            Math.pow(this.ball.x - this.centerX, 2) + 
            Math.pow(this.ball.y - this.centerY, 2)
        );
        
        if (distFromCenter + this.ball.radius >= this.circleRadius) {
            // Check if ball hits a paddle
            const ballAngle = Math.atan2(this.ball.y - this.centerY, this.ball.x - this.centerX);
            
            const paddle1Hit = this.isBallHittingPaddle(ballAngle, this.paddle1Angle);
            const paddle2Hit = this.isBallHittingPaddle(ballAngle, this.paddle2Angle);
            
            if (paddle1Hit.hit || paddle2Hit.hit) {
                const hitSegment = paddle1Hit.hit ? paddle1Hit.segment : paddle2Hit.segment;
                
                // Check if ball hits a bump for unpredictable reflection
                let hitBump = false;
                let bumpAngle = 0;
                
                // Calculate ball's collision point on the circle
                const ballCollisionX = this.centerX + this.circleRadius * Math.cos(ballAngle);
                const ballCollisionY = this.centerY + this.circleRadius * Math.sin(ballAngle);
                
                for (let bump of hitSegment.bumps) {
                    // Calculate bump position on the circle
                    const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                    const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                    
                    // Calculate distance between ball collision point and bump center
                    const distance = Math.sqrt(
                        Math.pow(ballCollisionX - bumpX, 2) + 
                        Math.pow(ballCollisionY - bumpY, 2)
                    );
                    
                    // Check if ball is close enough to bump (bump visual radius is 8px)
                    if (distance <= 15) { // Slightly larger than visual bump radius for better gameplay
                        hitBump = true;
                        bumpAngle = bump.angle;
                        console.log(`BUMP HIT! Distance: ${distance.toFixed(1)}px from bump center`);
                        break;
                    }
                }
                
                if (hitBump) {
                    // Unpredictable reflection from bump
                    this.reflectBallFromBump(bumpAngle);
                } else {
                    // Normal reflection from paddle
                    this.reflectBall();
                }
                
                this.score++;
                this.scoreElement.textContent = `Score: ${this.score}`;
                
                // Add some randomness to keep game interesting
                this.ball.vx += (Math.random() - 0.5) * 0.2;
                this.ball.vy += (Math.random() - 0.5) * 0.2;
                
                // Gradually increase speed with score, but maintain reasonable limits
                const baseSpeed = 4 + (this.score * 0.05); // Very gradual increase
                const maxSpeed = Math.min(baseSpeed + 2, 8); // Cap at 8 for playability
                const currentSpeed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
                
                // Ensure minimum speed and gradual increase
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
                // Game over
                this.gameOver = true;
                this.gameRunning = false;
                this.statusElement.textContent = "Game Over! Click restart button to play again";
                this.restartButton.style.display = 'block';
            }
        }
    }
    
    isAngleInRange(angle, start, end) {
        // Normalize all angles to [0, 2*PI] for consistent comparison
        angle = angle < 0 ? angle + 2 * Math.PI : angle;
        start = start < 0 ? start + 2 * Math.PI : start;
        end = end < 0 ? end + 2 * Math.PI : end;
        
        if (start <= end) {
            // Normal case: range doesn't cross 0
            return angle >= start && angle <= end;
        } else {
            // Range crosses 0 (e.g., start=350°, end=10°)
            return angle >= start || angle <= end;
        }
    }
    
    isBallHittingPaddle(ballAngle, paddleAngle) {
        const paddleConfig = this.getPaddleConfiguration();
        const segments = this.getPaddleSegments(paddleAngle, paddleConfig);
        
        // Normalize ball angle
        const normalizedBallAngle = this.normalizeAngle(ballAngle);
        
        // Debug logging
        if (segments.length > 0) {
            console.log(`Score: ${this.score}, Config: gaps=${paddleConfig.gaps}, bumps=${paddleConfig.bumps}`);
            console.log(`Ball angle: ${(normalizedBallAngle * 180/Math.PI).toFixed(1)}°, Paddle: ${(paddleAngle * 180/Math.PI).toFixed(1)}°, Checking ${segments.length} segments`);
            
            // Log bump information
            let totalBumps = 0;
            segments.forEach((seg, i) => {
                totalBumps += seg.bumps.length;
                if (seg.bumps.length > 0) {
                    console.log(`Segment ${i} has ${seg.bumps.length} bumps`);
                }
            });
            console.log(`Total bumps rendered: ${totalBumps}`);
        }
        
        // Check if ball hits any segment (not in gaps)
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            if (this.isAngleInRange(normalizedBallAngle, segment.start, segment.end)) {
                console.log(`HIT! Segment ${i}: ${(segment.start * 180/Math.PI).toFixed(1)}° to ${(segment.end * 180/Math.PI).toFixed(1)}°`);
                return { hit: true, segment: segment };
            } else {
                console.log(`Miss segment ${i}: ${(segment.start * 180/Math.PI).toFixed(1)}° to ${(segment.end * 180/Math.PI).toFixed(1)}°`);
            }
        }
        
        console.log('No paddle hit detected');
        return { hit: false };
    }
    
    reflectBall() {
        // Calculate reflection vector
        const normal = {
            x: (this.ball.x - this.centerX) / this.circleRadius,
            y: (this.ball.y - this.centerY) / this.circleRadius
        };
        
        // Reflect velocity
        const dot = this.ball.vx * normal.x + this.ball.vy * normal.y;
        this.ball.vx -= 2 * dot * normal.x;
        this.ball.vy -= 2 * dot * normal.y;
        
        // Move ball slightly inward to prevent sticking
        this.ball.x = this.centerX + normal.x * (this.circleRadius - this.ball.radius - 5);
        this.ball.y = this.centerY + normal.y * (this.circleRadius - this.ball.radius - 5);
    }
    
    reflectBall() {
        // Calculate reflection vector
        const normal = {
            x: (this.ball.x - this.centerX) / this.circleRadius,
            y: (this.ball.y - this.centerY) / this.circleRadius
        };
        
        // Reflect velocity
        const dot = this.ball.vx * normal.x + this.ball.vy * normal.y;
        this.ball.vx -= 2 * dot * normal.x;
        this.ball.vy -= 2 * dot * normal.y;
        
        // Move ball slightly inward to prevent sticking
        this.ball.x = this.centerX + normal.x * (this.circleRadius - this.ball.radius - 5);
        this.ball.y = this.centerY + normal.y * (this.circleRadius - this.ball.radius - 5);
    }
    
    reflectBallFromBump(bumpAngle) {
        // Much more dramatic and unpredictable reflection from bump
        const randomDeflection = (Math.random() - 0.5) * Math.PI * 0.8; // ±72 degree random deflection (much wider)
        const deflectionAngle = bumpAngle + randomDeflection;
        
        // Calculate new velocity direction with more chaos
        const speed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
        const newDirection = deflectionAngle + Math.PI + (Math.random() - 0.5) * Math.PI / 6; // Additional randomness
        
        this.ball.vx = Math.cos(newDirection) * speed * 1.3; // Bigger speed boost from bump
        this.ball.vy = Math.sin(newDirection) * speed * 1.3;
        
        // Move ball inward
        const normal = {
            x: (this.ball.x - this.centerX) / this.circleRadius,
            y: (this.ball.y - this.centerY) / this.circleRadius
        };
        this.ball.x = this.centerX + normal.x * (this.circleRadius - this.ball.radius - 10);
        this.ball.y = this.centerY + normal.y * (this.circleRadius - this.ball.radius - 10);
        
        console.log(`BUMP HIT! Major deflection: ${(randomDeflection * 180/Math.PI).toFixed(1)}° + extra chaos!`);
    }
    
    resetGame() {
        this.ball.x = this.centerX;
        this.ball.y = this.centerY;
        this.ball.vx = 3;
        this.ball.vy = 2;
        this.score = 0;
        this.gameOver = false;
        this.gameRunning = false;
        this.currentRotationSpeed = 0;
        this.scoreElement.textContent = `Score: ${this.score}`;
        this.statusElement.textContent = "Show your hand or use arrow keys to start!";
        this.restartButton.style.display = 'none';
    }
    
    drawArc(centerX, centerY, radius, startAngle, endAngle, color, width) {
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.stroke();
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#001122';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw circle boundary
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.circleRadius, 0, 2 * Math.PI);
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw paddles with gaps and bumps
        const paddleConfig = this.getPaddleConfiguration();
        const paddle1Segments = this.getPaddleSegments(this.paddle1Angle, paddleConfig);
        const paddle2Segments = this.getPaddleSegments(this.paddle2Angle, paddleConfig);
        
        // Draw paddle 1 segments
        paddle1Segments.forEach(segment => {
            this.drawArc(
                this.centerX, this.centerY, this.circleRadius,
                segment.start, segment.end,
                '#ff0080', this.arcWidth
            );
            
            // Draw bumps as larger, more visible circles
            segment.bumps.forEach(bump => {
                const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                this.ctx.beginPath();
                this.ctx.arc(bumpX, bumpY, 8, 0, 2 * Math.PI); // Doubled size
                this.ctx.fillStyle = '#ff0000'; // Brighter red
                this.ctx.fill();
                // Add glow effect
                this.ctx.shadowColor = '#ff0000';
                this.ctx.shadowBlur = 8;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            });
        });
        
        // Draw paddle 2 segments
        paddle2Segments.forEach(segment => {
            this.drawArc(
                this.centerX, this.centerY, this.circleRadius,
                segment.start, segment.end,
                '#ff0080', this.arcWidth
            );
            
            // Draw bumps as larger, more visible circles
            segment.bumps.forEach(bump => {
                const bumpX = this.centerX + (this.circleRadius - this.arcWidth/2) * Math.cos(bump.angle);
                const bumpY = this.centerY + (this.circleRadius - this.arcWidth/2) * Math.sin(bump.angle);
                this.ctx.beginPath();
                this.ctx.arc(bumpX, bumpY, 8, 0, 2 * Math.PI); // Doubled size
                this.ctx.fillStyle = '#ff0000'; // Brighter red
                this.ctx.fill();
                // Add glow effect
                this.ctx.shadowColor = '#ff0000';
                this.ctx.shadowBlur = 8;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            });
        });
        
        // Draw ball
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#ffff00';
        this.ctx.fill();
        
        // Add glow effect to ball
        this.ctx.shadowColor = '#ffff00';
        this.ctx.shadowBlur = 10;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        
        // Draw rotation speed indicator
        if (this.gameRunning && !this.gameOver) {
            this.ctx.fillStyle = '#00ffff';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            const speedText = this.currentRotationSpeed === 0 ? 'STOPPED' : 
                             this.currentRotationSpeed > 0 ? `CLOCKWISE ${(this.currentRotationSpeed * 1000).toFixed(1)}` :
                             `COUNTER-CLOCKWISE ${(-this.currentRotationSpeed * 1000).toFixed(1)}`;
            this.ctx.fillText(speedText, this.centerX, this.centerY + 40);
            
            // Draw difficulty indicator
            const paddleConfig = this.getPaddleConfiguration();
            const difficultyLevel = Math.max(Math.floor(this.score / 3), Math.floor(this.score / 4)) + 1;
            this.ctx.fillStyle = '#ffaa00';
            this.ctx.font = '14px Arial';
            this.ctx.fillText(`Difficulty: Level ${difficultyLevel} | Gaps: ${paddleConfig.gaps} | Bumps: ${paddleConfig.bumps}`, this.centerX, this.centerY + 60);
        }
        
        // Draw game over message
        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', this.centerX, this.centerY - 30);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '24px Arial';
            this.ctx.fillText(`Final Score: ${this.score}`, this.centerX, this.centerY + 20);
        }
        
        // Draw center point
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 3, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#00ffff';
        this.ctx.fill();
    }
    
    gameLoop() {
        this.updateBall();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CircularPingPong();
});