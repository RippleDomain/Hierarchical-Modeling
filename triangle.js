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
    render();

    assimpjs().then (function (ajs) {
        // fetch the files to import
        let files = [
            'miku-hatsune-vocaloid-rigged/source/MIKU VOCALOID RIGGED.glb',
        ];
        Promise.all (files.map ((file) => fetch (file))).then ((responses) => {
            return Promise.all (responses.map ((res) => res.arrayBuffer ()));
        }).then ((arrayBuffers) => {
            // create new file list object, and add the files
            let fileList = new ajs.FileList ();
            for (let i = 0; i < files.length; i++) {
                fileList.AddFile (files[i], new Uint8Array (arrayBuffers[i]));
            }
            
            // convert file list to assimp json
            let result = ajs.ConvertFileList (fileList, 'assjson');
            
            // check if the conversion succeeded
            if (!result.IsSuccess () || result.FileCount () == 0) {
                console.log(result.GetErrorCode ());
                return;
            }
    
            // get the result file, and convert to string
            let resultFile = result.GetFile (0);
            let jsonContent = new TextDecoder ().decode (resultFile.GetContent ());
    
            // parse the result json
            let resultJson = JSON.parse (jsonContent);
            
            console.log(resultJson);
            window.model = resultJson;

            loadMaterials(resultJson).then(materials => {
                gl.clear(gl.COLOR_BUFFER_BIT);
                let texCoordBuffer = gl.createBuffer();
                let indexBufferId = gl.createBuffer();
                for (let mesh of resultJson.meshes) {
                    let vertices = [];
                    let indices = [];
                    let texcoords = [];
                    for (let i = 0; i < mesh.vertices.length; i += 3) {
                        mesh.vertices[i + 1] -= 1;
                        mesh.vertices[i + 2] -= 1;
                    }
                    indices.push(...(mesh.faces.flat()));
                    vertices.push(...mesh.vertices);
                    texcoords.push(...mesh.texturecoords[0]);
                    const vertexArray = new Float32Array(vertices);
                    const texcoordArray = new Float32Array(texcoords);
                    const indexArray = new Int16Array(indices)

                    const textureId = materials[mesh.materialindex].texture;

                    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
                    gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);

                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferId);
                    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

                    let vPosition = gl.getAttribLocation(program, "vPosition");
                    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(vPosition);

                    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, texcoordArray, gl.STATIC_DRAW);
                    let aTexCoord = gl.getAttribLocation(program, "aTexCoord");
                    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(aTexCoord);

                    let uSampler = gl.getUniformLocation(program, "uSampler");
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, textureId);
                    gl.uniform1i(uSampler, 0);

                    gl.drawElements(gl.TRIANGLES, indexArray.length, gl.UNSIGNED_SHORT, 0);
                }
            })
        });
    });
};

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}
