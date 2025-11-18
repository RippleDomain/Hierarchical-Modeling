/** @type {WebGLRenderingContext} */
let gl;
let program;
let meshes;
let uMVPMatrix;
let projectionMatrix;

// camera in spherical coordinates
let cameraRadius = 2;
let cameraTheta = 0; // horizontal angle
let cameraPhi = Math.PI / 2; // vertical angle 0 is top PI is bottom
let lookAtPoint = [0, 0, 0];

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function updateCamera() {
    let cameraCoords = sphericalToCartesian(cameraRadius, cameraTheta, cameraPhi);
    
    let absoluteCameraPos = [
        cameraCoords[0] + lookAtPoint[0],
        cameraCoords[1] + lookAtPoint[1],
        cameraCoords[2] + lookAtPoint[2]
    ];
    
    let lookAtMatrix = lookAt(
        absoluteCameraPos,
        lookAtPoint,
        [0, 1, 0]
    );
    
    let MVPMatrix = mult(projectionMatrix, lookAtMatrix);
    gl.uniformMatrix4fv(uMVPMatrix, false, flatten(MVPMatrix));
    
    if (meshes) {
        renderMeshes(meshes);
    }
}

window.onload = function init() {
    let canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) {
        alert("WebGL isn't available");
    }

    projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 100);
    
    // Configure WebGL   
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // Load shaders and initialize attribute buffers
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Associate out shader variables with our data buffer
    let vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    uMVPMatrix = gl.getUniformLocation(program, "uMVPMatrix");
    let uLightPosition = gl.getUniformLocation(program, "uLightPosition");
    gl.uniform3f(uLightPosition, 0, 2, 50);
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let deltaX = e.clientX - lastMouseX;
        let deltaY = e.clientY - lastMouseY;
        
        if (e.shiftKey) {
            let cameraCoords = sphericalToCartesian(cameraRadius, cameraTheta, cameraPhi);
            
            let forward = normalize([
                -cameraCoords[0],
                -cameraCoords[1],
                -cameraCoords[2]
            ]);
            
            let worldUp = [0, 1, 0];
            let right = normalize(cross(forward, worldUp));
            
            let up = normalize(cross(right, forward));
            
            let panSpeed = cameraRadius * 0.001;
            
            lookAtPoint[0] += right[0] * deltaX * panSpeed;
            lookAtPoint[1] += right[1] * deltaX * panSpeed;
            lookAtPoint[2] += right[2] * deltaX * panSpeed;
            
            lookAtPoint[0] -= up[0] * deltaY * panSpeed;
            lookAtPoint[1] -= up[1] * deltaY * panSpeed;
            lookAtPoint[2] -= up[2] * deltaY * panSpeed;
        } else {
            cameraTheta -= deltaX * 0.01;
            cameraPhi += deltaY * 0.01;
            
            cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi));
        }
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        
        updateCamera();
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        cameraRadius += e.deltaY * 0.01;
        cameraRadius = Math.max(0.5, Math.min(20, cameraRadius));
        updateCamera();
    });

    loadModel([
        'robotModel/robofella.glb',
    ]).then(loadedMeshes => {
        meshes = loadedMeshes;
        updateCamera();
    });
};

function renderMeshes(meshes) {
    console.log(meshes);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    let vPosition = gl.getAttribLocation(program, "vPosition");
    let aNormal = gl.getAttribLocation(program, "aNormal");
    let aTexCoord = gl.getAttribLocation(program, "aTexCoord");
    let uSampler = gl.getUniformLocation(program, "uSampler");
    let bufferId = gl.createBuffer();
    let texCoordBuffer = gl.createBuffer();
    let normalBuffer = gl.createBuffer();
    let indexBufferId = gl.createBuffer();
    for (let mesh of meshes) {
        gl.enableVertexAttribArray(vPosition);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(aNormal);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
        gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

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