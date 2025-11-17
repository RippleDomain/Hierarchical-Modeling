"use strict";

var canvas;
var gl;
var program;

var projectionMatrix;
var modelViewMatrix;
var instanceMatrix;
var modelViewMatrixLoc;

var vertices = [
    vec4(-0.5, -0.5,  0.5, 1.0),
    vec4(-0.5,  0.5,  0.5, 1.0),
    vec4( 0.5,  0.5,  0.5, 1.0),
    vec4( 0.5, -0.5,  0.5, 1.0),
    vec4(-0.5, -0.5, -0.5, 1.0),
    vec4(-0.5,  0.5, -0.5, 1.0),
    vec4( 0.5,  0.5, -0.5, 1.0),
    vec4( 0.5, -0.5, -0.5, 1.0)
];

// Node IDs
var torsoId          = 0;
var headId           = 1;
var head1Id          = 1;   // head nod (pitch)
var head2Id          = 10;  // head turn (yaw)
var leftUpperArmId   = 2;
var leftLowerArmId   = 3;
var rightUpperArmId  = 4;
var rightLowerArmId  = 5;
var leftUpperLegId   = 6;
var leftLowerLegId   = 7;
var rightUpperLegId  = 8;
var rightLowerLegId  = 9;

// Side movement (abduction/adduction) angle IDs
var leftUpperArmSideId  = 11;
var rightUpperArmSideId = 12;
var leftUpperLegSideId  = 13;
var rightUpperLegSideId = 14;
var leftHandId = 15;
var rightHandId = 16;

// Robot dimensions
var torsoHeight     = 5.0;
var torsoWidth      = 1.0;
var upperArmHeight  = 3.0;
var lowerArmHeight  = 2.0;
var upperArmWidth   = 0.5;
var lowerArmWidth   = 0.5;
var upperLegWidth   = 0.5;
var lowerLegWidth   = 0.5;
var lowerLegHeight  = 2.0;
var upperLegHeight  = 3.0;
var headHeight      = 1.5;
var headWidth       = 1.0;
var handHeight      = 1.0;
var handWidth       = 0.5;

var numNodes  = 17;
var numAngles = 17;
var angle     = 0;

// Rotation angles for each joint (in degrees)
// Format: [torso, head1, leftUpperArm, leftLowerArm, rightUpperArm, rightLowerArm,
//          leftUpperLeg, leftLowerLeg, rightUpperLeg, rightLowerLeg, head2,
//          leftUpperArmSide, rightUpperArmSide, leftUpperLegSide, rightUpperLegSide]
// All 0 = neutral, standing straight, arms & legs hanging down.
var theta = [
    0,  // torso twist
    0,  // head nod (pitch)
    0,  // left shoulder pitch (from arm down)
    0,  // left elbow flex
    0,  // right shoulder pitch
    0,  // right elbow flex
    0,  // left hip pitch (from leg down)
    0,  // left knee flex
    0,  // right hip pitch
    0,  // right knee flex
    0,  // head turn (yaw)
    0,  // left shoulder abduction
    0,  // right shoulder abduction
    0,  // left hip abduction
    0,   // right hip abduction
    0,  // left hand bend (inward)
    0   // right hand bend (inward)
];

// Joint angle constraints (min, max) in degrees
var jointConstraints = {
    [torsoId]:          [-180, 180], // torso twist left/right

    [head1Id]:          [-45, 45],   // head nod (pitch)
    [head2Id]:          [-80, 80],   // head turn (yaw)

    // Shoulders
    [leftUpperArmId]:   [-180, 0],   // forward/back
    [rightUpperArmId]:  [0, 180],

    // Elbows
    [leftLowerArmId]:   [-135, 0],
    [rightLowerArmId]:  [-135, 0],

    // Hips
    [leftUpperLegId]:   [-45, 75],
    [rightUpperLegId]:  [-45, 75],

    // Knees
    [leftLowerLegId]:   [0, 135],
    [rightLowerLegId]:  [0, 135],

    // Shoulder abduction/adduction (side raise)
    [leftUpperArmSideId]:  [0, 110],
    [rightUpperArmSideId]: [-110, 0],

    // Leg abduction/adduction (side)
    [leftUpperLegSideId]:  [-30, 30],
    [rightUpperLegSideId]: [-30, 30],

    // Hands (inward rotation)
    [leftHandId]:       [0, 45],
    [rightHandId]:      [0, 45]
};

// Constrain angle to valid range for a joint
function constrainAngle(jointId, angleValue) {
    if (jointConstraints[jointId]) {
        var min = jointConstraints[jointId][0];
        var max = jointConstraints[jointId][1];
        return Math.max(min, Math.min(max, angleValue));
    }
    return angleValue;
}

// Animation parameters
var animate = false;
var animationSpeed = 1.0;

// Mouse picking and dragging
var selectedLimbId = null;  // Currently selected limb node ID
var selectedAngleId = null; // Primary angle to control (pitch)
var selectedSideAngleId = null; // Secondary angle to control (side movement/yaw)
var isDragging = false;
var lastMouseX = 0;
var lastMouseY = 0;
var dragSensitivity = 1.5;  // Degrees per pixel

// Mapping from node IDs to their angle IDs (primary and secondary)
var nodeToAngleMap = {
    [torsoId]: { primary: torsoId, secondary: null },
    [headId]: { primary: head1Id, secondary: head2Id },
    [leftUpperArmId]: { primary: leftUpperArmId, secondary: leftUpperArmSideId },
    [leftLowerArmId]: { primary: leftLowerArmId, secondary: null },
    [rightUpperArmId]: { primary: rightUpperArmId, secondary: rightUpperArmSideId },
    [rightLowerArmId]: { primary: rightLowerArmId, secondary: null },
    [leftUpperLegId]: { primary: leftUpperLegId, secondary: leftUpperLegSideId },
    [leftLowerLegId]: { primary: leftLowerLegId, secondary: null },
    [rightUpperLegId]: { primary: rightUpperLegId, secondary: rightUpperLegSideId },
    [rightLowerLegId]: { primary: rightLowerLegId, secondary: null },
    [leftHandId]:      { primary: leftHandId,     secondary: null },
    [rightHandId]:     { primary: rightHandId,    secondary: null }
};

// Toggle animation function (called from HTML)
function toggleAnimation() {
    animate = !animate;
    var btn = document.getElementById("animateBtn");
    if (animate) {
        btn.textContent = "Stop Animation";
    } else {
        btn.textContent = "Start Animation";
    }
}

var numVertices = 24;

// Matrix stack for tree traversal
var stack = [];

// Node structure array
var figure = [];
for (var i = 0; i < numNodes; i++) {
    figure[i] = createNode(null, null, null, null);
}

var vBuffer;
var cBuffer;
var pointsArray = [];
var colorsArray = [];

// RGBA colors for different parts
var vertexColors = [
    vec4(0.0, 0.0, 0.0, 1.0),  // black
    vec4(1.0, 0.0, 0.0, 1.0),  // red
    vec4(1.0, 1.0, 0.0, 1.0),  // yellow
    vec4(0.0, 1.0, 0.0, 1.0),  // green
    vec4(0.0, 0.0, 1.0, 1.0),  // blue
    vec4(1.0, 0.0, 1.0, 1.0),  // magenta
    vec4(1.0, 1.0, 1.0, 1.0),  // white
    vec4(0.0, 1.0, 1.0, 1.0)   // cyan
];

// Scale function
function scale4(a, b, c) {
    var result = mat4();
    result[0][0] = a;
    result[1][1] = b;
    result[2][2] = c;
    return result;
}

// Create a node for the tree structure
function createNode(transform, render, sibling, child) {
    var node = {
        transform: transform,
        render:    render,
        sibling:   sibling,
        child:     child
    };
    return node;
}

// Initialize nodes with their transformations
function initNodes(Id) {
    var m = mat4();

    switch (Id) {
        case torsoId:
            m = rotate(theta[torsoId], 0, 1, 0);
            figure[torsoId] = createNode(m, torso, null, headId);
            break;

        case headId:
        case head1Id:
        case head2Id:
            // Position head on top of torso with two rotations:
            // head1: nod (pitch, x-axis), head2: turn (yaw, y-axis)
            m = translate(0.0, torsoHeight + 0.5 * headHeight, 0.0);
            m = mult(m, rotate(theta[head1Id], 1, 0, 0));
            m = mult(m, rotate(theta[head2Id], 0, 1, 0));
            m = mult(m, translate(0.0, -0.5 * headHeight, 0.0));
            figure[headId] = createNode(m, head, leftUpperArmId, null);
            break;

        case leftUpperArmId:
            m = translate(-(torsoWidth + upperArmWidth), 0.9 * torsoHeight, 0.0);
            m = mult(m, rotate(180 + theta[leftUpperArmId], 1, 0, 0));   // pitch first: 0 = arm down
            m = mult(m, rotate(theta[leftUpperArmSideId], 0, 0, 1));     // then abduction: side raise
            figure[leftUpperArmId] = createNode(m, leftUpperArm, rightUpperArmId, leftLowerArmId);
            break;

        case rightUpperArmId:
            m = translate(torsoWidth + upperArmWidth, 0.9 * torsoHeight, 0.0);
            m = mult(m, rotate(180 - theta[rightUpperArmId], 1, 0, 0));  // pitch first: 0 = arm down (negated for opposite side)
            m = mult(m, rotate(theta[rightUpperArmSideId], 0, 0, 1));    // then abduction: side raise
            figure[rightUpperArmId] = createNode(m, rightUpperArm, leftUpperLegId, rightLowerArmId);
            break;

        case leftUpperLegId:
            m = translate(-(torsoWidth + upperLegWidth), 0.1 * upperLegHeight, 0.0);
            m = mult(m, rotate(theta[leftUpperLegSideId], 0, 0, 1));     // side
            m = mult(m, rotate(180 + theta[leftUpperLegId], 1, 0, 0));   // 0 = leg down
            figure[leftUpperLegId] = createNode(m, leftUpperLeg, rightUpperLegId, leftLowerLegId);
            break;

        case rightUpperLegId:
            m = translate(torsoWidth + upperLegWidth, 0.1 * upperLegHeight, 0.0);
            m = mult(m, rotate(theta[rightUpperLegSideId], 0, 0, 1));    // side
            m = mult(m, rotate(180 + theta[rightUpperLegId], 1, 0, 0));  // 0 = leg down
            figure[rightUpperLegId] = createNode(m, rightUpperLeg, null, rightLowerLegId);
            break;

        case leftLowerArmId:
            m = translate(0.0, upperArmHeight, 0.0);
            m = mult(m, rotate(theta[leftLowerArmId], 1, 0, 0));         // 0 = straight, + = flex
            figure[leftLowerArmId] = createNode(m, leftLowerArm, null, leftHandId);  // child: hand
            break;
    
        case rightLowerArmId:
            m = translate(0.0, upperArmHeight, 0.0);
            m = mult(m, rotate(theta[rightLowerArmId], 1, 0, 0));
            figure[rightLowerArmId] = createNode(m, rightLowerArm, null, rightHandId); // child: hand
            break;
    

        case leftLowerLegId:
            m = translate(0.0, upperLegHeight, 0.0);
            m = mult(m, rotate(theta[leftLowerLegId], 1, 0, 0));         // 0 = straight, + = flex
            figure[leftLowerLegId] = createNode(m, leftLowerLeg, null, null);
            break;

        case rightLowerLegId:
            m = translate(0.0, upperLegHeight, 0.0);
            m = mult(m, rotate(theta[rightLowerLegId], 1, 0, 0));
            figure[rightLowerLegId] = createNode(m, rightLowerLeg, null, null);
            break;

        case leftHandId:
            // Attach at the end of the forearm, rotate around Z so positive angle bends inward
            m = translate(0.0, lowerArmHeight, 0.0);
            m = mult(m, rotate(-theta[leftHandId], 0, 0, 1));  // -θ for inward on the left
            figure[leftHandId] = createNode(m, leftHand, null, null);
            break;

        case rightHandId:
            // Attach at the end of the forearm, rotate around Z so positive angle bends inward
            m = translate(0.0, lowerArmHeight, 0.0);
            m = mult(m, rotate(theta[rightHandId], 0, 0, 1)); // +θ for inward on the right
            figure[rightHandId] = createNode(m, rightHand, null, null);
            break;
    }
}

// Tree traversal function using matrix stack
function traverse(Id) {
    if (Id == null) return;

    stack.push(modelViewMatrix);

    modelViewMatrix = mult(modelViewMatrix, figure[Id].transform);

    figure[Id].render();

    if (figure[Id].child != null) traverse(figure[Id].child);

    modelViewMatrix = stack.pop();

    if (figure[Id].sibling != null) traverse(figure[Id].sibling);
}

// Tree traversal for outline rendering
function traverseOutline(Id) {
    if (Id == null) return;

    stack.push(modelViewMatrix);
    modelViewMatrix = mult(modelViewMatrix, figure[Id].transform);

    // Render outline if this is the selected limb
    if (Id === selectedLimbId) {
        renderOutline(Id);
    }

    if (figure[Id].child != null) traverseOutline(figure[Id].child);
    modelViewMatrix = stack.pop();
    if (figure[Id].sibling != null) traverseOutline(figure[Id].sibling);
}

// Alternative: Direct outline rendering without traversal
function renderSelectedLimbOutline() {
    if (selectedLimbId === null) return;
    
    // Re-traverse to the selected limb and render outline
    modelViewMatrix = mat4();
    traverseToLimbAndRenderOutline(torsoId, selectedLimbId);
}

// Traverse to find and render outline for specific limb
function traverseToLimbAndRenderOutline(currentId, targetId) {
    if (currentId == null) return false;
    
    stack.push(modelViewMatrix);
    modelViewMatrix = mult(modelViewMatrix, figure[currentId].transform);
    
    if (currentId === targetId) {
        renderOutline(targetId);
        modelViewMatrix = stack.pop();
        return true;
    }
    
    var found = false;
    if (figure[currentId].child != null) {
        found = traverseToLimbAndRenderOutline(figure[currentId].child, targetId);
    }
    
    if (!found) {
        modelViewMatrix = stack.pop();
        if (figure[currentId].sibling != null) {
            found = traverseToLimbAndRenderOutline(figure[currentId].sibling, targetId);
        }
        if (!found) {
            return false;
        }
    } else {
        modelViewMatrix = stack.pop();
    }
    
    return found;
}

// Edge indices for wireframe rendering (12 edges of a cube)
var cubeEdges = [
    0, 1, 1, 2, 2, 3, 3, 0,  // Front face
    4, 5, 5, 6, 6, 7, 7, 4,  // Back face
    0, 4, 1, 5, 2, 6, 3, 7   // Connecting edges
];

// Edge indices for wireframe (12 edges, each with 2 vertices)
var wireframeIndices = [
    0, 1,  1, 2,  2, 3,  3, 0,  // Front face
    4, 5,  5, 6,  6, 7,  7, 4,  // Back face
    0, 4,  1, 5,  2, 6,  3, 7   // Connecting edges
];

// Render cube wireframe using the current instanceMatrix
// The instanceMatrix is already set by the calling render function
function renderCubeWireframe() {
    // Create edge vertex buffer from cube vertices
    var edgeVertices = [];
    for (var i = 0; i < wireframeIndices.length; i++) {
        edgeVertices.push(vertices[wireframeIndices[i]]);
    }
    
    // Create temporary buffer for edges
    var edgeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(edgeVertices), gl.STATIC_DRAW);
    
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);
    
    // Render all edges as lines (instanceMatrix uniform is already set)
    gl.drawArrays(gl.LINES, 0, edgeVertices.length);
    
    // Clean up
    gl.deleteBuffer(edgeBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);  // Restore original vertex buffer
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
}

// Render wireframe outline for a selected limb
function renderOutline(limbId) {
    if (!figure[limbId] || !figure[limbId].render || !figure[limbId].render.renderWireframe) {
        return;
    }

    var vColor    = gl.getAttribLocation(program, "vColor");
    var vPosition = gl.getAttribLocation(program, "vPosition");

    gl.disable(gl.DEPTH_TEST);
    try {
        gl.lineWidth(2.0);
    } catch (e) {
        
    }

    gl.disableVertexAttribArray(vColor);
    gl.vertexAttrib4f(vColor, 0.0, 0.0, 0.0, 1.0);

    // renderWireframe is attached to the *render* function, not the node itself
    var renderFunc = figure[limbId].render;
    renderFunc.renderWireframe();
    // Optional second pass to make outline appear bolder
    renderFunc.renderWireframe();

    // Re-enable depth test
    gl.enable(gl.DEPTH_TEST);
    try {
        gl.lineWidth(1.0);
    } catch (e) {}

    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.enableVertexAttribArray(vColor);
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
}

// Convert node ID to unique picking color (RGB, each component 0-1)
function nodeIdToColor(nodeId) {
    // Map node IDs to colors (R, G, B)
    var colorMap = {
        [torsoId]:         vec4(1.0, 0.0, 0.0, 1.0),      // Red
        [headId]:          vec4(0.0, 1.0, 0.0, 1.0),      // Green
        [leftUpperArmId]:  vec4(0.0, 0.0, 1.0, 1.0),      // Blue
        [leftLowerArmId]:  vec4(1.0, 1.0, 0.0, 1.0),      // Yellow
        [rightUpperArmId]: vec4(1.0, 0.0, 1.0, 1.0),      // Magenta
        [rightLowerArmId]: vec4(0.0, 1.0, 1.0, 1.0),      // Cyan
        [leftUpperLegId]:  vec4(0.5, 0.0, 0.0, 1.0),      // Dark Red
        [leftLowerLegId]:  vec4(0.0, 0.5, 0.0, 1.0),      // Dark Green
        [rightUpperLegId]: vec4(0.0, 0.0, 0.5, 1.0),      // Dark Blue
        [rightLowerLegId]: vec4(0.5, 0.5, 0.0, 1.0),      // Dark Yellow

        // NEW: hands
        [leftHandId]:      vec4(1.0, 0.5, 0.0, 1.0),      // Orange
        [rightHandId]:     vec4(0.5, 0.0, 0.5, 1.0)       // Purple
    };
    return colorMap[nodeId] || vec4(0.5, 0.5, 0.5, 1.0);
}

// Convert color back to node ID with better tolerance
function colorToNodeId(r, g, b) {
    var tolerance = 0.2;
    
    // Check each color with tolerance
    var colorTests = [
        { r: 1.0, g: 0.0, b: 0.0, id: torsoId },
        { r: 0.0, g: 1.0, b: 0.0, id: headId },
        { r: 0.0, g: 0.0, b: 1.0, id: leftUpperArmId },
        { r: 1.0, g: 1.0, b: 0.0, id: leftLowerArmId },
        { r: 1.0, g: 0.0, b: 1.0, id: rightUpperArmId },
        { r: 0.0, g: 1.0, b: 1.0, id: rightLowerArmId },
        { r: 0.5, g: 0.0, b: 0.0, id: leftUpperLegId },
        { r: 0.0, g: 0.5, b: 0.0, id: leftLowerLegId },
        { r: 0.0, g: 0.0, b: 0.5, id: rightUpperLegId },
        { r: 0.5, g: 0.5, b: 0.0, id: rightLowerLegId },

        // NEW: hands
        { r: 1.0, g: 0.5, b: 0.0, id: leftHandId },
        { r: 0.5, g: 0.0, b: 0.5, id: rightHandId }
    ];
    
    // Find closest match
    var bestMatch = null;
    var minDistance = Infinity;
    
    for (var i = 0; i < colorTests.length; i++) {
        var test = colorTests[i];
        var distance = Math.sqrt(
            Math.pow(r - test.r, 2) +
            Math.pow(g - test.g, 2) +
            Math.pow(b - test.b, 2)
        );
        if (distance < minDistance && distance < tolerance) {
            minDistance = distance;
            bestMatch = test.id;
        }
    }
    
    return bestMatch;
}

// Simplified picking: render with unique colors to offscreen buffer
var pickingMode = false;
var pickingColorUniform = null;

// Render scene in picking mode (each limb with unique color)
function renderPickingScene() {
    pickingMode = true;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Render with picking colors
    modelViewMatrix = mat4();
    traversePicking(torsoId);
    
    pickingMode = false;
    
    // Restore original colors after picking
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colorsArray), gl.STATIC_DRAW);
}

// Traverse and render with picking colors
function traversePicking(Id) {
    if (Id == null) return;
    
    stack.push(modelViewMatrix);
    modelViewMatrix = mult(modelViewMatrix, figure[Id].transform);
    
    // Render with picking color
    renderLimbWithPickingColor(Id);
    
    if (figure[Id].child != null) traversePicking(figure[Id].child);
    modelViewMatrix = stack.pop();
    if (figure[Id].sibling != null) traversePicking(figure[Id].sibling);
}

// Render a limb with its picking color
var pickingColorsBuffer = null;

function renderLimbWithPickingColor(limbId) {
    var pickingColor = nodeIdToColor(limbId);
    
    // Create picking colors array (all faces use the same picking color)
    var pickingColors = [];
    for (var i = 0; i < 24; i++) {  // 24 vertices for a cube (6 faces * 4 vertices)
        pickingColors.push(pickingColor);
    }
    
    // Update color buffer with picking colors
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pickingColors), gl.STATIC_DRAW);
    
    // Render
    figure[limbId].render();
}

// Pick limb at mouse coordinates
function pickLimb(x, y) {
    // Ensure coordinates are within canvas bounds
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
        return null;
    }
    
    // Create offscreen framebuffer
    var pickingFBO = gl.createFramebuffer();
    var pickingTexture = gl.createTexture();
    var pickingRenderbuffer = gl.createRenderbuffer();
    
    gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickingRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickingRenderbuffer);
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(pickingFBO);
        gl.deleteTexture(pickingTexture);
        gl.deleteRenderbuffer(pickingRenderbuffer);
        return null;
    }
    
    // Set viewport for picking
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Render picking scene
    renderPickingScene();
    
    // Read pixel (flip Y coordinate)
    var pixel = new Uint8Array(4);
    gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    
    // Clean up
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);  // Restore viewport
    gl.deleteFramebuffer(pickingFBO);
    gl.deleteTexture(pickingTexture);
    gl.deleteRenderbuffer(pickingRenderbuffer);
    
    // Convert to node ID
    var r = pixel[0] / 255.0;
    var g = pixel[1] / 255.0;
    var b = pixel[2] / 255.0;
    
    // Check if we hit background (white or near-white)
    if (r > 0.9 && g > 0.9 && b > 0.9) {
        return null;
    }
    
    return colorToNodeId(r, g, b);
}

// Rendering functions for each body part
function torso() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * torsoHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(torsoWidth, torsoHeight, torsoWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

// Wireframe rendering for torso
torso.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * torsoHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(torsoWidth, torsoHeight, torsoWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function head() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * headHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(headWidth, headHeight, headWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
head.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * headHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(headWidth, headHeight, headWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function leftUpperArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperArmWidth, upperArmHeight, upperArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
leftUpperArm.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperArmWidth, upperArmHeight, upperArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function leftLowerArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerArmWidth, lowerArmHeight, lowerArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
leftLowerArm.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerArmWidth, lowerArmHeight, lowerArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function rightUpperArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperArmWidth, upperArmHeight, upperArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
rightUpperArm.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperArmWidth, upperArmHeight, upperArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function rightLowerArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerArmWidth, lowerArmHeight, lowerArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
rightLowerArm.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerArmWidth, lowerArmHeight, lowerArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function leftUpperLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperLegWidth, upperLegHeight, upperLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
leftUpperLeg.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperLegWidth, upperLegHeight, upperLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function leftLowerLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerLegWidth, lowerLegHeight, lowerLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
leftLowerLeg.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerLegWidth, lowerLegHeight, lowerLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function rightUpperLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperLegWidth, upperLegHeight, upperLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
rightUpperLeg.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperLegWidth, upperLegHeight, upperLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function rightLowerLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerLegWidth, lowerLegHeight, lowerLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
rightLowerLeg.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerLegWidth, lowerLegHeight, lowerLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
}

function leftHand() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * handHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(handWidth, handHeight, handWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
leftHand.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * handHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(handWidth, handHeight, handWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
};

function rightHand() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * handHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(handWidth, handHeight, handWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}
rightHand.renderWireframe = function() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * handHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(handWidth, handHeight, handWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    renderCubeWireframe();
};

// Create quad face of cube (4 vertices for TRIANGLE_FAN)
function quad(a, b, c, d) {
    var color = vertexColors[a];

    pointsArray.push(vertices[a]);
    colorsArray.push(color);
    pointsArray.push(vertices[b]);
    colorsArray.push(color);
    pointsArray.push(vertices[c]);
    colorsArray.push(color);
    pointsArray.push(vertices[d]);
    colorsArray.push(color);
}

// Create cube geometry
function cube() {
    quad(1, 0, 3, 2);
    quad(2, 3, 7, 6);
    quad(3, 0, 4, 7);
    quad(6, 5, 1, 2);
    quad(4, 5, 6, 7);
    quad(5, 4, 0, 1);
}

// Main initialization function
window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) {
        alert("WebGL isn't available");
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // Load shaders and initialize attribute buffers
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    instanceMatrix   = mat4();
    projectionMatrix = ortho(-10.0, 10.0, -10.0, 10.0, -10.0, 10.0);
    modelViewMatrix  = mat4();

    gl.uniformMatrix4fv(
        gl.getUniformLocation(program, "modelViewMatrix"),
        false,
        flatten(modelViewMatrix)
    );
    gl.uniformMatrix4fv(
        gl.getUniformLocation(program, "projectionMatrix"),
        false,
        flatten(projectionMatrix)
    );

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");

    // Create cube geometry
    cube();

    // Set up vertex buffer
    vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsArray), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    // Set up color buffer
    cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colorsArray), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    // Slider event handlers (oninput for real-time updates)
    document.getElementById("slider0").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[torsoId] = constrainAngle(torsoId, value);
        event.target.value = theta[torsoId];
        initNodes(torsoId);
    };

    document.getElementById("slider1").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[head1Id] = constrainAngle(head1Id, value);
        event.target.value = theta[head1Id];
        initNodes(headId);
    };

    document.getElementById("slider2").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftUpperArmId] = constrainAngle(leftUpperArmId, value);
        event.target.value = theta[leftUpperArmId];
        initNodes(leftUpperArmId);
    };

    document.getElementById("slider3").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftLowerArmId] = constrainAngle(leftLowerArmId, value);
        event.target.value = theta[leftLowerArmId];
        initNodes(leftLowerArmId);
    };

    document.getElementById("slider4").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightUpperArmId] = constrainAngle(rightUpperArmId, value);
        event.target.value = theta[rightUpperArmId];
        initNodes(rightUpperArmId);
    };

    document.getElementById("slider5").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightLowerArmId] = constrainAngle(rightLowerArmId, value);
        event.target.value = theta[rightLowerArmId];
        initNodes(rightLowerArmId);
    };

    document.getElementById("slider6").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftUpperLegId] = constrainAngle(leftUpperLegId, value);
        event.target.value = theta[leftUpperLegId];
        initNodes(leftUpperLegId);
    };

    document.getElementById("slider7").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftLowerLegId] = constrainAngle(leftLowerLegId, value);
        event.target.value = theta[leftLowerLegId];
        initNodes(leftLowerLegId);
    };

    document.getElementById("slider8").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightUpperLegId] = constrainAngle(rightUpperLegId, value);
        event.target.value = theta[rightUpperLegId];
        initNodes(rightUpperLegId);
    };

    document.getElementById("slider9").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightLowerLegId] = constrainAngle(rightLowerLegId, value);
        event.target.value = theta[rightLowerLegId];
        initNodes(rightLowerLegId);
    };

    document.getElementById("slider10").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[head2Id] = constrainAngle(head2Id, value);
        event.target.value = theta[head2Id];
        initNodes(headId);
    };

    document.getElementById("slider11").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftUpperArmSideId] = constrainAngle(leftUpperArmSideId, value);
        event.target.value = theta[leftUpperArmSideId];
        initNodes(leftUpperArmId);
    };

    document.getElementById("slider12").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightUpperArmSideId] = constrainAngle(rightUpperArmSideId, value);
        event.target.value = theta[rightUpperArmSideId];
        initNodes(rightUpperArmId);
    };

    document.getElementById("slider13").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftUpperLegSideId] = constrainAngle(leftUpperLegSideId, value);
        event.target.value = theta[leftUpperLegSideId];
        initNodes(leftUpperLegId);
    };

    document.getElementById("slider14").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightUpperLegSideId] = constrainAngle(rightUpperLegSideId, value);
        event.target.value = theta[rightUpperLegSideId];
        initNodes(rightUpperLegId);
    };

    document.getElementById("slider15").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[leftHandId] = constrainAngle(leftHandId, value);
        event.target.value = theta[leftHandId];
        initNodes(leftHandId);
    };

    document.getElementById("slider16").oninput = function (event) {
        var value = parseFloat(event.target.value);
        theta[rightHandId] = constrainAngle(rightHandId, value);
        event.target.value = theta[rightHandId];
        initNodes(rightHandId);
    };

    // Apply constraints to initial values
    for (var i = 0; i < numAngles; i++) {
        theta[i] = constrainAngle(i, theta[i]);
    }

    // Update slider values to match constrained initial values
    document.getElementById("slider0").value  = theta[torsoId];
    document.getElementById("slider1").value  = theta[head1Id];
    document.getElementById("slider2").value  = theta[leftUpperArmId];
    document.getElementById("slider3").value  = theta[leftLowerArmId];
    document.getElementById("slider4").value  = theta[rightUpperArmId];
    document.getElementById("slider5").value  = theta[rightLowerArmId];
    document.getElementById("slider6").value  = theta[leftUpperLegId];
    document.getElementById("slider7").value  = theta[leftLowerLegId];
    document.getElementById("slider8").value  = theta[rightUpperLegId];
    document.getElementById("slider9").value  = theta[rightLowerLegId];
    document.getElementById("slider10").value = theta[head2Id];
    document.getElementById("slider11").value = theta[leftUpperArmSideId];
    document.getElementById("slider12").value = theta[rightUpperArmSideId];
    document.getElementById("slider13").value = theta[leftUpperLegSideId];
    document.getElementById("slider14").value = theta[rightUpperLegSideId];
    document.getElementById("slider15").value = theta[leftHandId];
    document.getElementById("slider16").value = theta[rightHandId];

    // Initialize all nodes
    for (var j = 0; j < numNodes; j++) {
        initNodes(j);
    }

    // Mouse event handlers for picking and dragging
    canvas.addEventListener("mousedown", function(event) {
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        
        var pickedId = pickLimb(x, y);
        if (pickedId !== null) {  // Allow picking all limbs including torso
            selectedLimbId = pickedId;
            var angleMapping = nodeToAngleMap[pickedId];
            selectedAngleId = angleMapping.primary;
            selectedSideAngleId = angleMapping.secondary;
            isDragging = true;
            lastMouseX = x;
            lastMouseY = y;
            canvas.style.cursor = "grabbing";
            event.preventDefault();  // Prevent default to improve dragging
        } else {
            // Deselect if clicking on empty space
            selectedLimbId = null;
            selectedAngleId = null;
            selectedSideAngleId = null;
        }
    });

    canvas.addEventListener("mousemove", function(event) {
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        
        if (isDragging && selectedAngleId !== null) {
            var deltaX = x - lastMouseX;
            var deltaY = y - lastMouseY;
            
            // Map mouse movement to angle changes
            // Horizontal (X) movement controls primary angle (pitch)
            if (deltaX !== 0) {
                var angleDeltaX = deltaX * dragSensitivity;
                theta[selectedAngleId] = constrainAngle(
                    selectedAngleId,
                    theta[selectedAngleId] + angleDeltaX
                );
                updateSliderForAngle(selectedAngleId);
            }
            
            // Vertical (Y) movement controls secondary angle (side movement/yaw) if available
            if (deltaY !== 0 && selectedSideAngleId !== null) {
                var angleDeltaY = -deltaY * dragSensitivity;  // Negative for intuitive control
                theta[selectedSideAngleId] = constrainAngle(
                    selectedSideAngleId,
                    theta[selectedSideAngleId] + angleDeltaY
                );
                updateSliderForAngle(selectedSideAngleId);
            }
            
            // Reinitialize affected nodes
            if (selectedLimbId === headId) {
                initNodes(headId);
            } else if (selectedLimbId === torsoId) {
                initNodes(torsoId);
            } else {
                initNodes(selectedLimbId);
            }
            
            lastMouseX = x;
            lastMouseY = y;
            event.preventDefault();  // Prevent default for smoother dragging
        }
    });

    canvas.addEventListener("mouseup", function(event) {
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = "default";
            event.preventDefault();
        }
    });

    canvas.addEventListener("mouseleave", function(event) {
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = "default";
        }
    });
    
    // Also handle mouseup outside canvas for better UX
    document.addEventListener("mouseup", function(event) {
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = "default";
        }
    });

    // Function to update slider value for an angle
    function updateSliderForAngle(angleId) {
        var sliderMap = {
            [torsoId]: "slider0",
            [head1Id]: "slider1",
            [head2Id]: "slider10",
            [leftUpperArmId]: "slider2",
            [leftLowerArmId]: "slider3",
            [rightUpperArmId]: "slider4",
            [rightLowerArmId]: "slider5",
            [leftUpperLegId]: "slider6",
            [leftLowerLegId]: "slider7",
            [rightUpperLegId]: "slider8",
            [rightLowerLegId]: "slider9",
            [leftUpperArmSideId]: "slider11",
            [rightUpperArmSideId]: "slider12",
            [leftUpperLegSideId]: "slider13",
            [rightUpperLegSideId]: "slider14",
            [leftHandId]: "slider15",
            [rightHandId]: "slider16"
        };
        
        var sliderId = sliderMap[angleId];
        if (sliderId) {
            var slider = document.getElementById(sliderId);
            if (slider) {
                slider.value = theta[angleId];
            }
        }
    }

    render();
};

// Render function with animation loop
var render = function () {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Optional: simple waving animation for left arm
    if (animate) {
        angle += animationSpeed;
        theta[leftUpperArmId] = constrainAngle(
            leftUpperArmId,
            30 + 20 * Math.sin(angle * 0.05)
        );
        theta[leftLowerArmId] = constrainAngle(
            leftLowerArmId,
            60 + 20 * Math.sin(angle * 0.05)
        );
        initNodes(leftUpperArmId);
        initNodes(leftLowerArmId);
    }

    modelViewMatrix = mat4();

    // Render normal scene
    traverse(torsoId);
    
    // Render outline for selected limb (after normal rendering)
    if (selectedLimbId !== null) {
        modelViewMatrix = mat4();
        // Render outline by finding and rendering the selected limb
        renderSelectedLimbOutline();
    }

    requestAnimFrame(render);
};