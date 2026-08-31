#!/usr/bin/env bash
#
# Digital Partner — single entry point.
#
#   ./digital-partner.sh          launch the app (builds on first run)
#   ./digital-partner.sh --dev    launch with hot reload (for development)
#   ./digital-partner.sh --restart  replace a running instance
#   ./digital-partner.sh --setup  (re)install dependencies only
#
# Everything the app needs — Python environment, Node packages, the renderer
# build, the background engine — is prepared here. There is nothing else to
# start by hand.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT/apps/desktop"
VENV="$ROOT/.venv"

# Product identity. The engine underneath keeps its own name; everything the
# user sees comes from here (mirrors apps/desktop/src/brand.ts).
BRAND_NAME="${PARTNER_BRAND_NAME:-Partner}"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
say()  { printf '%s\n' "${DIM}·${RESET} $*"; }
step() { printf '%s\n' "${BOLD}$*${RESET}"; }
fail() { printf '%s\n' "✗ $*" >&2; exit 1; }

# Electron is a real GUI binary, but some hosts (VS Code's integrated terminal,
# some IDE shells) export ELECTRON_RUN_AS_NODE=1, which turns it into a plain
# Node process — the app then dies with "does not provide an export named
# 'BrowserWindow'". Scrub those before anything launches.
unset ELECTRON_RUN_AS_NODE ELECTRON_NO_ATTACH_CONSOLE

# Run THIS checkout's engine, not whatever copy the installer left in
# ~/.hermes/hermes-agent. Without this the desktop resolves the installed
# runtime and every backend change in this repo is dead code — a provider
# added here, a config section added here, simply never runs. The venv beside
# this script is the one ensure_python prepared.
export HERMES_DESKTOP_HERMES_ROOT="$ROOT"

MODE="run"
REBUILT=0
FORCE_RESTART=0
for arg in "$@"; do
  case "$arg" in
    --dev)   MODE="dev" ;;
    --setup) MODE="setup" ;;
    --restart) FORCE_RESTART=1 ;;
    -h|--help)
      sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) fail "Unknown option: $arg (try --help)" ;;
  esac
done

# ── Python environment ─────────────────────────────────────────────────────
ensure_python() {
  if [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c 'import dotenv, fastapi' 2>/dev/null; then
    return
  fi

  step "Preparing the Python environment"

  local uv
  uv="$(command -v uv || true)"
  [ -n "$uv" ] || uv="$HOME/.hermes/bin/uv"
  [ -x "$uv" ] || fail "uv is required to build the environment but was not found.
  Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"

  (cd "$ROOT" && "$uv" sync) || fail "Could not build the Python environment."
}

# ── Node packages ──────────────────────────────────────────────────────────
ensure_node() {
  command -v npm >/dev/null 2>&1 || fail "Node.js and npm are required. Install Node 22+ and try again."

  if [ -d "$ROOT/node_modules" ] && [ -d "$APP_DIR/node_modules" ]; then
    return
  fi

  step "Installing packages (first run only, this takes a few minutes)"
  (cd "$ROOT" && npm install) || fail "Package installation failed."
}

# ── Renderer build (skipped in --dev, which serves from memory) ────────────
#
# Rebuilds when the build is missing OR stale. A mtime check matters: without
# it an edited source silently keeps serving the previous bundle, and the app
# looks unchanged for reasons that have nothing to do with the code.
ensure_build() {
  local stamp="$APP_DIR/dist/index.html"

  if [ -f "$APP_DIR/dist/electron-main.mjs" ] && [ -f "$stamp" ]; then
    local newer
    newer="$(find "$APP_DIR/src" "$APP_DIR/electron" "$APP_DIR/index.html" "$APP_DIR/package.json" \
      -newer "$stamp" -print -quit 2>/dev/null)"

    if [ -z "$newer" ]; then
      return
    fi

    say "Sources changed since the last build — rebuilding"
  fi

  step "Building $BRAND_NAME"
  (cd "$APP_DIR" && npm run build) || fail "Build failed."
  REBUILT=1
}

ensure_python
ensure_node

case "$MODE" in
  setup)
    ensure_build
    step "$BRAND_NAME is ready. Start it with:  ./digital-partner.sh"
    ;;
  dev)
    say "Starting $BRAND_NAME with hot reload"
    cd "$APP_DIR"
    exec npm run dev
    ;;
  run)
    ensure_build

    # The app holds a single-instance lock: launching again only FOCUSES the
    # window that is already open. That window is running the bundle it started
    # with, so after a rebuild it would keep showing the old UI no matter how
    # many times this script is run — the failure looks like "my changes did
    # nothing". Replace it instead.
    running="$(pgrep -f "$APP_DIR/node_modules/electron/dist/electron \." 2>/dev/null | head -1 || true)"

    if [ -n "$running" ] && { [ "$REBUILT" = "1" ] || [ "$FORCE_RESTART" = "1" ]; }; then
      say "Replacing the running instance (it is on the previous build)"

      # Ask it to quit, then WAIT for the process to actually go. A hard kill
      # orphans the background engine it owns, and the replacement then tries
      # to reach a port nobody is listening on (ECONNREFUSED) before recovering.
      pkill -TERM -f "$APP_DIR/node_modules/electron/dist/electron \." 2>/dev/null || true

      for _ in $(seq 1 30); do
        pgrep -f "$APP_DIR/node_modules/electron/dist/electron \." >/dev/null 2>&1 || break
        sleep 0.5
      done

      if pgrep -f "$APP_DIR/node_modules/electron/dist/electron \." >/dev/null 2>&1; then
        say "It did not exit cleanly — forcing it"
        pkill -KILL -f "$APP_DIR/node_modules/electron/dist/electron \." 2>/dev/null || true
        sleep 1
      fi

      # Reap any engine left behind by a shell whose owner is already gone.
      for pid in $(pgrep -f "hermes_cli.main serve" 2>/dev/null); do
        if ! kill -0 "$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" 2>/dev/null; then
          kill -TERM "$pid" 2>/dev/null || true
        fi
      done
    elif [ -n "$running" ]; then
      # The app holds a single-instance lock, so this launch hands off to the
      # window that is already open and exits. Say that, and only that —
      # printing "Starting" underneath it read as a second instance booting.
      say "$BRAND_NAME is already running — bringing it to the front."
      say "Use --restart to reload it with the current build."
      cd "$APP_DIR"
      exec npx electron .
    fi

    say "Starting $BRAND_NAME"
    cd "$APP_DIR"
    exec npx electron .
    ;;
esac
