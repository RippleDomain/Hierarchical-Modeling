#pragma once

#include <string>
#include <memory>
#include <unordered_map>
#include <vector>
#include <functional>
#include <glad/glad.h>
#include <GLFW/glfw3.h>
#include <glm.hpp>

#include "SceneTypes.h"
#include "../util/ShaderLoader.h"
#include "../animation/AnimationSystem.h"

class RobotRig
{
public:
    static constexpr int kJointCount = 21;

    bool initialize();
    void shutdown();

    void setRootNode(const std::shared_ptr<SceneNode>& root);

    void update(float deltaTime);
    void onResize(int w, int h);

    void resetPose();

    float clampJoint(int id, float val) const;
    void getJointLimits(int id, float& outMin, float& outMax);

    std::vector<float>& getAngles();
    const std::vector<float>& getAngles() const;

    AnimationSystem& getAnimationSystem();
    const AnimationSystem& getAnimationSystem() const;

    bool onLeftMousePress(GLFWwindow* window, const glm::mat4& mvp, ShaderProgram& pickShader);
    void onLeftMouseRelease(GLFWwindow* window, const glm::mat4& mvp, ShaderProgram& pickShader);
    void onMouseMove(double x, double y);

    void cancelLimbDrag();
    bool getIsLimbDragging() const;

    const std::string& getSelectedNodeName() const;
    void clearSelection();

    void renderRobotScene(ShaderProgram& robotShader, const glm::mat4& mvp, const glm::vec3& eye) const;
    void renderOutline(ShaderProgram& outlineShader, const glm::mat4& mvp) const;

private:
    void recreatePickTargetsIfNeeded(int w, int h);

    std::string pickAtCursor(GLFWwindow* window, const glm::mat4& mvp, ShaderProgram& pickShader);
    void renderPickingScene(ShaderProgram& pickShader, const glm::mat4& mvp) const;

    std::unordered_map<std::string, glm::mat4> buildPoseTransforms() const;

    void traverseWithPose(
        const std::shared_ptr<SceneNode>& node,
        const glm::mat4& parentT,
        const std::unordered_map<std::string, glm::mat4>& pose,
        const std::function<void(const std::shared_ptr<SceneNode>&, const glm::mat4&)>& cb) const;

private:
    std::shared_ptr<SceneNode> rootNode;

    std::vector<float> theta;
    AnimationSystem animSystem;

    float limbDragSensitivity = 0.8f;

    struct LimbDragState
    {
        bool active = false;
        double lastX = 0.0;
        double lastY = 0.0;
    } limbDrag;

    struct JointPair
    {
        int primary = -1;
        int secondary = -1;
    };

    std::unordered_map<std::string, glm::vec3> nameToPickColor;
    std::unordered_map<unsigned int, std::string> pickIdToName;
    std::unordered_map<std::string, JointPair> limbJointMap;

    std::string selectedNodeName;

    GLuint pickFbo = 0;
    GLuint pickTex = 0;
    GLuint pickDepth = 0;
    int pickW = 0;
    int pickH = 0;
};