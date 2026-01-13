#!/bin/bash

# Surf App Data Restore Script
# This script restores user data from a backup archive

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
        DATA_PATH="$HOME/Library/Application Support/Surf"
        PARENT_PATH="$HOME/Library/Application Support"
        OS_NAME="macOS"
        ;;
    Linux*)
        DATA_PATH="$HOME/.config/Surf"
        PARENT_PATH="$HOME/.config"
        OS_NAME="Linux"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        DATA_PATH="$APPDATA/Surf"
        PARENT_PATH="$APPDATA"
        OS_NAME="Windows"
        ;;
    *)
        echo -e "${RED}❌ Unsupported operating system${NC}"
        exit 1
        ;;
esac

echo -e "${YELLOW}📍 Detected OS: ${OS_NAME}${NC}"
echo -e "${YELLOW}📂 Restore location: ${DATA_PATH}${NC}"
echo -e "${YELLOW}📦 Backup file: ${BACKUP_FILE}${NC}"
echo ""

# Check if data directory already exists
if [ -d "$DATA_PATH" ]; then
    echo -e "${YELLOW}⚠️  Warning: Existing Surf data found!${NC}"
    echo -e "${YELLOW}   This will be backed up before restore.${NC}"
    echo ""
    
    read -p "Continue? This will replace existing data (y/n): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Restore cancelled.${NC}"
        exit 0
    fi
    
    # Backup existing data
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    EXISTING_BACKUP="${DATA_PATH}_backup_before_restore_${TIMESTAMP}"
    echo -e "${BLUE}⏳ Backing up existing data to: ${EXISTING_BACKUP}${NC}"
    mv "$DATA_PATH" "$EXISTING_BACKUP"
    echo -e "${GREEN}✅ Existing data backed up${NC}"
    echo ""
else
    read -p "Proceed with restore? (y/n): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Restore cancelled.${NC}"
        exit 0
    fi
fi

echo -e "${BLUE}⏳ Restoring data...${NC}"

# Create parent directory if it doesn't exist
mkdir -p "$PARENT_PATH"

# Extract backup
tar -xzf "$BACKUP_FILE" -C "$PARENT_PATH"

if [ $? -eq 0 ] && [ -d "$DATA_PATH" ]; then
    DATA_SIZE=$(du -sh "$DATA_PATH" 2>/dev/null | cut -f1)
    echo ""
    echo -e "${GREEN}✅ Restore completed successfully!${NC}"
    echo ""
    echo -e "${GREEN}📂 Restored to: ${DATA_PATH}${NC}"
    echo -e "${GREEN}📊 Data size: ${DATA_SIZE}${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  You can now start the Surf app to access your data.${NC}"
else
    echo -e "${RED}❌ Restore failed!${NC}"
    
    # Try to restore the backup if it exists
    if [ -d "$EXISTING_BACKUP" ]; then
        echo -e "${YELLOW}↩️  Restoring previous data...${NC}"
        mv "$EXISTING_BACKUP" "$DATA_PATH"
    fi
    exit 1
fi
