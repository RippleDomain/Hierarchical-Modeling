#pragma once

#include <string>
#include <memory>
#include <glad/glad.h>
#include <GLFW/glfw3.h>
#include <glm.hpp>

#include "../scene/SceneTypes.h"
#include "../scene/RobotRig.h"
#include "../util/ShaderLoader.h"
#include "../scene/CameraController.h"

class App
{
public:
    bool initialize();
    void run();
    void shutdown();

private:
    void initializeGlfw();
    void initializeGlad();
    void initializeImGui();

    void loadShaders();
    void loadScene();

    void update(float deltaTime);
    void render();

    void drawImGui();

public:
    static void mouseButtonCallback(GLFWwindow* window, int button, int action, int mods);
    static void cursorPosCallback(GLFWwindow* window, double xPos, double yPos);
    static void scrollCallback(GLFWwindow* window, double xOffset, double yOffset);

private:
    void onMouseButton(int button, int action, int mods);
    void onMouseMove(double xPos, double yPos);
    void onScroll(double xOffset, double yOffset);

private:
    GLFWwindow* window = nullptr;

    int winWidth = 1920;
    int winHeight = 1080;

    ShaderProgram robotShader;
    ShaderProgram pickShader;
    ShaderProgram outlineShader;

    std::shared_ptr<SceneNode> rootNode;

    glm::mat4 projectionMatrix = glm::mat4(1.0f);

    CameraController camera;
    RobotRig robotRig;

    bool bodyPartSelectedUi[12] = { false };

    char modelPath[512] = "robotModel/robot.glb";
    char saveAnimPath[512] = "robot-animation.json";
    char loadAnimPath[512] = "robot-animation.json";
};