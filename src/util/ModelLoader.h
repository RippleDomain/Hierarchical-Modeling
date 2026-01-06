#pragma once

#include <string>
#include <memory>

#include "../scene/SceneTypes.h"

#define GLM_ENABLE_EXPERIMENTAL
#include <gtc/matrix_transform.hpp>
#include <gtc/quaternion.hpp>
#include <gtx/quaternion.hpp>

namespace ModelLoader
{
    std::shared_ptr<SceneNode> loadGlbOrGltf(const std::string& path);
    void destroyNodeGpu(std::shared_ptr<SceneNode>& node);
}