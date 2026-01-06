#pragma once

#include <string>
#include <vector>

namespace fileUtils
{
    bool readFileToString(const std::string& path, std::string& outText);
    bool readFileToBytes(const std::string& path, std::vector<unsigned char>& outBytes);
}