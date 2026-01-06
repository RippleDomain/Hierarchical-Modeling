#version 330 core

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;

uniform vec3 uLightPosition;
uniform vec3 uViewPosition;
uniform sampler2D uSampler;

out vec4 fragColor;

void main()
{
    vec3 albedo = texture(uSampler, vUv).rgb;

    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightPosition - vWorldPos);
    vec3 V = normalize(uViewPosition - vWorldPos);
    vec3 R = reflect(-L, N);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(R, V), 0.0), 32.0);

    vec3 ambient = 0.12 * albedo;
    vec3 diffuse = diff * albedo;
    vec3 specular = vec3(0.35) * spec;

    fragColor = vec4(ambient + diffuse + specular, 1.0);
}