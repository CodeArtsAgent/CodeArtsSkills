---
name: codearena-cn
description: "评测/对比同一需求(或同一代码仓多个分支)的多个代码实现并打分。当用户要『开始一轮评测/评估项目』『对比同一需求下的多个实现』『对比一个仓库的多个分支』『按 basic + round rubric 打分』『跑 API/视觉/SAST/架构/治理/覆盖率评测并出中英双语报告』时使用。"
---

# CodeArena 评测 skill

把各项目实现按**两套独立 rubric**(通用 Basic /100 + 本轮需求 Round /100,各加最高 +10 动态加分)评测,并产出**中英双语**报告。本 skill 内含完整标准、用例、模板与探测脚本。

## 0. 必读资源(都在本 skill 内)
- `references/EVAL_STANDARDS.md` —— 权威标准(工作流、硬性规则、基线工具表)。**评测前先读。**
- `references/basic_eval_cases.md` —— 静态 Basic rubric(B1 安全 30 / B2 视觉 18 / B3 代码质量 30 / B4 治理 10 / B5 测试覆盖率 12)。每轮原样复用。
- `references/report_template.md` —— 报告模板(三段式,中文;英文报告同构镜像)。
- `references/scoring_overview.md` —— 评分总览。
- `references/example_round_eval_cases.md` —— 一份 round 用例样例(0→1 需求),供生成新 round 用例参照。
- `scripts/` —— 通用库 `lib/`(http/ui/端口探测)、每轮生成用的 `templates/`(api/ui/visual 骨架)、截图工具 `cap.mjs`、工具就绪检查 `check-tools.sh` 与安装 `setup-tools.sh`(见 §4、§5)。

## 1. 工作流(每轮必须按序执行)
路径相对工作根目录(受评项目与 `EvalSets/` 都在此);`<round>` 为用户选定的轮次短名。

0. **工具就绪检查(每轮开跑前必做)** —— 先跑 `bash scripts/check-tools.sh`;**用任何工具前先确认它已安装可用**,缺失的用 `bash scripts/check-tools.sh --install` 安装(逐项安装方式见 §4 与 `scripts/tools-README.md`),全部就绪后再继续。
1. **选目标与命名** —— 一个**目标 = (仓库, 分支)**;可跨不同仓库,**也可同一仓库的多个分支**(至少两个目标)。项目在工作根目录下**递归发现**(可在子目录),且可**只给名称**——名称假定唯一,用 `find <root> -type d -name <name>` 解析为路径。每个仓库记录**解析出的路径 + 分支 + 报告显示名**;**分支规则**:未给分支→当前分支;给了一个/多个分支→各为一个目标、按其**最后一次提交**评测(报告列名 `<repo>@<branch>`)。映射记入 `EvalSets/<round>/<round>_targets.md`(中英,含分支与解析出的范围)。
2. **记原始 prompt** —— 逐字记入 `EvalSets/<round>/<round>_raw_prompt.md`(中英)。**若用户没给评测项目/目标或没给原始 prompt,先索取——绝不猜测目标或编造需求。**
3. **执行**(仅在用户确认 3.1 后):
   - 3.1 据 prompt 生成 `EvalSets/<round>/<round>_eval_cases.md`(中英,/100 + 加分)→ 交用户评审更新至确认。
   - 3.2 过范围闸、起隔离临时副本,开跑;**所有证据写入并保留** `EvalSets/<round>/evidence/`。
   - 3.3 先跑 Basic 用例(`basic_eval_cases.md`)。
   - 3.4 再跑 Round 用例。
4. **出报告** —— 按 `report_template.md` 写 `EvalSets/<round>/<round>_test_report.md` 及 `_cn.md`。

## 2. 硬性规则(务必遵守)
- **范围 = 每个目标解析出的文件集**(先跑范围闸):**默认当前分支**——有未提交改动→评未提交增量(相对 `HEAD`),干净→评**最后一次提交内容**(`git diff --name-only HEAD~1 HEAD`,根提交则取完整树);**显式指定分支**——评该分支**尖端(最后一次提交)**,忽略工作树未提交改动。同一仓多分支各用独立临时检出(`git worktree add <tmp-i> <branch>` 或 `git archive`),互不干扰。**并发目标错开端口**:优先串行;若并发,目标序号 `i` 用偏移——后端 `PORT=<base>+i`、前端 `<base>+i`,并让每个前端指向各自后端(`BASE`/`FE_BASE`/`VITE_API_BASE` 或覆盖 Vite proxy);仅当后端 URL 可配置才并发。**完成后必清理**:`pkill -9 node`、还原数据目录、对每个检出 `git worktree remove <tmp-i> --force` 再 `git worktree prune`,不留残余。
- **两个 rubric 各恰 100 分**,各带独立动态加分(最高 +10)。
- **不重复计算**:同一问题/能力只计一次。跨域缺陷(如硬编码密钥)只在最具体的专项扣(→ B1-8),不在 SAST 再扣;已计分的能力(分页/时间格式化/状态标签/过滤/错误处理)**不再**作 bonus。
- **轮次隔离**:每轮完全独立,只评本轮,不与历史轮对比/引用("fixed/regressed/vs round X" 一律禁止)。唯一例外:B3d-2 兼容性可用 git 对比同仓前一版本(未提交 vs `HEAD`,或 `HEAD` vs `HEAD~1`),属项内技术 diff。
- **独立性**:功能/安全/UX 分数来自评估方自研探测;项目自带测试仅计入 R4 测试域。
- **双语产物**:每个交付件出英文 `<name>.md` + 中文 `<name>_cn.md`;**唯一例外 `evidence/`**(JSON/截图/脚本不翻译)。
- **报告格式**:三段式(摘要 / 详细评分表 / 用例执行);摘要用差异化对比——共同优缺点单列,差异项按域分类表格呈现,加分项标 **[bonus]**;不设"修复建议"章节。

## 3. 基线工具(每域固定,跨轮一致)
| 域 | 工具 |
|---|---|
| 功能正确性 | 后端:Node `fetch` 探测(**每轮生成**,见 §5);前端:**`playwright-cli` skill 做完整端到端 UI 测试** + **每轮生成**的 UI 测试集。二者都用通用库 `scripts/lib/{http,ui}.mjs`,骨架见 `scripts/templates/` |
| 视觉 UX | Playwright 3 视口全页截图(通用引擎 `scripts/cap.mjs`;截图清单每轮按目标页面校准)+ 多模态评审 |
| 代码质量/安全 SAST | Semgrep + **官方 `semgrep-rules`(每轮从官网 `git clone` 动态获取,不打包/不冻结)** + `scripts/sast-rules.yaml`(仅作密钥/JWT 补充规则)+ `npm audit` |
| 架构质量 | dependency-cruiser |
| 可读性 | ESLint + eslint-plugin-complexity + jscpd(重复率须 ≤3%) |
| RESTful + 兼容性 | API 探测 + 人工路由审查 + `git diff` |
| 开源治理 | license-checker(仅看依赖,OSI 宽松)+ `npm audit --omit=dev`(无 High/Critical) |
| 测试覆盖率(Basic B5) | **c8**(V8 覆盖率,包裹任意 runner)+ 前端 `vitest --coverage`;映射端点/角色/错误路径/E2E 写流程 |

## 4. 工具就绪与安装(务必先装)
**先跑就绪检查,再按需安装** —— 使用任何工具前确认其可用:
```bash
bash scripts/check-tools.sh            # 列出每个工具 OK / MISSING
bash scripts/check-tools.sh --install  # 自动安装缺失项,再复检
```
`check-tools.sh` 覆盖:semgrep、dependency-cruiser、eslint(+complexity)、jscpd、license-checker、cloc、Playwright+Chromium、playwright-cli skill(及 node/npm/git/python/pip)。逐项安装命令见下与 `scripts/tools-README.md`。

两种环境二选一(或都用):

**A. 本机(host)一键装到 `~/tools/`** —— 见 `scripts/setup-tools.sh`(详见 `scripts/tools-README.md`):
```bash
chmod +x scripts/setup-tools.sh && ./scripts/setup-tools.sh   # 装 Semgrep 引擎 / dependency-cruiser / ESLint / jscpd / license-checker / cloc / Playwright
npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli   # 装 playwright-cli skill(完整 UI 测试)
```
注:GitHub release 下载若报 `curl (16) HTTP2`,脚本已用 `--http1.1 -C -` 规避;Apple Silicon 软链接目录用 `/opt/homebrew/bin`。

**B. 沙箱内自备**(评测实际在此跑):
```bash
# Node 工具(本地装,避免污染全局)
npm i dependency-cruiser eslint@8 eslint-plugin-complexity jscpd license-checker
# Semgrep 引擎:先下 wheel 再 --no-deps 装,然后补依赖
pip install semgrep --break-system-packages         # 或下 wheel 后 pip install ./semgrep-*.whl
```
**Semgrep 规则文件必须每轮从官网动态获取(不打包、不缓存冻结):**
```bash
git clone --depth 1 https://github.com/semgrep/semgrep-rules.git   # 每轮评测时现拉最新官方规则
```
说明:沙箱代理对 GitHub release 二进制常返回 403,但 `git clone` 与 pip/npm 可用——所以官方 Semgrep 规则始终用 `git clone` 现取最新版。本 skill **不内置**官方规则副本,仅内置 `scripts/sast-rules.yaml` 作为官方 JS 规则集未覆盖的密钥/JWT 补充。当前 rubric 不含 DAST,故不安装 OWASP ZAP / Dependency-Check;治理由 license-checker + npm audit 完成。

## 5. 脚本:通用预置 vs 每轮生成

**核心原则:测试脚本(决定"测什么"——断言、流程、字段、测试数据)必须每轮按 本轮代码 + 评测标准 + `<round>_eval_cases.md` 用例 + `<round>_raw_prompt.md` 需求 动态生成;只有通用基础设施预先写好。**

**通用、预置(直接用,不改):**
- `scripts/lib/http.mjs` —— 请求/multipart/token 提取/结果记录器(`Recorder`)。
- `scripts/lib/ui.mjs` —— Playwright 启动(含 `PW_EXEC`/`--no-sandbox`)、登录、toast 轮询、console/page 错误捕获、截图、`UIRecorder`。
- `scripts/lib/detect-ports.mjs` / `scripts/detect-ports.mjs` —— 从 README/配置探测端口。
- `scripts/cap.mjs` —— 3 视口截图工具(单次登录避限流)。
- `scripts/sast-rules.yaml`、`setup-tools.sh`、`check-tools.sh`、`tools-README.md`。

**每轮生成(从 `scripts/templates/` 骨架生成,不要直接跑模板):**
- `templates/api_test.template.mjs` → 生成 `EvalSets/<round>/evidence/harness/api_test.mjs`:按目标真实路由 + 用例填 契约块 与 逐条断言(每条对应一个 eval-case ID)。
- `templates/ui_test.template.mjs` → 生成 `…/harness/ui_test.mjs`:按目标前端 路由/选择器/按钮文案 + 用例填 完整写操作流程。
- `templates/visual_test.template.mjs` → 生成 `…/harness/visual_test.mjs`:按目标页面填 要截哪些屏(简单场景直接用 `cap.mjs`)。

**生成步骤(工作流 3.x):**
1. 读 `<round>_eval_cases.md`、`<round>_raw_prompt.md`,并审目标 `backend` 路由与 `frontend` 视图/store。
2. 复制对应模板到 `EvalSets/<round>/evidence/harness/`,并把 `scripts/lib/` 整目录拷到 `…/harness/lib/`(模板按 `./lib/...` 引用,自包含)。
3. 填充 GENERATE-PER-ROUND 区:契约、逐条断言、UI 流程、截图清单——每条都要可追溯到某个 eval-case;不得留通用占位。
4. **交用户确认生成的 harness**,再运行。

**运行(生成后):**
```bash
# 端口先探测,不写死
node scripts/detect-ports.mjs <projectDir>
# 后端 API:
PROJECT_DIR=<projectDir> EVID_DIR=EvalSets/<round>/evidence \
  node EvalSets/<round>/evidence/harness/api_test.mjs <project> → <project>-api-results.json
# 完整 UI(必做):先用 playwright-cli skill 录制/核对选择器,再跑生成的 harness
PW_EXEC=<chromium> EVID_DIR=EvalSets/<round>/evidence/ui FE_BASE=http://localhost:<feport> \
  node EvalSets/<round>/evidence/harness/ui_test.mjs <project> → <project>-ui-results.json + 截图
# 视觉:
PROJECT_DIR=<projectDir> EVID_DIR=... node scripts/cap.mjs <project>
# SAST:
semgrep --config <semgrep-rules>/javascript --config scripts/sast-rules.yaml --json ...   # 甄别误报
```
**只验 API 不够**:前端独有缺陷(store 递归/损坏、API 客户端接错、对话框点了不提交)只有完整 UI 测试看得见;某项后端通过但 UI 坏,则该 API+UI 项最多判部分、对应核心场景判 Fail。

## 6. 记忆要点(易踩坑)
- 实现的接口/端口在不同轮次可能差异很大(multipart vs 先上传再 JSON、PUT vs POST 动作、账号以 id vs username 为键、`/files` 是否鉴权、端口不一)——所以 harness **每轮从模板生成**(§5),先 `detect-ports.mjs` 探测端口、再读目标 routes 填断言。**端口一律从 README/代码探测,不写死**(detect-ports 失败才回退默认 3000/5173)。
- 起后端前清干净数据目录(有的项目用相对 `./db`,忽略 `DB_DIR`),否则 409 脏数据。
- 视觉评测多次登录会触发限流 → 用单次登录 + 视口缩放的截图方式。
- **API 通过 ≠ 功能可用**:务必用 `playwright-cli` + 每轮生成的 UI harness 把 UI 写操作全跑一遍——后端对但前端 store/客户端坏的情况很常见(如 Pinia 本地函数与导入同名导致递归爆栈),只有 UI 测试能发现。
- **多分支:** 并发评测必须错开端口(目标 i 偏移 base+i,前端各自指向自己的后端);评完务必清理——`pkill -9 node` + 每个 `git worktree remove --force` + `git worktree prune`,不留 worktree/进程/端口。
- 评分务必按 §2 的"不重复计算"。
