# Native ink provenance and rebuild

The desktop ink engine uses Windows WinPointer (`GetPointerPenInfoHistory`,
`GetPointerDeviceRects`, HIMETRIC coordinates), the solid pressure-contour
algorithm from Xournal++, and the actual Cairo image rasterizer. Electron is
retained for the surrounding UI, Markdown and PDF. It does not rasterize new
desktop ink geometry. This is a hybrid integration, not a complete GTK fork.

`xournal-contour.h` adapts the solid-contour portion of
`src/core/model/StrokeContour.cpp` from Xournal++ commit
`9882ffaaf2c012a1de4c33161eb4284468d84b9d` (GNU GPL v2 or later). The contour
operations are retained; Point/MathVect and assertions are standalone adapters.
Debug/dashed paths are omitted. `src/xournal-contour.js` translates the same
operations to SVG for PDF/SVG export and browser compatibility. Pressure-only
duplicates and width interpolation are handled before contour construction.
The original raw coordinates remain in the JSON document.

Windows coordinate mapping was checked against GTK 3's WinPointer backend
(`gdkdevicemanager-win32.c`, gtk-3-24 branch) and Microsoft WinPointer API docs.
The input bridge is independently written, and uses raw HIMETRIC pen positions
before converting physical pixels to CSS pixels. History is processed oldest
first. No device-independent smoothing or integer coordinate reconstruction is
applied. Legacy drivers without WinPointer events receive an explicit browser
fallback indication; they are not represented as verified high-resolution input.

Static dependencies:

- Cairo 1.18.4, official source archive SHA-256
  `445ed8208a6e4823de1226a74ca319d3600e83f6369f99b14265006599c32ccb`.
- Pixman 0.43.4, Cairo's pinned subproject archive SHA-256
  `a0624db90180c7ddb79fc7a9151093dc37c646d8c38d3f232f767cf64b85a226`.
- Node-API headers from Node.js v22.14.0, MIT licensed. Native functions are
  resolved from the host executable, using the stable Node-API ABI.

Licenses are in `desktop/native/licenses`. Xournal-derived code is covered by
the root GPL-2.0-or-later license. Cairo is used under LGPL-2.1; Pixman is under
its permissive license. The source distribution includes application/native
source and the original Cairo/Pixman source archives, so the native module can
be modified and relinked. It does not include unrelated user notes or research
files. Do not redistribute only the executable without the corresponding source
and license materials.

On Windows x64, install Node.js, Python (with pip), GCC/G++ and Ninja (MinGW).
Run `npm ci`, `npm run build:native`, `npm run build`, `npm test`,
`npm run test:native`, and `npm run test:desktop`. The native build downloads
hash-checked source archives only if absent, builds static libraries, and writes
`desktop/native/ink-native.node`. The runtime needs neither a compiler nor an
installed copy of Xournal++. The native build log is `artifacts/native-build.log`.

Hardware validation is separate from synthetic packet/calibration tests.
`samples` and `preciseSamples` in the native status report count actual Win32
packets. Zero counts in automated tests mean that no physical pen was tested.
