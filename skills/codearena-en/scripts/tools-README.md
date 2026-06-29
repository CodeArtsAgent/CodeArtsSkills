# CodeArena Evaluation Toolchain (local install)

Installs the baselined evaluation tools used by the **current** rubric into `~/tools/` (macOS).

## Install
```bash
chmod +x setup-tools.sh
./setup-tools.sh
```
Requires Homebrew (installs python3 / node via brew if missing). No `source` needed afterward.

## Tools
| Tool | Eval domain | Install | Verify |
|---|---|---|---|
| Semgrep (engine) | SAST / Security | `~/tools/semgrep-venv` + symlink in PATH | `semgrep --version` |
| dependency-cruiser | Architecture | npm `-g` | `depcruise --version` |
| ESLint + eslint-plugin-complexity | Readability/complexity | npm `-g` | `eslint --version` |
| jscpd | Duplication (≤3%) | npm `-g` | `jscpd --version` |
| license-checker | Open-source governance | npm `-g` | `license-checker --version` |
| cloc | Effective changed LOC | npm `-g` | `cloc --version` |
| c8 | Test coverage (Basic B5) | npm `-g` (+ project `vitest --coverage`) | `c8 --version` |
| Playwright + Chromium | End-to-end UI testing | npm `-g` + `npx playwright install chromium` | `npx playwright --version` |
| playwright-cli (skill) | Complete UI test authoring/drive | `npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli` | skill listed in `npx skills list` |

## Semgrep rules — fetched dynamically (not installed here)
Always pull the latest official rules at eval time; never freeze/bundle them:
```bash
git clone --depth 1 https://github.com/semgrep/semgrep-rules.git
```

## Not installed (by design)
OWASP ZAP and OWASP Dependency-Check are **not** part of the current rubric (no DAST; governance = `license-checker` + `npm audit`), so they are intentionally omitted.

## Troubleshooting
- `curl (16) HTTP2 framing layer` on downloads → use `curl --http1.1 -C -` (and disable any VPN/proxy interfering with GitHub).
- Apple Silicon: symlink dir is `/opt/homebrew/bin`; Intel: `/usr/local/bin`.
