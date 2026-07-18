# Environment Version and Installation Policy

## Contents

1. Scope
2. Evidence order
3. Version decision
4. Mandatory installation approval
5. Package dependencies
6. Credential readiness
7. Service startup readiness
8. Audit requirements
9. Supported platform behavior

## Scope

Apply this policy to runtimes, package managers, compilers, SDKs, browsers, databases, services, container tooling, system libraries, and repository package restoration. Never install, upgrade, downgrade, download, or globally reconfigure these without explicit user approval for the specific action.

Read-only discovery is allowed: inspect repository files and run already-installed tools with version or diagnostic flags that do not mutate state.

## Evidence order

Derive requirements from the base revision in this order:

1. version-manager files such as `.nvmrc`, `.node-version`, `.python-version`, `.tool-versions`, or language-specific toolchain files;
2. manifest constraints such as `engines`, SDK targets, or build configuration;
3. lockfiles and package-manager declarations;
4. CI, container, and deployment configuration;
5. repository documentation;
6. explicit human instruction.

Record the exact file, field, or human decision. When sources conflict, do not choose silently; show the conflict and ask.

## Version decision

Normalize versions only when comparison is reliable.

- Minimum requirement: reuse an installed local version when it is equal to or higher than the minimum.
- Exact requirement: reuse only the exact version.
- Bounded requirement: reuse only when the installed version is within the declared range, even if it is higher than the minimum.
- Multiple installed compatible versions: use the already-active compatible version. Do not change the global default or shell profile.
- Missing, lower, out-of-range, conflicting, prerelease-ambiguous, or unparseable version: set `needs-user-decision` and ask whether installation is required.

Do not claim compatibility merely because a numeric version is higher when the project declares an exact version, upper bound, incompatible major, implementation variant, or platform constraint.

## Mandatory installation approval

Before any install or environment mutation, present:

- component and proposed version;
- repository evidence and current local version;
- why the existing environment cannot be reused;
- exact command, source, scope, download/network need, and expected filesystem changes;
- alternatives such as providing an existing environment, using a container already present, or continuing only with non-executable design work.

Use the structured user-input tool to ask whether to install. General H0 consent, prior permission to run tests, or permission to create snapshots is not installation approval. Record `approvedBy`, `approvedAt`, exact command, version, source, and scope before executing the approved command.

Without explicit approval, do not run commands such as `brew install`, `apt install`, `nvm install`, `pyenv install`, `sdk install`, `npm install`, `pnpm install`, `yarn install`, `pip install`, `poetry install`, `bundle install`, `cargo install`, `playwright install`, `docker pull`, or their equivalents. Do not edit shell profiles, global package state, version-manager defaults, or system services.

If the user declines, mark `installation-declined`. Continue only with stages and cases that do not require the missing environment. If executable release coverage depends on it, report the block instead of silently weakening the result check.

## Package dependencies

Treat repository libraries differently from runtimes. Respect the manifest and lockfile; do not substitute an arbitrary higher library version. Reuse an already-restored dependency tree only after checking it against the lockfile. If restoring packages requires downloads or writes dependency directories, ask before running the install or restore command.

Do not generate or update a lockfile unless the case itself explicitly requires that change and the user has authorized it.

## Execution readiness barrier

Complete dependency discovery, approval, installation or restoration, and verification before creating evaluation task snapshots or starting child agents. Use one sealed pre-run environment as the source for every attempt and record its identity in the execution configuration.

After the first evaluated task starts, prohibit all dependency installation, restoration, download, upgrade, downgrade, and environment mutation by the main agent, case coordinators, workers, Runner, and evaluated systems. If a missing or incompatible dependency is discovered during execution, stop the entire run. After explicit approval and remediation, start a new run and recreate every snapshot; do not continue the old run with mixed environments.

## Credential readiness

Discover only credentials required by the application under evaluation, including test accounts, database accounts, or equivalent application-service identities. Exclude credentials for the evaluated coding product, authoring agent, Judge, source browsing, and benchmark infrastructure.

Do not ask during intake whether credential-dependent cases are allowed or generally available. Before authoring any dependent case, perform a least-privilege, non-destructive readiness check using an already available secure injection mechanism. Record the requirement name, check type, timestamp, redacted status, and cleanup evidence; never read into artifacts or persist usernames, passwords, tokens, keys, connection strings, cookies, or secret-bearing command output. Clean any created session or temporary credential state immediately after the check.

Treat `verified` as a release prerequisite for every credential required by an executable case. If a credential is missing, invalid, over-privileged for a safe check, or cannot be checked without an unauthorized mutation, do not author or release the dependent case. Ask only for remediation of the concrete failed requirement, then repeat the readiness check before continuing. Re-run the same redacted checks before execution and before credential-dependent Judge verification so failures surface before measured work.

## Service startup readiness

For every HTTP server, database, queue, worker, browser service, or other process required by planned executable coverage, prove the same lifecycle that execution will use before authoring a dependent case:

1. record the baseline for processes, ports, relevant database/schema state, outside-workspace paths, caches, and generated files;
2. start the service with the planned existing command and sealed environment, without installing, restoring, compiling, migrating, or changing dependencies unless that exact mutation was separately approved;
3. wait within a bounded timeout and probe an application-level readiness condition, such as a successful health endpoint, expected HTML/API response, authenticated no-op, or harmless database query; an open port or running PID alone is insufficient;
4. exercise the minimum required integration when a dependent case needs more than startup, while using disposable namespaces or rollback-only state;
5. stop the full process tree, remove created sessions and temporary state, and verify the recorded baseline with no dirty data remaining.

Record the start command, probe, timeout, process identities, result, logs, cleanup actions, and baseline comparison in `environment-preflight.json` and both language reports. Treat startup and cleanup success as a release prerequisite for every dependent executable case. If startup, readiness, shutdown, or cleanup fails, do not author that case; remediate and repeat the entire check.

Generate publishes the sanitized, product-independent startup contract in the released track's immutable `execution-contract.json.serviceReadiness`. Execute repeats the lifecycle without changing that contract and records its live verification status and time in the minimal execution request. The Runner merges those live facts with the immutable contract and publishes the selected candidate-safe records in `execution-state.json.todo.serviceReadiness`. Include only the relative working directory, optional build command, start command, bounded readiness probe, stop strategy, opaque requirement and cleanup IDs, verified time, and operational notes. Never copy secret values, secret-bearing command arguments, private evidence paths, private checks, answers, or scores. The main coordinator and active case coordinator may read this shared section. A worker receives only the current case's matching English records through `worker-envelope.json.serviceContext`, never the complete state.

Do not require or probe Docker, Kubernetes, or other container tooling merely because the repository contains a container configuration file. Inventory such tooling only when it is the selected startup path or a planned case requires it.

## Audit requirements

Produce `environment-preflight.json` and paired `environment-preflight.zh-CN.md` and `environment-preflight.en.md`. Record each requirement, evidence, local version, comparison, decision, installation approval if any, final verified version, and unresolved risk.

At release, every environment required by selected executable cases must be `reuse-local`, `installed-and-verified`, or explicitly `not-required`. Semantic compatibility remains a human-reviewed risk even when numeric comparison passes.

## Supported platform behavior

Use Node.js built-ins and process argument arrays so the helpers work on macOS, Linux, and recognized Windows environments without Bash or PowerShell syntax. On Windows:

- preserve `SystemRoot`, `WINDIR`, `ComSpec`, `PATHEXT`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `PROGRAMDATA`, `PROGRAMFILES`, and `PROGRAMFILES(X86)` when launching child commands;
- terminate full process trees with `taskkill.exe /PID <pid> /T /F` before cleanup;
- retry recursive deletion to tolerate transient file locks;
- reject Windows device names and trailing-dot IDs, and keep the evaluation root short enough for a 240-character attempt-path safety budget;
- use the same-machine filesystem only. Cross-machine transport and path remapping are not supported.
