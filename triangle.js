/** @type {WebGLRenderingContext} */
let gl;

window.onload = function init() {
    let canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) {
        alert("WebGL isn't available");
    }

    // Three Vertices        
    let initialVertices = [
        vec2(-1, -1),
        vec2(0, 1),
        vec2(1, -1)
    ];

    let lookAtMatrix = lookAt(
        [0, 2, 3],
        [0, 1, 0],
        [0, 10, 0]
    );

    let projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 100);

    let MVPMatrix = mult(projectionMatrix, lookAtMatrix);
    
    // Configure WebGL   
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // Load shaders and initialize attribute buffers
    let program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Load the data into the GPU        
    let bufferId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(initialVertices), gl.STATIC_DRAW);

    // Associate out shader variables with our data buffer
    let vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    let uMVPMatrix = gl.getUniformLocation(program, "uMVPMatrix");
    gl.uniformMatrix4fv(uMVPMatrix, false, flatten(MVPMatrix));
    render();

    loadModel([
        'miku-hatsune-vocaloid-rigged/source/MIKU VOCALOID RIGGED.glb',
    ]).then(meshes => {
        loadModel([
            'nnd-compass-saber-alter-t0/nnd_compass_saber_alter_t0.glb'
        ]).then(meshes2 => {
            renderMeshes(program, meshes);
        });
    });
};

function renderMeshes(program, meshes) {
    console.log(meshes);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    let vPosition = gl.getAttribLocation(program, "vPosition");
    let aTexCoord = gl.getAttribLocation(program, "aTexCoord");
    let uSampler = gl.getUniformLocation(program, "uSampler");
    let bufferId = gl.createBuffer();
    let texCoordBuffer = gl.createBuffer();
    let indexBufferId = gl.createBuffer();
    for (let mesh of meshes) {
        gl.enableVertexAttribArray(vPosition);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(aTexCoord);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.texcoords, gl.STATIC_DRAW);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
        gl.uniform1i(uSampler, 0);
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferId);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}
