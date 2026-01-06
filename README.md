# Hierarchical Modeling (OpenGL)

A self-contained C++/OpenGL application for **hierarchical pose control** and **keyframe animation** of a glTF robot rig.  
It supports **per-limb rotation constraints**, **color-based picking**, **outline highlighting**, and **JSON animation save/load** through an ImGui control panel and direct mouse interaction.

## Showcase Video of a Simple Animation Made with the App

https://github.com/user-attachments/assets/67290e89-ae79-4551-98f8-cdeb911b390b

## Features

- **Hierarchical Rig & Pose Control**
  - Full hierarchy-driven transforms: rotating a parent limb affects all children (as expected in hierarchical modeling).
  - Joint angles are stored in a single `theta[]` array and applied through a pose-transform map.
  - Includes additional yaw joints (hands + lower legs) for more natural motion.

- **Joint Constraints (No Over-Dragging)**
  - Each joint has its own min/max limits.
  - ImGui sliders use the **real limit range**, so the user cannot drag beyond constraints.
  - When a joint is at (or very near) a limit, the slider visually **greys out** to communicate restraint.

- **Picking & Selection (Color ID Buffer)**
  - Clicking on robot parts uses an off-screen framebuffer (FBO) where each pickable node is drawn with a unique color ID.
  - Selection is resolved by reading the pixel under the cursor and mapping RGB → part name.
  - Selected body part is stored as a name string and used consistently across UI + outline rendering.

- **Outline Highlighting**
  - The selected node is highlighted using a dedicated outline shader pass.
  - Uses inflated model transform + front-face culling to create a clean silhouette outline.

- **Mouse Limb Dragging**
  - Click a limb and drag to rotate it directly:
    - **dy** affects the primary joint (main bend/pitch)
    - **dx** affects the secondary joint (yaw/side rotation if supported)
  - Uses a per-node joint mapping so interaction stays consistent and predictable.

- **Camera Controls**
  - Smooth interactive camera designed for inspecting rigs:
    - Keyboard movement (WASD + modifiers) when UI is not capturing input.
    - Mouse controls for orbit/pan/zoom (depending on your camera module setup).
  - Camera reset button restores a known good view for testing animation and pose.

- **Keyframe Animation System**
  - Keyframes can be stored per body part (torso, head, each arm segment, each leg segment, hands).
  - Supports:
    - Set / delete keyframes at the current timeline frame
    - Playback controls (play/pause/stop)
    - Timeline scrubbing
  - Interpolation is performed between frames to produce smooth motion.

- **Save / Load Animations (JSON)**
  - Animations export to a clean JSON format:
    - versioned format (`"2.0"`)
    - frame rate, duration, max frame
    - keyframes grouped by body part
  - Save/load buttons allow quick iteration while testing motion.
  - Animations can be organized under a dedicated directory (e.g., `savedAnimations/`).

---

## Build (Windows, Visual Studio 2022)

1. Install **Visual Studio 2022** with “Desktop development with C++”.
2. Open the solution: `Hierarchical-Modeling.sln` (or your project `.sln`).
3. Select **x64** and **Debug** or **Release**.
4. Build & Run.

All third-party dependencies are vendored in the **`external/`** directory and are already wired up in the solution.  
Building in VS2022 is sufficient - no extra setup is required.

### Dependencies (vendored under `external/`)
- **GLFW** (windowing, input)
- **GLAD** (OpenGL loader)
- **ImGui** (+ GLFW/OpenGL3 backends)
- **GLM** (math)
- **nlohmann/json** (animation save/load)
- **tinygltf** (glTF / GLB loading)
- **stb_image / stb_image_write** (texture I/O if used by the loader)

The app creates an **OpenGL 3.3 Core** context (`#version 330`).

---

## Run-time Usage

### Mouse controls
- **LMB on robot part**: select via color picking
- **LMB drag on selected limb**: rotate the limb (dy = primary, dx = secondary if available)
- **Mouse wheel**: zoom (camera radius / scroll zoom)

> If your camera module supports it:
- **MMB drag**: pan
- **LMB drag (empty space)**: orbit

### Keyboard controls
> Only active when ImGui is not capturing keyboard input.
- **W/A/S/D**: move camera
- **Shift / Ctrl**: speed modifiers (depending on your camera implementation)

---

## ImGui Panel: Robot Controls

### Model
- **Model Path**: edit the path to the `.glb` / `.gltf` file
- **Reload Model**: reloads the scene and rebuilds GPU resources

### Pose
- **Joint sliders**: rotate each joint within its real constraints
- **Greyed-out sliders** indicate a joint is at its limit
- **Reset Pose**: restores all joints to default
- **Reset Camera**: restores camera to default viewing position

### Keyframe Targeting
- Choose which body parts the current keyframe applies to:
  - **None selected = all body parts**
  - Includes a convenient **All Body Parts** master checkbox

### Animation Controls
- **Play / Pause**
- **Stop** (returns to frame 0)
- **Timeline slider** for scrubbing
- **Set Keyframe** at current frame
- **Delete Keyframe** at current frame

### Save / Load
- **Save Animation JSON**: exports current keyframes to JSON
- **Load Animation JSON**: loads a saved animation into the system

---

## Notes

- An example animation is provided under the savedAnimations directory.

---
