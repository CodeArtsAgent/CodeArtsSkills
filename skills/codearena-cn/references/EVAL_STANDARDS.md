# CodeArena 评测标准

评测/对比项目实现的长期规则。除非用户另行指定,适用于每一轮。

## 工作流(每轮必须按序执行)

本标准统辖整个流程,不得跳过、调序或临时发挥。下文所有路径均**相对工作根目录**(受评项目与 `EvalSets/` 都在此)。`<round>` 为用户选定的轮次短名(如 `auth`、`0to1`)。

**第 0 步 — 工具就绪(强制,先于一切)。**
- 先跑预检 `bash scripts/check-tools.sh`。**使用任何工具前,先确认它已安装且可用**,不得想当然。
- 缺失的工具先装好 —— `bash scripts/check-tools.sh --install`(或基线工具表 / `scripts/tools-README.md` 里的逐项命令)。复跑至全部 OK 为止。Semgrep *规则* 仍每轮用 `git clone` 现取(不在本检查内)。

**第 1 步 — 选定目标与命名。**
- 一个**目标**是一对 *(仓库, 分支)*。目标可以是**不同仓库**(如 `proj-A` vs `proj-B`),**也可以是同一仓库的多个分支**(如 `proj-A@main` vs `proj-A@feature-x`)。用户须选**至少两个**目标。
- **若用户没说要对比哪些项目/分支,先询问用户** —— 可列出发现到的候选项目供其选择。目标少于两个**不得**开跑,也不得擅自猜测目标。
- **在工作根目录下递归发现项目** —— 候选仓库可能在**子目录**里,不只顶层。候选 = 看起来像项目根的目录(含 `package.json`、`.git`,或 `backend`+`frontend` 一对)。
- **项目可只用名称指定。** 名称在工作根目录下假定**唯一**(不同目录同名不在考虑范围)。用递归查找把 名称 → 路径,并在下文凡 `<repo>` 处用该路径:

  ```
  REPO=$(find <工作根目录> -type d -name '<name>' -not -path '*/node_modules/*' | head -1)
  ```
  也可直接给相对/绝对路径代替名称。若某名称解析到 0 个或多个目录,停下来问用户。
- 每个目标记录:(a) **解析出的路径**,(b) 要评测的**分支**(见下方分支规则),(c) 报告中的**显示名**。
- **分支规则(每个仓库):**
  - **未给分支 → 该仓库的当前分支**(`git -C <repo> rev-parse --abbrev-ref HEAD`)。
  - **给了一个或多个分支 → 每个分支各为一个目标**,在其**分支尖端(最后一次提交)**评测。一个仓库选 N 个分支即产出 N 个报告列,命名 `<repo>@<branch>`(或用户显示名)。
- 将映射记录到 `EvalSets/<round>/<round>_targets.md`(小表:报告名 ↔ 相对路径 ↔ 分支 ↔ 解析出的范围)。

**第 2 步 — 记录原始 prompt。**
- 用户提供本轮**原始需求 prompt**。**逐字**记录到 `EvalSets/<round>/<round>_raw_prompt.md`。
- **若用户未提供原始 prompt,生成任何用例前先询问用户索取。** Round rubric 完全由该 prompt 推导——**不得**自行编造、臆测或转述需求,也不得未经用户确认就沿用上一轮的 prompt。

**第 3 步 — 执行本轮(仅在用户确认 3.1 之后)。**
- **3.1 生成本轮用例。** 据 `EvalSets/<round>/<round>_raw_prompt.md` 写出 `EvalSets/<round>/<round>_eval_cases.md`(/100 + 动态加分)。交用户**评审并更新**,迭代至确认。
- **3.1b 生成本轮测试 harness。** 测试脚本**每轮生成,不预置**。据已确认的 `<round>_eval_cases.md` + `<round>_raw_prompt.md` + 各目标实际后端路由与前端(视图/store),用 `scripts/templates/` 骨架生成 `EvalSets/<round>/evidence/harness/{api_test,ui_test,visual_test}.mjs`——每条断言/流程对应一个 eval-case,按目标真实契约/选择器校准。把 `scripts/lib/` 拷到 `evidence/harness/lib/` 使 harness 自包含。只有通用机制(`scripts/lib/`、`detect-ports.mjs`、`cap.mjs`、`sast-rules.yaml`、安装脚本)原样复用。**生成的 harness 须交用户确认后再跑。**
- **3.2 执行(确认后)。** 设置范围闸与各目标的隔离临时副本;运行生成的 harness。**所有证据必须写入并保留在 `EvalSets/<round>/evidence/`** —— API/Semgrep/指标 JSON、Playwright 截图(`evidence/screens/`)、UI 结果(`evidence/ui/`)、生成的 harness(`evidence/harness/`)。证据是该轮永久产物,报告写完后不得删除。
- **3.3 先跑 Basic 用例。** 对每个目标用 `EvalSets/basic_eval_cases.md` 评分 → 各自 /100 + 加分。
- **3.4 再跑 Round 用例。** 对每个目标用 `EvalSets/<round>/<round>_eval_cases.md` 评分 → 各自 /100 + 加分。

**第 4 步 — 撰写报告。**
- 用 `EvalSets/report_template.md`,写出 `EvalSets/<round>/<round>_test_report.md`(英文,下述三段式)及其中文版。全文使用第 1 步的显示名。报告引用 `EvalSets/<round>/evidence/` 内的证据文件。

- 所有用例、prompt、targets、报告均为 **Markdown 文件**。
- **每轮保留产物(永不删除):** `<round>_targets.md`、`<round>_raw_prompt.md`、`<round>_eval_cases.md`、`<round>_test_report.md` 及整个 `evidence/` 目录。

## EvalSets 目录结构(多轮、可归档)

```
EvalSets/
├── EVAL_STANDARDS.md            # 本标准 — 所有轮共享
├── basic_eval_cases.md          # 静态 Basic rubric(/100)— 每轮原样复用
├── report_template.md           # 报告模板 — 每轮复用
├── tools/                       # 工具链安装器
│   ├── setup-tools.sh
│   └── README.md
└── <round>/                     # 每轮一个目录(如 auth/、0to1/)
    ├── <round>_targets.md        # 报告名 ↔ 项目相对路径(第 1 步)
    ├── <round>_raw_prompt.md     # 逐字原始 prompt(第 2 步)
    ├── <round>_eval_cases.md     # 本轮 rubric(/100)(第 3.1 步)
    ├── <round>_test_report.md# 最终报告(第 4 步)
    └── evidence/                 # 本轮证据
        ├── harness/              # 每轮生成的测试脚本(api_test/ui_test/visual_test)+ lib/
        ├── screens/              # Playwright 截图
        ├── ui/                   # UI 流程结果 JSON + 截图
        ├── coverage/             # c8/vitest 覆盖率 lcov + 汇总(Basic B5)
        └── *.json                # API/Semgrep/指标输出
```

每轮在 `EvalSets/<round>/` 下自包含;`basic_eval_cases.md`、`report_template.md` 与本标准为共享,不在每轮内重复。

## 双语产物(所有轮固定)
- **每个交付件都同时产出英文与中文** —— 两个文件:`<name>.md`(英文)与 `<name>_cn.md`(中文)。适用于标准、eval cases、原始 prompt 记录、targets、报告模板、评分总览、报告。
- **例外:`evidence/`**(API/Semgrep/指标 JSON、截图、harness 脚本)不翻译,只存一份。
- 两种语言文件须保持同步:改其一时,同一次改动里更新另一份。

## 报告格式(所有轮固定)
- **语言:英文 + 中文。** 每份报告同时产出 `<round>_test_report.md`(英)与 `<round>_test_report_cn.md`(中)。
- **模板:** 严格遵循 `EvalSets/report_template.md`。仅三段:
  1. **摘要** —— 结论 + 总分表 + 优缺点**差异化对比**:所有目标共有的特性在"共同优点/共同缺点"下只列一次;差异项以**一张按域分组的表格**呈现(每行一个目标间存在差异的维度,每列一个项目)。加分项标 **[bonus]**;每格一短句 + 证据指针;共同项不在差异表里重复。
  2. **详细评分表** —— Basic 各域、Round 各域、加分明细;每个计分行用**半句话**注明原因(非段落)。
  3. **用例执行情况** —— 运行时 API 探测(仅列差异)、视觉 UX(3 视口)、静态分析汇总、核心场景。
- **不设"修复建议"章节** —— 任何修复折进半句话的缺点注里。

## 两文件 rubric 结构
- **`EvalSets/basic_eval_cases.md`** —— **基线**:静态、与应用无关、每轮原样复用。**不得**含任何轮次/需求/项目相关信息。独立计 **/100** + 最高 **+10** 加分。覆盖通用工程质量:B1 运行时安全、B2 视觉 UX、B3 代码质量(SAST + 架构 + 可读性)、B4 开源治理。
- **`EvalSets/<round>/<round>_eval_cases.md`** —— 动态,源自本轮原始 prompt。独立计 **/100** + 最高 **+10** 加分。
- 每个实现得到**两个**分数,在报告中并排呈现。两文件独立评分(不合并为单一 100)。

## 硬性规则
- **范围 = 每个目标解析出的在范围内文件集**(先跑 git 范围闸并记录文件集)。解析方式取决于该目标的分支如何选定:
  - **默认当前分支**(用户未指定分支):
    - **工作树有未提交改动**(`git -C <repo> status --porcelain` 非空)→ 评测**相对 `HEAD` 的未提交增量**(未跟踪 + 已修改)。*(历史默认)*
    - **工作树干净** → 评测**最后一次提交的内容** —— 尖端提交改动的文件(`git -C <repo> diff --name-only HEAD~1 HEAD`);若尖端**无父提交**(根/`init` 提交且整份实现都在其中),则评测 `HEAD` 处的**完整树**。
  - **显式指定的分支**(单个或多个)→ 评测该分支**尖端(最后一次提交)**的内容:`git -C <repo> diff --name-only <branch>~1 <branch>`(若为根提交则取尖端完整树)。对显式指定的分支,工作树的未提交改动一律**忽略**——只算该分支已提交的内容。
  - **同一仓库多分支的隔离:** 每个分支在**各自的临时检出**中评测 —— `git -C <repo> worktree add <tmp-i> <branch>`(或 `git -C <repo> archive <branch> | tar -x -C <tmp-i>`)——使分支之间、以及与工作树互不干扰。各目标对各自检出启动服务/harness。
  - **并发目标必须错开端口。** 两个目标不能共用端口。优先**串行**评测(一次一个,用探测到的基准端口,目标间彻底清理)。若**并发**,给目标序号 `i`(从 0 起)一个偏移:后端 `PORT = <探测到的后端端口>+i`(如 3000、3001…),前端端口 `<探测到的前端端口>+i`(如 5173、5174…),并**让每个前端指向各自的后端** —— 通过环境变量把错开后的值传给 harness(`PORT`、`BASE`、`FE_BASE`,以及项目的 API 基址覆盖如 `VITE_API_BASE`,或覆盖 Vite proxy 目标)。仅当前端的后端 URL 可配置时才并发;否则保持串行。
  - **清理(每个目标完成后/本轮结束时必做):** 停掉所有启动的服务(`pkill -9 node`)、还原被改动的数据目录,然后**移除每个临时检出** —— 对每个执行 `git -C <repo> worktree remove <tmp-i> --force`,再 `git -C <repo> worktree prune`。不得留下任何残余 worktree、进程或错开端口的服务。(`EvalSets/<round>/evidence/` 下的证据保留;临时检出不保留。)
  - 无论如何解析,同一范围集随后驱动该目标的**全部**代码审查、SAST、指标、架构、治理与覆盖率评分。
- **两个 rubric 文件各恰好 100 分**,各自带**独立的动态加分**(最高 +10)。
- **加分为动态:** 从静态种子起步,完整评审后增删条目,最终列表**对所有目标一致适用**以保公平,每项附证据。
- **不重复计算。** 同一问题或同一能力只计**一次**。(a) 跨域出现的同一缺陷(如硬编码密钥在运行时 B1 与静态 SAST B3a 均可检出)只在**一个**域扣分——优先最具体的专项(硬编码密钥 → B1-8)。(b) 已是**计分项**的能力**不再**作加分:必需前端特性(表单校验、图片上传预览、列表分页、时间格式化)、状态标签/样式化状态(B2-5)、分页/过滤查询参数(B3d-1)在各自域计分,**不得**再作 bonus。加分仅留给超出所有计分项的真正额外能力(如限流、helmet 安全头、审计日志、统计仪表盘、提交的 API 文档)。
- **架构质量**判定为**高内聚 / 低耦合 / 高可扩展**(在 basic B3b),并记录可复现信号。
- **独立性:** 功能/安全/UX/视觉分数来自评估方自研、对运行中应用的探测。项目自带测试套件**仅**计入本轮测试域——绝不自评正确性。
- **必须做完整 UI 测试。** 功能正确性必须经由真实前端 UI 验证,不能只验后端 API。用 `playwright-cli` skill(+ 内置 `ui_test.mjs`)把用户能到达的**每个**页面、**每个**写操作端到端走一遍(登录/登出、记录增改删、提交/撤销、审批/驳回——即该应用的各写操作),对结果提示/通知、表格/列表状态、是否落库做断言,并捕获 console/page 错误。若某项后端 API 通过但 UI 路径损坏,则该"API + UI"项最多判**部分**,对应核心场景判 **Fail**。UI 证据(结果 JSON + 截图)存 `evidence/ui/`。
- **轮次隔离:** 每轮**完全独立**评测。只评、只述当前轮观测到的状态;**不**与任何历史轮次对比、引用或沿用("fixed/regressed/added since/unchanged/vs round X" 一律禁止)。报告与用例须独立成文,即便 prompt 或目标复用。**有限例外:** API 前向/后向兼容性检查(basic B3d-2)可用 **git** 对比同仓库的前一版本(未提交 vs `HEAD`,或 `HEAD` vs `HEAD~1`)以检测破坏性变更——这是用 git 历史的项内技术 diff(无快照文件,非跨轮分数对比)。

## 各评测域的基线工具(所有轮固定)
每个评测域恰有一个基线主工具,每轮一致使用以保证跨轮可比。未更新本表前不得在轮间替换工具。

| 域 | 基线工具(主) | 用法(可直接照敲的起点) |
|---|---|---|
| 功能正确性 | 后端:**NodeJS `fetch` API harness**;前端:**`playwright-cli` skill 做完整端到端 UI 测试** + UI harness。**两个 harness 都每轮生成**(从 `scripts/templates/` + 通用 `scripts/lib/`),非预置。 | harness 的用例/流程每轮据 `<round>_eval_cases.md` + `<round>_raw_prompt.md` + 目标真实路由/前端生成;只有 `scripts/lib/{http,ui}.mjs` 的机制是通用的。生成到 `evidence/harness/`、交用户确认后再跑:后端 `node evidence/harness/api_test.mjs <project>` → `evidence/<project>-api-results.json`;前端——装 skill(`npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli`),把**每个**写操作流程经真实 UI 走一遍,`node evidence/harness/ui_test.mjs <project>` → `evidence/ui/<project>-ui-results.json` + 截图。**只靠 API harness 不够**:前端独有缺陷(store 损坏、API 客户端接错、对话框点了不提交)对它不可见,必须经 UI 捕获。 |
| 视觉 UX | **Playwright** 3 视口全页截图 + 多模态评审 | 起前后端,`node scripts/cap.mjs <project>`(通用单次登录截图),在桌面 1280×900、平板 768×1024、移动 390×844 截图(`fullPage:true`);若需比默认更多页面,用模板生成 `evidence/harness/visual_test.mjs` 并填本轮页面清单。PNG 存 `evidence/screens/`,逐张查看并按 B2 评分。 |
| 代码质量(SAST) | **Semgrep**(官方 `semgrep-rules`,克隆) | 一次性:`git clone --depth 1 https://github.com/semgrep/semgrep-rules`。扫描:`semgrep --config semgrep-rules/javascript --metrics off --json -o evidence/<project>-semgrep.json --exclude node_modules <project>/backend/src <project>/frontend/src`。对结果做误报甄别,按 `extra.severity` 分桶。 |
| 架构质量 | **dependency-cruiser** | `depcruise <project>/backend/src --no-config --output-type json > evidence/<project>-dc.json`。从 JSON:统计应用级循环依赖与"逆向"import(低层→高层),并 grep store 层之外的直接 `fs`/持久化访问。`depcruise ... --output-type err` 给人读的违规列表。 |
| 可读性 | **ESLint** + **eslint-plugin-complexity** + **jscpd** | 复杂度/长度:`eslint --no-eslintrc -c metrics.eslintrc.json --ext .js -f json -o evidence/<project>-eslint.json <project>/backend/src`,规则 `complexity:["warn",10]`、`max-lines-per-function:["warn",60]`。重复率:`jscpd <project>/backend/src <project>/frontend/src --reporters json --output evidence/<project>-jscpd` —— **重复率须 ≤ 3%**。 |
| 有效代码行 | **cloc**(仅代码;产品 + 测试分列) | cloc `code` 行(排除空行+注释),覆盖全部在范围内源码——JS/TS、Vue(`<template>`+`<script>`)、CSS/SCSS、HTML。**产品代码与测试代码分两个数字报告。** 排除配置(`package.json`、`*.config.*`、`tsconfig*`、eslintrc)、数据/种子/fixtures(`db.json`、`*seed*`)、lock 文件,以及生成物(`node_modules`、`dist`、`build`、`coverage`)。完整两遍 `cloc` 命令见 `basic_eval_cases.md` 执行标准。 |
| RESTful API 设计与兼容性 | **API 探测 + 人工路由审查** + **`git diff`** | 从路由+探测证据列出动词/路径/状态码,核对 REST 约定。兼容性(无快照):`git -C <project> diff HEAD -- <routes/controllers>`(未提交 vs 最近提交),否则 `git -C <project> diff HEAD~1 HEAD -- <routes/controllers>`(最近 vs 上一次),标记破坏性变更;若 `HEAD` 为空/`init`,只评设计层面兼容性。 |
| 安全 | **Semgrep**(SAST,官方规则)+ **NodeJS `fetch` API 探测**(`api_test.mjs`) | SAST:与代码质量同命令,聚焦鉴权/密钥/注入/XSS 规则。行为:API 探测跑越权、RBAC、归属、路径穿越、JWT 篡改。静态(Semgrep)与运行时(探测)交叉引用——不重复扣分。用 `jq '.results[] | {sev:.extra.severity, id:.check_id, path:.path}' evidence/<project>-semgrep.json` 查证据。 |
| 开源治理 | **license-checker** + **`npm audit --omit=dev`** | 仅两项检查。许可证:`cd <project>/<sub> && license-checker --production --summary`(`--json` 标记任何非 OSI 宽松/copyleft/UNKNOWN/UNLICENSED **依赖**——项目自身 license 字段不计分)。CVE:`npm audit --omit=dev --json` → 读 `.metadata.vulnerabilities` 看 High/Critical。 |
| 测试覆盖率(Basic B5) | **`c8`**(V8 覆盖率,可包裹任意 runner)+ 前端 **`vitest --coverage`** | 在覆盖率下跑项目**自带**套件:后端 `c8 --reporter=lcov --reporter=text <test-cmd>`(如 `c8 npm test`),前端 `vitest run --coverage` → `evidence/coverage/`。在范围内代码报告分支/行/函数覆盖率%;把已提交测试映射到端点/角色/错误路径(4xx)/核心场景;核查已提交 E2E(`playwright-cli`/Playwright)覆盖哪些 UI 写操作流程。套件无法运行 → B5 = 0。评判测试彻底程度,绝非应用正确性。 |
| 本轮专属域 | 复用上表已有工具;无合适者方可新增 | 运行前在该轮 eval-cases 文件中写明所选工具与确切命令。 |

## 证据
- 每个 API 用例把请求+响应记为 JSON;每个视觉用例引用一个截图文件。存于 `EvalSets/<round>/evidence/`。
- 报告以 `file:line` 引用代码发现。
