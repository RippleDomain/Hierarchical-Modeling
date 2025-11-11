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
    console.log(materials);
    return materials;
};