#!/bin/bash

# Surf App Data Restore Script
# This script restores user data from a backup archive (both Surf and Surf-dev)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Surf App Data Restore Tool        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Usage: ./restore-data.sh <backup_file.tar.gz>${NC}"
    echo -e "${YELLOW}   Example: ./restore-data.sh surf_backup_20260112_120000.tar.gz${NC}"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

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
echo -e "${YELLOW}📦 Backup file: ${BACKUP_FILE}${NC}"
echo ""

# Check what's in the backup
echo -e "${BLUE}📋 Checking backup contents...${NC}"
BACKUP_CONTENTS=$(tar -tzf "$BACKUP_FILE" 2>/dev/null | head -20)
HAS_SURF_BACKUP=$(echo "$BACKUP_CONTENTS" | grep -q "^Surf/" && echo "true" || echo "false")
HAS_SURF_DEV_BACKUP=$(echo "$BACKUP_CONTENTS" | grep -q "^Surf-dev/" && echo "true" || echo "false")

echo ""
echo -e "${BLUE}ℹ️  Backup contains:${NC}"
[ "$HAS_SURF_BACKUP" = true ] && echo -e "${BLUE}   ✓ Surf (production data)${NC}"
[ "$HAS_SURF_DEV_BACKUP" = true ] && echo -e "${BLUE}   ✓ Surf-dev (development data)${NC}"
echo ""

# Check if directories already exist
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EXISTING_DIRS=""

if [ -d "$SURF_PATH" ] && [ "$HAS_SURF_BACKUP" = true ]; then
    EXISTING_DIRS="${EXISTING_DIRS}Surf "
fi
if [ -d "$SURF_DEV_PATH" ] && [ "$HAS_SURF_DEV_BACKUP" = true ]; then
    EXISTING_DIRS="${EXISTING_DIRS}Surf-dev "
fi

if [ -n "$EXISTING_DIRS" ]; then
    echo -e "${YELLOW}⚠️  Warning: Existing data found for: ${EXISTING_DIRS}${NC}"
    echo -e "${YELLOW}   Existing data will be backed up before restore.${NC}"
    echo ""
fi

read -p "Proceed with restore? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Restore cancelled.${NC}"
    exit 0
fi

echo ""

# Backup existing directories if they exist
if [ -d "$SURF_PATH" ] && [ "$HAS_SURF_BACKUP" = true ]; then
    EXISTING_BACKUP="${SURF_PATH}_backup_before_restore_${TIMESTAMP}"
    echo -e "${BLUE}⏳ Backing up existing Surf data...${NC}"
    mv "$SURF_PATH" "$EXISTING_BACKUP"
    echo -e "${GREEN}✅ Existing Surf data backed up to: ${EXISTING_BACKUP}${NC}"
fi

if [ -d "$SURF_DEV_PATH" ] && [ "$HAS_SURF_DEV_BACKUP" = true ]; then
    EXISTING_DEV_BACKUP="${SURF_DEV_PATH}_backup_before_restore_${TIMESTAMP}"
    echo -e "${BLUE}⏳ Backing up existing Surf-dev data...${NC}"
    mv "$SURF_DEV_PATH" "$EXISTING_DEV_BACKUP"
    echo -e "${GREEN}✅ Existing Surf-dev data backed up to: ${EXISTING_DEV_BACKUP}${NC}"
fi

echo ""
echo -e "${BLUE}⏳ Restoring data...${NC}"

# Create parent directory if it doesn't exist
mkdir -p "$PARENT_PATH"

# Extract backup
tar -xzf "$BACKUP_FILE" -C "$PARENT_PATH"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Restore completed successfully!${NC}"
    echo ""
    
    if [ "$HAS_SURF_BACKUP" = true ] && [ -d "$SURF_PATH" ]; then
        SURF_SIZE=$(du -sh "$SURF_PATH" 2>/dev/null | cut -f1)
        echo -e "${GREEN}📂 Surf restored: ${SURF_PATH} (${SURF_SIZE})${NC}"
    fi
    
    if [ "$HAS_SURF_DEV_BACKUP" = true ] && [ -d "$SURF_DEV_PATH" ]; then
        SURF_DEV_SIZE=$(du -sh "$SURF_DEV_PATH" 2>/dev/null | cut -f1)
        echo -e "${GREEN}📂 Surf-dev restored: ${SURF_DEV_PATH} (${SURF_DEV_SIZE})${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}ℹ️  You can now start the Surf app to access your data.${NC}"
    echo -e "${BLUE}   • yarn start   → uses Surf (production) data${NC}"
    echo -e "${BLUE}   • yarn dev     → uses Surf-dev (development) data${NC}"
else
    echo -e "${RED}❌ Restore failed!${NC}"
    exit 1
fi
