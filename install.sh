#!/bin/bash

# Solana Transaction Doctor - Installer
# Installs the solana-tx-doctor skill into ~/.claude/skills/

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
SKILLS_DIR="$HOME/.claude/skills"
SKILL_PATH="$SKILLS_DIR/solana-tx-doctor"
CLAUDE_MD_PATH="$HOME/.claude/CLAUDE.md"
INSTALL_CLAUDE_MD=false

print_banner() {
    echo ""
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}🩺  Solana Transaction Doctor${NC}                              ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${WHITE}Diagnose & fix failed, reverted, or dropped Solana txs${NC}     ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${GREEN}decode → explain → fix → verify${NC}                            ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_help() {
    echo "Solana Transaction Doctor - Installer"
    echo ""
    echo "Usage: ./install.sh [OPTIONS]"
    echo ""
    echo "Installs the solana-tx-doctor skill to:"
    echo "  $SKILL_PATH"
    echo ""
    echo "Options:"
    echo "  -y, --yes          Skip the confirmation prompt"
    echo "  --with-claude-md   Also install CLAUDE.md to ~/.claude/ (backs up any existing)"
    echo "  -h, --help         Show this help"
    echo ""
}

SKIP_CONFIRM=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes) SKIP_CONFIRM=true; shift ;;
        --with-claude-md) INSTALL_CLAUDE_MD=true; shift ;;
        -h|--help) print_help; exit 0 ;;
        *) echo "Unknown option: $1"; echo "Use --help for usage."; exit 1 ;;
    esac
done

print_banner

echo -e "${WHITE}This will install:${NC}"
echo -e "  ${BLUE}•${NC} solana-tx-doctor → ${CYAN}$SKILL_PATH${NC}"
if [ "$INSTALL_CLAUDE_MD" = true ]; then
    echo -e "  ${BLUE}•${NC} CLAUDE.md        → ${CYAN}$CLAUDE_MD_PATH${NC}"
fi
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
    read -p "Proceed with installation? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Installation cancelled${NC}"
        exit 0
    fi
fi

echo ""
mkdir -p "$SKILLS_DIR"
mkdir -p "$HOME/.claude"

# Install the skill (copy skill/, agents/, commands/, rules/, scripts/)
echo -e "${CYAN}[1/2]${NC} Installing solana-tx-doctor skill..."
if [ -d "$SKILL_PATH" ]; then
    echo -e "  ${YELLOW}→${NC} Removing existing installation"
    rm -rf "$SKILL_PATH"
fi
mkdir -p "$SKILL_PATH"
for item in skill agents commands rules scripts CLAUDE.md README.md LICENSE; do
    if [ -e "$SCRIPT_DIR/$item" ]; then
        cp -r "$SCRIPT_DIR/$item" "$SKILL_PATH/"
    fi
done
echo -e "  ${GREEN}✓${NC} Installed to $SKILL_PATH"

# Optionally install CLAUDE.md at the top level
echo -e "${CYAN}[2/2]${NC} CLAUDE.md..."
if [ "$INSTALL_CLAUDE_MD" = true ]; then
    if [ -f "$CLAUDE_MD_PATH" ]; then
        echo -e "  ${YELLOW}→${NC} Backing up existing CLAUDE.md"
        cp "$CLAUDE_MD_PATH" "$CLAUDE_MD_PATH.backup"
    fi
    cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_MD_PATH"
    echo -e "  ${GREEN}✓${NC} Installed to $CLAUDE_MD_PATH"
else
    echo -e "  ${BLUE}•${NC} Skipped (run with --with-claude-md to install it globally)"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${WHITE}Installation Complete!${NC}                                       ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Try asking Claude:${NC}"
echo -e "  ${BLUE}•${NC} \"Why did this transaction fail? <signature>\""
echo -e "  ${BLUE}•${NC} \"custom program error: 0x1771 — what is this?\""
echo -e "  ${BLUE}•${NC} \"My transactions keep getting dropped, make my sender reliable\""
echo ""
echo -e "${CYAN}Or run the decoder directly:${NC}"
echo -e "  ${BLUE}•${NC} node $SKILL_PATH/scripts/decode-tx.mjs <SIGNATURE>"
echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}     solana-tx-doctor · decode → explain → fix → verify${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
