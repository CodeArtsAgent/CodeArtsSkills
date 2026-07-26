#!/usr/bin/env bash
#
# apply-tool-selections.sh
#
# Applies tool selections to agent definition files.
# Reads tool-selections.json + skill-registry.json, rewrites the
# permission.skill block in each agent file (methodology skills only).
# Built-in utility skills are NEVER touched.
#
# Per multi-tool-selection-plan.md §6.5. Idempotent - safe to re-run.
#
set -euo pipefail

SELECTIONS_FILE="${1:-.codeartsdoer/tool-selections.json}"
REGISTRY_FILE="${2:-.codeartsdoer/skills/sdlc-agentic-pipeline/references/skill-registry.json}"
AGENTS_DIR="${3:-.codeartsdoer/agents}"

if [ ! -f "$SELECTIONS_FILE" ]; then
    echo "ERROR: tool-selections.json not found at: $SELECTIONS_FILE" >&2
    echo "Run Step 0.0.5 (multi-tool selection) first." >&2
    exit 1
fi

if [ ! -f "$REGISTRY_FILE" ]; then
    echo "ERROR: skill-registry.json not found at: $REGISTRY_FILE" >&2
    exit 1
fi

if [ ! -d "$AGENTS_DIR" ]; then
    echo "ERROR: agents directory not found: $AGENTS_DIR" >&2
    echo "Run Step 0.0 (auto-provision) first." >&2
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required but not installed." >&2
    exit 1
fi

export SELECTIONS_FILE REGISTRY_FILE AGENTS_DIR

python3 << 'PYEOF'
import json, os, re, glob

selections_file = os.environ["SELECTIONS_FILE"]
registry_file   = os.environ["REGISTRY_FILE"]
agents_dir      = os.environ["AGENTS_DIR"]

BUILT_IN_KEYS = {
    "ide-tool", "doc-expert", "pptx", "data-analysis",
    "prd", "frontend-design", "i18n-integration",
}

with open(selections_file, encoding="utf-8") as f:
    selections = json.load(f)

with open(registry_file, encoding="utf-8") as f:
    registry = json.load(f)

# Build agent_type -> desired methodology frontmatter keys
agent_desired = {}
all_methodology_keys = set()

for skill in registry["methodologySkills"]:
    for k in skill["frontmatterKeys"]:
        all_methodology_keys.add(k)

    if skill["status"] != "available":
        continue

    sid = skill["id"]
    if not selections.get("tools", {}).get(sid, False):
        continue

    for agent_type in skill["grantedToAgents"]:
        agent_desired.setdefault(agent_type, set())
        for k in skill["frontmatterKeys"]:
            agent_desired[agent_type].add(k)

agent_files = sorted(glob.glob(os.path.join(agents_dir, "*-agent.md")))
if not agent_files:
    print(f"ERROR: No agent files found in: {agents_dir}", flush=True)
    raise SystemExit(1)

existing_agent_types = {re.sub(r"-agent\.md$", "", os.path.basename(f)) for f in agent_files}

for agent_type in agent_desired:
    if agent_type not in existing_agent_types:
        print(f"WARNING: grantedToAgents references '{agent_type}' but no {agent_type}-agent.md found in {agents_dir}. Skill permissions for this agent will be skipped.")

for fpath in agent_files:
    fname = os.path.basename(fpath)
    # Derive agent type: pm-agent.md -> pm
    agent_type = re.sub(r"-agent\.md$", "", fname)

    desired = agent_desired.get(agent_type, set())

    with open(fpath, encoding="utf-8") as f:
        content = f.read()

    # Split into frontmatter (between first two ---) and body
    m = re.match(r"^(---\r?\n)(.*?)(\r?\n---\r?\n)(.*)$", content, re.DOTALL)
    if not m:
        print(f"WARNING: No YAML frontmatter in {fname} - skipping")
        continue

    fm_open, fm_body, fm_close, doc_body = m.group(1), m.group(2), m.group(3), m.group(4)

    lines = fm_body.split("\n")
    result = []
    i = 0
    changed = False

    while i < len(lines):
        line = lines[i]

        # Detect "permission:" at column 0
        if re.match(r"^permission:\s*$", line):
            result.append(line)
            i += 1

            # Next line should be "  skill:"
            if i < len(lines) and re.match(r"^\s+skill:\s*$", lines[i]):
                result.append(lines[i])
                i += 1

                # Collect existing entries (4-space indent: "    key: value")
                has_wildcard = False
                builtin_entries = {}  # key -> value

                entry_re = re.compile(r"^    (\S[^:]*):\s*(.+)$")
                while i < len(lines) and entry_re.match(lines[i]):
                    em = entry_re.match(lines[i])
                    ek, ev = em.group(1), em.group(2).strip()

                    if ek == "'*'":
                        has_wildcard = True
                    elif ek in BUILT_IN_KEYS:
                        builtin_entries[ek] = ev
                    # methodology keys dropped (re-added below if desired)
                    i += 1

                # Rebuild: '*' first, then all keys alphabetical (builtin + desired)
                if has_wildcard:
                    result.append("    '*': deny")

                combined = dict(builtin_entries)
                for k in desired:
                    if k not in combined:
                        combined[k] = "allow"

                for k in sorted(combined.keys()):
                    result.append(f"    {k}: {combined[k]}")

                changed = True
            # else: permission without skill - continue normally
        else:
            result.append(line)
            i += 1

    if not changed:
        print(f"Skipped (no permission.skill block): {fname}")
        continue

    new_fm = "\n".join(result)
    new_content = fm_open + new_fm + fm_close + doc_body

    with open(fpath, "w", encoding="utf-8", newline="") as f:
        f.write(new_content)

    key_list = ", ".join(sorted(desired)) if desired else "(none)"
    print(f"Updated: {fname}  [agent: {agent_type}]  methodology keys: {key_list}")

print()
print("Done. Agent frontmatter permission.skill blocks updated based on tool selections.")
print("Built-in utility skills (ide-tool, doc-expert, pptx, data-analysis, prd, frontend-design, i18n-integration) were not modified.")
PYEOF
