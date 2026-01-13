#!/bin/bash

# Surf App Data Restore Script
# This script restores user data AND backend binaries from a complete backup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Surf App Complete Restore Tool      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Usage: ./restore-data.sh <backup_file.tar.gz>${NC}"
    echo -e "${YELLOW}   Example: ./restore-data.sh ~/Desktop/surf_complete_backup_20260113.tar.gz${NC}"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

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
echo -e "${YELLOW}📦 Backup file: ${BACKUP_FILE}${NC}"
echo ""

# Check what's in the backup
echo -e "${BLUE}📋 Checking backup contents...${NC}"
BACKUP_CONTENTS=$(tar -tzf "$BACKUP_FILE" 2>/dev/null | head -50)

HAS_USER_DATA=$(echo "$BACKUP_CONTENTS" | grep -q "^./user_data/" && echo "true" || echo "false")
HAS_BINARIES=$(echo "$BACKUP_CONTENTS" | grep -q "^./binaries/" && echo "true" || echo "false")

# Also check for legacy format (direct Surf/ folder)
HAS_LEGACY_SURF=$(echo "$BACKUP_CONTENTS" | grep -q "^Surf/" && echo "true" || echo "false")
HAS_LEGACY_SURF_DEV=$(echo "$BACKUP_CONTENTS" | grep -q "^Surf-dev/" && echo "true" || echo "false")

IS_LEGACY_BACKUP=false
if [ "$HAS_LEGACY_SURF" = true ] || [ "$HAS_LEGACY_SURF_DEV" = true ]; then
    IS_LEGACY_BACKUP=true
fi

echo ""
echo -e "${BLUE}ℹ️  Backup contains:${NC}"
if [ "$IS_LEGACY_BACKUP" = true ]; then
    echo -e "${YELLOW}   (Legacy backup format detected)${NC}"
    [ "$HAS_LEGACY_SURF" = true ] && echo -e "${BLUE}   ✓ Surf (production data)${NC}"
    [ "$HAS_LEGACY_SURF_DEV" = true ] && echo -e "${BLUE}   ✓ Surf-dev (development data)${NC}"
else
    [ "$HAS_USER_DATA" = true ] && echo -e "${BLUE}   ✓ User data (notebooks, images, etc.)${NC}"
    [ "$HAS_BINARIES" = true ] && echo -e "${BLUE}   ✓ Backend binaries${NC}"
fi
echo ""

# Confirm restore
read -p "Proceed with restore? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Restore cancelled.${NC}"
    exit 0
fi

echo ""

# Create temp directory for extraction
TEMP_EXTRACT_DIR=$(mktemp -d)
echo -e "${BLUE}⏳ Extracting backup...${NC}"
tar -xzf "$BACKUP_FILE" -C "$TEMP_EXTRACT_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

if [ "$IS_LEGACY_BACKUP" = true ]; then
    # Handle legacy backup format
    echo -e "${BLUE}⏳ Restoring from legacy backup format...${NC}"
    
    if [ "$HAS_LEGACY_SURF" = true ]; then
        if [ -d "$SURF_PATH" ]; then
            EXISTING_BACKUP="${SURF_PATH}_backup_${TIMESTAMP}"
            echo -e "${YELLOW}   Backing up existing Surf to: ${EXISTING_BACKUP}${NC}"
            mv "$SURF_PATH" "$EXISTING_BACKUP"
        fi
        mkdir -p "$PARENT_PATH"
        mv "${TEMP_EXTRACT_DIR}/Surf" "$SURF_PATH"
        echo -e "${GREEN}   ✓ Restored Surf data${NC}"
    fi
    
    if [ "$HAS_LEGACY_SURF_DEV" = true ]; then
        if [ -d "$SURF_DEV_PATH" ]; then
            EXISTING_BACKUP="${SURF_DEV_PATH}_backup_${TIMESTAMP}"
            echo -e "${YELLOW}   Backing up existing Surf-dev to: ${EXISTING_BACKUP}${NC}"
            mv "$SURF_DEV_PATH" "$EXISTING_BACKUP"
        fi
        mkdir -p "$PARENT_PATH"
        mv "${TEMP_EXTRACT_DIR}/Surf-dev" "$SURF_DEV_PATH"
        echo -e "${GREEN}   ✓ Restored Surf-dev data${NC}"
    fi
else
    # Handle new backup format
    
    # Restore user data
    if [ "$HAS_USER_DATA" = true ]; then
        echo -e "${BLUE}⏳ Restoring user data...${NC}"
        
        if [ -d "${TEMP_EXTRACT_DIR}/user_data/Surf" ]; then
            if [ -d "$SURF_PATH" ]; then
                EXISTING_BACKUP="${SURF_PATH}_backup_${TIMESTAMP}"
                echo -e "${YELLOW}   Backing up existing Surf to: ${EXISTING_BACKUP}${NC}"
                mv "$SURF_PATH" "$EXISTING_BACKUP"
            fi
            mkdir -p "$PARENT_PATH"
            mv "${TEMP_EXTRACT_DIR}/user_data/Surf" "$SURF_PATH"
            echo -e "${GREEN}   ✓ Restored Surf data${NC}"
        fi
        
        if [ -d "${TEMP_EXTRACT_DIR}/user_data/Surf-dev" ]; then
            if [ -d "$SURF_DEV_PATH" ]; then
                EXISTING_BACKUP="${SURF_DEV_PATH}_backup_${TIMESTAMP}"
                echo -e "${YELLOW}   Backing up existing Surf-dev to: ${EXISTING_BACKUP}${NC}"
                mv "$SURF_DEV_PATH" "$EXISTING_BACKUP"
            fi
            mkdir -p "$PARENT_PATH"
            mv "${TEMP_EXTRACT_DIR}/user_data/Surf-dev" "$SURF_DEV_PATH"
            echo -e "${GREEN}   ✓ Restored Surf-dev data${NC}"
        fi
    fi
    
    # Restore binaries
    if [ "$HAS_BINARIES" = true ]; then
        echo -e "${BLUE}⏳ Restoring backend binaries...${NC}"
        mkdir -p "$BIN_DIR"
        cp -R "${TEMP_EXTRACT_DIR}/binaries/"* "$BIN_DIR/"
        chmod +x "$BIN_DIR"/*
        echo -e "${GREEN}   ✓ Restored backend binaries to: ${BIN_DIR}${NC}"
    fi
fi

# Cleanup
rm -rf "$TEMP_EXTRACT_DIR"

echo ""
echo -e "${GREEN}✅ Restore completed successfully!${NC}"
echo ""

# Show what was restored
if [ -d "$SURF_PATH" ]; then
    SURF_SIZE=$(du -sh "$SURF_PATH" 2>/dev/null | cut -f1)
    echo -e "${GREEN}📂 Surf: ${SURF_PATH} (${SURF_SIZE})${NC}"
fi

if [ -d "$SURF_DEV_PATH" ]; then
    SURF_DEV_SIZE=$(du -sh "$SURF_DEV_PATH" 2>/dev/null | cut -f1)
    echo -e "${GREEN}📂 Surf-dev: ${SURF_DEV_PATH} (${SURF_DEV_SIZE})${NC}"
fi

if [ -d "$BIN_DIR" ] && [ "$(ls -A "$BIN_DIR" 2>/dev/null)" ]; then
    echo -e "${GREEN}📂 Binaries: ${BIN_DIR}${NC}"
fi

echo ""
echo -e "${BLUE}ℹ️  Next steps:${NC}"
echo -e "${BLUE}   1. Run: cd app && yarn install${NC}"
echo -e "${BLUE}   2. Start the app:${NC}"
echo -e "${BLUE}      • yarn start  → uses Surf (production) data${NC}"
echo -e "${BLUE}      • yarn dev    → uses Surf-dev (development) data${NC}"
