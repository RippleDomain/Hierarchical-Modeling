#pragma once

#include <string>
#include <vector>
#include <unordered_map>

class AnimationSystem
{
public:
    struct Keyframe
    {
        int frame = 0;
        std::vector<float> angles;
    };

    AnimationSystem() = default;

    AnimationSystem(int numJoints, const std::unordered_map<std::string, std::vector<int>>& bodyPartMap);

    void setKeyframe(int frame, const std::vector<float>& allAngles, const std::vector<std::string>* bodyPartsOrNull);
    void removeKeyframe(int frame, const std::vector<std::string>* bodyPartsOrNull);

    std::vector<Keyframe> getKeyframesForBodyPart(const std::string& bodyPart) const;
    std::vector<std::pair<std::string, Keyframe>> getAllKeyframes() const;

    void clearKeyframes();

    std::vector<float> interpolate(int frame, const std::vector<float>& defaultAngles) const;

    void update(float deltaTime);

    void play();
    void pause();
    void stop();

    void setFrame(int frame);

    std::vector<float> getCurrentAngles(const std::vector<float>& defaultAngles) const;

    std::string exportToJsonString() const;
    void importFromJsonString(const std::string& jsonText);

    int getCurrentFrame() const;
    int getMaxFrame() const;
    float getFrameRate() const;
    float getDuration() const;
    float getAnimationTime() const;
    bool getIsPlaying() const;

private:
    std::vector<float> interpolateBodyPart(const std::string& bodyPart, int frame, const std::vector<float>& defaultAngles) const;

private:
    int numJoints = 0;

    std::unordered_map<std::string, std::vector<int>> bodyPartMap;
    std::unordered_map<std::string, std::vector<Keyframe>> keyframes;

    int currentFrame = 0;
    bool isPlaying = false;

    float playbackSpeed = 1.0f;
    float frameRate = 120.0f;

    float animationTime = 0.0f;
    bool loop = true;

    float duration = 5.0f;
    int maxFrame = 600;
};