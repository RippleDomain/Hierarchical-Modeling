#include "CameraController.h"

#include <cmath>
#include <gtc/matrix_transform.hpp>

void CameraController::reset()
{
    cameraRadius = 2.0f;
    cameraTheta = 0.0f;
    cameraPhi = 3.1415926f / 2.0f;
    lookAtPoint = glm::vec3(0.0f, 1.0f, 0.0f);

    isOrbiting = false;
    isPanning = false;
}

glm::vec3 CameraController::sphericalToCartesian(float radius, float thetaIn, float phiIn) const
{
    float x = radius * std::sin(phiIn) * std::cos(thetaIn);
    float y = radius * std::cos(phiIn);
    float z = radius * std::sin(phiIn) * std::sin(thetaIn);

    return glm::vec3(x, y, z);
}

glm::vec3 CameraController::getEye() const
{
    glm::vec3 c = sphericalToCartesian(cameraRadius, cameraTheta, cameraPhi);

    return c + lookAtPoint;
}

glm::mat4 CameraController::getViewMatrix() const
{
    glm::vec3 eye = getEye();

    return glm::lookAt(eye, lookAtPoint, glm::vec3(0.0f, 1.0f, 0.0f));
}

void CameraController::updateKeyboard(GLFWwindow* window, float deltaTime, bool allowKeyboard)
{
    if (!allowKeyboard)
    {
        return;
    }

    float speed = 2.0f;

    if (glfwGetKey(window, GLFW_KEY_LEFT_SHIFT) == GLFW_PRESS || glfwGetKey(window, GLFW_KEY_RIGHT_SHIFT) == GLFW_PRESS)
    {
        speed *= 3.0f;
    }

    float step = speed * deltaTime;

    glm::vec3 eye = getEye();
    glm::vec3 worldUp(0.0f, 1.0f, 0.0f);

    glm::vec3 forward = lookAtPoint - eye;
    forward.y = 0.0f;

    float fLen = glm::length(forward);

    if (fLen > 0.00001f)
    {
        forward /= fLen;
    }
    else
    {
        forward = glm::vec3(0.0f, 0.0f, -1.0f);
    }

    glm::vec3 right = glm::normalize(glm::cross(forward, worldUp));
    glm::vec3 move(0.0f);

    if (glfwGetKey(window, GLFW_KEY_W) == GLFW_PRESS) { move += forward; }
    if (glfwGetKey(window, GLFW_KEY_S) == GLFW_PRESS) { move -= forward; }
    if (glfwGetKey(window, GLFW_KEY_D) == GLFW_PRESS) { move += right; }
    if (glfwGetKey(window, GLFW_KEY_A) == GLFW_PRESS) { move -= right; }

    float mLen = glm::length(move);

    if (mLen > 0.00001f)
    {
        move = (move / mLen) * step;
        lookAtPoint += move;
    }

    if (glfwGetKey(window, GLFW_KEY_SPACE) == GLFW_PRESS)
    {
        lookAtPoint += worldUp * step;
    }

    if (glfwGetKey(window, GLFW_KEY_LEFT_CONTROL) == GLFW_PRESS || glfwGetKey(window, GLFW_KEY_RIGHT_CONTROL) == GLFW_PRESS)
    {
        lookAtPoint -= worldUp * step;
    }
}

bool CameraController::onMouseButton(GLFWwindow* window, int button, int action)
{
    if (button != GLFW_MOUSE_BUTTON_MIDDLE)
    {
        return false;
    }

    if (action == GLFW_PRESS)
    {
        isPanning = true;
        glfwGetCursorPos(window, &panLastX, &panLastY);

        isOrbiting = false;

        return true;
    }

    if (action == GLFW_RELEASE)
    {
        isPanning = false;
        return true;
    }

    return false;
}

void CameraController::beginOrbit(GLFWwindow* window)
{
    isOrbiting = true;
    glfwGetCursorPos(window, &orbitLastX, &orbitLastY);

    isPanning = false;
}

void CameraController::endOrbit()
{
    isOrbiting = false;
}

void CameraController::onMouseMove(double x, double y)
{
    if (isPanning)
    {
        double dx = x - panLastX;
        double dy = y - panLastY;

        glm::vec3 eye = getEye();
        glm::vec3 worldUp(0.0f, 1.0f, 0.0f);

        glm::vec3 forward = glm::normalize(lookAtPoint - eye);
        glm::vec3 right = glm::normalize(glm::cross(forward, worldUp));
        glm::vec3 up = glm::normalize(glm::cross(right, forward));

        float panSpeed = cameraRadius * 0.0015f;

        lookAtPoint += right * (float)dx * panSpeed;
        lookAtPoint -= up * (float)dy * panSpeed;

        panLastX = x;
        panLastY = y;
        return;
    }

    if (!isOrbiting)
    {
        return;
    }

    double dx = x - orbitLastX;
    double dy = y - orbitLastY;

    cameraTheta -= (float)dx * 0.01f;
    cameraPhi += (float)dy * 0.01f;
    cameraPhi = std::max(0.1f, std::min(3.1415926f - 0.1f, cameraPhi));

    orbitLastX = x;
    orbitLastY = y;
}

void CameraController::onScroll(double yOffset)
{
    cameraRadius += (float)yOffset * 0.1f;
    cameraRadius = std::max(0.5f, std::min(20.0f, cameraRadius));
}

bool CameraController::getIsOrbiting() const
{
    return isOrbiting;
}

bool CameraController::getIsPanning() const
{
    return isPanning;
}