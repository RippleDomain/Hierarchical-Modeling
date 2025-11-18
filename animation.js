// animation.js
"use strict";

/**
 * Keyframe Animation System for Robot
 * Supports per-body-part keyframe-based animation with interpolation and JSON save/load
 */

class AnimationSystem {
  constructor(numJoints, bodyPartMap) {
    this.numJoints = numJoints;
    this.bodyPartMap = bodyPartMap; // Maps body part names to joint angle IDs
    this.keyframes = {}; // { bodyPartName: [{ frame: number, angles: [joint values] }] }
    this.currentFrame = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.frameRate = 120; // frames per second
    this.lastTime = 0;
    this.animationTime = 0; // in seconds
    this.loop = true;
    this.duration = 5.0; // default duration in seconds
    this.maxFrame = 600; // default max frame (5 seconds at 30fps)
    
    // Initialize keyframes for each body part
    for (const bodyPart in bodyPartMap) {
      this.keyframes[bodyPart] = [];
    }
  }

  /**
   * Add or update a keyframe for specific body parts at the specified frame
   * @param {number} frame - Frame number
   * @param {Array<number>} allAngles - All joint angles (17 values)
   * @param {Array<string>} bodyParts - Array of body part names to set keyframes for
   */
  setKeyframe(frame, allAngles, bodyParts) {
    frame = Math.max(0, Math.floor(frame));
    
    // If no body parts specified, set keyframes for all
    if (!bodyParts || bodyParts.length === 0) {
      bodyParts = Object.keys(this.bodyPartMap);
    }
    
    for (const bodyPart of bodyParts) {
      if (!this.bodyPartMap[bodyPart]) continue;
      
      const jointIds = this.bodyPartMap[bodyPart];
      const bodyPartAngles = jointIds.map(id => allAngles[id]);
      
      const keyframe = {
        frame: frame,
        angles: bodyPartAngles.slice()
      };
      
      // Find existing keyframe at this frame for this body part
      const existingIndex = this.keyframes[bodyPart].findIndex(kf => kf.frame === frame);
      
      if (existingIndex >= 0) {
        // Update existing
        this.keyframes[bodyPart][existingIndex] = keyframe;
      } else {
        // Insert sorted by frame
        this.keyframes[bodyPart].push(keyframe);
        this.keyframes[bodyPart].sort((a, b) => a.frame - b.frame);
      }
    }
    
    // Update max frame if needed
    if (frame > this.maxFrame) {
      this.maxFrame = frame;
      this.duration = this.maxFrame / this.frameRate;
    }
  }

  /**
   * Remove keyframe for specific body parts at specified frame
   * @param {number} frame - Frame number
   * @param {Array<string>} bodyParts - Array of body part names (if empty, removes from all)
   */
  removeKeyframe(frame, bodyParts) {
    if (!bodyParts || bodyParts.length === 0) {
      bodyParts = Object.keys(this.bodyPartMap);
    }
    
    for (const bodyPart of bodyParts) {
      if (!this.keyframes[bodyPart]) continue;
      const index = this.keyframes[bodyPart].findIndex(kf => kf.frame === frame);
      if (index >= 0) {
        this.keyframes[bodyPart].splice(index, 1);
      }
    }
    
    // Update max frame - only reduce if all keyframes are deleted
    // Otherwise, preserve maxFrame to allow users to add keyframes at higher frames
    let maxFrame = 0;
    for (const bodyPart in this.keyframes) {
      if (this.keyframes[bodyPart].length > 0) {
        const max = Math.max(...this.keyframes[bodyPart].map(kf => kf.frame));
        if (max > maxFrame) maxFrame = max;
      }
    }
    
    if (maxFrame > 0) {
      // Only update maxFrame if it's higher than current (allow increases)
      // Don't reduce maxFrame - preserve it so users can add keyframes at higher frames
      if (maxFrame > this.maxFrame) {
        this.maxFrame = maxFrame;
        this.duration = this.maxFrame / this.frameRate;
      }
      // If maxFrame < this.maxFrame, keep this.maxFrame unchanged
    } else {
      // Only reset to default if all keyframes are deleted
      this.maxFrame = 600;
      this.duration = 5.0;
    }
  }

  /**
   * Get keyframe for a body part at specified frame (if exists)
   */
  getKeyframe(bodyPart, frame) {
    if (!this.keyframes[bodyPart]) return null;
    return this.keyframes[bodyPart].find(kf => kf.frame === frame);
  }

  /**
   * Get all keyframes for a specific body part
   */
  getKeyframesForBodyPart(bodyPart) {
    return this.keyframes[bodyPart] ? this.keyframes[bodyPart].slice() : [];
  }

  /**
   * Get all keyframes (organized by body part)
   */
  getAllKeyframes() {
    const result = [];
    for (const bodyPart in this.keyframes) {
      for (const kf of this.keyframes[bodyPart]) {
        result.push({
          bodyPart: bodyPart,
          frame: kf.frame,
          angles: kf.angles
        });
      }
    }
    return result.sort((a, b) => a.frame - b.frame);
  }

  /**
   * Clear all keyframes
   */
  clearKeyframes() {
    for (const bodyPart in this.keyframes) {
      this.keyframes[bodyPart] = [];
    }
    this.maxFrame = 150;
    this.duration = 5.0;
  }

  /**
   * Interpolate angles for a specific body part at a given frame
   */
  interpolateBodyPart(bodyPart, frame, defaultAngles) {
    if (!this.keyframes[bodyPart] || this.keyframes[bodyPart].length === 0) {
      // No keyframes for this body part, return default angles
      return defaultAngles;
    }

    const keyframes = this.keyframes[bodyPart];
    
    if (keyframes.length === 1) {
      // Only one keyframe, return it
      return keyframes[0].angles.slice();
    }

    // Clamp frame to valid range
    frame = Math.max(0, Math.min(frame, this.maxFrame));

    // Find surrounding keyframes
    let before = null;
    let after = null;

    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].frame <= frame) {
        before = keyframes[i];
      }
      if (keyframes[i].frame >= frame && !after) {
        after = keyframes[i];
        break;
      }
    }

    // If before the first keyframe, return first keyframe
    if (!before) {
      return keyframes[0].angles.slice();
    }

    // If after the last keyframe, return last keyframe
    if (!after) {
      return keyframes[keyframes.length - 1].angles.slice();
    }

    // If exactly on a keyframe, return it
    if (before.frame === frame) {
      return before.angles.slice();
    }

    // Linear interpolation
    const t = (frame - before.frame) / (after.frame - before.frame);
    const interpolated = new Array(before.angles.length);
    
    for (let i = 0; i < before.angles.length; i++) {
      // Handle angle wrapping for smooth rotation
      let angle1 = before.angles[i];
      let angle2 = after.angles[i];
      
      // Find shortest path for rotation
      let diff = angle2 - angle1;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      
      interpolated[i] = angle1 + diff * t;
    }

    return interpolated;
  }

  /**
   * Interpolate all angles at a given frame using per-body-part keyframes
   * @param {number} frame - Frame number
   * @param {Array<number>} defaultAngles - Default angles to use if no keyframes exist
   */
  interpolate(frame, defaultAngles) {
    const result = defaultAngles ? defaultAngles.slice() : new Array(this.numJoints).fill(0);
    
    // Interpolate each body part independently
    for (const bodyPart in this.bodyPartMap) {
      const jointIds = this.bodyPartMap[bodyPart];
      const defaultBodyPartAngles = jointIds.map(id => result[id]);
      const interpolatedAngles = this.interpolateBodyPart(bodyPart, frame, defaultBodyPartAngles);
      
      // Apply interpolated angles to result
      for (let i = 0; i < jointIds.length; i++) {
        result[jointIds[i]] = interpolatedAngles[i];
      }
    }
    
    return result;
  }

  /**
   * Update animation playback
   */
  update(deltaTime) {
    if (!this.isPlaying) return;

    this.animationTime += deltaTime * this.playbackSpeed;
    
    if (this.loop) {
      this.animationTime = this.animationTime % this.duration;
    } else {
      this.animationTime = Math.min(this.animationTime, this.duration);
      if (this.animationTime >= this.duration) {
        this.isPlaying = false;
      }
    }

    this.currentFrame = Math.floor(this.animationTime * this.frameRate);
    this.currentFrame = Math.min(this.currentFrame, this.maxFrame);
  }

  /**
   * Play animation
   */
  play() {
    this.isPlaying = true;
    this.lastTime = performance.now() / 1000;
  }

  /**
   * Pause animation
   */
  pause() {
    this.isPlaying = false;
  }

  /**
   * Stop and reset animation
   */
  stop() {
    this.isPlaying = false;
    this.animationTime = 0;
    this.currentFrame = 0;
  }

  /**
   * Set current frame (for scrubbing)
   */
  setFrame(frame) {
    frame = Math.max(0, Math.min(frame, this.maxFrame));
    this.currentFrame = frame;
    this.animationTime = frame / this.frameRate;
  }

  /**
   * Export animation to JSON
   */
  exportToJSON() {
    const keyframesByBodyPart = {};
    for (const bodyPart in this.keyframes) {
      if (this.keyframes[bodyPart].length > 0) {
        keyframesByBodyPart[bodyPart] = this.keyframes[bodyPart].map(kf => ({
          frame: kf.frame,
          angles: kf.angles
        }));
      }
    }
    
    return {
      version: "2.0",
      frameRate: this.frameRate,
      maxFrame: this.maxFrame,
      duration: this.duration,
      numJoints: this.numJoints,
      keyframesByBodyPart: keyframesByBodyPart
    };
  }

  /**
   * Import animation from JSON
   */
  importFromJSON(json) {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }

    // Clear existing keyframes
    this.clearKeyframes();

    // Handle both old format (version 1.0) and new format (version 2.0)
    if (json.version === "2.0" && json.keyframesByBodyPart) {
      // New format: per-body-part keyframes
      for (const bodyPart in json.keyframesByBodyPart) {
        if (this.bodyPartMap[bodyPart]) {
          this.keyframes[bodyPart] = json.keyframesByBodyPart[bodyPart].map(kf => ({
            frame: Math.floor(kf.frame),
            angles: kf.angles.slice()
          })).sort((a, b) => a.frame - b.frame);
        }
      }
    } else if (json.keyframes && Array.isArray(json.keyframes)) {
      // Old format: convert to new format (all body parts get same keyframes)
      for (const kf of json.keyframes) {
        const frame = Math.floor(kf.frame);
        const angles = kf.angles.slice(0, this.numJoints);
        // Set keyframe for all body parts
        for (const bodyPart in this.bodyPartMap) {
          const jointIds = this.bodyPartMap[bodyPart];
          const bodyPartAngles = jointIds.map(id => angles[id]);
          this.keyframes[bodyPart].push({
            frame: frame,
            angles: bodyPartAngles
          });
        }
      }
      // Sort all keyframes
      for (const bodyPart in this.keyframes) {
        this.keyframes[bodyPart].sort((a, b) => a.frame - b.frame);
      }
    } else {
      throw new Error("Invalid animation JSON: missing keyframes");
    }

    if (json.frameRate) this.frameRate = json.frameRate;
    if (json.maxFrame) this.maxFrame = json.maxFrame;
    if (json.duration) this.duration = json.duration;

    // Update maxFrame from keyframes if needed
    let maxFrame = 0;
    for (const bodyPart in this.keyframes) {
      if (this.keyframes[bodyPart].length > 0) {
        const max = Math.max(...this.keyframes[bodyPart].map(kf => kf.frame));
        if (max > maxFrame) maxFrame = max;
      }
    }
    if (maxFrame > 0 && maxFrame > this.maxFrame) {
      this.maxFrame = maxFrame;
      this.duration = this.maxFrame / this.frameRate;
    }
  }

  /**
   * Get current interpolated angles
   */
  getCurrentAngles(defaultAngles) {
    return this.interpolate(this.currentFrame, defaultAngles);
  }
}
