#include "TextureLoader.h"

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

GLuint textureLoader::createTextureFromRgba8(int width, int height, const unsigned char* rgbaPixels, bool generateMipmaps)
{
    GLuint tex = 0;
    glGenTextures(1, &tex);
    glBindTexture(GL_TEXTURE_2D, tex);

    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgbaPixels);

    if (generateMipmaps)
    {
        glGenerateMipmap(GL_TEXTURE_2D);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    }
    else
    {
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    }

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);

    glBindTexture(GL_TEXTURE_2D, 0);
    return tex;
}

GLuint textureLoader::loadTextureFromFile(const std::string& path, bool generateMipmaps)
{
    int w = 0;
    int h = 0;
    int comp = 0;

    stbi_set_flip_vertically_on_load(1);
    unsigned char* pixels = stbi_load(path.c_str(), &w, &h, &comp, 4);

    if (!pixels)
    {
        return 0;
    }

    GLuint tex = createTextureFromRgba8(w, h, pixels, generateMipmaps);
    stbi_image_free(pixels);

    return tex;
}