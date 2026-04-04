#!/usr/bin/env bash
cd "$(dirname "$0")/frontend" || exit 1
exec python3 -m http.server 5175 --bind 127.0.0.1
