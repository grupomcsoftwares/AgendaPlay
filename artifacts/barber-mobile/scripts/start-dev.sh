#!/bin/bash
# Kill any process currently holding the target port, then start Expo.
PORT="${PORT:-23260}"

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

exec pnpm exec expo start --localhost --port "$PORT" --web
