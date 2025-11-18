function linkSlider(id, angleId){
  const slider = document.getElementById(id);
  const label  = document.getElementById(`v${angleId}`);
  slider.addEventListener("input", e => {
    theta[angleId] = clampJoint(angleId, parseFloat(e.target.value));
    e.target.value = theta[angleId];
    if (label) label.textContent = String(theta[angleId] | 0);
    if (typeof updateCameraAndDraw !== 'undefined') {
      updateCameraAndDraw();
    } else if (typeof updateCamera !== 'undefined') {
      updateCamera();
    }
  });
  if (label) label.textContent = slider.value;
}

function resetPose(){
  for (let i=0;i<numAngles;i++){
    theta[i] = clampJoint(i, 0);
    const sId = ({
      0:"slider0",1:"slider1",2:"slider2",3:"slider3",4:"slider4",5:"slider5",
      6:"slider6",7:"slider7",8:"slider8",9:"slider9",10:"slider10",11:"slider11",
      12:"slider12",13:"slider13",14:"slider14",15:"slider15",16:"slider16"
    })[i];
    const s = document.getElementById(sId);
    if (s){ s.value = theta[i]; const lab = document.getElementById(`v${i}`); if (lab) lab.textContent = "0"; }
  }
  if (typeof updateCameraAndDraw !== 'undefined') {
    updateCameraAndDraw();
  } else if (typeof updateCamera !== 'undefined') {
    updateCamera();
  }
}

function resetCamera(){
  cameraRadius = 2.0;
  cameraTheta  = 0.0;
  cameraPhi    = Math.PI / 2;
  lookAtPoint  = [0,1,0];
  updateCamera();
}

function updateSlidersFromTheta(){
  for (let i=0;i<numAngles;i++){
    const sId = ({
      0:"slider0",1:"slider1",2:"slider2",3:"slider3",4:"slider4",5:"slider5",
      6:"slider6",7:"slider7",8:"slider8",9:"slider9",10:"slider10",11:"slider11",
      12:"slider12",13:"slider13",14:"slider14",15:"slider15",16:"slider16"
    })[i];
    const s = document.getElementById(sId);
    if (s) {
      s.value = theta[i];
      const lab = document.getElementById(`v${i}`);
      if (lab) lab.textContent = String(theta[i] | 0);
    }
  }
}

function updateAnimationUI(){
  if (!animSystem) return;
  
  const frameDisplay = document.getElementById("currentFrameDisplay");
  const maxFrameDisplay = document.getElementById("maxFrameDisplay");
  const timeDisplay = document.getElementById("timeDisplay");
  const timeline = document.getElementById("timeline");
  const playPauseBtn = document.getElementById("btnPlayPause");
  
  if (frameDisplay) frameDisplay.textContent = animSystem.currentFrame;
  if (maxFrameDisplay) maxFrameDisplay.textContent = animSystem.maxFrame;
  if (timeDisplay) timeDisplay.textContent = animSystem.animationTime.toFixed(1) + "s";
  if (timeline) {
    timeline.max = animSystem.maxFrame;
    timeline.value = animSystem.currentFrame;
  }
  if (playPauseBtn) {
    playPauseBtn.textContent = animSystem.isPlaying ? "Pause" : "Play";
    playPauseBtn.classList.toggle("active", animSystem.isPlaying);
  }
  
  updateKeyframeList();
}

function getSelectedBodyParts() {
  const checkboxes = document.querySelectorAll('.body-part-checkbox:checked');
  if (checkboxes.length === 0) {
    // If no body parts selected, return all (null means all)
    return null;
  }
  return Array.from(checkboxes).map(cb => cb.value);
}

function updateKeyframeList(){
  if (!animSystem) return;
  const listEl = document.getElementById("keyframeList");
  if (!listEl) return;
  
  const keyframes = animSystem.getAllKeyframes();
  
  if (keyframes.length === 0) {
    listEl.innerHTML = '<div style="color:#888; padding:4px; text-align:center;">No keyframes</div>';
    return;
  }
  
  const byFrame = {};
  for (const kf of keyframes) {
    if (!byFrame[kf.frame]) {
      byFrame[kf.frame] = [];
    }
    byFrame[kf.frame].push(kf.bodyPart);
  }
  
  listEl.innerHTML = Object.keys(byFrame).sort((a, b) => parseInt(a) - parseInt(b)).map(frame => {
    const time = (parseInt(frame) / animSystem.frameRate).toFixed(1);
    const bodyParts = byFrame[frame].map(bp => {
      const displayNames = {
        'torso': 'Torso',
        'head': 'Head',
        'left_arm_high': 'L Arm (U)',
        'left_arm_low': 'L Arm (L)',
        'right_arm_high': 'R Arm (U)',
        'right_arm_low': 'R Arm (L)',
        'left_leg_high': 'L Leg (U)',
        'left_leg_low': 'L Leg (L)',
        'right_leg_high': 'R Leg (U)',
        'right_leg_low': 'R Leg (L)',
        'left_hand': 'L Hand',
        'right_hand': 'R Hand'
      };
      return displayNames[bp] || bp;
    }).join(', ');
    return `
      <div class="keyframe-item">
        <span>Frame ${frame} (${time}s): ${bodyParts}</span>
        <button onclick="animSystem.setFrame(${frame}); updateAnimationUI();">Go to</button>
      </div>
    `;
  }).join('');
}

function fitCanvas(){
  const canvas = gl.canvas;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width  = Math.floor(rect.width  * dpr);
  const height = Math.floor(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height){
    canvas.width = width; canvas.height = height;
  }
  projectionMatrix = perspective(45, width/height, 0.1, 100.0);
}

function updateCameraAndDraw(){
  if (!gl || !program) return;

  if (animSystem && animSystem.isPlaying) {
    const now = performance.now() / 1000;
    if (lastAnimTime > 0) {
      const deltaTime = now - lastAnimTime;
      animSystem.update(deltaTime);
      
      const animAngles = animSystem.getCurrentAngles(theta.slice());
      for (let i = 0; i < numAngles; i++) {
        theta[i] = animAngles[i];
      }
      
      updateSlidersFromTheta();
      updateAnimationUI();
    }
    lastAnimTime = now;
  } else {
    lastAnimTime = 0;
  }

  const eye = sphericalToEye();
  const V = lookAt(eye, lookAtPoint, [0,1,0]);
  const MVP = mult(projectionMatrix, V);

  gl.useProgram(program);
  gl.uniformMatrix4fv(uMVPMatrix, false, flatten(MVP));
  gl.uniform3fv(uViewPosition, eye);
  gl.uniform3f(uLightPosition, 0, 2, 50);

  gl.viewport(0,0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  if (!rootNode) return;

  const pose = buildPoseTransforms();

  const items = [];
  traverseWithPose(rootNode, mat4(), pose, (node, t) => {
    for (const m of node.meshes) items.push({ t, ...m });
  });
  renderMeshes(items);

  drawSelectedOutline();
}

let animSystem = null;
let isAnimating = false;
let lastAnimTime = 0;

let pickProgram, outlineProgram;
let pick_uMVP, pick_uModel, pick_uColor;
let outline_uMVP, outline_uModel;
let uLightPosition;

function initUI() {
  linkSlider("slider0", 0);
  linkSlider("slider1", 1);
  linkSlider("slider2", 2);
  linkSlider("slider3", 3);
  linkSlider("slider4", 4);
  linkSlider("slider5", 5);
  linkSlider("slider6", 6);
  linkSlider("slider7", 7);
  linkSlider("slider8", 8);
  linkSlider("slider9", 9);
  linkSlider("slider10",10);
  linkSlider("slider11",11);
  linkSlider("slider12",12);
  linkSlider("slider13",13);
  linkSlider("slider14",14);
  linkSlider("slider15",15);
  linkSlider("slider16",16);

  const btnResetPose   = document.getElementById("btnResetPose");
  const btnResetCamera = document.getElementById("btnResetCamera");
  if (btnResetPose)   btnResetPose.onclick   = ()=> resetPose();
  if (btnResetCamera) btnResetCamera.onclick = ()=> resetCamera();

  const bodyPartMap = {
    [NAME.torso]: [torsoId],
    [NAME.head]: [head1Id, head2Id],
    [NAME.lArmHi]: [leftUpperArmId, leftUpperArmSideId],
    [NAME.lArmLo]: [leftLowerArmId],
    [NAME.rArmHi]: [rightUpperArmId, rightUpperArmSideId],
    [NAME.rArmLo]: [rightLowerArmId],
    [NAME.lLegHi]: [leftUpperLegId, leftUpperLegSideId],
    [NAME.lLegLo]: [leftLowerLegId],
    [NAME.rLegHi]: [rightUpperLegId, rightUpperLegSideId],
    [NAME.rLegLo]: [rightLowerLegId],
    [NAME.lHand]: [leftHandId],
    [NAME.rHand]: [rightHandId]
  };
  animSystem = new AnimationSystem(numAngles, bodyPartMap);
  updateAnimationUI();

  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnStop = document.getElementById("btnStop");
  const btnSetKeyframe = document.getElementById("btnSetKeyframe");
  const btnDeleteKeyframe = document.getElementById("btnDeleteKeyframe");
  const btnSaveAnimation = document.getElementById("btnSaveAnimation");
  const btnClearAnimation = document.getElementById("btnClearAnimation");
  const timeline = document.getElementById("timeline");
  const loadAnimFile = document.getElementById("loadAnimFile");

  if (btnPlayPause) {
    btnPlayPause.onclick = () => {
      if (animSystem.isPlaying) {
        animSystem.pause();
      } else {
        animSystem.play();
        lastAnimTime = performance.now() / 1000;
      }
      updateAnimationUI();
    };
  }

  if (btnStop) {
    btnStop.onclick = () => {
      animSystem.stop();
      const animAngles = animSystem.getCurrentAngles(theta.slice());
      for (let i = 0; i < numAngles; i++) {
        theta[i] = animAngles[i];
      }
      updateSlidersFromTheta();
      updateAnimationUI();
    };
  }

  if (btnSetKeyframe) {
    btnSetKeyframe.onclick = () => {
      const selectedBodyParts = getSelectedBodyParts();
      animSystem.setKeyframe(animSystem.currentFrame, theta.slice(), selectedBodyParts);
      updateAnimationUI();
    };
  }

  if (btnDeleteKeyframe) {
    btnDeleteKeyframe.onclick = () => {
      const selectedBodyParts = getSelectedBodyParts();
      animSystem.removeKeyframe(animSystem.currentFrame, selectedBodyParts);
      updateAnimationUI();
    };
  }

  if (timeline) {
    timeline.addEventListener("input", (e) => {
      const frame = parseInt(e.target.value);
      animSystem.setFrame(frame);
      const animAngles = animSystem.getCurrentAngles(theta.slice());
      for (let i = 0; i < numAngles; i++) {
        theta[i] = animAngles[i];
      }
      updateSlidersFromTheta();
      updateAnimationUI();
    });
  }

  if (btnSaveAnimation) {
    btnSaveAnimation.onclick = () => {
      const json = animSystem.exportToJSON();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "robot-animation.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }

  if (loadAnimFile) {
    loadAnimFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          animSystem.importFromJSON(event.target.result);
          const animAngles = animSystem.getCurrentAngles(theta.slice());
          for (let i = 0; i < numAngles; i++) {
            theta[i] = animAngles[i];
          }
          updateSlidersFromTheta();
          updateAnimationUI();
          alert("Animation loaded successfully!");
        } catch (error) {
          alert("Error loading animation: " + error.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  if (btnClearAnimation) {
    btnClearAnimation.onclick = () => {
      if (confirm("Clear all keyframes?")) {
        animSystem.clearKeyframes();
        updateAnimationUI();
      }
    };
  }

  const canvas = gl.canvas;
  canvas.addEventListener("mousedown", (e) => {
    const hit = pickAtClientPos(e.clientX, e.clientY);
    if (hit){
      selectedNodeName = hit;
      limbDrag.active = true;
      limbDrag.lastX = e.clientX;
      limbDrag.lastY = e.clientY;
      e.preventDefault();
      return;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (limbDrag.active){
      const map = nodeToAngleMapByName[selectedNodeName];
      if (map){
        const dx = e.clientX - limbDrag.lastX;
        const dy = e.clientY - limbDrag.lastY;

        if (dy !== 0){
          theta[map.primary] = clampJoint(map.primary, theta[map.primary] + dy * limbDragSensitivity);
          const lab = document.getElementById(`v${map.primary}`); if (lab) lab.textContent = String(theta[map.primary] | 0);
          const sld = document.getElementById(`slider${map.primary}`); if (sld) sld.value = theta[map.primary];
        }
        if (map.secondary != null && dx !== 0){
          theta[map.secondary] = clampJoint(map.secondary, theta[map.secondary] - dx * limbDragSensitivity);
          const lab2 = document.getElementById(`v${map.secondary}`); if (lab2) lab2.textContent = String(theta[map.secondary] | 0);
          const sld2 = document.getElementById(`slider${map.secondary}`); if (sld2) sld2.value = theta[map.secondary];
        }

        limbDrag.lastX = e.clientX;
        limbDrag.lastY = e.clientY;
        if (typeof updateCameraAndDraw !== 'undefined') {
          updateCameraAndDraw();
        } else if (typeof updateCamera !== 'undefined') {
          updateCamera();
        }
      }
      e.preventDefault();
      return;
    }
  });

  ["mouseup","mouseleave"].forEach(evt => canvas.addEventListener(evt, () => {
    limbDrag.active = false;
  }));

  canvas.addEventListener("click", (e) => {
    if (limbDrag.active) return;
    const hit = pickAtClientPos(e.clientX, e.clientY);
    if (!hit) selectedNodeName = null;
  });

  window.addEventListener("resize", ()=> fitCanvas());
  fitCanvas();
}

function initPickingPrograms() {
  pickProgram = initShaders(gl, "pick-vertex", "pick-fragment");
  pick_uMVP   = gl.getUniformLocation(pickProgram, "uMVPMatrix");
  pick_uModel = gl.getUniformLocation(pickProgram, "model");
  pick_uColor = gl.getUniformLocation(pickProgram, "uPickColor");

  outlineProgram = initShaders(gl, "outline-vertex", "outline-fragment");
  outline_uMVP   = gl.getUniformLocation(outlineProgram, "uMVPMatrix");
  outline_uModel = gl.getUniformLocation(outlineProgram, "model");
}

function initializeUIAfterRobot() {
  if (typeof gl === 'undefined' || !gl) {
    setTimeout(initializeUIAfterRobot, 100);
    return;
  }
  
  if (typeof program !== 'undefined' && program) {
    uLightPosition = gl.getUniformLocation(program, "uLightPosition");
  }
  
  initPickingPrograms();
  initUI();
  
  if (typeof updateCameraAndDraw !== 'undefined') {
    (function loop(){
      fitCanvas();
      updateCameraAndDraw();
      requestAnimFrame(loop);
    })();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeUIAfterRobot, 200);
  });
} else {
  setTimeout(initializeUIAfterRobot, 200);
}

