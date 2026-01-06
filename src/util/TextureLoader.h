#pragma once

#include <string>
#include <vector>
#include <glad/glad.h>

namespace textureLoader
{
    GLuint createTextureFromRgba8(int width, int height, const unsigned char* rgbaPixels, bool generateMipmaps);
    GLuint loadTextureFromFile(const std::string& path, bool generateMipmaps);
}