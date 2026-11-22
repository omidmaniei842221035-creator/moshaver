#!/bin/sh
# macOS / Linux launcher
D="$(cd "$(dirname "$0")" && pwd)"
if command -v open >/dev/null 2>&1; then open "$D/index.html"; else xdg-open "$D/index.html"; fi
