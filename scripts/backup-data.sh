#!/bin/bash

# Surf App Data Backup Script
# This script backs up all user data AND backend binaries needed to run the app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Surf App Complete Backup Tool      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Get the script's directory to find the project
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="${PROJECT_DIR}/app/resources/bin"

# Detect OS and set data path
case "$(uname -s)" in
    Darwin*)
        PARENT_PATH="$HOME/Library/Application Support"
        OS_NAME="macOS"
        ;;
    Linux*)
        PARENT_PATH="$HOME/.config"
        OS_NAME="Linux"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        PARENT_PATH="$APPDATA"
        OS_NAME="Windows"
        ;;
    *)
        echo -e "${RED}❌ Unsupported operating system${NC}"
        exit 1
        ;;
esac

SURF_PATH="${PARENT_PATH}/Surf"
SURF_DEV_PATH="${PARENT_PATH}/Surf-dev"

echo -e "${YELLOW}📍 Detected OS: ${OS_NAME}${NC}"
echo ""

# Check what data exists
HAS_SURF=false
HAS_SURF_DEV=false
HAS_BINARIES=false

echo -e "${BLUE}📋 Checking available data...${NC}"
echo ""

# Check user data
if [ -d "$SURF_PATH" ]; then
    HAS_SURF=true
    SURF_SIZE=$(du -sh "$SURF_PATH" 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓ Surf (production): ${SURF_SIZE}${NC}"
fi

if [ -d "$SURF_DEV_PATH" ]; then
    HAS_SURF_DEV=true
    SURF_DEV_SIZE=$(du -sh "$SURF_DEV_PATH" 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓ Surf-dev (development): ${SURF_DEV_SIZE}${NC}"
fi

# Check backend binaries
if [ -d "$BIN_DIR" ] && [ "$(ls -A "$BIN_DIR" 2>/dev/null)" ]; then
    HAS_BINARIES=true
    BIN_SIZE=$(du -sh "$BIN_DIR" 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓ Backend binaries: ${BIN_SIZE}${NC}"
else
    echo -e "${YELLOW}⚠ Backend binaries not found at: ${BIN_DIR}${NC}"
fi

if [ "$HAS_SURF" = false ] && [ "$HAS_SURF_DEV" = false ]; then
    echo -e "${RED}❌ No Surf data directories found!${NC}"
    echo -e "${YELLOW}   Make sure you have run the Surf app at least once.${NC}"
    exit 1
fi

echo ""

# Set default backup location
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEFAULT_BACKUP_NAME="surf_complete_backup_${TIMESTAMP}.tar.gz"
BACKUP_DIR="${1:-$HOME/Desktop}"
BACKUP_PATH="${BACKUP_DIR}/${DEFAULT_BACKUP_NAME}"

echo -e "${YELLOW}💾 Backup will be saved to: ${BACKUP_PATH}${NC}"
echo ""

# Confirm with user
read -p "Proceed with backup? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Backup cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}⏳ Creating backup...${NC}"

# Create a temporary directory for organizing the backup
TEMP_BACKUP_DIR=$(mktemp -d)
mkdir -p "${TEMP_BACKUP_DIR}/user_data"
mkdir -p "${TEMP_BACKUP_DIR}/binaries"

# Copy user data
if [ "$HAS_SURF" = true ]; then
    echo -e "${BLUE}   Copying Surf data...${NC}"
    cp -R "$SURF_PATH" "${TEMP_BACKUP_DIR}/user_data/"
fi

if [ "$HAS_SURF_DEV" = true ]; then
    echo -e "${BLUE}   Copying Surf-dev data...${NC}"
    cp -R "$SURF_DEV_PATH" "${TEMP_BACKUP_DIR}/user_data/"
fi

# Copy binaries
if [ "$HAS_BINARIES" = true ]; then
    echo -e "${BLUE}   Copying backend binaries...${NC}"
    cp -R "$BIN_DIR"/* "${TEMP_BACKUP_DIR}/binaries/"
fi

# Create the backup archive (exclude socket files and other runtime files)
echo -e "${BLUE}   Compressing...${NC}"
COPYFILE_DISABLE=1 tar -czf "$BACKUP_PATH" \
    --exclude='*.sock' \
    --exclude='*.pid' \
    --exclude='*.lock' \
    --exclude='Cache' \
    --exclude='GPUCache' \
    --exclude='Crashpad' \
    -C "$TEMP_BACKUP_DIR" .

# Cleanup temp directory
rm -rf "$TEMP_BACKUP_DIR"

if [ $? -eq 0 ]; then
    FINAL_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
    echo ""
    echo -e "${GREEN}✅ Backup completed successfully!${NC}"
    echo ""
    echo -e "${GREEN}📦 Backup file: ${BACKUP_PATH}${NC}"
    echo -e "${GREEN}📊 Compressed size: ${FINAL_SIZE}${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  Contents:${NC}"
    [ "$HAS_SURF" = true ] && echo -e "${BLUE}   ✓ Surf (production data)${NC}"
    [ "$HAS_SURF_DEV" = true ] && echo -e "${BLUE}   ✓ Surf-dev (development data)${NC}"
    [ "$HAS_BINARIES" = true ] && echo -e "${BLUE}   ✓ Backend binaries (required to run)${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  To restore on another machine:${NC}"
    echo -e "${BLUE}   1. Clone the repo: git clone <repo-url>${NC}"
    echo -e "${BLUE}   2. Copy this backup file to the new machine${NC}"
    echo -e "${BLUE}   3. Run: ./scripts/restore-data.sh <path-to-backup>${NC}"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    rm -rf "$TEMP_BACKUP_DIR"
    exit 1
fi
