#pragma once

#include <string>
#include <vector>
#include <memory>
#include <glad/glad.h>
#include <glm.hpp>

struct GpuMesh
{
    GLuint vao = 0;
    GLuint vboPos = 0;
    GLuint vboNor = 0;
    GLuint vboUv = 0;
    GLuint ebo = 0;

    GLsizei indexCount = 0;
    GLuint textureId = 0;
};

struct SceneNode
{
    std::string name;
    glm::mat4 localTransform = glm::mat4(1.0f);

    std::vector<GpuMesh> meshes;
    std::vector<std::shared_ptr<SceneNode>> children;
};