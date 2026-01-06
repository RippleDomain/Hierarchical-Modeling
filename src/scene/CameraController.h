#pragma once

#include <algorithm>
#include <GLFW/glfw3.h>
#include <glm.hpp>

class CameraController
{
public:
    void reset();

    void updateKeyboard(GLFWwindow* window, float deltaTime, bool allowKeyboard);

    bool onMouseButton(GLFWwindow* window, int button, int action);
    void onMouseMove(double x, double y);
    void onScroll(double yOffset);

    bool getIsOrbiting() const;
    bool getIsPanning() const;

    void beginOrbit(GLFWwindow* window);
    void endOrbit();

    glm::vec3 getEye() const;
    glm::mat4 getViewMatrix() const;

private:
    glm::vec3 sphericalToCartesian(float radius, float theta, float phi) const;

private:
    float cameraRadius = 2.0f;
    float cameraTheta = 0.0f;
    float cameraPhi = 3.1415926f / 2.0f;
    glm::vec3 lookAtPoint = glm::vec3(0.0f, 1.0f, 0.0f);

    bool isOrbiting = false;
    double orbitLastX = 0.0;
    double orbitLastY = 0.0;

    bool isPanning = false;
    double panLastX = 0.0;
    double panLastY = 0.0;
};