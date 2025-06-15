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
        leftHand: null,
        rightHand: null,
        rotationSpeed: 0,
        confidence: 0,
        gesture: "none"
      });
      return;
    }

    try {
      const hands = results.multiHandLandmarks;
      const handedness = results.multiHandedness;
      
      let leftHand = null;
      let rightHand = null;
      
      // Process each detected hand
      for (let i = 0; i < hands.length && i < 2; i++) {
        const landmarks = hands[i];
        const handType = handedness[i].label; // "Left" or "Right" from the user's perspective
        
        const wrist = landmarks[0];
        const indexFingerTip = landmarks[8];
        
        if (!wrist || !indexFingerTip) continue;
        
        // Calculate index finger direction relative to wrist
        // Note: Camera is mirrored, so we don't invert coordinates
        const fingerDirection = Math.atan2(indexFingerTip.y - wrist.y, indexFingerTip.x - wrist.x);
        
        // Convert to degrees for easier interpretation
        let fingerAngleDegrees = (fingerDirection * 180 / Math.PI);
        
        // Normalize to [0, 360)
        if (fingerAngleDegrees < 0) fingerAngleDegrees += 360;
        
        // Determine if index finger is pointing left or right
        // Left pointing: 135° to 225° (±45° around 180°)
        // Right pointing: 315° to 45° (±45° around 0°/360°)
        const isPointingLeft = fingerAngleDegrees >= 135 && fingerAngleDegrees <= 225;
        const isPointingRight = fingerAngleDegrees >= 315 || fingerAngleDegrees <= 45;
        
        const handData = {
          type: handType,
          fingerAngle: fingerAngleDegrees,
          isPointingLeft: isPointingLeft,
          isPointingRight: isPointingRight,
          confidence: 0.9
        };
        
        if (handType === "Left") {
          leftHand = handData;
        } else {
          rightHand = handData;
        }
      }
      
      // Determine rotation based on gesture rules
      let rotationSpeed = 0;
      let gesture = "none";
      let confidence = 0;
      
      const hasValidLeftHand = leftHand && leftHand.isPointingRight;
      const hasValidRightHand = rightHand && rightHand.isPointingLeft;
      
      if (hasValidLeftHand && hasValidRightHand) {
        // Both hands detected with valid gestures = no motion
        gesture = "both_hands";
        rotationSpeed = 0;
        confidence = Math.min(leftHand.confidence, rightHand.confidence);
      } else if (hasValidLeftHand && !rightHand) {
        // Only left hand pointing right = clockwise
        gesture = "left_hand_clockwise";
        rotationSpeed = this.maxRotationSpeed;
        confidence = leftHand.confidence;
      } else if (hasValidRightHand && !leftHand) {
        // Only right hand pointing left = anti-clockwise
        gesture = "right_hand_anticlockwise";
        rotationSpeed = -this.maxRotationSpeed;
        confidence = rightHand.confidence;
      } else {
        // No valid gestures detected
        gesture = "invalid";
        rotationSpeed = 0;
        confidence = 0;
      }
      
      console.log(`Dual hand control: Left=${leftHand ? (leftHand.isPointingRight ? 'index pointing right' : 'invalid') : 'none'}, Right=${rightHand ? (rightHand.isPointingLeft ? 'index pointing left' : 'invalid') : 'none'}, Gesture=${gesture}, Speed=${rotationSpeed.toFixed(3)}`);

      // Send control data to game
      this.onThumbControl({
        handDetected: leftHand !== null || rightHand !== null,
        leftHand: leftHand,
        rightHand: rightHand,
        rotationSpeed: rotationSpeed,
        confidence: confidence,
        gesture: gesture
      });

    } catch (error) {
      console.warn("Hand tracking processing error:", error);
      this.onThumbControl({ 
        handDetected: false, 
        leftHand: null,
        rightHand: null,
        rotationSpeed: 0,
        confidence: 0,
        gesture: "error"
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