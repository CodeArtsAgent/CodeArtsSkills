#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CodeArena Evaluation Toolchain installer (macOS) — installs into ~/tools/
#
# Installs the baselined evaluation tools used by the current rubric:
#   - Semgrep (engine)                 -> ~/tools/semgrep-venv   (Python venv)
#   - dependency-cruiser / eslint(+complexity) / jscpd / license-checker / cloc / c8 -> npm -g
#
# NOTE: Semgrep RULE FILES are NOT installed here — they are fetched dynamically
#       at eval time with:  git clone --depth 1 https://github.com/semgrep/semgrep-rules
#       (always pull the latest official rules; never freeze/bundle them).
#
# (OWASP ZAP / Dependency-Check are intentionally NOT installed: the current
#  rubric uses no DAST, and governance = license-checker + npm audit.)
#
# Usage:  chmod +x setup-tools.sh && ./setup-tools.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
TOOLS="${TOOLS_DIR:-$HOME/tools}"
mkdir -p "$TOOLS"
note(){ printf "\033[1;34m==>\033[0m %s\n" "$*"; }
ok(){ printf "\033[1;32m  ok\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m  !!\033[0m %s\n" "$*"; }

# 0. Prerequisites
command -v brew >/dev/null 2>&1 || { warn "Install Homebrew first: https://brew.sh"; exit 1; }
command -v python3 >/dev/null 2>&1 || brew install python
command -v node >/dev/null 2>&1 || brew install node
ok "python3 $(python3 --version) | node $(node --version)"

# 1. Semgrep engine (Python venv)
note "Installing Semgrep engine into $TOOLS/semgrep-venv …"
if [ ! -x "$TOOLS/semgrep-venv/bin/semgrep" ]; then
  python3 -m venv "$TOOLS/semgrep-venv"
  "$TOOLS/semgrep-venv/bin/pip" install --quiet --upgrade pip
  "$TOOLS/semgrep-venv/bin/pip" install --quiet semgrep
fi
ok "semgrep $("$TOOLS/semgrep-venv/bin/semgrep" --version 2>/dev/null || echo '?')"

# 2. Node CLI tools — GLOBAL
note "Installing dependency-cruiser, eslint, eslint-plugin-complexity, jscpd, license-checker, cloc, c8 (npm -g) …"
npm install -g --silent --no-audit --no-fund \
    dependency-cruiser eslint@8 eslint-plugin-complexity jscpd license-checker cloc c8
ok "node tools installed globally ($(npm root -g 2>/dev/null))"

# 3b. Playwright (browser UI testing) + playwright-cli skill (complete UI tests)
note "Installing Playwright + Chromium and the playwright-cli skill (complete UI testing) …"
npm install -g --silent --no-audit --no-fund playwright || true
npx --yes playwright install chromium || true
npx --yes skills add https://github.com/microsoft/playwright-cli --skill playwright-cli || true
ok "Playwright + playwright-cli skill ready"

# 3. Make Semgrep callable in any shell (symlink into a PATH bin dir)
BINDIR=""
for cand in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
  if [ -d "$cand" ] && [ -w "$cand" ]; then BINDIR="$cand"; break; fi
done
[ -z "$BINDIR" ] && { BINDIR="$HOME/.local/bin"; mkdir -p "$BINDIR"; warn "using $BINDIR — ensure it's on PATH"; }
ln -sf "$TOOLS/semgrep-venv/bin/semgrep" "$BINDIR/semgrep"
ok "symlinked semgrep -> $BINDIR"

# 4. Summary
note "Done. Verify (no 'source' needed):"
cat <<EOF

  semgrep --version
  depcruise --version
  eslint --version
  jscpd --version
  license-checker --version
  cloc --version
  c8 --version
  npx --yes playwright --version 2>/dev/null || true

  # Semgrep official rules — fetch fresh each eval (NOT installed by this script):
  git clone --depth 1 https://github.com/semgrep/semgrep-rules.git

EOF
