class AnimationSystem {
  constructor(numJoints, bodyPartMap) {
    this.numJoints = numJoints;
    this.bodyPartMap = bodyPartMap;
    this.keyframes = {};
    this.currentFrame = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.frameRate = 120;
    this.lastTime = 0;
    this.animationTime = 0;
    this.loop = true;
    this.duration = 5.0;
    this.maxFrame = 600;
    
    for (const bodyPart in bodyPartMap) {
      this.keyframes[bodyPart] = [];
    }
  }

  setKeyframe(frame, allAngles, bodyParts) {
    frame = Math.max(0, Math.floor(frame));
    
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
      
      const existingIndex = this.keyframes[bodyPart].findIndex(kf => kf.frame === frame);
      
      if (existingIndex >= 0) {
        this.keyframes[bodyPart][existingIndex] = keyframe;
      } else {
        this.keyframes[bodyPart].push(keyframe);
        this.keyframes[bodyPart].sort((a, b) => a.frame - b.frame);
      }
    }
    
    if (frame > this.maxFrame) {
      this.maxFrame = frame;
      this.duration = this.maxFrame / this.frameRate;
    }
  }

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
    
    let maxFrame = 0;
    for (const bodyPart in this.keyframes) {
      if (this.keyframes[bodyPart].length > 0) {
        const max = Math.max(...this.keyframes[bodyPart].map(kf => kf.frame));
        if (max > maxFrame) maxFrame = max;
      }
    }
    
    if (maxFrame > 0) {
      if (maxFrame > this.maxFrame) {
        this.maxFrame = maxFrame;
        this.duration = this.maxFrame / this.frameRate;
      }
    } else {
      this.maxFrame = 600;
      this.duration = 5.0;
    }
  }

  getKeyframe(bodyPart, frame) {
    if (!this.keyframes[bodyPart]) return null;
    return this.keyframes[bodyPart].find(kf => kf.frame === frame);
  }

  getKeyframesForBodyPart(bodyPart) {
    return this.keyframes[bodyPart] ? this.keyframes[bodyPart].slice() : [];
  }

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

  clearKeyframes() {
    for (const bodyPart in this.keyframes) {
      this.keyframes[bodyPart] = [];
    }
    this.maxFrame = 150;
    this.duration = 5.0;
  }

  interpolateBodyPart(bodyPart, frame, defaultAngles) {
    if (!this.keyframes[bodyPart] || this.keyframes[bodyPart].length === 0) {
      return defaultAngles;
    }

    const keyframes = this.keyframes[bodyPart];
    
    if (keyframes.length === 1) {
      return keyframes[0].angles.slice();
    }

    frame = Math.max(0, Math.min(frame, this.maxFrame));

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

    if (!before) {
      return keyframes[0].angles.slice();
    }

    if (!after) {
      return keyframes[keyframes.length - 1].angles.slice();
    }

    if (before.frame === frame) {
      return before.angles.slice();
    }

    const t = (frame - before.frame) / (after.frame - before.frame);
    const interpolated = new Array(before.angles.length);
    
    for (let i = 0; i < before.angles.length; i++) {
      let angle1 = before.angles[i];
      let angle2 = after.angles[i];
      
      let diff = angle2 - angle1;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      
      interpolated[i] = angle1 + diff * t;
    }

    return interpolated;
  }

  interpolate(frame, defaultAngles) {
    const result = defaultAngles ? defaultAngles.slice() : new Array(this.numJoints).fill(0);
    
    for (const bodyPart in this.bodyPartMap) {
      const jointIds = this.bodyPartMap[bodyPart];
      const defaultBodyPartAngles = jointIds.map(id => result[id]);
      const interpolatedAngles = this.interpolateBodyPart(bodyPart, frame, defaultBodyPartAngles);
      
      for (let i = 0; i < jointIds.length; i++) {
        result[jointIds[i]] = interpolatedAngles[i];
      }
    }
    
    return result;
  }

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

  play() {
    this.isPlaying = true;
    this.lastTime = performance.now() / 1000;
  }

  pause() {
    this.isPlaying = false;
  }

  stop() {
    this.isPlaying = false;
    this.animationTime = 0;
    this.currentFrame = 0;
  }

  setFrame(frame) {
    frame = Math.max(0, Math.min(frame, this.maxFrame));
    this.currentFrame = frame;
    this.animationTime = frame / this.frameRate;
  }

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

  importFromJSON(json) {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }

    this.clearKeyframes();

    if (json.version === "2.0" && json.keyframesByBodyPart) {
      for (const bodyPart in json.keyframesByBodyPart) {
        if (this.bodyPartMap[bodyPart]) {
          this.keyframes[bodyPart] = json.keyframesByBodyPart[bodyPart].map(kf => ({
            frame: Math.floor(kf.frame),
            angles: kf.angles.slice()
          })).sort((a, b) => a.frame - b.frame);
        }
      }
    } else if (json.keyframes && Array.isArray(json.keyframes)) {
      for (const kf of json.keyframes) {
        const frame = Math.floor(kf.frame);
        const angles = kf.angles.slice(0, this.numJoints);
        for (const bodyPart in this.bodyPartMap) {
          const jointIds = this.bodyPartMap[bodyPart];
          const bodyPartAngles = jointIds.map(id => angles[id]);
          this.keyframes[bodyPart].push({
            frame: frame,
            angles: bodyPartAngles
          });
        }
      }
      for (const bodyPart in this.keyframes) {
        this.keyframes[bodyPart].sort((a, b) => a.frame - b.frame);
      }
    } else {
      throw new Error("Invalid animation JSON: missing keyframes");
    }

    if (json.frameRate) this.frameRate = json.frameRate;
    if (json.maxFrame) this.maxFrame = json.maxFrame;
    if (json.duration) this.duration = json.duration;

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

  getCurrentAngles(defaultAngles) {
    return this.interpolate(this.currentFrame, defaultAngles);
  }
}
