#!/usr/bin/env bash
# install.sh — DLNA Media Server macOS installation script
#
# Requirements: 9.1, 9.2
#
# This script must be run as root (sudo ./install.sh) because it:
#   - Creates a system user (_dlna) via dscl
#   - Writes to /opt, /etc, /var/log, /Library/LaunchDaemons
#
# Usage:
#   npm run build          # compile TypeScript first
#   sudo ./install.sh

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Colour helpers
# ──────────────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # no colour

info()    { echo -e "${GREEN}[install]${NC} $*"; }
warn()    { echo -e "${YELLOW}[install]${NC} $*"; }
error()   { echo -e "${RED}[install]${NC} $*" >&2; exit 1; }

# ──────────────────────────────────────────────────────────────────────────────
# Guards
# ──────────────────────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Darwin" ]] || error "This installer only runs on macOS."
[[ "$EUID" -eq 0 ]]             || error "Run this script with sudo: sudo ./install.sh"

# Verify compiled output exists
[[ -f "dist/index.js" ]] || error "dist/index.js not found. Run 'npm run build' first."

# ──────────────────────────────────────────────────────────────────────────────
# Resolve Node.js binary (Homebrew first, then system PATH)
# ──────────────────────────────────────────────────────────────────────────────
NODE_BIN=""
for candidate in \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$(command -v node 2>/dev/null || true)"; do
  if [[ -x "$candidate" ]]; then
    NODE_BIN="$candidate"
    break
  fi
done
[[ -n "$NODE_BIN" ]] || error "Node.js not found. Install via: brew install node"
info "Using Node.js: $NODE_BIN"

# ──────────────────────────────────────────────────────────────────────────────
# Directories
# ──────────────────────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/dlna-media-server"
CONFIG_DIR="/etc/dlna-media-server"
LOG_DIR="/var/log/dlna-media-server"
PLIST_SRC="deploy/com.dlna-media-server.plist"
PLIST_DEST="/Library/LaunchDaemons/com.dlna-media-server.plist"

# ──────────────────────────────────────────────────────────────────────────────
# 1. Create _dlna system user (if not already present)
# ──────────────────────────────────────────────────────────────────────────────
info "Creating _dlna system user…"
if dscl . -read /Users/_dlna > /dev/null 2>&1; then
  warn "_dlna user already exists — skipping creation"
else
  # Find a free UID in the 200–499 system-user range
  DLNA_UID=300
  while dscl . -search /Users UniqueID "$DLNA_UID" 2>/dev/null | grep -q UniqueID; do
    DLNA_UID=$(( DLNA_UID + 1 ))
  done
  DLNA_GID=$DLNA_UID

  # Create group
  dscl . -create /Groups/_dlna
  dscl . -create /Groups/_dlna PrimaryGroupID "$DLNA_GID"
  dscl . -create /Groups/_dlna RealName "DLNA Media Server"
  dscl . -create /Groups/_dlna Password "*"

  # Create user
  dscl . -create /Users/_dlna
  dscl . -create /Users/_dlna UniqueID "$DLNA_UID"
  dscl . -create /Users/_dlna PrimaryGroupID "$DLNA_GID"
  dscl . -create /Users/_dlna RealName "DLNA Media Server"
  dscl . -create /Users/_dlna UserShell /usr/bin/false
  dscl . -create /Users/_dlna NFSHomeDirectory /var/empty
  dscl . -create /Users/_dlna Password "*"

  info "_dlna user created (UID $DLNA_UID)"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 2. Copy application to /opt/dlna-media-server
# ──────────────────────────────────────────────────────────────────────────────
info "Copying application to $INSTALL_DIR…"
mkdir -p "$INSTALL_DIR"
cp -r dist             "$INSTALL_DIR/"
cp -r node_modules     "$INSTALL_DIR/"
cp    package.json     "$INSTALL_DIR/"

# Create a bin symlink pointing to the resolved Node.js binary
mkdir -p "$INSTALL_DIR/bin"
ln -sf "$NODE_BIN" "$INSTALL_DIR/bin/node"

chown -R _dlna:_dlna "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
info "Application installed to $INSTALL_DIR"

# ──────────────────────────────────────────────────────────────────────────────
# 3. Create config file (if not already present)
# ──────────────────────────────────────────────────────────────────────────────
info "Setting up configuration at $CONFIG_DIR…"
mkdir -p "$CONFIG_DIR"
if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  cat > "$CONFIG_DIR/config.json" <<'EOF'
{
  "friendlyName": "DLNA Media Server",
  "port": 8200,
  "mediaDirectories": [],
  "pin": "",
  "logLevel": "INFO"
}
EOF
  info "Default config written to $CONFIG_DIR/config.json"
  warn "Edit $CONFIG_DIR/config.json to add your media directories before starting the server."
else
  warn "Config already exists at $CONFIG_DIR/config.json — not overwriting"
fi
chown -R _dlna:_dlna "$CONFIG_DIR"

# ──────────────────────────────────────────────────────────────────────────────
# 4. Create log directory
# ──────────────────────────────────────────────────────────────────────────────
info "Creating log directory $LOG_DIR…"
mkdir -p "$LOG_DIR"
chown _dlna:_dlna "$LOG_DIR"
chmod 755 "$LOG_DIR"

# ──────────────────────────────────────────────────────────────────────────────
# 5. Install and load the launchd plist
# ──────────────────────────────────────────────────────────────────────────────
[[ -f "$PLIST_SRC" ]] || error "plist not found at $PLIST_SRC"

info "Installing launchd plist to $PLIST_DEST…"

# Unload first if already loaded (ignore errors)
launchctl unload "$PLIST_DEST" 2>/dev/null || true

cp "$PLIST_SRC" "$PLIST_DEST"
chown root:wheel "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

info "Loading service with launchctl…"
launchctl load "$PLIST_DEST"

# ──────────────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────────────
info ""
info "Installation complete!"
info "  Config:  $CONFIG_DIR/config.json"
info "  Logs:    $LOG_DIR/"
info "  Status:  launchctl list | grep dlna-media-server"
info "  Reload:  sudo launchctl kickstart -k system/com.dlna-media-server"
info ""
info "Edit $CONFIG_DIR/config.json to add your media directories, then restart:"
info "  sudo launchctl kickstart -k system/com.dlna-media-server"
