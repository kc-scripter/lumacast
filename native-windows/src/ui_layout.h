#pragma once

#include <d2d1.h>

namespace lunira::ui {

struct Tokens {
    static constexpr float Sidebar = 228.0f;
    static constexpr float Outer = 20.0f;
    static constexpr float Gap = 14.0f;
    static constexpr float SmallGap = 10.0f;
    static constexpr float HeaderHeight = 52.0f;
    static constexpr float ControlDockHeight = 86.0f;
    static constexpr float CameraCollapsed = 42.0f;
    static constexpr float CameraExpanded = 130.0f;
    static constexpr float RadiusSmall = 10.0f;
    static constexpr float Radius = 14.0f;
    static constexpr float RadiusLarge = 20.0f;
};

float Width(const D2D1_RECT_F& rect) noexcept;
float Height(const D2D1_RECT_F& rect) noexcept;
bool HasArea(const D2D1_RECT_F& rect) noexcept;
D2D1_RECT_F Inset(const D2D1_RECT_F& rect, float amount) noexcept;
D2D1_RECT_F Inset(
    const D2D1_RECT_F& rect,
    float horizontal,
    float vertical) noexcept;

struct HomeLayout {
    D2D1_RECT_F sidebar{};
    D2D1_RECT_F content{};
    D2D1_RECT_F hero{};
    D2D1_RECT_F form{};
    D2D1_RECT_F preview{};
};

struct RoomLayout {
    D2D1_RECT_F sidebar{};
    D2D1_RECT_F header{};
    D2D1_RECT_F screen{};
    D2D1_RECT_F cameras{};
    D2D1_RECT_F controls{};
};

struct SettingsLayout {
    D2D1_RECT_F sidebar{};
    D2D1_RECT_F content{};
    D2D1_RECT_F header{};
    D2D1_RECT_F leftCard{};
    D2D1_RECT_F rightCard{};
    D2D1_RECT_F updateCard{};
};

HomeLayout MakeHomeLayout(float width, float height) noexcept;
RoomLayout MakeRoomLayout(
    float width,
    float height,
    float cameraReveal,
    bool hasCameras,
    bool focused) noexcept;
SettingsLayout MakeSettingsLayout(float width, float height) noexcept;

class MotionValue {
public:
    MotionValue() = default;
    explicit MotionValue(float value) noexcept : value_(value), target_(value) {}

    float Get() const noexcept { return value_; }
    float Target() const noexcept { return target_; }

    void SetTarget(float target) noexcept;
    void Snap(float value) noexcept;
    bool Step(float response = 0.24f) noexcept;
    bool Settled(float epsilon = 0.003f) const noexcept;

private:
    float value_ = 0.0f;
    float target_ = 0.0f;
};

} // namespace lunira::ui
