#!/bin/bash

# NovelGenerator v4.0 Launcher
# Double-click this file to start the application

# Change to the script's directory
cd "$(dirname "$0")"

# Add common Node.js paths to PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"

# Try to source nvm if it exists
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

# Find npm and node explicitly
NPM_PATH=$(which npm 2>/dev/null || echo "/usr/local/bin/npm")
NODE_BIN=$(which node 2>/dev/null || echo "/usr/local/bin/node")

# Make sure node is in PATH for npm scripts
export NODE_PATH="$NODE_BIN"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear

echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║                                        ║"
echo "║     NovelGenerator v4.0 Launcher       ║"
echo "║                                        ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if npm is installed
if [ ! -f "$NPM_PATH" ]; then
    echo -e "${RED}❌ Error: npm is not installed!${NC}"
    echo -e "${YELLOW}Please install Node.js from https://nodejs.org/${NC}"
    echo ""
    read -n 1 -s -r -p "Press any key to exit..."
    exit 1
fi

echo -e "${GREEN}✓ Node.js found: $NODE_BIN${NC}"
echo -e "${GREEN}✓ npm found: $NPM_PATH${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚙️  Installing dependencies (first time only)...${NC}"
    "$NPM_PATH" install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        read -n 1 -s -r -p "Press any key to exit..."
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies ready${NC}"
fi

# Check for .env file
if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  Warning: No .env file found${NC}"
    echo -e "${YELLOW}   Create .env with: API_KEY=your_gemini_api_key${NC}"
    echo ""
fi

echo ""
echo -e "${BLUE}🚀 Starting NovelGenerator...${NC}"
echo ""

# Kill any existing processes on ports 3000-3010
for port in {3000..3010}; do
    lsof -ti:$port | xargs kill -9 2>/dev/null
done

# Create log file
LOG_FILE="/tmp/novelgenerator-vite.log"
> "$LOG_FILE"

# Start the development server using direct node call
# We need to use the vite JS file directly, not the shell wrapper
/usr/local/bin/node node_modules/vite/bin/vite.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo -e "${CYAN}⏳ Waiting for server to start...${NC}"
sleep 4

# Check if server started successfully
if ! ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${RED}❌ Failed to start server${NC}"
    echo -e "${RED}Log:${NC}"
    cat "$LOG_FILE"
    read -n 1 -s -r -p "Press any key to exit..."
    exit 1
fi

# Extract URL from log
SERVER_URL=$(grep -o "http://localhost:[0-9]*" "$LOG_FILE" | head -1)
if [ -z "$SERVER_URL" ]; then
    SERVER_URL="http://localhost:3000"
fi

# Open browser
echo -e "${GREEN}✓ Server started successfully${NC}"
echo -e "${BLUE}🌐 Opening browser at $SERVER_URL${NC}"

# Try to open in different browsers (priority order)
if command -v open &> /dev/null; then
    # macOS
    open "$SERVER_URL" 2>/dev/null || \
    open -a Safari "$SERVER_URL" 2>/dev/null || \
    open -a "Google Chrome" "$SERVER_URL" 2>/dev/null
fi

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                        ║${NC}"
echo -e "${GREEN}║   ✓ NovelGenerator is running!        ║${NC}"
echo -e "${GREEN}║                                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📍 URL: ${BLUE}$SERVER_URL${NC}"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo -e "   • The browser should open automatically"
echo -e "   • If not, open: ${BLUE}$SERVER_URL${NC}"
echo -e "   • Press ${RED}Ctrl+C${NC} to stop the server"
echo -e "   • You can close this window after the browser opens"
echo -e "   • Log file: ${BLUE}$LOG_FILE${NC}"
echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

# Keep the server running
wait $SERVER_PID
