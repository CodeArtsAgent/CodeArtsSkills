---
name: postman
description: "Connects CodeArts Agent to Postman's official MCP server for API testing, collection, and workspace management - run collections with test results, create/update workspaces, collections, environments, mocks, and specs, generate collections from OpenAPI specs, and search across your Postman resources, without opening the Postman app. Also supports projects whose Postman collection was never synced to a cloud account (offline / local-only), by editing the exported collection JSON file directly instead of using MCP. Use whenever the user asks to run a Postman collection, test an API via Postman, create or update a Postman collection/environment/workspace/mock/spec, sync code with an OpenAPI spec, search for an existing API/collection, list their Postman workspaces, or edit a local/offline Postman collection file."
---

# API Testing with Postman - CodeArts Agent

This file documents the verified tool catalog and workflows so CodeArts Agent has real, working access to workspaces, collections, environments, mocks, and specs - no manual clicking in the Postman app. It also covers the offline case, where the collection was never synced to a Postman account and MCP cannot reach it at all.

Tool catalog verified against the official source: `postmanlabs/postman-mcp-server` (v2.11.0, `src/enabledResources.ts`, minimal tool set - 42 tools).

## Mode Selection (ask once per project)

Before doing anything else, determine whether this project's Postman data lives in a **Cloud account** or is **Offline / local-only** (Postman Desktop's Lightweight API Client, or a workspace the user deliberately kept unsynced). These two paths are handled completely differently - only Cloud mode uses the MCP server described in the rest of this file.

**Check first**: if `.postman.json` already has a `"mode"` field, skip the question and use that value for the rest of the session.

If not, ask once with the `question` tool:
- Question: "Is this project's Postman collection in the cloud (synced to your account) or local/offline (never synced)?"
- Options: `"Cloud (Postman account)"`, `"Local / Offline (no account)"`

Then branch:
- **Cloud** → continue with "Connection" below, and write `"mode": "cloud"` to `.postman.json`.
- **Local / Offline** → skip the entire Connection/MCP section and go straight to **"Offline File Mode"** further down. Ask for the collection's file path instead of an API key, and write `"mode": "offline"` to `.postman.json`.

**Terminology note**: don't confuse "Offline / local-only" with the **"Local (stdio) server"** variant documented under "Region and mode variants" below - that stdio variant is still Cloud mode, just running the MCP server process on the user's machine instead of Postman's remote server, so it can reach `localhost` APIs. It still authenticates to, and reads/writes, the user's cloud account. "Offline / local-only" in this section means data that was **never synced to any account** - no API key, remote or local-stdio, can reach it.

## Connection

*(Cloud mode only - skip this entire section in Offline File Mode.)*

**Auth method: API key (Bearer token).** This is the default and recommended method for CodeArts Agent - OAuth was tested and found not to work reliably: CodeArts Agent opens the raw MCP endpoint URL (`https://mcp.postman.com/minimal`) directly in the browser instead of performing OAuth discovery and opening Postman's actual login/consent page, so the OAuth handshake never completes. API key auth bypasses this entirely.

### Interactive API key setup (no command-line installer)

When the Postman MCP connection is not yet configured (or needs a new key), CodeArts Agent should **ask the user for their Postman API key interactively** using the `question` tool - do NOT require the user to run a `node ... installer.js init --project --api-key=...` command.

**Steps the agent must follow:**

1. Check if `.codeartsdoer/mcp/mcp_settings.json` already contains a valid Postman `Authorization` header (i.e., `Bearer PMAK-...` with a non-placeholder key). If it does, skip asking and proceed to verify the connection.
2. If no key is present (or the key is a placeholder), ask the user:
   - Question: "Please provide your Postman API key (starts with `PMAK-...`). You can get one from Postman -> Account Settings -> API Keys."
   - Use the `question` tool with a single question and no predefined options (let the user type their key).
3. Write the key directly into `.codeartsdoer/mcp/mcp_settings.json` using the `write` tool, in this format:

```json
{
  "mcpServers": {
    "postman": {
      "type": "http",
      "url": "https://mcp.postman.com/mcp",
      "headers": { "Authorization": "Bearer PMAK-your-key-here" },
      "disabled": false
    }
  }
}
```

**Why full mode (`/mcp`) and not `/minimal`**: this skill's core purpose is running collections and seeing test results. Minimal mode's only execution tool is `runCollection`, which CodeArts Agent fails to register as callable (verified in practice - see Collection Runner notes). Full mode adds the Monitor tool family (`createMonitor`, `runMonitor`, `getMonitorRunResults`, etc.) - plain request/response tools that register normally and provide an MCP-native way to execute a collection and read per-request assertion results. The cost is a larger tool catalog (127 tools) loaded into context; for this skill, reliable test execution outweighs that overhead.

4. Verify the connection by calling a Postman MCP tool (e.g., `getAuthenticatedUser` or `getWorkspaces`). If it returns real data, the connection is live.
5. If the call fails with 401/Unauthorized, tell the user the key is invalid or expired and ask again.

Get a key from Postman -> Account Settings -> API Keys (starts with `PMAK-...`). Write the literal key value into `mcp_settings.json` directly - don't rely on `${POSTMAN_API_KEY}`-style variable substitution, since it's unverified whether CodeArts Agent resolves it.

### Region and mode variants
- **EU data residency**: `https://mcp.eu.postman.com/minimal` - API-key auth only (the EU server does not support OAuth).
- **Local (stdio) server** - required for `localhost` APIs (the remote server has no network path to your machine), and the first thing to try when `runCollection` isn't callable on the remote server (see Collection Runner notes below). This still uses your cloud account/API key - see the terminology note above:
  ```json
  {
    "mcpServers": {
      "postman": {
        "command": "npx",
        "args": ["@postman/postman-mcp-server"],
        "env": { "POSTMAN_API_KEY": "PMAK-your-key-here" }
      }
    }
  }
  ```
  The npm package (v2.11.0+) ships the full 42-tool minimal set including `runCollection`. Defaults to minimal mode; add `--full` or `--code` to switch modes.
- **Tool-set modes** (URL path on the remote server): `/mcp` (full - 127 tools, **this skill's default** because it includes the Monitor family needed for test execution), `/minimal` (42 tools, lowest token overhead but its only runner tool `runCollection` doesn't register in CodeArts Agent), `/code` (API discovery + client code generation), `/learn` (Postman Docs search). After switching modes, call `getEnabledTools` to confirm what's actually available.

### Verifying the connection
Restart CodeArts Agent, then ask: **"List my Postman workspaces."** Real workspace names back = connection is live. Don't assume success from config alone.

### Pre-usage health check (mandatory)

**Before performing any Postman task**, always run a lightweight health check to confirm the MCP server is reachable and the API key is still valid. This prevents confusing failures mid-task caused by expired tokens, network changes, or server outages.

**Procedure:**

1. Call `getWorkspaces` (a read-only, zero-side-effect tool that lists workspaces you can access).
2. Evaluate the result:
   - **Success** (returns workspace data): the server is healthy and the token is valid - proceed with the task.
   - **"Not connected"** or no response: the MCP server isn't registered. This usually means CodeArts Agent hasn't been restarted since `mcp_settings.json` was last modified. Ask the user to restart, then retry.
   - **401/Unauthorized**: the API key is expired or invalid. Ask the user for a new key interactively (see "Interactive API key setup" above), update `mcp_settings.json`, and ask for a restart.
   - **Network/timeout error**: the environment may lack outbound internet access. Test general connectivity (e.g., `Invoke-WebRequest https://example.com`) and check for proxy requirements before retrying.

**Do not skip this step** even if the connection worked in a previous session - tokens expire and network conditions change. The check is cheap (one read-only call) and catches problems early.

Example:
```javascript
// Health check before any Postman task
const result = await mcp_postman_getWorkspaces()
// If result contains workspace data → server healthy, token valid → proceed
// If error → diagnose per the cases above before continuing
```

## Available tools (full mode - 127 tools; core subset documented below, verified against official source)

Full mode exposes 127 tools. The subset below covers this skill's workflows (the 42 minimal-set tools plus the Monitor family and delete operations used for cleanup). For anything else - comments, forks, tags, Private API Network - call `getEnabledTools` for the complete list and rely on each tool's own schema.

**Workspace Management**
- `createWorkspace` - creates a workspace. Returns 403 if the account lacks permission; private/partner workspaces need Team/Enterprise plans.
- `getWorkspace` - gets one workspace's info (includes `visibility`: personal/team/private/public/partner).
- `getWorkspaces` - lists workspaces you can access. For "my workspaces", call `getAuthenticatedUser` first and filter by `createdBy`. Paginated - use `cursor` for more pages.
- `updateWorkspace` - updates name/visibility. Some visibility transitions are blocked on Free/Solo plans.

**Collection Management**
- `createCollection` - creates a collection (Postman Collection v2.1.0 schema). Without a `workspace` param, it lands in your oldest personal workspace.
- `getCollection` - gets a collection. Default returns a lightweight collection map (metadata + recursive itemRefs); `model=minimal` for root-level IDs only, `model=full` for the complete payload.
- `getCollections` - lists collections; **requires a `workspace` ID**.
- `putCollection` - replaces a collection's full contents. Omitting item ID values **deletes and recreates** all items with new IDs - pass them back to preserve item identity. Max size 100MB; supports async via `Prefer: respond-async`.
- `duplicateCollection` - copies a collection into another workspace (async - poll with `getDuplicateCollectionTaskStatus`).
- `getDuplicateCollectionTaskStatus` - checks the status of a `duplicateCollection` task.
- `createCollectionRequest` - adds a request to a collection. Always pass `name` explicitly or it's created blank.
- `updateCollectionRequest` - updates a request (PATCH-style, only changes what you pass). Cannot move a request between folders. Needs the bare collection ID, not a `uid`.
- `createCollectionResponse` - adds a saved example response to a request. Pass `name` explicitly.

**Collection Runner (test execution)**

Running a collection and reading test results via MCP has two paths. Try them in this order:

- `runCollection` - runs a collection by ID with detailed test results and execution statistics. `collectionId` must be in `<OWNER_ID>-<UUID>` format (the collection UID). Optional: `environmentId` (variable substitution), `stopOnError` / `stopOnFailure` (graceful halt), `abortOnError` / `abortOnFailure` (abrupt halt), `iterationCount` (default 1), `requestTimeout` (default 60000 ms), `scriptTimeout` (default 5000 ms).
  - **Known limitation in CodeArts Agent (verified in practice)**: `getEnabledTools` reports `runCollection` as enabled, but CodeArts Agent does **not** register it as a callable tool - it is the only long-running, progress-reporting tool in the set, and the client appears to drop it. Attempt it once; if it is not callable, use the Monitor path below - do not fall back to manual request execution or generic URL fetchers (e.g. `webfetch`), which skip test scripts, pre-request scripts, assertions, and environment variable resolution and produce no test results.
- **Monitor path (MCP-native, registers reliably)** - full mode's Monitor tools are plain request/response tools without progress reporting, so they register like the rest of the catalog. The pattern: create a monitor bound to the collection once, run it on demand, read per-request assertion results:
  - `createMonitor` - one-time setup. Requires `workspace` ID and a `monitor` object with `name`, `collection` (UID), `schedule` (pass an empty object `{}` for manual-only runs, or a `cron` + `timezone` for scheduled runs), optional `environment` (UID). Note: monitors cannot be created for collections added to an API definition.
  - `runMonitor` - executes the monitor's collection now. Pass `async: true` for long collections (a synchronous call that exceeds 300 seconds returns HTTP 202 and you must poll anyway); with async, poll `getMonitor` and read the `lastRun` property for status.
  - `getMonitorRunResults` - gets a specific run's results including trimmed execution logs (beforeItem and assertion events) and result counts - this is where per-request assertions and failure details live. Get the `runId` from the `runMonitor` response or from `listMonitorExecutions`.
  - Supporting tools: `getMonitors` (list, scope by `workspace`), `getMonitor` (status + `lastRun`), `updateMonitor`, `deleteMonitor`, `listMonitorExecutions`, `listRunsForExecution`.
  - **Monitors run from Postman's cloud** - the target API must be reachable from the internet. For `localhost` APIs, neither remote path works; use the local (stdio) server or Postman CLI.
- **Running requests one by one**: neither `runCollection` nor monitors can execute a single request in isolation - both always run a whole collection. To run APIs one at a time with test results, create one temporary single-request collection per request (`createCollection` + `createCollectionRequest`, reusing the original request definitions from `getCollection` with `model=full`), attach a monitor to each, and run them individually. Delete the temporary collections/monitors afterward (`deleteCollection`, `deleteMonitor` - available in full mode).
- **Last-resort fallback (outside MCP)**: Postman CLI as a shell command - `postman login --with-api-key PMAK-...` then `postman collection run <collectionId> -e <environmentId>`. Executes test scripts fully; also the right tool for `localhost` APIs and CI pipelines.

**Environment Management**
- `createEnvironment` - creates an environment. Without `workspace`, lands in your oldest personal workspace. Max request body 30MB.
- `getEnvironment` - gets one environment.
- `getEnvironments` - lists all environments you can access.
- `putEnvironment` - replaces an environment's full contents. Max request body 30MB.

**Mock Server Management**
- `createMock` - creates a mock server for a collection. **Needs the collection UID** (`ownerId-collectionId`), not the bare ID - resolve via `getCollection` (read `.uid`) or build it from `getAuthenticatedUser` (`teamId` for team collections, `user.id` for personal ones).
- `getMock` - gets a mock server's info, including its `mockUrl` and source `collection` UID.
- `getMocks` - lists your active mock servers. Always scope with `workspace` or `teamId`; if both given, `workspace` wins.
- `updateMock` - updates name/environment/privacy, or activates/deactivates a saved response via `config.serverResponseId`.
- `publishMock` - makes a mock server publicly accessible.

**Monitor Management (test execution backbone - full mode)**
- `createMonitor` - creates a monitor bound to a collection (by UID). Requires `workspace` and a `monitor` object with `name`, `collection`, `schedule` (empty object `{}` for manual-only). Optional `environment`, `retry`, `options` (requestDelay, requestTimeout, strictSSL), `distribution` (run region). Cannot be created for collections added to an API definition.
- `runMonitor` - runs the monitor's collection now and returns run results. Use `async: true` for long collections (sync calls exceeding 300 s return HTTP 202 anyway); then poll `getMonitor` and read `lastRun`.
- `getMonitorRunResults` - gets a specific run's results: trimmed execution logs (beforeItem + assertion events) and result counts - per-request assertions and failure details.
- `getMonitor` - monitor info including `lastRun` status.
- `getMonitors` - lists monitors; scope with `workspace` or `teamId`.
- `updateMonitor` / `deleteMonitor` - manage lifecycle.
- `listMonitorExecutions` / `listRunsForExecution` - execution history and run IDs.

**Cleanup (full mode)**
- `deleteCollection`, `deleteEnvironment`, `deleteMock`, `deleteMonitor`, `deleteSpec` - remove temporary resources created during one-by-one test runs. Destructive - confirm the ID targets a temporary resource before calling.

**API Specification Management**
- `createSpec` - creates a spec in Spec Hub (OpenAPI 2.0/3.0/3.1, AsyncAPI 2.0/3.0, protobuf 2/3, GraphQL, Smithy). Multi-file specs need exactly one root file; 12MB max per file. A `/` in a file path creates a folder.
- `getSpec` - gets a spec's metadata.
- `getAllSpecs` - lists all specs in a workspace.
- `getSpecDefinition` - gets a spec's full definition contents (OpenAPI/AsyncAPI only).
- `updateSpecProperties` - updates spec metadata (e.g. name).
- `createSpecFile` - adds a file to an OpenAPI/protobuf spec. New files default to `DEFAULT` type; 10MB max.
- `getSpecFile` - gets one spec file's contents.
- `getSpecFiles` - lists all files in a spec.
- `updateSpecFile` - updates a spec file's content or type (not both in one call - separate calls required). Setting a file to `ROOT` demotes the previous root to `DEFAULT`.

**Code Generation & Sync**
- `generateCollection` - generates a collection from an existing spec (async, returns a polling link).
- `generateSpecFromCollection` - generates an OpenAPI 2.0/3.0/3.1 spec from a collection (async, returns a polling link).
- `getGeneratedCollectionSpecs` - gets the spec that was generated for a given collection.
- `getSpecCollections` - gets all collections generated from a given spec.
- `syncCollectionWithSpec` - re-syncs a generated collection with its source spec (async, OpenAPI 2.0/3.0/3.1 only, source spec must match).
- `syncSpecWithCollection` - re-syncs a spec with its linked collection (async, same OpenAPI-only restriction).

**Search**
- `searchPostmanElements` - searches across requests, collections, workspaces, specs, flows, environments, and mocks. Use `ownership: organization` (default, your org's resources), `external` (public network, e.g. "Stripe API"), or `all`. Supports structured `filters` (`$and` array; fields like `workspaceId`, `visibility`, `method`, `tags`, `createdBy` - see tool schema for full operator support).

**User & Metadata**
- `getAuthenticatedUser` - gets the current user's identity (`user.id`, `username`, `teamId`, roles). Call this first whenever a request says "my ..." (my workspaces, my info) to resolve the user/team ID.
- `getTaggedEntities` - gets entities by tag. **Requires an Enterprise plan** - 404s on Free/Basic/Professional.
- `getEnabledTools` - run this first if an expected tool seems unavailable; reports which tools are enabled in full vs. minimal mode.

## Tool usage examples

```javascript
// Resolve "my" context first
const { user } = await mcp_postman_getAuthenticatedUser()

// List my workspaces
const { workspaces } = await mcp_postman_getWorkspaces({ createdBy: user.id, limit: 100 })

// Create a collection
mcp_postman_createCollection({
  workspace: "workspace-id",
  collection: {
    info: {
      name: "User API",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    }
  }
})

// Create an environment
mcp_postman_createEnvironment({
  workspace: "workspace-id",
  environment: {
    name: "Local",
    values: [{ key: "base_url", value: "http://localhost:3000", enabled: true }]
  }
})

// Run a collection with tests (note: collectionId is the UID: <OWNER_ID>-<UUID>)
mcp_postman_runCollection({
  collectionId: "12345-33823532ab9e41c9b6fd12d0fd459b8b",
  environmentId: "environment-id",
  stopOnFailure: false,
  iterationCount: 1
})

// Search across your organization's resources
mcp_postman_searchPostmanElements({
  query: "orders",
  elementTypes: ["collections", "specs"],
  ownership: "organization"
})
```

## Workflows

**Project setup:**
```javascript
const { user } = await mcp_postman_getAuthenticatedUser()
const { workspace } = await mcp_postman_createWorkspace({ workspace: { name: "Project", type: "personal" }})
const { collection } = await mcp_postman_createCollection({ workspace: workspace.id, collection: { info: { name: "API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }}})
const { environment } = await mcp_postman_createEnvironment({ workspace: workspace.id, environment: { name: "Local", values: [{ key: "base_url", value: "http://localhost:3000", enabled: true }]}})
// Save IDs to .postman.json (see "State tracking" below)
```

**Run tests against a deployed API (primary: Monitor path):**
```javascript
// One-time setup: resolve the collection UID and create a manual-run monitor
const { collection } = await mcp_postman_getCollection({ collectionId: "collection-id" })
// collection.uid is "<OWNER_ID>-<UUID>"
const { monitor } = await mcp_postman_createMonitor({
  workspace: "workspace-id",
  monitor: {
    name: "API Test Runner",
    collection: collection.uid,
    environment: "environment-uid",   // optional
    schedule: {}                       // empty = manual runs only
  }
})
// Save monitor.id to .postman.json for reuse

// Every test run afterwards:
const run = await mcp_postman_runMonitor({ monitorId: monitor.id, async: true })
// Poll until finished, then read per-request assertions and failures:
const status = await mcp_postman_getMonitor({ monitorId: monitor.id })  // check lastRun
const results = await mcp_postman_getMonitorRunResults({ monitorId: monitor.id, runId: run.id })
// results contain assertion events and failure details per request
```
Try `runCollection` first (single call, richest options) - but if the agent reports it isn't callable (the known CodeArts Agent registration gap), use the Monitor path above. If neither MCP path fits (e.g. `localhost` target), fall back to the Postman CLI as a shell command:
```
postman login --with-api-key PMAK-your-key
postman collection run <collectionId> -e <environmentId>
```

**Run APIs one by one with test results:**
```javascript
// Neither runCollection nor monitors can run a single request - both run whole collections.
// Pattern: one temporary single-request collection per API, each with its own monitor.
const { collection: source } = await mcp_postman_getCollection({ collectionId: "collection-id", model: "full" })
for (const item of source.item) {           // each request in the source collection
  const { collection: single } = await mcp_postman_createCollection({
    workspace: "workspace-id",
    collection: { info: { name: `single - ${item.name}`, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }, item: [item] }
  })
  const { monitor } = await mcp_postman_createMonitor({
    workspace: "workspace-id",
    monitor: { name: `run - ${item.name}`, collection: single.uid, schedule: {} }
  })
  const run = await mcp_postman_runMonitor({ monitorId: monitor.id, async: true })
  // poll getMonitor, then getMonitorRunResults for this request's assertions
  // cleanup when done: deleteMonitor + deleteCollection (available in full mode)
}
```

**Generate a collection from an OpenAPI spec:**
```javascript
const { spec } = await mcp_postman_createSpec({ workspaceId: "workspace-id", name: "API Spec", type: "OPENAPI:3.0", files: [{ path: "openapi.yaml", content: "..." }]})
const result = await mcp_postman_generateCollection({ specId: spec.id, elementType: "collection", name: "Generated Collection" })
// result returns a polling link - poll it until the generation task completes
```

**Create a mock server (resolving the UID correctly):**
```javascript
const { collection } = await mcp_postman_getCollection({ collectionId: "collection-id" })
const mock = await mcp_postman_createMock({ collection: collection.uid, workspace: "workspace-id" })
```

**Keeping requests honest during a refactor**: after changing an API's shape in code, call `syncCollectionWithSpec` / `syncSpecWithCollection` so the collection and spec don't drift from the implementation - only works for collections/specs generated from an OpenAPI 2.0/3.0/3.1 spec in the first place.

**Finding an existing resource before creating a duplicate:**
```javascript
const results = await mcp_postman_searchPostmanElements({
  query: "Orders API",
  elementTypes: ["collections"],
  ownership: "organization"
})
// Check results before calling createCollection again
```

## State tracking: `.postman.json`

Store workspace/collection/environment IDs at the project root after first setup, so later sessions reuse them instead of recreating each time:

```json
{
  "mode": "cloud",
  "workspaceId": "workspace-id",
  "collectionId": "collection-id",
  "collectionUid": "ownerId-collectionId",
  "environmentId": "environment-id",
  "monitorId": "monitor-id"
}
```

Store both the bare `collectionId` (needed by `updateCollectionRequest`) and the `collectionUid` (needed by `runCollection`, `createMonitor`, and `createMock`), plus the `monitorId` after first monitor setup so test runs reuse the same monitor instead of creating a new one each session. Check that stored IDs still resolve via `getCollection`/`getEnvironment`/`getMonitor` before creating anything new - or use `searchPostmanElements` to check for an existing resource by name first.

The `"mode"` field is what Mode Selection (top of this file) checks on later sessions to skip re-asking Cloud vs. Offline. See "Offline File Mode" below for the `mode: "offline"` variant of this file.

## Continuous testing without hooks

CodeArts Agent has no file-watch/hook mechanism, so "run tests automatically on every code change" isn't available as a background trigger:

- **On-demand**: explicitly ask CodeArts Agent to call `runCollection` after API changes - e.g. "I changed the Orders endpoint, run the Postman collection and show me any failures." If `runCollection` isn't callable in the session, the agent should use the Postman CLI shell command instead (see Collection Runner notes).
- **CI-gated**: for pipeline-level enforcement, add a Postman CLI (`postman collection run`) or `newman run` step to a CodeArts Pipeline stage (alongside CodeArts Check/Build) so collection tests run on every push/merge request. `runCollection` via MCP is for interactive agent sessions; the CLI path is for unattended CI.

## Offline File Mode (no Postman account)

Use this path only when the user selected **"Local / Offline"** in Mode Selection. This does **not** use the Postman MCP server, any URL, or any API key - Postman's API has no visibility into data that was never synced to an account, so there is nothing to authenticate to and no cloud workaround. All work happens on the exported collection file directly, using CodeArts Agent's own file tools (`view`, `str_replace`, `create_file`) - not MCP tools.

### Getting the file
Ask the user: *"What's the file path to your exported Postman collection JSON? (In Postman Desktop: right-click the collection → Export → Collection v2.1.)"*

If the project is brand new and no collection exists yet, create a minimal empty one instead and confirm the path with the user:
```json
{
  "info": {
    "name": "New Collection",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": []
}
```

### Adding or editing a request
Each entry in `item[]` is either a request or a folder (a nested `item[]`) - never both on the same object. Example request object to add:
```json
{
  "name": "Create Order",
  "request": {
    "method": "POST",
    "url": { "raw": "{{base_url}}/orders", "host": ["{{base_url}}"], "path": ["orders"] },
    "header": [{ "key": "Content-Type", "value": "application/json" }],
    "body": { "mode": "raw", "raw": "{\n  \"items\": [],\n  \"customerId\": \"\"\n}" }
  }
}
```
Read the file, add or modify the relevant object inside `item[]` with `str_replace` (or rewrite the whole file with `create_file` for larger changes), then save.

### Environments (offline)
Environments are separate files (conventionally named `*.postman_environment.json`), edited the same way. Ask for the path, or create one:
```json
{
  "name": "Local",
  "values": [{ "key": "base_url", "value": "http://localhost:3000", "enabled": true }]
}
```

### Running tests offline
CodeArts Agent cannot drive Postman Desktop's UI, so to actually execute requests, use **Newman** (Postman's own CLI test runner) as a shell command - it reads the same collection/environment JSON files and works fully offline, including against `localhost`:
```
newman run collection.json -e environment.json
```
If Newman isn't installed: `npm install -g newman`. This is also the only offline path to real test-script/assertion results - editing the JSON by hand doesn't execute anything.

### What's not possible offline
- **Mock servers** - hosted entirely on Postman's cloud infrastructure; there is no offline equivalent.
- **Auto-sync between a spec and a collection** (`syncCollectionWithSpec`) - a cloud API operation on linked cloud objects. Offline, the closest equivalent is manually re-running an OpenAPI-to-collection generator (e.g. the `openapi-to-postmanv2` CLI) and reviewing the diff yourself.
- **Workspaces** - an organizational concept that only exists once data is synced to an account. Offline, there's just the flat collection file - don't ask the user to name or create a workspace.
- **Team collaboration / sharing** - by definition, nothing here has left the user's machine.

### Getting changes back into Postman Desktop
CodeArts Agent edits the file on disk; it cannot trigger Postman Desktop's Import dialog. After each meaningful change, tell the user: *"Updated `<path>` - re-import it in Postman Desktop (File → Import) to see the changes there."*

### State tracking (offline variant)
```json
{
  "mode": "offline",
  "collectionFilePath": "/path/to/orders-collection.json",
  "environmentFilePath": "/path/to/orders.postman_environment.json"
}
```

## Local vs Cloud - capability matrix

| Capability | Cloud mode | Offline File Mode |
|---|---|---|
| Workspace | Yes - organizes collections | Doesn't exist |
| Collection storage | Postman's cloud, ID-addressable | Flat JSON file on disk |
| Search before creating | `searchPostmanElements` | Check if the file exists |
| Generate from OpenAPI spec | `generateCollection` (MCP, async) | `openapi-to-postmanv2` CLI (offline) |
| Run collection with test results | `runCollection` / Monitor path | Newman (`newman run`) |
| Reach `localhost` APIs | Only via the local (stdio) MCP server | Native - no workaround needed |
| Mock server | Yes | Not possible |
| Auto-sync spec ↔ collection | `syncCollectionWithSpec` | Not possible - manual re-generate only |
| CI/CD integration | Postman CLI / Newman | Newman - identical |
| State tracking | Cloud IDs in `.postman.json` | File paths in `.postman.json` |
| Team collaboration | Yes | No |
| Cleanup | Delete via API | Delete the local file |

## Best practices

- Store IDs in `.postman.json`, or search before creating to avoid duplicates.
- Use environment variables per context (local/staging/production) instead of hardcoding `base_url`.
- When calling `putCollection`/`putEnvironment`, pass back existing item/ID values to preserve identity - omitting them recreates everything with new IDs.
- Add post-request test scripts to collections, not just status-code checks - `runCollection` reports per-test outcomes.
- Confirm the target API server is running (and reachable from Postman's cloud, for the remote server) before calling `runCollection`.
- Organize requests in folders as the collection grows.
- **Rotate the API key periodically** and never commit `mcp_settings.json` with a live key to a shared repo - it's a credential, treat it like one.

## Prompting tip

Be explicit - *"Use the Postman MCP tools to run this collection"* - rather than a bare "test this API," since CodeArts Agent also has native Repo/Check/Build tools it could reach for instead.

## Troubleshooting

- **"Collection not found"**: call `getCollections` (needs a `workspace` ID) to verify the ID and permissions. For `runCollection`, make sure you passed the UID format (`<OWNER_ID>-<UUID>`), not the bare ID.
- **"Environment not found"**: call `getEnvironments` with the correct workspace context.
- **`getEnabledTools` reports `runCollection` as enabled, but the agent says it isn't callable**: known CodeArts Agent behavior - the client registers every plain tool but drops this one (the only progress-reporting tool). Use the Monitor path instead: `createMonitor` (once, `schedule: {}`) then `runMonitor` + `getMonitorRunResults` - these register normally and return per-request assertion results. Do not accept manual request execution or generic URL fetchers (e.g. `webfetch`) as a substitute - those skip test scripts, pre-request scripts, and assertions, and produce no test results.
- **Monitor run succeeds but the target API is unreachable**: monitors execute from Postman's cloud - the API must be reachable from the internet. For `localhost` targets, use the local (stdio) server or the Postman CLI.
- **`runCollection` can't reach the API**: the remote server has no network path to `localhost` - switch to the local (stdio) server variant for local API testing.
- **401/Unauthorized**: the API key is missing, wrong, or expired - regenerate in Postman and ask CodeArts Agent to update the key in `mcp_settings.json` interactively.
- **Browser opens `https://mcp.postman.com/...` and errors with "Method not allowed"**: that's the OAuth path - don't use it. Confirm `mcp_settings.json` has a `headers.Authorization` block instead of relying on OAuth.
- **A tool you expect isn't available**: call `getEnabledTools` first - it reports what's actually enabled in the current mode (minimal vs. full) before you assume something is missing.
- **Agent doesn't see any Postman tools**: confirm the server name is still `postman`, then re-verify with "list my Postman workspaces."
- **Malformed collection/folder JSON**: each item needs either `request` (a request) or `item` (a folder array) - never both. Name the specific field if the agent gets this wrong, rather than asking it to "fix the JSON."
- **`getTaggedEntities` returns 404**: that tool requires an Enterprise plan - expected on Free/Basic/Professional.
- **User wants to access a local/offline workspace with a PMAK key**: not possible - a PMAK key authenticates to a Postman account, and offline data was never synced to one. There is no cloud-side workaround, remote or local-stdio. Switch to "Offline File Mode" above instead.
