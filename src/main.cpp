#include "core/App.h"

int main()
{
    App app;

    if (!app.initialize())
    {
        return 1;
    }

    app.run();
    app.shutdown();

    return 0;
}