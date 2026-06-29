#!/usr/bin/env bash
# check-tools.sh — preflight tool-readiness gate for CodeArena evaluation.
#
# Run this BEFORE every evaluation (workflow Step 0). It checks each tool the
# skill uses and, with --install, installs the missing ones. Never assume a tool
# is present — verify, then install if needed.
#
#   ./check-tools.sh            # check only; prints OK / MISSING table, exit 1 if any missing
#   ./check-tools.sh --install  # check, then install whatever is missing, then re-check
#
# Install methods (also in tools-README.md):
#   semgrep            -> pip install semgrep --break-system-packages   (rules: git clone semgrep-rules each round)
#   dependency-cruiser -> npm install -g dependency-cruiser             (binary: depcruise)
#   eslint(+complexity)-> npm install -g eslint@8 eslint-plugin-complexity
#   jscpd              -> npm install -g jscpd
#   license-checker    -> npm install -g license-checker
#   cloc               -> npm install -g cloc
#   playwright+chromium-> npm install -g playwright && npx playwright install chromium
#   playwright-cli skill-> npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli
set -u
INSTALL=0; [ "${1:-}" = "--install" ] && INSTALL=1
MISSING=()

check() { # name | check-cmd | install-cmd
  local name="$1" chk="$2" inst="$3"
  if eval "$chk" >/dev/null 2>&1; then
    printf "  [OK]      %s\n" "$name"
  else
    printf "  [MISSING] %s\n" "$name"
    if [ "$INSTALL" -eq 1 ]; then
      printf "            installing: %s\n" "$inst"
      eval "$inst" >/dev/null 2>&1 || printf "            (install failed — run manually: %s)\n" "$inst"
      if eval "$chk" >/dev/null 2>&1; then printf "            -> now OK\n"; else MISSING+=("$name"); fi
    else
      MISSING+=("$name")
    fi
  fi
}

echo "== CodeArena tool readiness =="
check "node"                "command -v node"            "echo 'install Node.js 18+ from nodejs.org'"
check "npm"                 "command -v npm"             "echo 'npm ships with Node.js'"
check "git"                 "command -v git"             "echo 'install git'"
check "python3"             "command -v python3"         "echo 'install Python 3'"
check "pip"                 "command -v pip || command -v pip3" "echo 'install pip'"
check "semgrep"             "command -v semgrep"         "pip install semgrep --break-system-packages || pip3 install semgrep --break-system-packages"
check "dependency-cruiser"  "command -v depcruise"       "npm install -g dependency-cruiser"
check "eslint"              "command -v eslint"          "npm install -g eslint@8 eslint-plugin-complexity"
check "jscpd"               "command -v jscpd"           "npm install -g jscpd"
check "license-checker"     "command -v license-checker" "npm install -g license-checker"
check "cloc"                "command -v cloc"            "npm install -g cloc"
check "c8 (coverage)"       "command -v c8"              "npm install -g c8"
check "playwright+chromium" "npx --yes playwright --version" "npm install -g playwright && npx --yes playwright install chromium"
check "playwright-cli skill" "npx --yes skills list 2>/dev/null | grep -qi playwright-cli" "npx --yes skills add https://github.com/microsoft/playwright-cli --skill playwright-cli"

echo
if [ "${#MISSING[@]}" -eq 0 ]; then
  echo "All tools ready."
  echo "Reminder: Semgrep RULES are fetched per round, not installed here:"
  echo "  git clone --depth 1 https://github.com/semgrep/semgrep-rules.git"
  exit 0
else
  echo "Missing: ${MISSING[*]}"
  echo "Run './check-tools.sh --install' to install them (or see tools-README.md), then re-run."
  exit 1
fi
