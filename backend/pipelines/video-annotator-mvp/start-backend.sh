#!/usr/bin/env bash
cd "$(dirname "$0")/backend" || exit 1
if [[ ! -d .venv ]]; then
  echo "No .venv found. Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
# shellcheck source=/dev/null
source .venv/bin/activate
exec uvicorn main:app --reload --host 127.0.0.1 --port 8100
