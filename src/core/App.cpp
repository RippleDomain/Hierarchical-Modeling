#include "App.h"

#include <filesystem>
#include <iostream>
#include <fstream>
#include <chrono>
#include <gtc/matrix_transform.hpp>

#include "../util/ModelLoader.h"
#include "../util/FileUtils.h"
#include "imgui.h"
#include "imgui_impl_glfw.h"
#include "imgui_impl_opengl3.h"

bool App::initialize()
{
    initializeGlfw();
    initializeGlad();

    glfwSetMouseButtonCallback(window, App::mouseButtonCallback);
    glfwSetCursorPosCallback(window, App::cursorPosCallback);
    glfwSetScrollCallback(window, App::scrollCallback);

    initializeImGui();

    loadShaders();

    robotRig.initialize();

    camera.reset();
    projectionMatrix = glm::perspective(glm::radians(45.0f), (float)winWidth / (float)winHeight, 0.1f, 100.0f);

    robotRig.onResize(winWidth, winHeight);

    loadScene();

    return true;
}

void App::initializeGlfw()
{
    if (!glfwInit())
    {
        std::exit(1);
    }

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);

    window = glfwCreateWindow(winWidth, winHeight, "Hierarchical Modeling", nullptr, nullptr);

    if (!window)
    {
        glfwTerminate();
        std::exit(1);
    }

    glfwMakeContextCurrent(window);
    glfwSwapInterval(1);

    glfwSetWindowUserPointer(window, this);
}

void App::initializeGlad()
{
    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress))
    {
        std::exit(1);
    }
}

void App::initializeImGui()
{
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();

    ImGuiIO& io = ImGui::GetIO();
    io.Fonts->AddFontDefault();

    ImGui::StyleColorsDark();

    ImGui_ImplGlfw_InitForOpenGL(window, true);
    ImGui_ImplOpenGL3_Init("#version 330");
}

void App::loadShaders()
{
    if (!robotShader.loadFromFiles("shaders/robot.vert", "shaders/robot.frag"))
    {
        std::exit(1);
    }

    if (!pickShader.loadFromFiles("shaders/pick.vert", "shaders/pick.frag"))
    {
        std::exit(1);
    }

    if (!outlineShader.loadFromFiles("shaders/outline.vert", "shaders/outline.frag"))
    {
        std::exit(1);
    }
}

void App::loadScene()
{
    if (rootNode)
    {
        robotRig.setRootNode(nullptr);
        ModelLoader::destroyNodeGpu(rootNode);
        rootNode.reset();
    }

    rootNode = ModelLoader::loadGlbOrGltf(modelPath);
    robotRig.setRootNode(rootNode);

    if (!rootNode)
    {
        std::cout << "Failed to load model: " << modelPath << "\n";
    }
}

void App::run()
{
    auto last = std::chrono::high_resolution_clock::now();

    while (!glfwWindowShouldClose(window))
    {
        glfwPollEvents();

        auto now = std::chrono::high_resolution_clock::now();
        float dt = std::chrono::duration<float>(now - last).count();
        last = now;

        update(dt);
        render();
    }
}

void App::shutdown()
{
    robotRig.setRootNode(nullptr);

    if (rootNode)
    {
        ModelLoader::destroyNodeGpu(rootNode);
        rootNode.reset();
    }

    robotRig.shutdown();

    robotShader.destroy();
    pickShader.destroy();
    outlineShader.destroy();

    ImGui_ImplOpenGL3_Shutdown();
    ImGui_ImplGlfw_Shutdown();
    ImGui::DestroyContext();

    glfwDestroyWindow(window);
    glfwTerminate();
}

void App::update(float deltaTime)
{
    int fbW = 0;
    int fbH = 0;
    glfwGetFramebufferSize(window, &fbW, &fbH);

    if (fbW != winWidth || fbH != winHeight)
    {
        winWidth = fbW;
        winHeight = fbH;

        projectionMatrix = glm::perspective(glm::radians(45.0f), (float)winWidth / (float)winHeight, 0.1f, 100.0f);
        robotRig.onResize(winWidth, winHeight);
    }

    robotRig.update(deltaTime);

    bool allowKeyboard = true;

    if (ImGui::GetCurrentContext() != nullptr)
    {
        ImGuiIO& io = ImGui::GetIO();

        if (io.WantTextInput || io.WantCaptureKeyboard)
        {
            allowKeyboard = false;
        }
    }

    camera.updateKeyboard(window, deltaTime, allowKeyboard);
}

void App::render()
{
    ImGui_ImplOpenGL3_NewFrame();
    ImGui_ImplGlfw_NewFrame();
    ImGui::NewFrame();

    drawImGui();

    glm::vec3 eye = camera.getEye();
    glm::mat4 V = camera.getViewMatrix();
    glm::mat4 MVP = projectionMatrix * V;

    glViewport(0, 0, winWidth, winHeight);
    glEnable(GL_DEPTH_TEST);

    glClearColor(0.18f, 0.18f, 0.18f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    if (rootNode)
    {
        robotRig.renderRobotScene(robotShader, MVP, eye);
        robotRig.renderOutline(outlineShader, MVP);
    }

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());

    glfwSwapBuffers(window);
}

void App::drawImGui()
{
    ImGui::Begin("Robot Controls");

    ImGui::InputText("Model Path", modelPath, sizeof(modelPath));

    if (ImGui::Button("Reload Model"))
    {
        loadScene();
    }

    ImGui::Separator();

    if (ImGui::Button("Reset Pose"))
    {
        robotRig.resetPose();
    }

    ImGui::SameLine();

    if (ImGui::Button("Reset Camera"))
    {
        camera.reset();
    }

    ImGui::Separator();

    auto& theta = robotRig.getAngles();
    auto& animSystem = robotRig.getAnimationSystem();

    const char* jointNames[RobotRig::kJointCount] =
    {
        "Torso Yaw",
        "Head Pitch",
        "L UpperArm Pitch",
        "L LowerArm Pitch",
        "R UpperArm Pitch",
        "R LowerArm Pitch",
        "L UpperLeg Pitch",
        "L LowerLeg Pitch",
        "R UpperLeg Pitch",
        "R LowerLeg Pitch",
        "Head Yaw",
        "L UpperArm Side",
        "R UpperArm Side",
        "L UpperLeg Side",
        "R UpperLeg Side",
        "L Hand",
        "R Hand",
        "L Hand Yaw",
        "R Hand Yaw",
        "L LowerLeg Yaw",
        "R LowerLeg Yaw"
    };

    for (int i = 0; i < RobotRig::kJointCount; ++i)
    {
        float minA = -180.0f;
        float maxA = 180.0f;
        robotRig.getJointLimits(i, minA, maxA);

        //Clamp once so loaded animations / bad values don't appear out-of-range.
        theta[i] = robotRig.clampJoint(i, theta[i]);

        const float eps = 0.0001f;
        bool atMin = (theta[i] <= (minA + eps));
        bool atMax = (theta[i] >= (maxA - eps));
        bool restrained = atMin || atMax;

        if (restrained)
        {
            //Grey-out styling to indicate the joint is constrained at its limit.
            ImGui::PushStyleColor(ImGuiCol_FrameBg, ImVec4(0.20f, 0.20f, 0.20f, 1.00f));
            ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ImVec4(0.24f, 0.24f, 0.24f, 1.00f));
            ImGui::PushStyleColor(ImGuiCol_FrameBgActive, ImVec4(0.24f, 0.24f, 0.24f, 1.00f));
            ImGui::PushStyleColor(ImGuiCol_SliderGrab, ImVec4(0.55f, 0.55f, 0.55f, 1.00f));
            ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, ImVec4(0.62f, 0.62f, 0.62f, 1.00f));
        }

        float v = theta[i];

        //This prevents dragging beyond limits (because min/max are the real limits).
        if (ImGui::SliderFloat(jointNames[i], &v, minA, maxA, "%.0f"))
        {
            theta[i] = robotRig.clampJoint(i, v);
        }

        if (restrained)
        {
            ImGui::PopStyleColor(5);
        }

        ImGui::SameLine();
        ImGui::TextDisabled("[%.0f..%.0f]", minA, maxA);
    }

    ImGui::Separator();

    struct BodyPartUiItem
    {
        const char* key;
        const char* label;
    };

    static BodyPartUiItem bodyParts[12] =
    {
        { "torso", "Torso" },
        { "head", "Head" },
        { "left_arm_high", "L Arm (U)" },
        { "left_arm_low", "L Arm (L)" },
        { "right_arm_high", "R Arm (U)" },
        { "right_arm_low", "R Arm (L)" },
        { "left_leg_high", "L Leg (U)" },
        { "left_leg_low", "L Leg (L)" },
        { "right_leg_high", "R Leg (U)" },
        { "right_leg_low", "R Leg (L)" },
        { "left_hand", "L Hand" },
        { "right_hand", "R Hand" }
    };

    ImGui::Text("Keyframe Target Body Parts (none = all)");

    static bool selectAllBodyPartsUi = false;

    if (ImGui::Checkbox("All Body Parts", &selectAllBodyPartsUi))
    {
        for (int i = 0; i < 12; ++i)
        {
            bodyPartSelectedUi[i] = selectAllBodyPartsUi;
        }
    }

    ImGui::Separator();

    bool anyChanged = false;

    if (ImGui::BeginTable("BodyPartsTable", 2, ImGuiTableFlags_SizingStretchSame))
    {
        for (int i = 0; i < 12; ++i)
        {
            ImGui::TableNextColumn();

            if (ImGui::Checkbox(bodyParts[i].label, &bodyPartSelectedUi[i]))
            {
                anyChanged = true;
            }
        }

        ImGui::EndTable();
    }

    if (anyChanged)
    {
        bool allSelected = true;

        for (int i = 0; i < 12; ++i)
        {
            if (!bodyPartSelectedUi[i])
            {
                allSelected = false;

                break;
            }
        }

        selectAllBodyPartsUi = allSelected;
    }

    std::vector<std::string> selectedParts;
    selectedParts.reserve(12);

    for (int i = 0; i < 12; ++i)
    {
        if (bodyPartSelectedUi[i])
        {
            selectedParts.push_back(bodyParts[i].key);
        }
    }

    std::vector<std::string>* partsPtr = selectedParts.empty() ? nullptr : &selectedParts;

    ImGui::Separator();

    ImGui::Text("Frame: %d / %d", animSystem.getCurrentFrame(), animSystem.getMaxFrame());
    ImGui::Text("Time: %.2fs / %.2fs", animSystem.getAnimationTime(), animSystem.getDuration());

    if (ImGui::Button(animSystem.getIsPlaying() ? "Pause" : "Play"))
    {
        if (animSystem.getIsPlaying())
        {
            animSystem.pause();
        }
        else
        {
            animSystem.play();
        }
    }

    ImGui::SameLine();

    if (ImGui::Button("Stop"))
    {
        animSystem.stop();
        theta = animSystem.getCurrentAngles(theta);
    }

    int frame = animSystem.getCurrentFrame();
    if (ImGui::SliderInt("Timeline", &frame, 0, animSystem.getMaxFrame()))
    {
        animSystem.setFrame(frame);
        theta = animSystem.getCurrentAngles(theta);
    }

    if (ImGui::Button("Set Keyframe"))
    {
        animSystem.setKeyframe(animSystem.getCurrentFrame(), theta, partsPtr);
    }

    ImGui::SameLine();

    if (ImGui::Button("Delete Keyframe"))
    {
        animSystem.removeKeyframe(animSystem.getCurrentFrame(), partsPtr);
    }

    ImGui::Separator();

    ImGui::InputText("Save Anim Path", saveAnimPath, sizeof(saveAnimPath));

    if (ImGui::Button("Save Animation JSON"))
    {
        std::filesystem::create_directories("savedAnimations");

        std::filesystem::path fileName = std::filesystem::path(saveAnimPath).filename();
        std::filesystem::path outPath = std::filesystem::path("savedAnimations") / fileName;

        std::string text = animSystem.exportToJsonString();
        std::ofstream out(outPath.string(), std::ios::out | std::ios::trunc);
        out << text;
    }

    ImGui::InputText("Load Anim Path", loadAnimPath, sizeof(loadAnimPath));

    if (ImGui::Button("Load Animation JSON"))
    {
        std::filesystem::path fileName = std::filesystem::path(loadAnimPath).filename();
        std::filesystem::path inPath = std::filesystem::path("savedAnimations") / fileName;

        std::string text;
        if (fileUtils::readFileToString(inPath.string(), text))
        {
            try
            {
                animSystem.importFromJsonString(text);
                theta = animSystem.getCurrentAngles(theta);
            }
            catch (...)
            {
            }
        }
    }

    ImGui::Separator();

    const std::string& selected = robotRig.getSelectedNodeName();
    ImGui::Text("Selection: %s", selected.empty() ? "(none)" : selected.c_str());

    if (ImGui::Button("Clear Selection"))
    {
        robotRig.clearSelection();
    }

    ImGui::End();
}

void App::onMouseButton(int button, int action, int mods)
{
    (void)mods;

    if (ImGui::GetCurrentContext() != nullptr)
    {
        ImGuiIO& io = ImGui::GetIO();

        if (io.WantCaptureMouse)
        {
            return;
        }
    }

    if (camera.onMouseButton(window, button, action))
    {
        robotRig.cancelLimbDrag();

        return;
    }

    if (button != GLFW_MOUSE_BUTTON_LEFT)
    {
        return;
    }

    glm::mat4 MVP = projectionMatrix * camera.getViewMatrix();

    if (action == GLFW_PRESS)
    {
        bool hit = robotRig.onLeftMousePress(window, MVP, pickShader);
        if (!hit)
        {
            camera.beginOrbit(window);
        }
    }
    else if (action == GLFW_RELEASE)
    {
        camera.endOrbit();
        robotRig.onLeftMouseRelease(window, MVP, pickShader);
    }
}

void App::onMouseMove(double x, double y)
{
    if (ImGui::GetCurrentContext() != nullptr)
    {
        ImGuiIO& io = ImGui::GetIO();

        if (io.WantCaptureMouse)
        {
            return;
        }
    }

    if (camera.getIsPanning())
    {
        camera.onMouseMove(x, y);

        return;
    }

    if (robotRig.getIsLimbDragging())
    {
        robotRig.onMouseMove(x, y);

        return;
    }

    if (camera.getIsOrbiting())
    {
        camera.onMouseMove(x, y);
    }
}

void App::onScroll(double xOffset, double yOffset)
{
    (void)xOffset;

    if (ImGui::GetCurrentContext() != nullptr)
    {
        ImGuiIO& io = ImGui::GetIO();

        if (io.WantCaptureMouse)
        {
            return;
        }
    }

    camera.onScroll(yOffset);
}

void App::mouseButtonCallback(GLFWwindow* window, int button, int action, int mods)
{
    App* app = static_cast<App*>(glfwGetWindowUserPointer(window));

    if (app)
    {
        app->onMouseButton(button, action, mods);
    }
}

void App::cursorPosCallback(GLFWwindow* window, double xPos, double yPos)
{
    App* app = static_cast<App*>(glfwGetWindowUserPointer(window));

    if (app)
    {
        app->onMouseMove(xPos, yPos);
    }
}

void App::scrollCallback(GLFWwindow* window, double xOffset, double yOffset)
{
    App* app = static_cast<App*>(glfwGetWindowUserPointer(window));

    if (app)
    {
        app->onScroll(xOffset, yOffset);
    }
}