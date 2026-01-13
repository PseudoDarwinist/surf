#!/bin/bash

# Surf App Data Backup Script
# This script backs up all user data (notes, images, resources) from the Surf app

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
        DATA_PATH="$HOME/Library/Application Support/Surf"
        OS_NAME="macOS"
        ;;
    Linux*)
        DATA_PATH="$HOME/.config/Surf"
        OS_NAME="Linux"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        DATA_PATH="$APPDATA/Surf"
        OS_NAME="Windows"
        ;;
    *)
        echo -e "${RED}❌ Unsupported operating system${NC}"
        exit 1
        ;;
esac

echo -e "${YELLOW}📍 Detected OS: ${OS_NAME}${NC}"
echo -e "${YELLOW}📂 Data location: ${DATA_PATH}${NC}"
echo ""

# Check if data directory exists
if [ ! -d "$DATA_PATH" ]; then
    echo -e "${RED}❌ Surf data directory not found at: ${DATA_PATH}${NC}"
    echo -e "${YELLOW}   Make sure you have run the Surf app at least once.${NC}"
    exit 1
fi

# Calculate size
DATA_SIZE=$(du -sh "$DATA_PATH" 2>/dev/null | cut -f1)
echo -e "${BLUE}📊 Data size: ${DATA_SIZE}${NC}"

# Set default backup location
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEFAULT_BACKUP_NAME="surf_backup_${TIMESTAMP}.tar.gz"
BACKUP_DIR="${1:-$HOME/Desktop}"
BACKUP_PATH="${BACKUP_DIR}/${DEFAULT_BACKUP_NAME}"

echo ""
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

# Create backup (exclude socket files and other runtime files)
# COPYFILE_DISABLE=1 prevents macOS extended attribute warnings
COPYFILE_DISABLE=1 tar -czf "$BACKUP_PATH" \
    --exclude='*.sock' \
    --exclude='*.pid' \
    --exclude='*.lock' \
    --exclude='Cache' \
    --exclude='GPUCache' \
    --exclude='Crashpad' \
    -C "$(dirname "$DATA_PATH")" "$(basename "$DATA_PATH")"

if [ $? -eq 0 ]; then
    FINAL_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
    echo ""
    echo -e "${GREEN}✅ Backup completed successfully!${NC}"
    echo ""
    echo -e "${GREEN}📦 Backup file: ${BACKUP_PATH}${NC}"
    echo -e "${GREEN}📊 Compressed size: ${FINAL_SIZE}${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  To restore this backup on another machine:${NC}"
    echo -e "${BLUE}   1. Copy the backup file to the new machine${NC}"
    echo -e "${BLUE}   2. Run: ./restore-data.sh ${DEFAULT_BACKUP_NAME}${NC}"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi
