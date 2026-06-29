# CodeArena 评测工具链(本机安装)

把**当前** rubric 所用的基线评测工具装到 `~/tools/`(macOS)。

## 安装
```bash
chmod +x setup-tools.sh
./setup-tools.sh
```
需要 Homebrew(缺失时用 brew 装 python3 / node)。装完无需 `source`。

## 工具
| 工具 | 评测域 | 安装方式 | 验证 |
|---|---|---|---|
| Semgrep(引擎) | SAST / 安全 | `~/tools/semgrep-venv` + PATH 中加软链接 | `semgrep --version` |
| dependency-cruiser | 架构 | npm `-g` | `depcruise --version` |
| ESLint + eslint-plugin-complexity | 可读性/复杂度 | npm `-g` | `eslint --version` |
| jscpd | 重复率(≤3%) | npm `-g` | `jscpd --version` |
| license-checker | 开源治理 | npm `-g` | `license-checker --version` |
| cloc | 有效变更代码行 | npm `-g` | `cloc --version` |
| c8 | 测试覆盖率(Basic B5) | npm `-g`(+ 项目内 `vitest --coverage`) | `c8 --version` |
| Playwright + Chromium | 端到端 UI 测试 | npm `-g` + `npx playwright install chromium` | `npx playwright --version` |
| playwright-cli(skill) | 完整 UI 测试录制/驱动 | `npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli` | `npx skills list` 中可见该 skill |

## Semgrep 规则 —— 动态获取(不在此安装)
评测时始终拉取最新官方规则;绝不冻结/打包:
```bash
git clone --depth 1 https://github.com/semgrep/semgrep-rules.git
```

## 有意不安装
OWASP ZAP 与 OWASP Dependency-Check **不**属于当前 rubric(无 DAST;治理 = `license-checker` + `npm audit`),故有意省略。

## 排障
- 下载时报 `curl (16) HTTP2 framing layer` → 改用 `curl --http1.1 -C -`(并关掉干扰 GitHub 的 VPN/代理)。
- Apple Silicon:软链接目录为 `/opt/homebrew/bin`;Intel:`/usr/local/bin`。
