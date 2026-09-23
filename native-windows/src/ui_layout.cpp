#include "ui_layout.h"

#include <algorithm>
#include <cmath>

namespace lunira::ui {

namespace {

D2D1_RECT_F Rect(float left, float top, float right, float bottom) noexcept {
    return D2D1::RectF(left, top, right, bottom);
}

float Lerp(float a, float b, float t) noexcept {
    return a + (b - a) * std::clamp(t, 0.0f, 1.0f);
}

} // namespace

float Width(const D2D1_RECT_F& rect) noexcept {
    return std::max(0.0f, rect.right - rect.left);
}

float Height(const D2D1_RECT_F& rect) noexcept {
    return std::max(0.0f, rect.bottom - rect.top);
}

bool HasArea(const D2D1_RECT_F& rect) noexcept {
    return Width(rect) > 0.5f && Height(rect) > 0.5f;
}

D2D1_RECT_F Inset(const D2D1_RECT_F& rect, float amount) noexcept {
    return Inset(rect, amount, amount);
}

D2D1_RECT_F Inset(
    const D2D1_RECT_F& rect,
    float horizontal,
    float vertical) noexcept {

    return Rect(
        rect.left + horizontal,
        rect.top + vertical,
        rect.right - horizontal,
        rect.bottom - vertical);
}

HomeLayout MakeHomeLayout(float width, float height) noexcept {
    HomeLayout layout;
    layout.sidebar = Rect(0.0f, 0.0f, Tokens::Sidebar, height);
    layout.content = Rect(
        Tokens::Sidebar + 30.0f,
        30.0f,
        width - 30.0f,
        height - 30.0f);

    const float contentWidth = Width(layout.content);
    const float leftWidth = std::clamp(contentWidth * 0.47f, 390.0f, 520.0f);
    const float columnGap = 26.0f;
    const float heroHeight = std::clamp(Height(layout.content) * 0.40f, 225.0f, 265.0f);

    layout.hero = Rect(
        layout.content.left,
        layout.content.top,
        layout.content.left + leftWidth,
        layout.content.top + heroHeight);

    layout.form = Rect(
        layout.content.left,
        layout.hero.bottom + 18.0f,
        layout.content.left + leftWidth,
        layout.content.bottom);

    layout.preview = Rect(
        layout.content.left + leftWidth + columnGap,
        layout.content.top,
        layout.content.right,
        layout.content.bottom);

    return layout;
}

RoomLayout MakeRoomLayout(
    float width,
    float height,
    float cameraReveal,
    bool hasCameras,
    bool focused) noexcept {

    RoomLayout layout;
    layout.sidebar = Rect(0.0f, 0.0f, Tokens::Sidebar, height);

    if (focused) {
        layout.screen = Rect(14.0f, 14.0f, width - 14.0f, height - 14.0f);
        return layout;
    }

    const float left = Tokens::Sidebar + Tokens::Outer;
    const float right = width - Tokens::Outer;
    const float top = 18.0f;
    const float bottom = height - 18.0f;

    layout.header = Rect(
        left,
        top,
        right,
        top + Tokens::HeaderHeight);

    layout.controls = Rect(
        left,
        bottom - Tokens::ControlDockHeight,
        right,
        bottom);

    float cameraHeight = 0.0f;
    if (hasCameras) {
        cameraHeight = Lerp(
            Tokens::CameraCollapsed,
            Tokens::CameraExpanded,
            cameraReveal);
        layout.cameras = Rect(
            left,
            layout.controls.top - Tokens::Gap - cameraHeight,
            right,
            layout.controls.top - Tokens::Gap);
    }

    const float stageTop = layout.header.bottom + 12.0f;
    const float stageBottom = hasCameras
        ? layout.cameras.top - 12.0f
        : layout.controls.top - 14.0f;

    const D2D1_RECT_F stageRegion = Rect(left, stageTop, right, stageBottom);
    const float regionWidth = Width(stageRegion);
    const float regionHeight = Height(stageRegion);
    constexpr float aspect = 16.0f / 9.0f;

    float screenWidth = regionWidth;
    float screenHeight = screenWidth / aspect;
    if (screenHeight > regionHeight) {
        screenHeight = regionHeight;
        screenWidth = screenHeight * aspect;
    }

    const float cx = (stageRegion.left + stageRegion.right) * 0.5f;
    const float cy = (stageRegion.top + stageRegion.bottom) * 0.5f;
    layout.screen = Rect(
        cx - screenWidth * 0.5f,
        cy - screenHeight * 0.5f,
        cx + screenWidth * 0.5f,
        cy + screenHeight * 0.5f);

    return layout;
}

SettingsLayout MakeSettingsLayout(float width, float height) noexcept {
    SettingsLayout layout;
    layout.sidebar = Rect(0.0f, 0.0f, Tokens::Sidebar, height);
    layout.content = Rect(
        Tokens::Sidebar + 40.0f,
        32.0f,
        width - 40.0f,
        height - 32.0f);

    layout.header = Rect(
        layout.content.left,
        layout.content.top,
        layout.content.right,
        layout.content.top + 78.0f);

    const float cardsTop = layout.header.bottom + 24.0f;
    const float cardsHeight = std::clamp(
        Height(layout.content) * 0.38f,
        205.0f,
        250.0f);
    const float gap = Tokens::Gap;
    const float cardWidth = (Width(layout.content) - gap) * 0.5f;

    layout.leftCard = Rect(
        layout.content.left,
        cardsTop,
        layout.content.left + cardWidth,
        cardsTop + cardsHeight);

    layout.rightCard = Rect(
        layout.leftCard.right + gap,
        cardsTop,
        layout.content.right,
        cardsTop + cardsHeight);

    layout.updateCard = Rect(
        layout.content.left,
        layout.leftCard.bottom + gap,
        layout.content.right,
        layout.content.bottom);

    return layout;
}

void MotionValue::SetTarget(float target) noexcept {
    target_ = std::clamp(target, 0.0f, 1.0f);
}

void MotionValue::Snap(float value) noexcept {
    value_ = std::clamp(value, 0.0f, 1.0f);
    target_ = value_;
}

bool MotionValue::Step(float response) noexcept {
    response = std::clamp(response, 0.01f, 1.0f);
    const float delta = target_ - value_;
    if (std::fabs(delta) <= 0.003f) {
        value_ = target_;
        return false;
    }

    value_ += delta * response;
    return true;
}

bool MotionValue::Settled(float epsilon) const noexcept {
    return std::fabs(target_ - value_) <= epsilon;
}

} // namespace lunira::ui
