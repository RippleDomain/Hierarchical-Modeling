#include "FileUtils.h"

#include <fstream>
#include <sstream>

bool fileUtils::readFileToString(const std::string& path, std::string& outText)
{
    std::ifstream in(path, std::ios::in);

    if (!in.is_open())
    {
        return false;
    }

    std::stringstream ss;
    ss << in.rdbuf();
    outText = ss.str();

    return true;
}

bool fileUtils::readFileToBytes(const std::string& path, std::vector<unsigned char>& outBytes)
{
    std::ifstream in(path, std::ios::binary);

    if (!in.is_open())
    {
        return false;
    }
    
    in.seekg(0, std::ios::end);
    std::streamoff size = in.tellg();
    in.seekg(0, std::ios::beg);

    outBytes.resize(static_cast<size_t>(size));
    in.read(reinterpret_cast<char*>(outBytes.data()), size);

    return true;
}