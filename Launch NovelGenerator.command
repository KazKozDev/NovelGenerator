#!/bin/bash

# NovelGenerator v4.2 Launcher
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
export BROWSERSLIST_IGNORE_OLD_DATA=true

# Colors
RESET='\033[0m'
DIM='\033[2m'
SLATE='\033[38;5;110m'
MUTED='\033[38;5;244m'
TEXT='\033[38;5;252m'
WARN='\033[38;5;179m'
ERR='\033[38;5;203m'

# Reset terminal state, clear scrollback buffer, and position cursor at top-left (Row 1, Col 1)
printf '\033c\033]50;ClearScrollback\a\033[2J\033[3J\033[H'

echo ""
echo ""
printf "%b" "${SLATE}"
cat <<'LOGO'
                ███╗   ██╗ ██████╗ ██╗   ██╗███████╗██╗     
                ████╗  ██║██╔═══██╗██║   ██║██╔════╝██║     
                ██╔██╗ ██║██║   ██║██║   ██║█████╗  ██║     
                ██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══╝  ██║     
                ██║ ╚████║╚██████╔╝ ╚████╔╝ ███████╗███████╗
                ╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚══════╝╚══════╝

 ██████╗ ███████╗███╗   ██╗███████╗██████╗  █████╗ ████████╗ ██████╗ ██████╗ 
██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗
██║  ███╗█████╗  ██╔██╗ ██║█████╗  ██████╔╝███████║   ██║   ██║   ██║██████╔╝
██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ██╔══██╗██╔══██║   ██║   ██║   ██║██╔══██╗
╚██████╔╝███████╗██║ ╚████║███████╗██║  ██║██║  ██║   ██║   ╚██████╔╝██║  ██║
 ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝
LOGO
printf "%b" "${RESET}"
echo -e "  ${MUTED}v4.2          A finished story before your coffee gets cold${RESET}"
echo ""
echo ""
echo ""

# Check if npm is installed
if [ ! -f "$NPM_PATH" ]; then
    echo -e "${ERR}error:${RESET} npm is not installed"
    echo -e "${MUTED}Please install Node.js from https://nodejs.org/${RESET}"
    echo ""
    read -n 1 -s -r -p "Press any key to exit..."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${MUTED}Installing dependencies...${RESET}"
    "$NPM_PATH" install
    if [ $? -ne 0 ]; then
        echo -e "${ERR}error:${RESET} Failed to install dependencies"
        read -n 1 -s -r -p "Press any key to exit..."
        exit 1
    fi
fi

# Check for .env file
if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
    echo -e "${WARN}notice:${RESET} No .env file found (API_KEY may be required)"
fi

# Kill any existing processes on ports 3000-3010
for port in {3000..3010}; do
    lsof -ti:$port | xargs kill -9 2>/dev/null
done

# Create log file
LOG_FILE="/tmp/novelgenerator-vite.log"
> "$LOG_FILE"

# Start the development server using direct node call
# We need to use the vite JS file directly, not the shell wrapper
"$NODE_BIN" node_modules/vite/bin/vite.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
sleep 4

# Check if server started successfully
if ! ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${ERR}error:${RESET} Failed to start server"
    echo -e "${MUTED}Log:${RESET}"
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
if command -v open &> /dev/null; then
    open "$SERVER_URL" 2>/dev/null || \
    open -a Safari "$SERVER_URL" 2>/dev/null || \
    open -a "Google Chrome" "$SERVER_URL" 2>/dev/null
fi

echo -e "  ${SLATE}Local:${RESET}   ${TEXT}${SERVER_URL}${RESET}"
echo -e "  ${MUTED}Logs:${RESET}    ${MUTED}${LOG_FILE}${RESET}"
echo -e "  ${MUTED}Stop:${RESET}    ${MUTED}Press Ctrl+C${RESET}"
echo ""
echo -e "  ${MUTED}──────────────────────────────────────────────────────────────────────────${RESET}"
echo -e "  ${SLATE}Live Activity Log${RESET}"
echo -e "  ${MUTED}Time     │ Level   │ Agent              Message${RESET}"
echo -e "  ${MUTED}──────────────────────────────────────────────────────────────────────────${RESET}"

# Stream logs in real-time to this terminal window
tail -n 0 -f "$LOG_FILE" 2>/dev/null | grep --line-buffered -v "baseline-browser-mapping" &
TAIL_PID=$!

# Clean up processes on exit or Ctrl+C
cleanup() {
    echo ""
    echo -e "${MUTED}Stopping server...${RESET}"
    kill $SERVER_PID 2>/dev/null
    kill $TAIL_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM EXIT

# Keep the server running
wait $SERVER_PID

