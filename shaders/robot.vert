#version 330 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTexCoord;

uniform mat4 uMvpMatrix;
uniform mat4 model;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;

void main()
{
    vec4 worldPos = model * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;

    mat3 nmat = mat3(transpose(inverse(model)));
    vNormal = normalize(nmat * aNormal);

    vUv = aTexCoord;

    gl_Position = uMvpMatrix * worldPos;
}