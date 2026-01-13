#!/bin/bash

# Surf App Data Backup Script
# This script backs up all user data (notes, images, resources) from both Surf and Surf-dev

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Surf App Data Backup Tool        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

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
TOTAL_SIZE="0"

if [ -d "$SURF_PATH" ]; then
    HAS_SURF=true
    SURF_SIZE=$(du -sh "$SURF_PATH" 2>/dev/null | cut -f1)
    echo -e "${BLUE}📂 Surf (production): ${SURF_PATH}${NC}"
    echo -e "${BLUE}   Size: ${SURF_SIZE}${NC}"
fi

if [ -d "$SURF_DEV_PATH" ]; then
    HAS_SURF_DEV=true
    SURF_DEV_SIZE=$(du -sh "$SURF_DEV_PATH" 2>/dev/null | cut -f1)
    echo -e "${BLUE}📂 Surf-dev (development): ${SURF_DEV_PATH}${NC}"
    echo -e "${BLUE}   Size: ${SURF_DEV_SIZE}${NC}"
fi

if [ "$HAS_SURF" = false ] && [ "$HAS_SURF_DEV" = false ]; then
    echo -e "${RED}❌ No Surf data directories found!${NC}"
    echo -e "${YELLOW}   Make sure you have run the Surf app at least once.${NC}"
    exit 1
fi

echo ""

# Set default backup location
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEFAULT_BACKUP_NAME="surf_backup_${TIMESTAMP}.tar.gz"
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

# Build the list of directories to backup
DIRS_TO_BACKUP=()
if [ "$HAS_SURF" = true ]; then
    DIRS_TO_BACKUP+=("Surf")
fi
if [ "$HAS_SURF_DEV" = true ]; then
    DIRS_TO_BACKUP+=("Surf-dev")
fi

# Create backup (exclude socket files and other runtime files)
# COPYFILE_DISABLE=1 prevents macOS extended attribute warnings
COPYFILE_DISABLE=1 tar -czf "$BACKUP_PATH" \
    --exclude='*.sock' \
    --exclude='*.pid' \
    --exclude='*.lock' \
    --exclude='Cache' \
    --exclude='GPUCache' \
    --exclude='Crashpad' \
    -C "$PARENT_PATH" "${DIRS_TO_BACKUP[@]}"

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
    echo ""
    echo -e "${BLUE}ℹ️  To restore this backup on another machine:${NC}"
    echo -e "${BLUE}   1. Copy the backup file to the new machine${NC}"
    echo -e "${BLUE}   2. Run: ./restore-data.sh ${DEFAULT_BACKUP_NAME}${NC}"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi
