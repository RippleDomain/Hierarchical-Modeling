#include "AnimationSystem.h"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

AnimationSystem::AnimationSystem(int inNumJoints, const std::unordered_map<std::string, std::vector<int>>& inBodyPartMap)
{
    numJoints = inNumJoints;
    bodyPartMap = inBodyPartMap;

    for (auto& it : bodyPartMap)
    {
        keyframes[it.first] = {};
    }
}

void AnimationSystem::setKeyframe(int frame, const std::vector<float>& allAngles, const std::vector<std::string>* bodyPartsOrNull)
{
    frame = std::max(0, frame);

    std::vector<std::string> targets;

    if (!bodyPartsOrNull || bodyPartsOrNull->empty())
    {
        for (auto& it : bodyPartMap)
        {
            targets.push_back(it.first);
        }
    }
    else
    {
        targets = *bodyPartsOrNull;
    }

    for (size_t i = 0; i < targets.size(); ++i)
    {
        const std::string& bodyPart = targets[i];

        auto itMap = bodyPartMap.find(bodyPart);

        if (itMap == bodyPartMap.end())
        {
            continue;
        }

        const std::vector<int>& jointIds = itMap->second;

        Keyframe kf;
        kf.frame = frame;
        kf.angles.resize(jointIds.size());

        for (size_t j = 0; j < jointIds.size(); ++j)
        {
            int id = jointIds[j];

            if (id >= 0 && id < static_cast<int>(allAngles.size()))
            {
                kf.angles[j] = allAngles[id];
            }
            else
            {
                kf.angles[j] = 0.0f;
            }
        }

        std::vector<Keyframe>& list = keyframes[bodyPart];

        auto existing = std::find_if(list.begin(), list.end(), [&](const Keyframe& a)
        {
            return a.frame == frame;
        });

        if (existing != list.end())
        {
            *existing = kf;
        }
        else
        {
            list.push_back(kf);

            std::sort(list.begin(), list.end(), [](const Keyframe& a, const Keyframe& b)
            {
                return a.frame < b.frame;
            });
        }
    }

    if (frame > maxFrame)
    {
        maxFrame = frame;
        duration = static_cast<float>(maxFrame) / frameRate;
    }
}

void AnimationSystem::removeKeyframe(int frame, const std::vector<std::string>* bodyPartsOrNull)
{
    std::vector<std::string> targets;

    if (!bodyPartsOrNull || bodyPartsOrNull->empty())
    {
        for (auto& it : bodyPartMap)
        {
            targets.push_back(it.first);
        }
    }
    else
    {
        targets = *bodyPartsOrNull;
    }

    for (size_t i = 0; i < targets.size(); ++i)
    {
        const std::string& bodyPart = targets[i];
        auto it = keyframes.find(bodyPart);

        if (it == keyframes.end())
        {
            continue;
        }

        std::vector<Keyframe>& list = it->second;
        list.erase(std::remove_if(list.begin(), list.end(), [&](const Keyframe& kf)
        {
            return kf.frame == frame;
        }), list.end());
    }

    int newMax = 0;

    for (auto& it : keyframes)
    {
        for (size_t i = 0; i < it.second.size(); ++i)
        {
            newMax = std::max(newMax, it.second[i].frame);
        }
    }

    if (newMax > 0)
    {
        maxFrame = std::max(maxFrame, newMax);
        duration = static_cast<float>(maxFrame) / frameRate;
    }
    else
    {
        maxFrame = 600;
        duration = 5.0f;
    }
}

std::vector<AnimationSystem::Keyframe> AnimationSystem::getKeyframesForBodyPart(const std::string& bodyPart) const
{
    auto it = keyframes.find(bodyPart);

    if (it == keyframes.end())
    {
        return {};
    }

    return it->second;
}

std::vector<std::pair<std::string, AnimationSystem::Keyframe>> AnimationSystem::getAllKeyframes() const
{
    std::vector<std::pair<std::string, Keyframe>> out;

    for (auto& it : keyframes)
    {
        const std::string& bodyPart = it.first;

        for (size_t i = 0; i < it.second.size(); ++i)
        {
            out.push_back({ bodyPart, it.second[i] });
        }
    }

    std::sort(out.begin(), out.end(), [](const auto& a, const auto& b)
    {
        return a.second.frame < b.second.frame;
    });

    return out;
}

void AnimationSystem::clearKeyframes()
{
    for (auto& it : keyframes)
    {
        it.second.clear();
    }

    maxFrame = 150;
    duration = 5.0f;
}

std::vector<float> AnimationSystem::interpolateBodyPart(const std::string& bodyPart, int frame, const std::vector<float>& defaultAngles) const
{
    auto it = keyframes.find(bodyPart);

    if (it == keyframes.end() || it->second.empty())
    {
        return defaultAngles;
    }

    const std::vector<Keyframe>& list = it->second;

    if (list.size() == 1)
    {
        return list[0].angles;
    }

    frame = std::max(0, std::min(frame, maxFrame));

    const Keyframe* before = nullptr;
    const Keyframe* after = nullptr;

    for (size_t i = 0; i < list.size(); ++i)
    {
        if (list[i].frame <= frame)
        {
            before = &list[i];
        }
        if (list[i].frame >= frame)
        {
            after = &list[i];

            break;
        }
    }

    if (!before)
    {
        return list[0].angles;
    }

    if (!after)
    {
        return list.back().angles;
    }

    if (before->frame == frame)
    {
        return before->angles;
    }

    float t = static_cast<float>(frame - before->frame) / static_cast<float>(after->frame - before->frame);

    std::vector<float> out;
    out.resize(before->angles.size());

    for (size_t i = 0; i < before->angles.size(); ++i)
    {
        float a1 = before->angles[i];
        float a2 = after->angles[i];

        float diff = a2 - a1;

        if (diff > 180.0f) diff -= 360.0f;
        if (diff < -180.0f) diff += 360.0f;

        out[i] = a1 + diff * t;
    }

    return out;
}

std::vector<float> AnimationSystem::interpolate(int frame, const std::vector<float>& defaultAngles) const
{
    std::vector<float> result = defaultAngles;

    if (static_cast<int>(result.size()) != numJoints)
    {
        result.assign(numJoints, 0.0f);
    }

    for (auto& it : bodyPartMap)
    {
        const std::string& bodyPart = it.first;
        const std::vector<int>& jointIds = it.second;

        std::vector<float> defaults;
        defaults.resize(jointIds.size());

        for (size_t j = 0; j < jointIds.size(); ++j)
        {
            int id = jointIds[j];
            defaults[j] = result[id];
        }

        std::vector<float> interp = interpolateBodyPart(bodyPart, frame, defaults);

        for (size_t j = 0; j < jointIds.size() && j < interp.size(); ++j)
        {
            int id = jointIds[j];
            result[id] = interp[j];
        }
    }

    return result;
}

void AnimationSystem::update(float deltaTime)
{
    if (!isPlaying)
    {
        return;
    }

    animationTime += deltaTime * playbackSpeed;

    if (loop)
    {
        if (duration > 0.0f)
        {
            animationTime = std::fmod(animationTime, duration);
        }
    }
    else
    {
        animationTime = std::min(animationTime, duration);

        if (animationTime >= duration)
        {
            isPlaying = false;
        }
    }

    currentFrame = static_cast<int>(std::floor(animationTime * frameRate));
    currentFrame = std::min(currentFrame, maxFrame);
}

void AnimationSystem::play()
{
    isPlaying = true;
}

void AnimationSystem::pause()
{
    isPlaying = false;
}

void AnimationSystem::stop()
{
    isPlaying = false;
    animationTime = 0.0f;
    currentFrame = 0;
}

void AnimationSystem::setFrame(int frame)
{
    frame = std::max(0, std::min(frame, maxFrame));
    currentFrame = frame;
    animationTime = static_cast<float>(frame) / frameRate;
}

std::vector<float> AnimationSystem::getCurrentAngles(const std::vector<float>& defaultAngles) const
{
    return interpolate(currentFrame, defaultAngles);
}

std::string AnimationSystem::exportToJsonString() const
{
    json j;

    json keyframesByBodyPart;

    for (auto& it : keyframes)
    {
        if (it.second.empty())
        {
            continue;
        }

        json arr = json::array();

        for (size_t i = 0; i < it.second.size(); ++i)
        {
            json kf;
            kf["frame"] = it.second[i].frame;
            kf["angles"] = it.second[i].angles;
            arr.push_back(kf);
        }

        keyframesByBodyPart[it.first] = arr;
    }

    j["version"] = "2.0";
    j["frameRate"] = frameRate;
    j["maxFrame"] = maxFrame;
    j["duration"] = duration;
    j["numJoints"] = numJoints;
    j["keyframesByBodyPart"] = keyframesByBodyPart;

    return j.dump(2);
}

void AnimationSystem::importFromJsonString(const std::string& jsonText)
{
    json j = json::parse(jsonText);

    clearKeyframes();

    if (j.contains("version") && j["version"].is_string() && j["version"].get<std::string>() == "2.0" && j.contains("keyframesByBodyPart"))
    {
        json kb = j["keyframesByBodyPart"];

        for (auto& it : bodyPartMap)
        {
            const std::string& bodyPart = it.first;

            if (!kb.contains(bodyPart))
            {
                continue;
            }

            json arr = kb[bodyPart];

            if (!arr.is_array())
            {
                continue;
            }

            std::vector<Keyframe> list;

            for (auto& el : arr)
            {
                Keyframe kf;
                kf.frame = el.value("frame", 0);
                kf.angles = el.value("angles", std::vector<float>());
                list.push_back(kf);
            }

            std::sort(list.begin(), list.end(), [](const Keyframe& a, const Keyframe& b)
            {
                return a.frame < b.frame;
            });

            keyframes[bodyPart] = list;
        }
    }
    else
    {
        throw std::runtime_error("Invalid animation JSON.");
    }

    if (j.contains("frameRate")) frameRate = j["frameRate"].get<float>();
    if (j.contains("maxFrame")) maxFrame = j["maxFrame"].get<int>();
    if (j.contains("duration")) duration = j["duration"].get<float>();
}

int AnimationSystem::getCurrentFrame() const { return currentFrame; }
int AnimationSystem::getMaxFrame() const { return maxFrame; }
float AnimationSystem::getFrameRate() const { return frameRate; }
float AnimationSystem::getDuration() const { return duration; }
float AnimationSystem::getAnimationTime() const { return animationTime; }
bool AnimationSystem::getIsPlaying() const { return isPlaying; }