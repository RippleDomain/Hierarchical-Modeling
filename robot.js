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

var numNodes  = 10;
var numAngles = 15;
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
    0   // right hip abduction
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
    [rightUpperLegSideId]: [-30, 30]
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
            figure[leftLowerArmId] = createNode(m, leftLowerArm, null, null);
            break;

        case rightLowerArmId:
            m = translate(0.0, upperArmHeight, 0.0);
            m = mult(m, rotate(theta[rightLowerArmId], 1, 0, 0));
            figure[rightLowerArmId] = createNode(m, rightLowerArm, null, null);
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

// Rendering functions for each body part
function torso() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * torsoHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(torsoWidth, torsoHeight, torsoWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function head() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * headHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(headWidth, headHeight, headWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function leftUpperArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperArmWidth, upperArmHeight, upperArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function leftLowerArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerArmWidth, lowerArmHeight, lowerArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function rightUpperArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperArmWidth, upperArmHeight, upperArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function rightLowerArm() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerArmHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerArmWidth, lowerArmHeight, lowerArmWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function leftUpperLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperLegWidth, upperLegHeight, upperLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function leftLowerLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerLegWidth, lowerLegHeight, lowerLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function rightUpperLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * upperLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(upperLegWidth, upperLegHeight, upperLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

function rightLowerLeg() {
    instanceMatrix = mult(modelViewMatrix, translate(0.0, 0.5 * lowerLegHeight, 0.0));
    instanceMatrix = mult(instanceMatrix, scale4(lowerLegWidth, lowerLegHeight, lowerLegWidth));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (var i = 0; i < 6; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
    }
}

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

    // Initialize all nodes
    for (var j = 0; j < numNodes; j++) {
        initNodes(j);
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

    traverse(torsoId);

    requestAnimFrame(render);
};