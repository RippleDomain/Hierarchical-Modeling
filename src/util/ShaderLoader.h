#pragma once

#include <string>
#include <glad/glad.h>
#include <glm.hpp>

class ShaderProgram
{
public:
    bool loadFromFiles(const std::string& vertexPath, const std::string& fragmentPath);

    void destroy();

    void bind() const;

    GLuint getId() const;

    void setMat4(const char* name, const glm::mat4& m) const;
    void setVec3(const char* name, const glm::vec3& v) const;
    void setInt(const char* name, int v) const;

private:
    GLuint programId = 0;

    GLuint compileStage(GLenum stageType, const std::string& source);
    bool linkProgram(GLuint vs, GLuint fs);
};