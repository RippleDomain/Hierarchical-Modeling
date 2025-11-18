// glb-loader.js
"use strict";

// Utility
function isPowerOf2(value){ return (value & (value - 1)) === 0; }

async function loadTextureFromBase64(gl, base64, mimeType = "image/png"){
  const image = new Image();
  const prefix = base64.startsWith("data:") ? "" : `data:${mimeType};base64,`;
  image.src = prefix + base64;
  await new Promise((res, rej) => { image.onload = res; image.onerror = rej; });

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  return tex;
}

async function loadMaterials(gl, model){
  const materials = [];
  for (let i = 0; i < model.materials.length; i++){
    const texProp = model.materials[i].properties.find(p => p.key === '$tex.file');
    if (!texProp) { materials[i] = { texture: null }; continue; }
    const key = texProp.value.startsWith('*') ? texProp.value.substring(1) : texProp.value;
    const packed = model.textures[key];
    if (!packed){ materials[i] = { texture: null }; continue; }
    const tex = await loadTextureFromBase64(gl, packed.data);
    materials[i] = { texture: tex };
  }
  return materials;
}

/**
 * Load a GLB via AssimpJS and build a scene graph with WebGL buffers baked once.
 * Returns: root node with { name, transformation(mat4), meshes:[{vbo,nbo,tbo,ibo,indexCount,texture}], children[] }
 */
async function loadModel(gl, files){
  const ajs = await assimpjs();

  const resps = await Promise.all(files.map(f => fetch(f)));
  const arrays = await Promise.all(resps.map(r => r.arrayBuffer()));

  const list = new ajs.FileList();
  for (let i=0;i<files.length;i++){ list.AddFile(files[i], new Uint8Array(arrays[i])); }

  const result = ajs.ConvertFileList(list, 'assjson');
  if (!result.IsSuccess() || result.FileCount() === 0){
    throw new Error(`Assimp conversion failed: ${result.GetErrorCode()}`);
  }

  const content = new TextDecoder().decode(result.GetFile(0).GetContent());
  const json = JSON.parse(content);

  const materials = await loadMaterials(gl, json);

  // bake meshes
  const bakedMeshes = [];
  for (const mesh of json.meshes){
    const vertices = new Float32Array(mesh.vertices);
    const normals  = new Float32Array(mesh.normals || new Array(mesh.vertices.length).fill(0));
    const texcoords = new Float32Array((mesh.texturecoords && mesh.texturecoords[0]) ? mesh.texturecoords[0] : new Array((mesh.vertices.length/3)*2).fill(0));
    const indices  = new Uint16Array(mesh.faces.flat());

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const nbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

    const tbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tbo);
    gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    bakedMeshes.push({
      vbo, nbo, tbo, ibo,
      indexCount: indices.length,
      texture: materials[mesh.materialindex]?.texture || null
    });
  }

  function readNode(node){
    return {
      name: node.name,
      transformation: mat4(node.transformation),
      meshes: (node.meshes || []).map(i => bakedMeshes[i]),
      children: (node.children || []).map(readNode)
    };
  }

  return readNode(json.rootnode);
}