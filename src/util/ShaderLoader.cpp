#include "ShaderLoader.h"
#include "FileUtils.h"

#include <vector>
#include <iostream>

GLuint ShaderProgram::compileStage(GLenum stageType, const std::string& source)
{
    GLuint shader = glCreateShader(stageType);

    const char* src = source.c_str();
    glShaderSource(shader, 1, &src, nullptr);
    glCompileShader(shader);

    GLint ok = 0;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);

    if (ok == GL_FALSE)
    {
        GLint logLen = 0;
        glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &logLen);

        std::vector<char> log(static_cast<size_t>(logLen));
        glGetShaderInfoLog(shader, logLen, nullptr, log.data());

        std::cerr << "Shader compile error:\n" << log.data() << "\n";

        glDeleteShader(shader);

        return 0;
    }

    return shader;
}

bool ShaderProgram::linkProgram(GLuint vs, GLuint fs)
{
    programId = glCreateProgram();
    glAttachShader(programId, vs);
    glAttachShader(programId, fs);
    glLinkProgram(programId);

    GLint ok = 0;
    glGetProgramiv(programId, GL_LINK_STATUS, &ok);

    if (ok == GL_FALSE)
    {
        GLint logLen = 0;
        glGetProgramiv(programId, GL_INFO_LOG_LENGTH, &logLen);

        std::vector<char> log(static_cast<size_t>(logLen));
        glGetProgramInfoLog(programId, logLen, nullptr, log.data());

        std::cerr << "Program link error:\n" << log.data() << "\n";

        glDeleteProgram(programId);
        programId = 0;

        return false;
    }

    return true;
}

bool ShaderProgram::loadFromFiles(const std::string& vertexPath, const std::string& fragmentPath)
{
    destroy();

    std::string vsText;
    std::string fsText;

    if (!fileUtils::readFileToString(vertexPath, vsText))
    {
        return false;
    }

    if (!fileUtils::readFileToString(fragmentPath, fsText))
    {
        return false;
    }

    GLuint vs = compileStage(GL_VERTEX_SHADER, vsText);
    GLuint fs = compileStage(GL_FRAGMENT_SHADER, fsText);

    if (vs == 0 || fs == 0)
    {
        if (vs != 0) glDeleteShader(vs);
        if (fs != 0) glDeleteShader(fs);

        return false;
    }

    bool ok = linkProgram(vs, fs);

    glDetachShader(programId, vs);
    glDetachShader(programId, fs);
    glDeleteShader(vs);
    glDeleteShader(fs);

    return ok;
}

void ShaderProgram::destroy()
{
    if (programId != 0)
    {
        glDeleteProgram(programId);
        programId = 0;
    }
}

void ShaderProgram::bind() const
{
    glUseProgram(programId);
}

GLuint ShaderProgram::getId() const
{
    return programId;
}

void ShaderProgram::setMat4(const char* name, const glm::mat4& m) const
{
    GLint loc = glGetUniformLocation(programId, name);

    if (loc >= 0)
    {
        glUniformMatrix4fv(loc, 1, GL_FALSE, &m[0][0]);
    }
}

void ShaderProgram::setVec3(const char* name, const glm::vec3& v) const
{
    GLint loc = glGetUniformLocation(programId, name);

    if (loc >= 0)
    {
        glUniform3fv(loc, 1, &v.x);
    }
}

void ShaderProgram::setInt(const char* name, int v) const
{
    GLint loc = glGetUniformLocation(programId, name);

    if (loc >= 0)
    {
        glUniform1i(loc, v);
    }
}