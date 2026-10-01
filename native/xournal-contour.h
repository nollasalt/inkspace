// Adapted from Xournal++ StrokeContour.cpp, GNU GPL v2 or later.
// Copyright Xournal++ contributors. See LICENSE and native/UPSTREAM.md.
// Only the solid-pressure contour is retained. Math/Point dependencies are
// replaced by equivalent standalone definitions; contour operations unchanged.
#pragma once
#include <cairo.h>
#include <cmath>
#include <limits>
#include <cassert>
#include <vector>
constexpr double M_PI=3.14159265358979323846;
constexpr double M_PI_2=M_PI/2;
#define xoj_assert assert
struct Point { double x,y,z; };
struct MathVect2 {
 double dx,dy;
 MathVect2(const Point& a,const Point& b):dx(b.x-a.x),dy(b.y-a.y){}
 double norm() const {return std::hypot(dx,dy);}
 double argument() const {return std::atan2(dy,dx);}
};
namespace xoj::view {
class StrokeContour {
 const std::vector<Point>& path;
 public:
 explicit StrokeContour(const std::vector<Point>& path);
 ~StrokeContour();
 void addToCairo(cairo_t* cr) const;
};
}
static_assert(std::numeric_limits<double>::is_iec559);  // Ensures atan2(0., 0.) does not error

/// Takes a double between -2*pi and 2*pi and returns the corresponding angle between -pi and pi
static constexpr double inMinusPiPiInterval(double t) {
    xoj_assert(t >= -2 * M_PI && t <= 2 * M_PI);
    return t > M_PI ? t - 2 * M_PI : t < -M_PI ? t + 2 * M_PI : t;
}

// Adds to cairo a segment corresponding to the cord of an arc obtained via cairo_arc() (with the same parameters)
static void drawChord(cairo_t* cr, double cx, double cy, double radius, double angle1, double angle2) {
    cairo_line_to(cr, cx + radius * std::cos(angle1), cy + radius * std::sin(angle1));
    cairo_line_to(cr, cx + radius * std::cos(angle2), cy + radius * std::sin(angle2));
}

static void hookAfter(cairo_t* cr, double x, double y, double r, double a, double b) {
    cairo_line_to(cr, x, y);
    cairo_arc(cr, x, y, r, a, b);
}
static void hookBefore(cairo_t* cr, double x, double y, double r, double a, double b) {
    cairo_arc(cr, x, y, r, a, b);
    cairo_line_to(cr, x, y);
}

struct ReturnOp {
    ReturnOp(void (*op)(cairo_t*, double, double, double, double, double), double x, double y, double r, double a,
             double b):
            op(op), x(x), y(y), r(r), a(a), b(b) {}
    void (*op)(cairo_t*, double, double, double, double, double);
    double x, y, r, a, b;

    void operator()(cairo_t* cr) { op(cr, x, y, r, a, b); }
};

xoj::view::StrokeContour::StrokeContour(const std::vector<Point>& path): path(path) {}
xoj::view::StrokeContour::~StrokeContour() = default;

static inline void drawCoupling(cairo_t* cr, std::vector<ReturnOp>& ops, const Point& p2, double n1, double n3,
                                double a1, double a3, double z1) {
    if (z1 < p2.z) {
        if (.5 * p2.z < n1  // Optimisation to avoid computing the std::hypot
            || .5 * p2.z <= std::hypot(.5 * z1, n1)) [[likely]] {
            double angleIn = std::asin(z1 / p2.z);
            double a = inMinusPiPiInterval(a1 + angleIn);
            double b = inMinusPiPiInterval(a3 - M_PI_2);
            auto* arcFun =
                    (inMinusPiPiInterval(a3 - a1) <= 0.0 || inMinusPiPiInterval(b - a) > 0.0) ? cairo_arc : drawChord;
            arcFun(cr, p2.x, p2.y, .5 * p2.z, a, b);

            double bp = inMinusPiPiInterval(a1 - angleIn);
            double ap = inMinusPiPiInterval(a3 + M_PI_2);
            auto* arcFunp =
                    (inMinusPiPiInterval(a3 - a1) >= 0.0 || inMinusPiPiInterval(bp - ap) > 0.0) ? cairo_arc : drawChord;
            ops.emplace_back(arcFunp, p2.x, p2.y, .5 * p2.z, ap, bp);
        } else {
            cairo_line_to(cr, p2.x, p2.y);
            cairo_arc(cr, p2.x, p2.y, .5 * p2.z, a1, a3 - M_PI_2);
            ops.emplace_back(hookBefore, p2.x, p2.y, .5 * p2.z, a3 + M_PI_2, a1);
        }
    } else {
        if (.5 * z1 < n3  // Optimisation to avoid computing the std::hypot
            || .5 * z1 <= std::hypot(.5 * p2.z, n3)) [[likely]] {
            double angleOut = std::asin(p2.z / z1);
            double a = inMinusPiPiInterval(a1 + M_PI_2);
            double b = inMinusPiPiInterval(a3 - angleOut);
            auto* arcFun =
                    (inMinusPiPiInterval(a3 - a1) <= 0.0 || inMinusPiPiInterval(b - a) > 0.0) ? cairo_arc : drawChord;
            arcFun(cr, p2.x, p2.y, .5 * z1, a, b);

            double bp = inMinusPiPiInterval(a1 - M_PI_2);
            double ap = inMinusPiPiInterval(a3 + angleOut);
            auto* arcFunp =
                    (inMinusPiPiInterval(a3 - a1) >= 0.0 || inMinusPiPiInterval(bp - ap) > 0.0) ? cairo_arc : drawChord;
            ops.emplace_back(arcFunp, p2.x, p2.y, .5 * z1, ap, bp);
        } else {
            cairo_arc(cr, p2.x, p2.y, .5 * z1, a1 + M_PI_2, a3);
            cairo_line_to(cr, p2.x, p2.y);
            ops.emplace_back(hookAfter, p2.x, p2.y, .5 * z1, a3, a1 - M_PI_2);
        }
    }
}

template <typename It>
static inline std::vector<ReturnOp> addSideToCairo(cairo_t* cr, It begin, It end) {
    std::vector<ReturnOp> ops;
    ops.reserve(static_cast<size_t>(std::distance(begin, end)));

    for (auto it1 = begin, it2 = it1 + 1, it3 = it2 + 1; it3 != end; it1++, it2++, it3++) {
        const auto& p1 = *it1;
        const auto& p2 = *it2;
        const auto& p3 = *it3;

        MathVect2 v1(p2, p1);
        MathVect2 v3(p2, p3);

        drawCoupling(cr, ops, p2, v1.norm(), v3.norm(), v1.argument(), v3.argument(), p1.z);
    }
    return ops;
}

template <bool forward>
static inline void contourStrokeEnd(cairo_t* cr, const Point& endPoint, const Point& adjacentPoint) {
    double a = MathVect2(endPoint, adjacentPoint).argument();
    cairo_arc(cr, endPoint.x, endPoint.y, .5 * (forward ? endPoint.z : adjacentPoint.z), a + M_PI_2, a - M_PI_2);
}

void xoj::view::StrokeContour::addToCairo(cairo_t* cr) const {
    xoj_assert(path.size() >= 2);
    contourStrokeEnd<true>(cr, path.front(), path[1]);
    // left side of the stroke
    auto ops = addSideToCairo(cr, path.begin(), path.end());

    // Second end of the stroke
    contourStrokeEnd<false>(cr, path.back(), path[path.size() - 2]);

    for (auto it = ops.rbegin(); it < ops.rend(); it++) {
        (*it)(cr);
    }

    cairo_close_path(cr);
}

