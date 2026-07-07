#!/bin/bash
# AgentKredit Demo Recording Script
# Opens each page in sequence with pauses for screen recording
# Usage: bash demo-video.sh

set -e

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
DIM="\033[2m"
RESET="\033[0m"

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$DEMO_DIR")"
PORT=8080

echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║     AgentKredit — Demo Recording Script      ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

# ─── Kill any existing server ───
pkill -f "serve.*$PORT" 2>/dev/null || true
sleep 0.5

# ─── Start server ───
echo -e "${CYAN}▶ Starting server on port $PORT...${RESET}"
setsid npx serve "$DEMO_DIR" -l "$PORT" --no-clipboard > /tmp/serve.log 2>&1 &
SERVER_PID=$!
sleep 2

# Verify server is up
if ! curl -s -o /dev/null -w "" http://localhost:$PORT/title-card.html 2>/dev/null; then
  echo -e "${CYAN}▶ Waiting for server...${RESET}"
  sleep 3
fi

echo -e "${GREEN}✓ Server running at http://localhost:$PORT${RESET}"
echo ""

# ─── Pages in order ───
PAGES=(
  "title-card.html"
  "farmable-graphic.html"
  "architecture-flow.html"
  "mock-explorer.html"
  "proof-terminal.html"
  "end-card.html"
)

DURATIONS=(
  5    # title card: 5s
  10   # farmable graphic: 10s
  13   # architecture flow: 13s
  22   # mock explorer: 22s (longest — has live terminal section)
  8    # proof terminal: 8s
  18   # end card: 18s
)

LABELS=(
  "Title Card"
  "Farmable Graphic"
  "Architecture Flow"
  "Mock Explorer + Live Flow"
  "Proof Terminal"
  "End Card"
)

TOTAL=0
for d in "${DURATIONS[@]}"; do
  TOTAL=$((TOTAL + d))
done

echo -e "${BOLD}Recording ${#PAGES[@]} pages (${TOTAL}s total)${RESET}"
echo -e "${DIM}Press Ctrl+C at any time to stop${RESET}"
echo ""

# ─── Countdown ───
echo -e "${BOLD}${CYAN}Recording starts in 3...${RESET}"
sleep 1
echo -e "${BOLD}${CYAN}2...${RESET}"
sleep 1
echo -e "${BOLD}${CYAN}1...${RESET}"
sleep 1
echo ""

# ─── Play each page ───
for i in "${!PAGES[@]}"; do
  PAGE="${PAGES[$i]}"
  DURATION="${DURATIONS[$i]}"
  LABEL="${LABELS[$i]}"
  URL="http://localhost:$PORT/$PAGE"

  echo -e "${BOLD}${GREEN}▶ [$((i+1))/${#PAGES[@]}] ${LABEL}${RESET}"
  echo -e "${DIM}   $URL${RESET}"
  echo -e "${DIM}   Duration: ${DURATION}s${RESET}"

  # Open in browser (works on Linux with xdg-open, macOS with open)
  if command -v xdg-open &>/dev/null; then
    xdg-open "$URL" 2>/dev/null
  elif command -v open &>/dev/null; then
    open "$URL"
  else
    echo -e "${DIM}   Open this URL manually: $URL${RESET}"
  fi

  # Wait for duration
  REMAINING=$DURATION
  while [ $REMAINING -gt 0 ]; do
    printf "\r${DIM}   ⏱  %02d:%02d remaining${RESET}  " $((REMAINING/60)) $((REMAINING%60))
    sleep 1
    REMAINING=$((REMAINING-1))
  done
  printf "\r${DIM}   ✓ Done${RESET}                  "
  echo ""
done

# ─── Run the live contract demo ───
echo ""
echo -e "${BOLD}${GREEN}▶ [LIVE] Contract Demo — Full Credit Flow${RESET}"
echo -e "${DIM}   Running on Hardhat local node...${RESET}"
echo ""

# Start Hardhat node in background
echo -e "${CYAN}▶ Starting Hardhat node...${RESET}"
cd "$PROJECT_DIR"
setsid npx hardhat node > /tmp/hardhat.log 2>&1 &
HH_PID=$!
sleep 3

# Run the demo script
echo -e "${CYAN}▶ Running demo-credit-flow.js...${RESET}"
echo ""
npx hardhat run scripts/demo-credit-flow.js --network localhost 2>&1
echo ""

# ─── Cleanup ───
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗"
echo "║         Recording Complete!                  ║"
echo "╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${DIM}Kill servers with: pkill -f 'serve.*$PORT' && kill $HH_PID${RESET}"
