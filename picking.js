let selectedNodeName = null;

const limbDrag = { active:false, lastX:0, lastY:0 };
const limbDragSensitivity = 0.8; // deg per pixel

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
  if (!pickProgram || !pick_uMVP) return;
  
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

  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  traverseWithPose(rootNode, mat4(), pose, (node, t) => {
    if (!nameToPickColor.has(node.name)) return;

    gl.uniform3fv(pick_uColor, new Float32Array(nameToPickColor.get(node.name)));
    gl.uniformMatrix4fv(pick_uModel, false, flatten(t));

    for (const m of node.meshes){
      const aPos = gl.getAttribLocation(pickProgram, "vPosition");
      
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aPos);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
      gl.drawElements(gl.TRIANGLES, m.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  });

  gl.deleteBuffer(vertexBuffer);
  gl.deleteBuffer(indexBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function pickAtClientPos(clientX, clientY){
  if (!gl || !gl.canvas || !pickProgram) return null;
  
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

  gl.deleteFramebuffer(fbo.fb);
  gl.deleteTexture(fbo.tex);
  gl.deleteRenderbuffer(fbo.rb);

  const key = `${px[0]}_${px[1]}_${px[2]}`;
  return pickColorToName.get(key) || null;
}

function drawSelectedOutline(){
  if (!selectedNodeName || !outlineProgram || !outline_uMVP) return;
  
  const eye = sphericalToEye();
  const V = lookAt(eye, lookAtPoint, [0,1,0]);
  const MVP = mult(projectionMatrix, V);

  const pose = buildPoseTransforms();
  const hit = findNodeAndT(rootNode, pose, selectedNodeName);
  if (!hit) return;

  gl.useProgram(outlineProgram);
  gl.uniformMatrix4fv(outline_uMVP, false, flatten(MVP));

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);
  gl.depthFunc(gl.LEQUAL);

  const inflated = mult(hit.t, scaleUniform(1.03));
  gl.uniformMatrix4fv(outline_uModel, false, flatten(inflated));

  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  for (const m of hit.node.meshes){
    const aPos = gl.getAttribLocation(outlineProgram, "vPosition");
    
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPos);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    gl.drawElements(gl.TRIANGLES, m.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  gl.deleteBuffer(vertexBuffer);
  gl.deleteBuffer(indexBuffer);

  gl.cullFace(gl.BACK);
  gl.disable(gl.CULL_FACE);
  gl.depthFunc(gl.LESS);
}
