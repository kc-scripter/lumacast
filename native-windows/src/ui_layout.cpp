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
        Tokens::Sidebar + Tokens::Outer,
        Tokens::Outer,
        width - Tokens::Outer,
        height - Tokens::Outer);

    const float contentWidth = Width(layout.content);
    const float formWidth = std::clamp(contentWidth * 0.35f, 360.0f, 430.0f);
    const float topHeight = std::clamp(
        Height(layout.content) * 0.47f,
        300.0f,
        360.0f);

    layout.hero = Rect(
        layout.content.left,
        layout.content.top,
        layout.content.right - formWidth - Tokens::Gap,
        layout.content.top + topHeight);

    layout.form = Rect(
        layout.hero.right + Tokens::Gap,
        layout.content.top,
        layout.content.right,
        layout.content.top + topHeight);

    layout.preview = Rect(
        layout.content.left,
        layout.content.top + topHeight + Tokens::Gap,
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
        layout.screen = Rect(
            Tokens::Sidebar + 16.0f,
            16.0f,
            width - 16.0f,
            height - 16.0f);
        return layout;
    }

    const float left = Tokens::Sidebar + Tokens::Outer;
    const float right = width - Tokens::Outer;
    const float top = Tokens::Outer;
    const float bottom = height - Tokens::Outer;

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

    const float expanded = hasCameras
        ? Tokens::CameraExpanded
        : 78.0f;
    const float cameraHeight = Lerp(
        Tokens::CameraCollapsed,
        expanded,
        cameraReveal);

    layout.cameras = Rect(
        left,
        layout.controls.top - Tokens::Gap - cameraHeight,
        right,
        layout.controls.top - Tokens::Gap);

    layout.screen = Rect(
        left,
        layout.header.bottom + 12.0f,
        right,
        layout.cameras.top - 12.0f);

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
