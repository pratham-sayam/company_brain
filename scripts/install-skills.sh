#!/bin/bash
set -e

echo "=== Orvyn Skills Installer ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

TEMP_DIR=$(mktemp -d)
AGENT_SKILLS=".agent/skills"
CLAUDE_SKILLS=".claude/skills"

# --- Antigravity Awesome Skills ---
echo -e "${GREEN}[1/3] Installing Antigravity skills...${NC}"
git clone --depth 1 https://github.com/sickn33/antigravity-awesome-skills.git "$TEMP_DIR/ag-skills" 2>/dev/null

mkdir -p "$AGENT_SKILLS"

# List of skills to install (verified against actual repo folder names)
SKILLS=(
  # Tier 1 — Daily drivers
  "senior-fullstack"
  "frontend-developer"
  "backend-dev-guidelines"
  "python-pro"
  "fastapi-pro"
  "systematic-debugging"
  "test-driven-development"

  # Tier 2 — Current UI phase
  "react-patterns"
  "cc-skill-security-review"

  # Tier 3 — Architecture & Performance
  "architecture"
  "performance-profiling"
)

INSTALLED=0
SKIPPED=0

for skill in "${SKILLS[@]}"; do
  if [ -d "$TEMP_DIR/ag-skills/skills/$skill" ]; then
    cp -r "$TEMP_DIR/ag-skills/skills/$skill" "$AGENT_SKILLS/"
    echo -e "  ${GREEN}✓${NC} $skill"
    ((INSTALLED++))
  else
    echo -e "  ${YELLOW}⚠ $skill not found (check folder name)${NC}"
    ((SKIPPED++))
  fi
done

echo -e "  Installed: $INSTALLED | Skipped: $SKIPPED"
echo ""

# --- UI UX Pro Max ---
echo -e "${GREEN}[2/3] Installing UI UX Pro Max...${NC}"
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git "$TEMP_DIR/uupm" 2>/dev/null

# For Antigravity
if [ -d "$TEMP_DIR/uupm/src/ui-ux-pro-max" ]; then
  cp -r "$TEMP_DIR/uupm/src/ui-ux-pro-max" "$AGENT_SKILLS/ui-ux-pro-max"
  echo -e "  ${GREEN}✓${NC} ui-ux-pro-max → .agent/skills/"
else
  # Fallback: try the .claude path
  cp -r "$TEMP_DIR/uupm/.claude/skills/ui-ux-pro-max" "$AGENT_SKILLS/ui-ux-pro-max" 2>/dev/null
  echo -e "  ${YELLOW}⚠${NC} Used fallback path for ui-ux-pro-max"
fi

# For Claude Code
mkdir -p "$CLAUDE_SKILLS"
if [ -d "$TEMP_DIR/uupm/.claude/skills/ui-ux-pro-max" ]; then
  cp -r "$TEMP_DIR/uupm/.claude/skills/ui-ux-pro-max" "$CLAUDE_SKILLS/ui-ux-pro-max"
  echo -e "  ${GREEN}✓${NC} ui-ux-pro-max → .claude/skills/"
fi

echo ""

# --- GSD (Get Shit Done) ---
echo -e "${GREEN}[3/3] Installing GSD...${NC}"
npx get-shit-done-cc init 2>/dev/null && \
  echo -e "  ${GREEN}✓${NC} GSD initialized" || \
  echo -e "  ${RED}✗${NC} GSD init failed — run 'npx get-shit-done-cc init' manually"

echo ""

# --- Cleanup ---
rm -rf "$TEMP_DIR"

echo -e "${GREEN}=== Setup complete ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Run the design system generator (see README)"
echo "  2. Review .claude/context/ files"
echo "  3. Start building!"