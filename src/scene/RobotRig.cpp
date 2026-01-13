#include "RobotRig.h"

#include <algorithm>
#include <cmath>
#include <gtc/matrix_transform.hpp>

static constexpr const char* kTorso = "torso";
static constexpr const char* kHead = "head";
static constexpr const char* kLArmHi = "left_arm_high";
static constexpr const char* kLArmLo = "left_arm_low";
static constexpr const char* kRArmHi = "right_arm_high";
static constexpr const char* kRArmLo = "right_arm_low";
static constexpr const char* kLLegHi = "left_leg_high";
static constexpr const char* kLLegLo = "left_leg_low";
static constexpr const char* kRLegHi = "right_leg_high";
static constexpr const char* kRLegLo = "right_leg_low";
static constexpr const char* kLHand = "left_hand";
static constexpr const char* kRHand = "right_hand";

static glm::mat4 scaleUniform(float s)
{
    glm::mat4 S(1.0f);
    S[0][0] = s;
    S[1][1] = s;
    S[2][2] = s;

    return S;
}

bool RobotRig::initialize()
{
    theta.assign(kJointCount, 0.0f);
    selectedNodeName.clear();

    // Pickable node colors (id packed in RGB).
    std::vector<std::string> pickables =
    {
        kTorso, kHead,
        kLArmHi, kLArmLo, kRArmHi, kRArmLo,
        kLLegHi, kLLegLo, kRLegHi, kRLegLo,
        kLHand, kRHand
    };

    nameToPickColor.clear();
    pickIdToName.clear();

    for (int i = 0; i < (int)pickables.size(); ++i)
    {
        unsigned int id = (unsigned int)(i + 1);
        float r = ((id) & 255) / 255.0f;
        float g = ((id >> 8) & 255) / 255.0f;
        float b = ((id >> 16) & 255) / 255.0f;
        nameToPickColor[pickables[i]] = glm::vec3(r, g, b);
        pickIdToName[id] = pickables[i];
    }

    // Limb drag mapping (dy = primary, dx = secondary).
    limbJointMap.clear();
    limbJointMap[kTorso] = { 0, -1 };
    limbJointMap[kHead] = { 1, 10 };

    limbJointMap[kLArmHi] = { 2, 11 };
    limbJointMap[kLArmLo] = { 3, -1 };

    limbJointMap[kRArmHi] = { 4, 12 };
    limbJointMap[kRArmLo] = { 5, -1 };

    limbJointMap[kLLegHi] = { 6, 13 };
    limbJointMap[kLLegLo] = { 7, 19 };

    limbJointMap[kRLegHi] = { 8, 14 };
    limbJointMap[kRLegLo] = { 9, 20 };

    limbJointMap[kLHand] = { 15, 17 };
    limbJointMap[kRHand] = { 16, 18 };

    // Animation system mapping.
    std::unordered_map<std::string, std::vector<int>> bodyPartMap;
    bodyPartMap[kTorso] = { 0 };
    bodyPartMap[kHead] = { 1, 10 };
    bodyPartMap[kLArmHi] = { 2, 11 };
    bodyPartMap[kLArmLo] = { 3 };
    bodyPartMap[kRArmHi] = { 4, 12 };
    bodyPartMap[kRArmLo] = { 5 };
    bodyPartMap[kLLegHi] = { 6, 13 };
    bodyPartMap[kLLegLo] = { 7, 19 };
    bodyPartMap[kRLegHi] = { 8, 14 };
    bodyPartMap[kRLegLo] = { 9, 20 };
    bodyPartMap[kLHand] = { 15, 17 };
    bodyPartMap[kRHand] = { 16, 18 };

    animSystem = AnimationSystem(kJointCount, bodyPartMap);

    return true;
}

void RobotRig::shutdown()
{
    if (pickFbo != 0)
    {
        glDeleteFramebuffers(1, &pickFbo);
        glDeleteTextures(1, &pickTex);
        glDeleteRenderbuffers(1, &pickDepth);

        pickFbo = 0;
        pickTex = 0;
        pickDepth = 0;
        pickW = 0;
        pickH = 0;
    }

    rootNode.reset();
    selectedNodeName.clear();
    limbDrag.active = false;
}

void RobotRig::setRootNode(const std::shared_ptr<SceneNode>& root)
{
    rootNode = root;
}

void RobotRig::onResize(int w, int h)
{
    recreatePickTargetsIfNeeded(w, h);
}

void RobotRig::update(float deltaTime)
{
    // Update animation when playing.
    if (animSystem.getIsPlaying())
    {
        animSystem.update(deltaTime);
        std::vector<float> animAngles = animSystem.getCurrentAngles(theta);

        for (int i = 0; i < (int)theta.size(); ++i)
        {
            theta[i] = animAngles[i];
        }
    }
}

void RobotRig::resetPose()
{
    for (int i = 0; i < (int)theta.size(); ++i)
    {
        theta[i] = clampJoint(i, 0.0f);
    }
}

float RobotRig::clampJoint(int id, float val) const
{
    // Clamp joint angles to constraints.
    auto clampRange = [&](float v, float a, float b)
        {
            return std::max(a, std::min(b, v));
        };

    switch (id)
    {
    case 0:  return clampRange(val, -180.0f, 180.0f);
    case 1:  return clampRange(val, -45.0f, 45.0f);
    case 10: return clampRange(val, -80.0f, 80.0f);

    case 2:  return clampRange(val, -180.0f, 0.0f);
    case 4:  return clampRange(val, -90.0f, 90.0f);

    case 3:  return clampRange(val, -135.0f, 0.0f);
    case 5:  return clampRange(val, -135.0f, 0.0f);

    case 6:  return clampRange(val, -45.0f, 75.0f);
    case 8:  return clampRange(val, -45.0f, 75.0f);

    case 7:  return clampRange(val, 0.0f, 135.0f);
    case 9:  return clampRange(val, 0.0f, 135.0f);

    case 11: return clampRange(val, 0.0f, 110.0f);
    case 12: return clampRange(val, -110.0f, 90.0f);

    case 13: return clampRange(val, -30.0f, 30.0f);
    case 14: return clampRange(val, -30.0f, 30.0f);

    case 15: return clampRange(val, -45.0f, 45.0f);
    case 16: return clampRange(val, -45.0f, 45.0f);

    case 17: return clampRange(val, -90.0f, 90.0f);
    case 18: return clampRange(val, -90.0f, 90.0f);
    case 19: return clampRange(val, -60.0f, 60.0f);
    case 20: return clampRange(val, -60.0f, 60.0f);
    default: return val;
    }
}

void RobotRig::getJointLimits(int id, float& outMin, float& outMax)
{
    switch (id)
    {
    case 0:  outMin = -180.0f; outMax = 180.0f; return;
    case 1:  outMin = -45.0f;  outMax = 45.0f;  return;
    case 10: outMin = -80.0f;  outMax = 80.0f;  return;

    case 2:  outMin = -180.0f; outMax = 0.0f;   return;
    case 4:  outMin = -90.0f;  outMax = 90.0f;  return;

    case 3:  outMin = -135.0f; outMax = 0.0f;   return;
    case 5:  outMin = -135.0f; outMax = 0.0f;   return;

    case 6:  outMin = -45.0f;  outMax = 75.0f;  return;
    case 8:  outMin = -45.0f;  outMax = 75.0f;  return;

    case 7:  outMin = 0.0f;    outMax = 135.0f; return;
    case 9:  outMin = 0.0f;    outMax = 135.0f; return;

    case 11: outMin = 0.0f;    outMax = 110.0f; return;
    case 12: outMin = -110.0f; outMax = 90.0f;  return;

    case 13: outMin = -30.0f;  outMax = 30.0f;  return;
    case 14: outMin = -30.0f;  outMax = 30.0f;  return;

    case 15: outMin = -45.0f;  outMax = 45.0f;  return;
    case 16: outMin = -45.0f;  outMax = 45.0f;  return;

    case 17: outMin = -90.0f;  outMax = 90.0f;  return;
    case 18: outMin = -90.0f;  outMax = 90.0f;  return;
    case 19: outMin = -60.0f;  outMax = 60.0f;  return;
    case 20: outMin = -60.0f;  outMax = 60.0f;  return;

    default:
        outMin = -180.0f;
        outMax = 180.0f;
        return;
    }
}

std::vector<float>& RobotRig::getAngles()
{
    return theta;
}

const std::vector<float>& RobotRig::getAngles() const
{
    return theta;
}

AnimationSystem& RobotRig::getAnimationSystem()
{
    return animSystem;
}

const AnimationSystem& RobotRig::getAnimationSystem() const
{
    return animSystem;
}

std::unordered_map<std::string, glm::mat4> RobotRig::buildPoseTransforms() const
{
    // Build pose transforms using degrees.
    auto RX = [&](float deg)
        {
            return glm::rotate(glm::mat4(1.0f), glm::radians(deg), glm::vec3(1.0f, 0.0f, 0.0f));
        };
    auto RY = [&](float deg)
        {
            return glm::rotate(glm::mat4(1.0f), glm::radians(deg), glm::vec3(0.0f, 1.0f, 0.0f));
        };
    auto RZ = [&](float deg)
        {
            return glm::rotate(glm::mat4(1.0f), glm::radians(deg), glm::vec3(0.0f, 0.0f, 1.0f));
        };

    std::unordered_map<std::string, glm::mat4> pose;

    pose[kTorso] = RY(theta[0]);
    pose[kHead] = RX(theta[1]) * RY(theta[10]);

    pose[kLArmHi] = RZ(theta[11]) * RX(theta[2]);
    pose[kRArmHi] = RZ(theta[12]) * RX(-theta[4]);

    pose[kLArmLo] = RX(theta[3]);
    pose[kRArmLo] = RX(theta[5]);

    pose[kLLegHi] = RZ(theta[13]) * RX(theta[6]);
    pose[kRLegHi] = RZ(theta[14]) * RX(theta[8]);

    pose[kLLegLo] = RY(theta[19]) * RX(theta[7]);
    pose[kRLegLo] = RY(theta[20]) * RX(theta[9]);

    pose[kLHand] = RY(theta[17]) * RZ(-theta[15]);
    pose[kRHand] = RY(theta[18]) * RX(theta[16]);

    return pose;
}

void RobotRig::traverseWithPose(
    const std::shared_ptr<SceneNode>& node,
    const glm::mat4& parentT,
    const std::unordered_map<std::string, glm::mat4>& pose,
    const std::function<void(const std::shared_ptr<SceneNode>&, const glm::mat4&)>& cb) const
{
    glm::mat4 t = parentT * node->localTransform;

    auto it = pose.find(node->name);
    if (it != pose.end())
    {
        t = t * it->second;
    }

    cb(node, t);

    for (int i = 0; i < (int)node->children.size(); ++i)
    {
        traverseWithPose(node->children[i], t, pose, cb);
    }
}

void RobotRig::recreatePickTargetsIfNeeded(int w, int h)
{
    if (pickFbo != 0 && pickW == w && pickH == h)
    {
        return;
    }

    if (pickFbo != 0)
    {
        glDeleteFramebuffers(1, &pickFbo);
        glDeleteTextures(1, &pickTex);
        glDeleteRenderbuffers(1, &pickDepth);
        pickFbo = 0;
        pickTex = 0;
        pickDepth = 0;
    }

    pickW = w;
    pickH = h;

    glGenFramebuffers(1, &pickFbo);
    glBindFramebuffer(GL_FRAMEBUFFER, pickFbo);

    glGenTextures(1, &pickTex);
    glBindTexture(GL_TEXTURE_2D, pickTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, pickW, pickH, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

    glGenRenderbuffers(1, &pickDepth);
    glBindRenderbuffer(GL_RENDERBUFFER, pickDepth);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, pickW, pickH);

    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, pickTex, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, pickDepth);

    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

std::string RobotRig::pickAtCursor(GLFWwindow* window, const glm::mat4& mvp, ShaderProgram& pickShader)
{
    if (!rootNode || pickFbo == 0)
    {
        return "";
    }

    double mx = 0.0;
    double my = 0.0;
    glfwGetCursorPos(window, &mx, &my);

    // Convert window coords to framebuffer pixel coords.
    int w = 0;
    int h = 0;
    glfwGetWindowSize(window, &w, &h);

    int fbW = 0;
    int fbH = 0;
    glfwGetFramebufferSize(window, &fbW, &fbH);

    float sx = (w > 0) ? (float)fbW / (float)w : 1.0f;
    float sy = (h > 0) ? (float)fbH / (float)h : 1.0f;

    int px = (int)(mx * sx);
    int py = (int)(my * sy);

    if (px < 0 || py < 0 || px >= fbW || py >= fbH)
    {
        return "";
    }

    glBindFramebuffer(GL_FRAMEBUFFER, pickFbo);
    glViewport(0, 0, pickW, pickH);
    glDisable(GL_BLEND);
    glEnable(GL_DEPTH_TEST);

    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    renderPickingScene(pickShader, mvp);

    unsigned char pxData[4] = { 0, 0, 0, 0 };
    glReadPixels(px, pickH - py - 1, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, pxData);

    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    unsigned int id = (unsigned int)pxData[0] | ((unsigned int)pxData[1] << 8) | ((unsigned int)pxData[2] << 16);

    auto it = pickIdToName.find(id);
    if (it != pickIdToName.end())
    {
        return it->second;
    }

    return "";
}

void RobotRig::renderPickingScene(ShaderProgram& pickShader, const glm::mat4& mvp) const
{
    pickShader.bind();
    pickShader.setMat4("uMvpMatrix", mvp);

    auto pose = buildPoseTransforms();

    traverseWithPose(rootNode, glm::mat4(1.0f), pose, [&](const std::shared_ptr<SceneNode>& node, const glm::mat4& t)
    {
        auto it = nameToPickColor.find(node->name);
        if (it == nameToPickColor.end())
        {
            return;
        }

        pickShader.setMat4("model", t);
        pickShader.setVec3("uPickColor", it->second);

        for (int i = 0; i < (int)node->meshes.size(); ++i)
        {
            const GpuMesh& m = node->meshes[i];
            glBindVertexArray(m.vao);
            glDrawElements(GL_TRIANGLES, m.indexCount, GL_UNSIGNED_INT, nullptr);
        }

        glBindVertexArray(0);
    });
}

bool RobotRig::onLeftMousePress(GLFWwindow* window, const glm::mat4& mvp, ShaderProgram& pickShader)
{
    std::string hit = pickAtCursor(window, mvp, pickShader);

    if (!hit.empty())
    {
        selectedNodeName = hit;
        limbDrag.active = true;
        glfwGetCursorPos(window, &limbDrag.lastX, &limbDrag.lastY);

        return true;
    }

    limbDrag.active = false;

    return false;
}

void RobotRig::onLeftMouseRelease(GLFWwindow* window, const glm::mat4& mvp, ShaderProgram& pickShader)
{
    limbDrag.active = false;

    std::string hit = pickAtCursor(window, mvp, pickShader);

    if (!hit.empty())
    {
        selectedNodeName = hit;
    }
}

void RobotRig::onMouseMove(double x, double y)
{
    if (!limbDrag.active || selectedNodeName.empty())
    {
        return;
    }

    double dx = x - limbDrag.lastX;
    double dy = y - limbDrag.lastY;

    auto it = limbJointMap.find(selectedNodeName);

    if (it != limbJointMap.end())
    {
        if (dy != 0.0 && it->second.primary >= 0)
        {
            int p = it->second.primary;
            theta[p] = clampJoint(p, theta[p] + (float)dy * limbDragSensitivity);
        }

        if (dx != 0.0 && it->second.secondary >= 0)
        {
            int s = it->second.secondary;
            theta[s] = clampJoint(s, theta[s] - (float)dx * limbDragSensitivity);
        }
    }

    limbDrag.lastX = x;
    limbDrag.lastY = y;
}

void RobotRig::cancelLimbDrag()
{
    limbDrag.active = false;
}

bool RobotRig::getIsLimbDragging() const
{
    return limbDrag.active;
}

const std::string& RobotRig::getSelectedNodeName() const
{
    return selectedNodeName;
}

void RobotRig::clearSelection()
{
    selectedNodeName.clear();
}

void RobotRig::renderRobotScene(ShaderProgram& robotShader, const glm::mat4& mvp, const glm::vec3& eye) const
{
    if (!rootNode)
    {
        return;
    }

    robotShader.bind();
    robotShader.setMat4("uMvpMatrix", mvp);
    robotShader.setVec3("uViewPosition", eye);
    robotShader.setVec3("uLightPosition", glm::vec3(0.0f, 2.0f, 50.0f));
    robotShader.setInt("uSampler", 0);

    auto pose = buildPoseTransforms();

    traverseWithPose(rootNode, glm::mat4(1.0f), pose, [&](const std::shared_ptr<SceneNode>& node, const glm::mat4& t)
    {
        robotShader.setMat4("model", t);

        for (int i = 0; i < (int)node->meshes.size(); ++i)
        {
            const GpuMesh& m = node->meshes[i];

            glActiveTexture(GL_TEXTURE0);
            glBindTexture(GL_TEXTURE_2D, m.textureId);

            glBindVertexArray(m.vao);
            glDrawElements(GL_TRIANGLES, m.indexCount, GL_UNSIGNED_INT, nullptr);
        }

        glBindVertexArray(0);
    });
}

void RobotRig::renderOutline(ShaderProgram& outlineShader, const glm::mat4& mvp) const
{
    if (!rootNode || selectedNodeName.empty())
    {
        return;
    }

    outlineShader.bind();
    outlineShader.setMat4("uMvpMatrix", mvp);

    outlineShader.setVec3("uColor", glm::vec3(1.0f, 1.0f, 1.0f));
    outlineShader.setVec3("uOutlineColor", glm::vec3(1.0f, 1.0f, 1.0f));

    auto pose = buildPoseTransforms();

    std::shared_ptr<SceneNode> hitNode;
    glm::mat4 hitT(1.0f);

    traverseWithPose(rootNode, glm::mat4(1.0f), pose, [&](const std::shared_ptr<SceneNode>& node, const glm::mat4& t)
    {
        if (!hitNode && node->name == selectedNodeName)
        {
            hitNode = node;
            hitT = t;
        }
    });

    if (!hitNode)
    {
        return;
    }

    glEnable(GL_CULL_FACE);
    glCullFace(GL_FRONT);
    glDepthFunc(GL_LEQUAL);

    glm::mat4 inflated = hitT * scaleUniform(1.03f);
    outlineShader.setMat4("model", inflated);

    for (int i = 0; i < (int)hitNode->meshes.size(); ++i)
    {
        const GpuMesh& m = hitNode->meshes[i];
        glBindVertexArray(m.vao);
        glDrawElements(GL_TRIANGLES, m.indexCount, GL_UNSIGNED_INT, nullptr);
    }

    glBindVertexArray(0);

    glCullFace(GL_BACK);
    glDisable(GL_CULL_FACE);
    glDepthFunc(GL_LESS);
}