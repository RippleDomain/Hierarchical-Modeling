#include "ModelLoader.h"
#include "TextureLoader.h"

#include <unordered_map>
#include <iostream>

#define TINYGLTF_NO_EXTERNAL_IMAGE
#define TINYGLTF_IMPLEMENTATION
#define TINYGLTF_NO_STB_IMAGE
#define TINYGLTF_NO_STB_IMAGE_WRITE

#include "tiny_gltf.h"
#include "stb_image.h"

static bool loadImageDataWithStb(
    tinygltf::Image* image,
    const int imageIndex,
    std::string* err,
    std::string* warn,
    int reqWidth,
    int reqHeight,
    const unsigned char* bytes,
    int size,
    void* userData)
{
    (void)imageIndex;
    (void)warn;
    (void)reqWidth;
    (void)reqHeight;
    (void)userData;

    int w = 0;
    int h = 0;
    int comp = 0;

    unsigned char* decoded = stbi_load_from_memory(bytes, size, &w, &h, &comp, 4);

    if (!decoded)
    {
        if (err) *err = "stb_image failed to decode image bytes.";
        return false;
    }

    image->width = w;
    image->height = h;
    image->component = 4;
    image->bits = 8;
    image->pixel_type = TINYGLTF_COMPONENT_TYPE_UNSIGNED_BYTE;

    image->image.assign(decoded, decoded + (w * h * 4));
    stbi_image_free(decoded);

    return true;
}

static glm::mat4 toGlmMat4(const double* m16)
{
    glm::mat4 m(1.0f);

    for (int c = 0; c < 4; ++c)
    {
        for (int r = 0; r < 4; ++r)
        {
            m[c][r] = static_cast<float>(m16[c * 4 + r]);
        }
    }

    return m;
}

static glm::mat4 nodeLocalTransform(const tinygltf::Node& n)
{
    if (n.matrix.size() == 16)
    {
        return toGlmMat4(n.matrix.data());
    }

    glm::vec3 t(0.0f);
    glm::vec3 s(1.0f);
    glm::quat q(1.0f, 0.0f, 0.0f, 0.0f);

    if (n.translation.size() == 3)
    {
        t = glm::vec3(static_cast<float>(n.translation[0]), static_cast<float>(n.translation[1]), static_cast<float>(n.translation[2]));
    }

    if (n.scale.size() == 3)
    {
        s = glm::vec3(static_cast<float>(n.scale[0]), static_cast<float>(n.scale[1]), static_cast<float>(n.scale[2]));
    }

    if (n.rotation.size() == 4)
    {
        q = glm::quat(
            static_cast<float>(n.rotation[3]),
            static_cast<float>(n.rotation[0]),
            static_cast<float>(n.rotation[1]),
            static_cast<float>(n.rotation[2]));
    }

    glm::mat4 M(1.0f);

    M = glm::translate(M, t);
    M = M * glm::mat4_cast(q);
    M = glm::scale(M, s);

    return M;
}

static const unsigned char* getBufferPtr(const tinygltf::Model& model, const tinygltf::Accessor& accessor, int& outStrideBytes, int& outCount)
{
    const tinygltf::BufferView& bv = model.bufferViews[accessor.bufferView];
    const tinygltf::Buffer& b = model.buffers[bv.buffer];

    outCount = accessor.count;

    int componentSize = tinygltf::GetComponentSizeInBytes(accessor.componentType);
    int typeCount = tinygltf::GetNumComponentsInType(accessor.type);

    int tightlyPacked = componentSize * typeCount;
    outStrideBytes = (bv.byteStride > 0) ? bv.byteStride : tightlyPacked;

    size_t start = static_cast<size_t>(bv.byteOffset + accessor.byteOffset);

    return b.data.data() + start;
}

static void uploadPrimitive(const tinygltf::Model& model, const tinygltf::Primitive& prim, GLuint textureId, std::vector<GpuMesh>& outMeshes)
{
    auto itPos = prim.attributes.find("POSITION");
    auto itNor = prim.attributes.find("NORMAL");
    auto itUv = prim.attributes.find("TEXCOORD_0");

    if (itPos == prim.attributes.end() || prim.indices < 0)
    {
        return;
    }

    const tinygltf::Accessor& accPos = model.accessors[itPos->second];
    const tinygltf::Accessor* accNor = (itNor != prim.attributes.end()) ? &model.accessors[itNor->second] : nullptr;
    const tinygltf::Accessor* accUv = (itUv != prim.attributes.end()) ? &model.accessors[itUv->second] : nullptr;

    const tinygltf::Accessor& accIdx = model.accessors[prim.indices];

    int stridePos = 0;
    int countPos = 0;
    const unsigned char* ptrPos = getBufferPtr(model, accPos, stridePos, countPos);

    int strideNor = 0;
    int countNor = 0;
    const unsigned char* ptrNor = accNor ? getBufferPtr(model, *accNor, strideNor, countNor) : nullptr;

    int strideUv = 0;
    int countUv = 0;
    const unsigned char* ptrUv = accUv ? getBufferPtr(model, *accUv, strideUv, countUv) : nullptr;

    int strideIdx = 0;
    int countIdx = 0;
    const unsigned char* ptrIdx = getBufferPtr(model, accIdx, strideIdx, countIdx);

    std::vector<float> positions;
    std::vector<float> normals;
    std::vector<float> uvs;

    positions.resize(static_cast<size_t>(countPos) * 3);

    if (ptrNor)
    {
        normals.resize(static_cast<size_t>(countPos) * 3);
    }
    else
    {
        normals.assign(static_cast<size_t>(countPos) * 3, 0.0f);
        for (int i = 0; i < countPos; ++i)
        {
            normals[static_cast<size_t>(i) * 3 + 2] = 1.0f;
        }
    }

    if (ptrUv)
    {
        uvs.resize(static_cast<size_t>(countPos) * 2);
    }
    else
    {
        uvs.assign(static_cast<size_t>(countPos) * 2, 0.0f);
    }

    for (int i = 0; i < countPos; ++i)
    {
        const float* p = reinterpret_cast<const float*>(ptrPos + static_cast<size_t>(i) * stridePos);
        positions[static_cast<size_t>(i) * 3 + 0] = p[0];
        positions[static_cast<size_t>(i) * 3 + 1] = p[1];
        positions[static_cast<size_t>(i) * 3 + 2] = p[2];

        if (ptrNor)
        {
            const float* n = reinterpret_cast<const float*>(ptrNor + static_cast<size_t>(i) * strideNor);
            normals[static_cast<size_t>(i) * 3 + 0] = n[0];
            normals[static_cast<size_t>(i) * 3 + 1] = n[1];
            normals[static_cast<size_t>(i) * 3 + 2] = n[2];
        }

        if (ptrUv)
        {
            const float* uv = reinterpret_cast<const float*>(ptrUv + static_cast<size_t>(i) * strideUv);
            uvs[static_cast<size_t>(i) * 2 + 0] = uv[0];
            uvs[static_cast<size_t>(i) * 2 + 1] = uv[1];
        }
    }

    std::vector<unsigned int> indices;
    indices.resize(static_cast<size_t>(countIdx));

    for (int i = 0; i < countIdx; ++i)
    {
        unsigned int idx = 0;

        if (accIdx.componentType == TINYGLTF_COMPONENT_TYPE_UNSIGNED_SHORT)
        {
            const unsigned short* v = reinterpret_cast<const unsigned short*>(ptrIdx + static_cast<size_t>(i) * strideIdx);
            idx = static_cast<unsigned int>(*v);
        }
        else if (accIdx.componentType == TINYGLTF_COMPONENT_TYPE_UNSIGNED_INT)
        {
            const unsigned int* v = reinterpret_cast<const unsigned int*>(ptrIdx + static_cast<size_t>(i) * strideIdx);
            idx = *v;
        }
        else if (accIdx.componentType == TINYGLTF_COMPONENT_TYPE_UNSIGNED_BYTE)
        {
            const unsigned char* v = reinterpret_cast<const unsigned char*>(ptrIdx + static_cast<size_t>(i) * strideIdx);
            idx = static_cast<unsigned int>(*v);
        }

        indices[static_cast<size_t>(i)] = idx;
    }

    GpuMesh m;

    glGenVertexArrays(1, &m.vao);
    glBindVertexArray(m.vao);

    glGenBuffers(1, &m.vboPos);
    glBindBuffer(GL_ARRAY_BUFFER, m.vboPos);
    glBufferData(GL_ARRAY_BUFFER, positions.size() * sizeof(float), positions.data(), GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 0, nullptr);
    glEnableVertexAttribArray(0);

    glGenBuffers(1, &m.vboNor);
    glBindBuffer(GL_ARRAY_BUFFER, m.vboNor);
    glBufferData(GL_ARRAY_BUFFER, normals.size() * sizeof(float), normals.data(), GL_STATIC_DRAW);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 0, nullptr);
    glEnableVertexAttribArray(1);

    glGenBuffers(1, &m.vboUv);
    glBindBuffer(GL_ARRAY_BUFFER, m.vboUv);
    glBufferData(GL_ARRAY_BUFFER, uvs.size() * sizeof(float), uvs.data(), GL_STATIC_DRAW);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
    glEnableVertexAttribArray(2);

    glGenBuffers(1, &m.ebo);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m.ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, indices.size() * sizeof(unsigned int), indices.data(), GL_STATIC_DRAW);

    glBindVertexArray(0);

    m.indexCount = static_cast<GLsizei>(indices.size());
    m.textureId = textureId;

    outMeshes.push_back(m);
}

static GLuint resolveBaseColorTexture(const tinygltf::Model& model, const std::unordered_map<int, GLuint>& imageIndexToGlTex, int materialIndex)
{
    if (materialIndex < 0 || materialIndex >= static_cast<int>(model.materials.size()))
    {
        return 0;
    }

    const tinygltf::Material& mat = model.materials[materialIndex];

    if (mat.pbrMetallicRoughness.baseColorTexture.index < 0)
    {
        return 0;
    }

    int texIndex = mat.pbrMetallicRoughness.baseColorTexture.index;

    if (texIndex < 0 || texIndex >= static_cast<int>(model.textures.size()))
    {
        return 0;
    }

    int imgIndex = model.textures[texIndex].source;
    auto it = imageIndexToGlTex.find(imgIndex);

    if (it == imageIndexToGlTex.end())
    {
        return 0;
    }

    return it->second;
}

static std::shared_ptr<SceneNode> buildNodeRecursive(
    const tinygltf::Model& model,
    const std::unordered_map<int, GLuint>& imageIndexToGlTex,
    int nodeIndex)
{
    const tinygltf::Node& n = model.nodes[nodeIndex];

    std::shared_ptr<SceneNode> out = std::make_shared<SceneNode>();
    out->name = n.name;
    out->localTransform = nodeLocalTransform(n);

    if (n.mesh >= 0 && n.mesh < static_cast<int>(model.meshes.size()))
    {
        const tinygltf::Mesh& mesh = model.meshes[n.mesh];

        for (int p = 0; p < static_cast<int>(mesh.primitives.size()); ++p)
        {
            const tinygltf::Primitive& prim = mesh.primitives[p];

            GLuint texId = resolveBaseColorTexture(model, imageIndexToGlTex, prim.material);
            uploadPrimitive(model, prim, texId, out->meshes);
        }
    }

    for (int i = 0; i < static_cast<int>(n.children.size()); ++i)
    {
        int childIndex = n.children[i];
        out->children.push_back(buildNodeRecursive(model, imageIndexToGlTex, childIndex));
    }

    return out;
}

std::shared_ptr<SceneNode> ModelLoader::loadGlbOrGltf(const std::string& path)
{
    tinygltf::TinyGLTF loader;
    loader.SetImageLoader(loadImageDataWithStb, nullptr);

    tinygltf::Model model;
    std::string err;
    std::string warn;

    bool ok = false;

    if (path.size() >= 4 && path.substr(path.size() - 4) == ".glb")
    {
        ok = loader.LoadBinaryFromFile(&model, &err, &warn, path);
    }
    else
    {
        ok = loader.LoadASCIIFromFile(&model, &err, &warn, path);
    }

    if (!warn.empty())
    {
        std::cout << "tinygltf warn: " << warn << "\n";
    }

    if (!ok)
    {
        std::cout << "tinygltf error: " << err << "\n";
        return nullptr;
    }

    std::unordered_map<int, GLuint> imageIndexToGlTex;

    for (int i = 0; i < static_cast<int>(model.images.size()); ++i)
    {
        const tinygltf::Image& img = model.images[i];
        if (img.image.empty() || img.width <= 0 || img.height <= 0)
        {
            continue;
        }

        GLuint tex = textureLoader::createTextureFromRgba8(img.width, img.height, img.image.data(), true);
        imageIndexToGlTex[i] = tex;
    }

    if (model.scenes.empty())
    {
        return nullptr;
    }

    int sceneIndex = (model.defaultScene >= 0) ? model.defaultScene : 0;

    if (sceneIndex < 0 || sceneIndex >= static_cast<int>(model.scenes.size()))
    {
        sceneIndex = 0;
    }

    const tinygltf::Scene& scene = model.scenes[sceneIndex];

    std::shared_ptr<SceneNode> root = std::make_shared<SceneNode>();
    root->name = "root";
    root->localTransform = glm::mat4(1.0f);

    for (int i = 0; i < static_cast<int>(scene.nodes.size()); ++i)
    {
        root->children.push_back(buildNodeRecursive(model, imageIndexToGlTex, scene.nodes[i]));
    }

    return root;
}

static void destroyMesh(GpuMesh& m)
{
    if (m.ebo != 0) glDeleteBuffers(1, &m.ebo);
    if (m.vboUv != 0) glDeleteBuffers(1, &m.vboUv);
    if (m.vboNor != 0) glDeleteBuffers(1, &m.vboNor);
    if (m.vboPos != 0) glDeleteBuffers(1, &m.vboPos);
    if (m.vao != 0) glDeleteVertexArrays(1, &m.vao);

    m.ebo = 0;
    m.vboUv = 0;
    m.vboNor = 0;
    m.vboPos = 0;
    m.vao = 0;
    m.indexCount = 0;
}

void ModelLoader::destroyNodeGpu(std::shared_ptr<SceneNode>& node)
{
    if (!node)
    {
        return;
    }

    for (size_t i = 0; i < node->meshes.size(); ++i)
    {
        destroyMesh(node->meshes[i]);
    }

    for (size_t i = 0; i < node->children.size(); ++i)
    {
        destroyNodeGpu(node->children[i]);
    }

    node.reset();
}