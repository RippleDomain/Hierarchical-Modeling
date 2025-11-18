// robot.js
"use strict";

/** ========== GL / Program Handles ========== */
let gl, program;

/** Main shader uniforms */
let uMVPMatrix, uLightPosition, uViewPosition, uModel;

/** Extra programs for picking & outline */
let pickProgram, outlineProgram;
let pick_uMVP, pick_uModel, pick_uColor;
let outline_uMVP, outline_uModel;

/** Projection / Camera (triangle.js style) */
let projectionMatrix;
let cameraRadius = 2.0;
let cameraTheta  = 0.0;
let cameraPhi    = Math.PI / 2;
let lookAtPoint  = [0, 1, 0];

const drag = { active:false, lastX:0, lastY:0 };
const limbDrag = { active:false, lastX:0, lastY:0 };
const limbDragSensitivity = 0.8; // deg per pixel

/** Scene graph root */
let rootNode = null;

/** ========== Hierarchy / Angles & Constraints ========== */
const torsoId=0, head1Id=1, leftUpperArmId=2, leftLowerArmId=3, rightUpperArmId=4, rightLowerArmId=5,
      leftUpperLegId=6, leftLowerLegId=7, rightUpperLegId=8, rightLowerLegId=9, head2Id=10,
      leftUpperArmSideId=11, rightUpperArmSideId=12, leftUpperLegSideId=13, rightUpperLegSideId=14,
      leftHandId=15, rightHandId=16;

const numAngles = 17;
const theta = new Array(numAngles).fill(0);

/* Constraints copied from your placeholder rig */
const jointConstraints = {
  [torsoId]: [-180, 180],
  [head1Id]: [-45, 45],  [head2Id]: [-80, 80],
  [leftUpperArmId]: [-180, 0],   [rightUpperArmId]: [0, 180],
  [leftLowerArmId]: [-135, 0],   [rightLowerArmId]: [-135, 0],
  [leftUpperLegId]: [-45, 75],   [rightUpperLegId]: [-45, 75],
  [leftLowerLegId]: [0, 135],    [rightLowerLegId]: [0, 135],
  [leftUpperArmSideId]: [0,110], [rightUpperArmSideId]: [-110,0],
  [leftUpperLegSideId]: [-30,30],[rightUpperLegSideId]: [-30,30],
  [leftHandId]: [0,45],          [rightHandId]: [0,45]
};
function clampJoint(id, val){
  const lim = jointConstraints[id];
  return lim ? Math.max(lim[0], Math.min(lim[1], val)) : val;
}

/** Node names from your GLB */
const NAME = {
  torso: "torso",
  head: "head",
  lArmHi: "left_arm_high",
  lArmLo: "left_arm_low",
  rArmHi: "right_arm_high",
  rArmLo: "right_arm_low",
  lLegHi: "left_leg_high",
  lLegLo: "left_leg_low",
  rLegHi: "right_leg_high",
  rLegLo: "right_leg_low",
  lHand: "left_hand",
  rHand: "right_hand"
};

/** Selected node name for outline & dragging */
let selectedNodeName = null;

/** Which angle IDs a node controls (primary via horizontal drag, secondary via vertical drag) */
const nodeToAngleMapByName = {
  [NAME.torso]:   { primary: torsoId,         secondary: null },
  [NAME.head]:    { primary: head1Id,         secondary: head2Id },
  [NAME.lArmHi]:  { primary: leftUpperArmId,  secondary: leftUpperArmSideId },
  [NAME.lArmLo]:  { primary: leftLowerArmId,  secondary: null },
  [NAME.rArmHi]:  { primary: rightUpperArmId, secondary: rightUpperArmSideId },
  [NAME.rArmLo]:  { primary: rightLowerArmId, secondary: null },
  [NAME.lLegHi]:  { primary: leftUpperLegId,  secondary: leftUpperLegSideId },
  [NAME.lLegLo]:  { primary: leftLowerLegId,  secondary: null },
  [NAME.rLegHi]:  { primary: rightUpperLegId, secondary: rightUpperLegSideId },
  [NAME.rLegLo]:  { primary: rightLowerLegId, secondary: null },
  [NAME.lHand]:   { primary: leftHandId,      secondary: null },
  [NAME.rHand]:   { primary: rightHandId,     secondary: null }
};

/** ========== Pose Construction (apply AFTER node's native transform) ========== */
const RX = (deg)=> rotate(deg, 1,0,0);
const RY = (deg)=> rotate(deg, 0,1,0);
const RZ = (deg)=> rotate(deg, 0,0,1);

function buildPoseTransforms(){
  const pose = {};
  // Torso twist (yaw)
  pose[NAME.torso] = RY(theta[torsoId]);
  // Head: pitch then yaw
  pose[NAME.head] = mult(RX(theta[head1Id]), RY(theta[head2Id]));
  // Shoulders: side (Z) then pitch (X)
  pose[NAME.lArmHi] = mult(RZ(theta[leftUpperArmSideId]), RX(theta[leftUpperArmId]));
  pose[NAME.rArmHi] = mult(RZ(theta[rightUpperArmSideId]), RX(-theta[rightUpperArmId]));
  // Elbows
  pose[NAME.lArmLo] = RX(theta[leftLowerArmId]);
  pose[NAME.rArmLo] = RX(theta[rightLowerArmId]);
  // Hips
  pose[NAME.lLegHi] = mult(RZ(theta[leftUpperLegSideId]), RX(theta[leftUpperLegId]));
  pose[NAME.rLegHi] = mult(RZ(theta[rightUpperLegSideId]), RX(theta[rightUpperLegId]));
  // Knees
  pose[NAME.lLegLo] = RX(theta[leftLowerLegId]);
  pose[NAME.rLegLo] = RX(theta[rightLowerLegId]);
  // Hands (positive = inward for both) — fixed sign for right hand
  pose[NAME.lHand] = RZ(-theta[leftHandId]);
  pose[NAME.rHand] = RZ(-theta[rightHandId]);

  return pose;
}

/** ========== Utility ========== */
function sphericalToCartesian(radius, theta, phi){
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return [x,y,z];
}
function sphericalToEye(){
  const c = sphericalToCartesian(cameraRadius, cameraTheta, cameraPhi);
  return [ c[0]+lookAtPoint[0], c[1]+lookAtPoint[1], c[2]+lookAtPoint[2] ];
}
function scaleUniform(s){
  const S = mat4();
  S[0][0]=s; S[1][1]=s; S[2][2]=s;
  return S;
}

/** Walk scene with current pose and call cb(node, worldT) */
function traverseWithPose(node, parentT, pose, cb){
  let t = mult(parentT, node.transformation);
  if (pose[node.name]) t = mult(t, pose[node.name]);
  cb(node, t);
  for (const c of (node.children || [])) traverseWithPose(c, t, pose, cb);
}
function findNodeAndT(root, pose, targetName){
  let out = null;
  traverseWithPose(root, mat4(), pose, (node, t) => {
    if (!out && node.name === targetName) out = { node, t };
  });
  return out;
}

/** ========== Main (lit+textured) Rendering ========== */
function renderMeshes(items){
  const aPos = gl.getAttribLocation(program, "vPosition");
  const aNrm = gl.getAttribLocation(program, "aNormal");
  const aUV  = gl.getAttribLocation(program, "aTexCoord");
  const uSamp = gl.getUniformLocation(program, "uSampler");
  uModel = gl.getUniformLocation(program, "model");

  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(uSamp, 0);

  for (const {t, m} of items){
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPos);

    gl.bindBuffer(gl.ARRAY_BUFFER, m.nbo);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aNrm);

    gl.bindBuffer(gl.ARRAY_BUFFER, m.tbo);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aUV);

    gl.uniformMatrix4fv(uModel, false, flatten(t));

    if (m.texture) gl.bindTexture(gl.TEXTURE_2D, m.texture);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_SHORT, 0);
  }
}

/** Draw the whole scene with current camera & pose */
function updateCameraAndDraw(){
  if (!gl || !program) return;

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

  // collect and draw
  const items = [];
  traverseWithPose(rootNode, mat4(), pose, (node, t) => {
    for (const m of node.meshes) items.push({ t, m });
  });
  renderMeshes(items);

  // outline on selection
  drawSelectedOutline();
}

/** ========== Picking (hidden color pass) ========== */
const pickables = [
  NAME.torso, NAME.head,
  NAME.lArmHi, NAME.lArmLo, NAME.rArmHi, NAME.rArmLo,
  NAME.lLegHi, NAME.lLegLo, NAME.rLegHi, NAME.rLegLo,
  NAME.lHand, NAME.rHand
];
const nameToPickColor = new Map();
const pickColorToName = new Map();
(function initPickColors(){
  for (let i = 0; i < pickables.length; i++){
    const id = i + 1;
    const r = ((id     ) & 255) / 255.0;
    const g = ((id >> 8) & 255) / 255.0;
    const b = ((id >>16) & 255) / 255.0;
    nameToPickColor.set(pickables[i], [r,g,b]);
    pickColorToName.set(`${Math.round(r*255)}_${Math.round(g*255)}_${Math.round(b*255)}`, pickables[i]);
  }
})();

function createPickFBO(width, height){
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);

  const ok = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return ok ? { fb, tex, rb, w:width, h:height } : null;
}

function renderPickingScene(fbo){
  const eye = sphericalToEye();
  const V = lookAt(eye, lookAtPoint, [0,1,0]);
  const MVP = mult(projectionMatrix, V);
  const pose = buildPoseTransforms();

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
  gl.viewport(0, 0, fbo.w, fbo.h);
  gl.clearColor(0,0,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  gl.useProgram(pickProgram);
  gl.uniformMatrix4fv(pick_uMVP, false, flatten(MVP));

  traverseWithPose(rootNode, mat4(), pose, (node, t) => {
    if (!nameToPickColor.has(node.name)) return;

    gl.uniform3fv(pick_uColor, new Float32Array(nameToPickColor.get(node.name)));
    gl.uniformMatrix4fv(pick_uModel, false, flatten(t));

    for (const m of node.meshes){
      const aPos = gl.getAttribLocation(pickProgram, "vPosition");
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aPos);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_SHORT, 0);
    }
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function pickAtClientPos(clientX, clientY){
  const rect = gl.canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const x = Math.floor((clientX - rect.left) * dpr);
  const y = Math.floor((clientY - rect.top)  * dpr);
  if (x < 0 || y < 0 || x >= gl.canvas.width || y >= gl.canvas.height) return null;

  const fbo = createPickFBO(gl.canvas.width, gl.canvas.height);
  if (!fbo) return null;

  renderPickingScene(fbo);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
  const px = new Uint8Array(4);
  gl.readPixels(x, fbo.h - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // cleanup
  gl.deleteFramebuffer(fbo.fb);
  gl.deleteTexture(fbo.tex);
  gl.deleteRenderbuffer(fbo.rb);

  const key = `${px[0]}_${px[1]}_${px[2]}`;
  return pickColorToName.get(key) || null;
}

/** ========== Outline of selected node (yellow) ========== */
function drawSelectedOutline(){
  if (!selectedNodeName) return;
  const eye = sphericalToEye();
  const V = lookAt(eye, lookAtPoint, [0,1,0]);
  const MVP = mult(projectionMatrix, V);

  const pose = buildPoseTransforms();
  const hit = findNodeAndT(rootNode, pose, selectedNodeName);
  if (!hit) return;

  gl.useProgram(outlineProgram);
  gl.uniformMatrix4fv(outline_uMVP, false, flatten(MVP));

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);              // draw backfaces for silhouette
  gl.depthFunc(gl.LEQUAL);

  const inflated = mult(hit.t, scaleUniform(1.03));
  gl.uniformMatrix4fv(outline_uModel, false, flatten(inflated));

  for (const m of hit.node.meshes){
    const aPos = gl.getAttribLocation(outlineProgram, "vPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPos);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  gl.cullFace(gl.BACK);
  gl.disable(gl.CULL_FACE);
  gl.depthFunc(gl.LESS);
}

/** ========== UI Helpers ========== */
function linkSlider(id, angleId){
  const slider = document.getElementById(id);
  const label  = document.getElementById(`v${angleId}`);
  slider.addEventListener("input", e => {
    theta[angleId] = clampJoint(angleId, parseFloat(e.target.value));
    e.target.value = theta[angleId];
    if (label) label.textContent = String(theta[angleId] | 0);
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
}
function resetCamera(){
  cameraRadius = 2.0;
  cameraTheta  = 0.0;
  cameraPhi    = Math.PI / 2;
  lookAtPoint  = [0,1,0];
}

/** Keep canvas hi-DPI and update projection */
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

/** ========== Init & Event Wiring ========== */
window.onload = async function(){
  const canvas = document.getElementById("gl-canvas");
  gl = WebGLUtils.setupWebGL(canvas);
  if (!gl) { alert("WebGL isn't available"); return; }

  program = initShaders(gl, "vertex-shader", "fragment-shader");
  gl.useProgram(program);
  uMVPMatrix     = gl.getUniformLocation(program, "uMVPMatrix");
  uLightPosition = gl.getUniformLocation(program, "uLightPosition");
  uViewPosition  = gl.getUniformLocation(program, "uViewPosition");

  // Extra programs
  pickProgram = initShaders(gl, "pick-vertex", "pick-fragment");
  pick_uMVP   = gl.getUniformLocation(pickProgram, "uMVPMatrix");
  pick_uModel = gl.getUniformLocation(pickProgram, "model");
  pick_uColor = gl.getUniformLocation(pickProgram, "uPickColor");

  outlineProgram = initShaders(gl, "outline-vertex", "outline-fragment");
  outline_uMVP   = gl.getUniformLocation(outlineProgram, "uMVPMatrix");
  outline_uModel = gl.getUniformLocation(outlineProgram, "model");

  gl.clearColor(0.06,0.06,0.08,1.0);

  // Sliders → theta[]
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

  // Reset buttons
  const btnResetPose   = document.getElementById("btnResetPose");
  const btnResetCamera = document.getElementById("btnResetCamera");
  if (btnResetPose)   btnResetPose.onclick   = ()=> resetPose();
  if (btnResetCamera) btnResetCamera.onclick = ()=> resetCamera();

  // Mouse input:
  canvas.addEventListener("mousedown", (e) => {
    // attempt limb pick first
    const hit = pickAtClientPos(e.clientX, e.clientY);
    if (hit){
      selectedNodeName = hit;
      limbDrag.active = true;
      limbDrag.lastX = e.clientX;
      limbDrag.lastY = e.clientY;
      drag.active = false; // prevent camera drag
      e.preventDefault();
      return;
    }
    // otherwise start camera drag
    drag.active = true;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  });

  canvas.addEventListener("mousemove", (e) => {
    // limb dragging
    if (limbDrag.active){
      const map = nodeToAngleMapByName[selectedNodeName];
      if (map){
        const dx = e.clientX - limbDrag.lastX;
        const dy = e.clientY - limbDrag.lastY;

        if (dx !== 0){
          theta[map.primary] = clampJoint(map.primary, theta[map.primary] + dx * limbDragSensitivity);
          const lab = document.getElementById(`v${map.primary}`); if (lab) lab.textContent = String(theta[map.primary] | 0);
          const sld = document.getElementById(`slider${map.primary}`); if (sld) sld.value = theta[map.primary];
        }
        if (map.secondary != null && dy !== 0){
          theta[map.secondary] = clampJoint(map.secondary, theta[map.secondary] - dy * limbDragSensitivity);
          const lab2 = document.getElementById(`v${map.secondary}`); if (lab2) lab2.textContent = String(theta[map.secondary] | 0);
          const sld2 = document.getElementById(`slider${map.secondary}`); if (sld2) sld2.value = theta[map.secondary];
        }

        limbDrag.lastX = e.clientX;
        limbDrag.lastY = e.clientY;
      }
      e.preventDefault();
      return;
    }

    // camera orbit/pan
    if (!drag.active) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;

    if (e.shiftKey){
      const cam = sphericalToCartesian(cameraRadius, cameraTheta, cameraPhi);
      const fwd = normalize([-cam[0], -cam[1], -cam[2]]);
      const right = normalize(cross(fwd, [0,1,0]));
      const up = normalize(cross(right, fwd));
      const pan = cameraRadius * 0.0015;
      lookAtPoint[0] += right[0]*dx*pan - up[0]*dy*pan;
      lookAtPoint[1] += right[1]*dx*pan - up[1]*dy*pan;
      lookAtPoint[2] += right[2]*dx*pan - up[2]*dy*pan;
    } else {
      cameraTheta -= dx * 0.01;
      cameraPhi   += dy * 0.01;
      cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi));
    }

    drag.lastX = e.clientX; drag.lastY = e.clientY;
  });

  ["mouseup","mouseleave"].forEach(evt => canvas.addEventListener(evt, () => {
    limbDrag.active = false;
    drag.active = false;
  }));

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cameraRadius += e.deltaY * 0.01;
    cameraRadius = Math.max(0.5, Math.min(20, cameraRadius));
  }, { passive:false });

  // click empty background to deselect
  canvas.addEventListener("click", (e) => {
    if (limbDrag.active) return; // ignore if drag just happened
    const hit = pickAtClientPos(e.clientX, e.clientY);
    if (!hit) selectedNodeName = null;
  });

  window.addEventListener("resize", ()=> fitCanvas());
  fitCanvas();

  // Load your GLB (adjust path if needed)
  rootNode = await loadModel(gl, [ "robotModel/robofella.glb" ]);

  // Main loop
  (function loop(){
    fitCanvas();
    updateCameraAndDraw();
    requestAnimFrame(loop);
  })();
};