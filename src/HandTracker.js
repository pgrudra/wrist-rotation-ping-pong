import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export default class HandTracker {
  constructor(videoElement, onThumbControlCallback) {
    this.videoElement = videoElement;
    this.onThumbControl = onThumbControlCallback;
    this.isRunning = false;
    
    this.processingWidth = 640;
    this.processingHeight = 480;
    
    // Thumb angle tracking for speed-based control
    this.lastThumbAngle = Math.PI / 2; // Start at horizontal (90°)
    this.thumbAngleHistory = [];
    this.deadZoneAngle = Math.PI / 12; // ±15° dead zone around horizontal
    this.maxRotationSpeed = 0.02; // Reduced maximum rotation speed per frame
    this.smoothingFactor = 0.7; // Smoothing for stable thumb tracking

    this.hands = new Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7, // Higher for curled palm detection
      minTrackingConfidence: 0.7   // Higher for stable palm tracking
    });

    this.hands.onResults(this.handleResults.bind(this));

    this.camera = new Camera(this.videoElement, {
      onFrame: async () => {
        if (this.isRunning) {
          try {
            await this.hands.send({ image: this.videoElement });
          } catch (error) {
            console.warn("Hand tracking frame error:", error);
          }
        }
      },
      width: this.processingWidth,
      height: this.processingHeight
    });
  }

  async start() {
    try {
      this.isRunning = true;
      await this.camera.start();
    } catch (error) {
      console.error("Failed to start hand tracking:", error);
      this.isRunning = false;
    }
  }

  stop() {
    this.isRunning = false;
    if (this.camera) {
      this.camera.stop();
    }
  }

  handleResults(results) {
    if (!this.isRunning || !results.multiHandLandmarks?.length) {
      this.onThumbControl({ 
        handDetected: false, 
        thumbAngle: Math.PI / 2,
        rotationSpeed: 0,
        confidence: 0,
        isInDeadZone: true
      });
      return;
    }

    try {
      const landmarks = results.multiHandLandmarks[0];
      
      // Optimized for thumbs-up/down control (fist with thumb extended)
      const wrist = landmarks[0];           // Wrist base
      const thumbTip = landmarks[4];        // Thumb tip (primary)
      const thumbIP = landmarks[3];         // Thumb intermediate joint
      const thumbMCP = landmarks[2];        // Thumb base joint

      if (!wrist || !thumbTip) {
        this.onThumbControl({ 
          handDetected: false, 
          thumbAngle: Math.PI / 2,
          rotationSpeed: 0,
          confidence: 0
        });
        return;
      }

      // Calculate thumb angle relative to wrist
      // 0° = thumbs up, 90° = horizontal, 180° = thumbs down
      let rawThumbAngle = Math.atan2(thumbTip.y - wrist.y, thumbTip.x - wrist.x);
      
      // Convert to standard orientation (0° = up, 90° = right, 180° = down)
      rawThumbAngle = rawThumbAngle + Math.PI / 2;
      if (rawThumbAngle < 0) rawThumbAngle += 2 * Math.PI;
      if (rawThumbAngle > 2 * Math.PI) rawThumbAngle -= 2 * Math.PI;
      
      // Use backup method if primary seems unreliable
      let thumbAngle = rawThumbAngle;
      let confidence = 0.9;
      let method = "wrist-thumb";
      
      // Backup: Use thumb direction from base to tip
      if (thumbMCP) {
        const thumbDirection = Math.atan2(thumbTip.y - thumbMCP.y, thumbTip.x - thumbMCP.x);
        let backupAngle = thumbDirection + Math.PI / 2;
        if (backupAngle < 0) backupAngle += 2 * Math.PI;
        if (backupAngle > 2 * Math.PI) backupAngle -= 2 * Math.PI;
        
        // Blend angles if both are available
        thumbAngle = thumbAngle * 0.7 + backupAngle * 0.3;
        confidence = 0.95;
        method = "blended";
      }
      // Apply smoothing to thumb angle
      if (this.thumbAngleHistory.length > 0) {
        const lastAngle = this.thumbAngleHistory[this.thumbAngleHistory.length - 1];
        thumbAngle = thumbAngle * (1 - this.smoothingFactor) + lastAngle * this.smoothingFactor;
      }
      
      // Keep history for smoothing
      this.thumbAngleHistory.push(thumbAngle);
      if (this.thumbAngleHistory.length > 3) {
        this.thumbAngleHistory.shift();
      }
      
      // Calculate rotation speed based on thumb position
      const horizontalAngle = Math.PI / 2; // 90° = horizontal
      const angleFromHorizontal = thumbAngle - horizontalAngle;
      
      let rotationSpeed = 0;
      
      // Apply dead zone around horizontal position
      if (Math.abs(angleFromHorizontal) > this.deadZoneAngle) {
        // Map angle to speed (-1 to +1)
        // Positive = clockwise (thumbs up), Negative = counterclockwise (thumbs down)
        const effectiveAngle = angleFromHorizontal - Math.sign(angleFromHorizontal) * this.deadZoneAngle;
        const maxAngle = Math.PI / 2 - this.deadZoneAngle; // Maximum usable angle
        
        rotationSpeed = -effectiveAngle / maxAngle; // Negative because up = positive angle but clockwise rotation
        rotationSpeed = Math.max(-1, Math.min(1, rotationSpeed)); // Clamp to [-1, 1]
        rotationSpeed *= this.maxRotationSpeed; // Scale to actual speed
        
        console.log(`Thumb control [${method}]: angle=${(thumbAngle * 180/Math.PI).toFixed(1)}°, speed=${(rotationSpeed * 180/Math.PI).toFixed(3)}°/frame`);
      } else {
        console.log(`Thumb control [${method}]: angle=${(thumbAngle * 180/Math.PI).toFixed(1)}° (in dead zone)`);
      }

      // Send thumb control data to game
      this.onThumbControl({
        handDetected: true,
        thumbAngle: thumbAngle,
        rotationSpeed: rotationSpeed,
        confidence: confidence,
        isInDeadZone: Math.abs(angleFromHorizontal) <= this.deadZoneAngle
      });

    } catch (error) {
      console.warn("Hand tracking processing error:", error);
      this.onWristRotation({ 
        handDetected: false, 
        angle: 0, 
        rotationDelta: 0 
      });
    }
  }

  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  cleanup() {
    this.stop();
    if (this.hands) {
      this.hands.close();
    }
    this.hands = null;
    this.camera = null;
    this.videoElement = null;
  }
}