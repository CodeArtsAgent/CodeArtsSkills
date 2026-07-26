# Step 9 Report Generation Specification

> This file is the **single source of truth** for the SDLC process report
> generated at the end of Step 9. Referenced by `pipeline.md` Step 9 and
> `SKILL.md` §"Step 9: Report Generation Details".

---

## HTML Report (`reports/sdlc-report.html`)

- Self-contained vanilla HTML/CSS (no frameworks) — inline CSS, no external
  dependencies
- Save in the repository directory
- All hyperlinks must open in the user's **external system browser**
  (use `target="_blank"`)
- All hyperlinks must be **real working URLs** (not `#` placeholders)
  constructed from `.env` values:

| Service | URL Pattern |
|---------|-------------|
| Jira | `https://{JIRA_CLOUD_ID}/browse/{ISSUE-KEY}` |
| GitHub repo | `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}` |
| PRs | `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/pull/{PR_NUMBER}` |
| SonarCloud | `https://sonarcloud.io/project/overview?id={SONAR_PROJECT_KEY}` |
| JFrog | `{JFROG_PLATFORM_URL}/ui/repos/tree/General/{JFROG_REPO_KEY}` |
| GitHub Actions | `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/actions` |

---

## Report Contents (Single-Page Scrollable)

### Header
- Project name (linked to GitHub repo)
- Sprint name
- Date range
- Overall status badge

### Summary Table
| Column | Description |
|--------|-------------|
| Step | Pipeline step number |
| Status | Pass/Fail/In Progress |
| Agent | Agent name |
| Key outcome | Short summary |

### Step-by-Step Detail Cards (Expand/Collapse)

**Step 0 — Service Links:**
- GitHub repo, Jira board, SonarCloud dashboard, JFrog repo — all clickable

**Step 1 — Jira Tasks Table:**
- Clickable hyperlinks to each Jira issue
- Columns: key, summary, label, status

**Step 3 — Development Table:**
- Branch names, PR links (clickable), merge status per Jira task

**Step 5 — E2E Test Results:**
- Test scenarios, PASS/FAIL badges, durations, total count

**Step 6 — CI/CD Pipeline:**
- GitHub Actions link, stage-by-stage pass/fail status
- JFrog Docker image table: image name, tags, size, verified badge
- SonarCloud QG metric cards:
  - Coverage % (actual number, not ">80%")
  - Duplication % (actual number, not "<3%")
  - Security rating (A/B/C/D/E)
  - Reliability rating (A/B/C/D/E)
  - Maintainability rating (A/B/C/D/E)
  - Bugs count
  - Vulnerabilities count
  - Code smells count

**Step 8 — Deployment:**
- Docker pull, container start, health check HTTP code, deployment URL

### Sprint Velocity Chart
- CSS-based bar chart

### Retrospective Section
- What went well
- What didn't go well
- Action items

---

## Push Report to GitHub

1. Delegate to developer agent (Backend if both active, otherwise sole
   developer) to create a `docs/sdlc-reports` branch from `dev`
2. Commit `reports/sdlc-report.html`
3. Create PR targeting `dev` and merge it (GitHub branch protection applies
   to the whole branch, so a PR is required)
4. Report PR link or commit URL to user

---

## Present Report to User

- Show file path to `reports/sdlc-report.html`
- Show GitHub PR link where report was pushed