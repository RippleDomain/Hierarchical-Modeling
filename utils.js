function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

async function loadTextureFromBase64(gl, texture, base64, mimeType = 'image/png') {
    const image = new Image();
    const prefix = base64.startsWith('data:') ? '' : `data:${mimeType};base64,`;
    image.src = prefix + base64;
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
    });
    gl.bindTexture(gl.TEXTURE_2D, texture);
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
    return texture;
}

const loadMaterials = async (model) => {
    const materials = [];
    for (let i = 0; i < model.materials.length; i++ ) {
        const texture = model.textures[model.materials[i].properties.find(prop => prop.key === '$tex.file')?.value.substring(1)];
        if (!texture) continue;
        const textureId = gl.createTexture();
        await loadTextureFromBase64(gl, textureId, texture.data);
        materials[i] = {
            texture: textureId,
            ...model.materials[i]
        }
    }
    return materials;
};

const loadModel = async (files) => {
	const ajs = await assimpjs();

	const responses = await Promise.all(files.map((file) => fetch(file)));
	const arrayBuffers = await Promise.all(responses.map((res) => res.arrayBuffer()));

	let fileList = new ajs.FileList();
	for (let i = 0; i < files.length; i++) {
		fileList.AddFile(files[i], new Uint8Array(arrayBuffers[i]));
	}

	let result = ajs.ConvertFileList(fileList, 'assjson');

	if (!result.IsSuccess() || result.FileCount() == 0) {
		throw new Error(`Assimp conversion failed: ${result.GetErrorCode()}`);
	}

	let resultFile = result.GetFile(0);
	let jsonContent = new TextDecoder().decode(resultFile.GetContent());

	let resultJson = JSON.parse(jsonContent);

	console.log(resultJson);
	window.model = resultJson;

	const materials = await loadMaterials(resultJson);

	const meshes = [];
	for (let mesh of resultJson.meshes) {
		let vertices = [];
		let normals = [];
		let indices = [];
		let texcoords = [];
		indices.push(...(mesh.faces.flat()));
		vertices.push(...mesh.vertices);
		normals.push(...mesh.normals);
		texcoords.push(...mesh.texturecoords[0]);
		const vertexArray = new Float32Array(vertices);
		const normalArray = new Float32Array(normals);
		const texcoordArray = new Float32Array(texcoords);
		const indexArray = new Int16Array(indices);

		const textureId = materials[mesh.materialindex]?.texture;

		meshes.push({
			vertices: vertexArray,
			normals: normalArray,
			texcoords: texcoordArray,
			indices: indexArray,
			texture: textureId
		});
	}

	return meshes;
}