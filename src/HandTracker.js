import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export default class HandTracker {
  constructor(videoElement, onThumbControlCallback) {
    this.videoElement = videoElement;
    this.onThumbControl = onThumbControlCallback;
    this.isRunning = false;
    
    this.processingWidth = 640;
    this.processingHeight = 480;
    
    // Thumb angle tracking for tilt-based control
    this.lastThumbAngle = 0; // Start at thumbs up (0°)
    this.thumbAngleHistory = [];
    this.deadZoneAngle = Math.PI / 12; // ±15° dead zone around thumbs up
    this.maxRotationSpeed = 0.02; // Reduced maximum rotation speed per frame
    this.smoothingFactor = 0.7; // Smoothing for stable thumb tracking

    this.hands = new Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2, // Allow both hands
      modelComplexity: 1,
      minDetectionConfidence: 0.5, // Lower for better detection coverage
      minTrackingConfidence: 0.5   // Lower for more sensitive tracking
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
        leftHand: null,
        rightHand: null,
        rotationSpeed: 0,
        confidence: 0,
        gesture: "none",
        indexFingerPosition: null
      });
      return;
    }

    try {
      const hands = results.multiHandLandmarks;
      const handedness = results.multiHandedness;
      
      let leftHand = null;
      let rightHand = null;
      let indexFingerPosition = null;
      
      // Process each detected hand
      for (let i = 0; i < hands.length && i < 2; i++) {
        const landmarks = hands[i];
        const handType = handedness[i].label; // "Left" or "Right" from the user's perspective
        
        const wrist = landmarks[0];
        const indexFingerTip = landmarks[8];
        
        if (!wrist || !indexFingerTip) continue;
        
        // Store the index finger position (normalized coordinates)
        // Mirror the x-coordinate since video feed is mirrored
        const rawX = 1.0 - indexFingerTip.x; // Mirror horizontally
        const rawY = indexFingerTip.y;
        
        // FIX: Removed the flawed "correction" logic.
        // The raw, normalized coordinates from MediaPipe should be used directly.
        // The mapping to the screen/canvas space is handled correctly in PlayScene.js.
        indexFingerPosition = {
            x: rawX,
            y: rawY
        };
        
        // The rest of the gesture detection logic remains the same.
        const handData = {
          landmarks,
          confidence: handedness[i].score,
          handType,
        };
        
        if (handType === "Left") {
            leftHand = handData;
        } else if (handType === "Right") {
            rightHand = handData;
        }
      }

      let rotationSpeed = 0;
      let confidence = 0;
      let gesture = "none";
      
      if (rightHand) {
        const mirroredIndexTipX = 1.0 - rightHand.landmarks[8].x;
        const mirroredWristX = 1.0 - rightHand.landmarks[0].x;
        const fingerDirection = Math.atan2(rightHand.landmarks[8].y - rightHand.landmarks[0].y, mirroredIndexTipX - mirroredWristX);
        let fingerAngleDegrees = (fingerDirection * 180 / Math.PI);
        if (fingerAngleDegrees < 0) fingerAngleDegrees += 360;

        if (fingerAngleDegrees > 135 && fingerAngleDegrees < 225) {
            gesture = "clockwise";
            rotationSpeed = this.maxRotationSpeed;
        } else if (fingerAngleDegrees > 315 || fingerAngleDegrees < 45) {
            gesture = "anti-clockwise";
            rotationSpeed = -this.maxRotationSpeed;
        }
        confidence = rightHand.confidence;
      } else if (leftHand) {
        const mirroredIndexTipX = 1.0 - leftHand.landmarks[8].x;
        const mirroredWristX = 1.0 - leftHand.landmarks[0].x;
        const fingerDirection = Math.atan2(leftHand.landmarks[8].y - leftHand.landmarks[0].y, mirroredIndexTipX - mirroredWristX);
        let fingerAngleDegrees = (fingerDirection * 180 / Math.PI);
        if (fingerAngleDegrees < 0) fingerAngleDegrees += 360;

        if (fingerAngleDegrees > 135 && fingerAngleDegrees < 225) {
            gesture = "clockwise";
            rotationSpeed = this.maxRotationSpeed;
        } else if (fingerAngleDegrees > 315 || fingerAngleDegrees < 45) {
            gesture = "anti-clockwise";
            rotationSpeed = -this.maxRotationSpeed;
        }
        confidence = leftHand.confidence;
      }
      
      // Send control data to game
      this.onThumbControl({
        handDetected: leftHand !== null || rightHand !== null,
        leftHand: leftHand,
        rightHand: rightHand,
        rotationSpeed: rotationSpeed,
        confidence: confidence,
        gesture: gesture,
        indexFingerPosition: indexFingerPosition
      });

    } catch (error) {
      console.warn("Hand tracking processing error:", error);
      this.onThumbControl({ 
        handDetected: false, 
        leftHand: null,
        rightHand: null,
        rotationSpeed: 0,
        confidence: 0,
        gesture: "error",
        indexFingerPosition: null
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
  }
}
