# Godot MCP

[![Github-sponsors](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#EA4AAA)](https://github.com/sponsors/Coding-Solo)

[![](https://badge.mcpx.dev?type=server 'MCP Server')](https://modelcontextprotocol.io/introduction)
[![Made with Godot](https://img.shields.io/badge/Made%20with-Godot-478CBF?style=flat&logo=godot%20engine&logoColor=white)](https://godotengine.org)
[![](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white 'Node.js')](https://nodejs.org/en/download/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white 'TypeScript')](https://www.typescriptlang.org/)

[![](https://img.shields.io/github/last-commit/Coding-Solo/godot-mcp 'Last Commit')](https://github.com/Coding-Solo/godot-mcp/commits/main)
[![](https://img.shields.io/github/stars/Coding-Solo/godot-mcp 'Stars')](https://github.com/Coding-Solo/godot-mcp/stargazers)
[![](https://img.shields.io/github/forks/Coding-Solo/godot-mcp 'Forks')](https://github.com/Coding-Solo/godot-mcp/network/members)
[![](https://img.shields.io/badge/License-MIT-red.svg 'MIT License')](https://opensource.org/licenses/MIT)


```text
                           (((((((             (((((((
                        (((((((((((           (((((((((((
                        (((((((((((((       (((((((((((((
                        (((((((((((((((((((((((((((((((((
                        (((((((((((((((((((((((((((((((((
         (((((      (((((((((((((((((((((((((((((((((((((((((      (((((
       (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
     ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
    ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
      (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
        (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
         (((((((((((@@@@@@@(((((((((((((((((((((((((((@@@@@@@(((((((((((
         (((((((((@@@@,,,,,@@@(((((((((((((((((((((@@@,,,,,@@@@(((((((((
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((
         (((((((((@@@,,,,,,,@@((((((((@@@@@((((((((@@,,,,,,,@@@(((((((((
         ((((((((((((@@@@@@(((((((((((@@@@@(((((((((((@@@@@@((((((((((((
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
         @@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@
         ((((((((( @@@(((((((((((@@(((((((((((@@(((((((((((@@@ (((((((((
         (((((((((( @@((((((((((@@@(((((((((((@@@((((((((((@@ ((((((((((
          (((((((((((@@@@@@@@@@@@@@(((((((((((@@@@@@@@@@@@@@(((((((((((
           (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
              (((((((((((((((((((((((((((((((((((((((((((((((((((((
                 (((((((((((((((((((((((((((((((((((((((((((((((
                        (((((((((((((((((((((((((((((((((


                          /$$      /$$  /$$$$$$  /$$$$$$$
                         | $$$    /$$$ /$$__  $$| $$__  $$
                         | $$$$  /$$$$| $$  \__/| $$  \ $$
                         | $$ $$/$$ $$| $$      | $$$$$$$/
                         | $$  $$$| $$| $$      | $$____/
                         | $$\  $ | $$| $$    $$| $$
                         | $$ \/  | $$|  $$$$$$/| $$
                         |__/     |__/ \______/ |__/
```

A Model Context Protocol (MCP) server for the Godot game engine.

It lets an AI agent launch the editor, run a project and read its output, and
edit scenes — so the agent can see what actually happens in a real Godot
project instead of guessing.

## Tools

| Tool | What it does |
|------|--------------|
| `launch_editor` | Open the Godot editor for a project |
| `run_project` | Run a project in debug mode and start capturing output |
| `get_debug_output` | Read the running project's output and errors |
| `stop_project` | Stop the running project and return its final output |
| `get_godot_version` | Report the engine version in use |
| `list_projects` | Find Godot projects in a directory |
| `get_project_info` | Project name, path, engine version and file counts |
| `create_scene` | Create a scene with a given root node type |
| `add_node` | Add a node to an existing scene, with properties |
| `load_sprite` | Set a texture on a Sprite2D, Sprite3D or TextureRect |
| `save_scene` | Re-save a scene, optionally to a new path |
| `export_mesh_library` | Export a 3D scene as a MeshLibrary for GridMap |
| `get_uid` | Get a file's Godot UID (4.4+) |
| `update_project_uids` | Re-save resources to refresh UID references (4.4+) |

The first four drive a Godot process with a window and need a display on the
machine running the engine, so they are exposed over **stdio only**. Over HTTP
the server is typically a headless container elsewhere, where `godot -e` and
`godot -d` cannot open a window at all — listing them there would mean a client
calling a tool that can never work. Set `GODOT_MCP_PROCESS_TOOLS=true` to force
them on, e.g. after adding a virtual display to the image.

Arguments are camelCase (`projectPath`), and `snake_case` (`project_path`) is
accepted as an alias.

`load_sprite` runs Godot's import pass first when the texture has no
`.import` sibling yet, since a file just added to the project cannot be
loaded until the engine has imported it.

## Requirements

- [Godot](https://godotengine.org/download) installed
- Node.js 20 or later
- An MCP-capable client

## Quick start (local, stdio)

```bash
claude mcp add godot -- npx @coding-solo/godot-mcp
```

Restart your client and the tools are available. To pin the engine explicitly:

```bash
claude mcp add godot -e GODOT_PATH=/path/to/godot -- npx @coding-solo/godot-mcp
```

<details>
<summary><strong>Cursor</strong></summary>

Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": ["@coding-solo/godot-mcp"],
      "env": { "GODOT_PATH": "/path/to/godot" }
    }
  }
}
```

</details>

<details>
<summary><strong>Cline</strong></summary>

Add to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": ["@coding-solo/godot-mcp"],
      "env": { "GODOT_PATH": "/path/to/godot" }
    }
  }
}
```

</details>

<details>
<summary><strong>Building from source</strong></summary>

```bash
git clone https://github.com/Coding-Solo/godot-mcp.git
cd godot-mcp
npm install
npm run build
npm test
```

Then point your client at `build/index.js`.

</details>

## Remote deployment (HTTP)

The server also speaks MCP over Streamable HTTP, which is how it runs at
`godot-mcp.software.nuvello.com.br`.

### Coolify

`docker-compose.yml` is written for Coolify, which manages Traefik itself.
Deploy it as a **Docker Compose** resource pointed at this repository. Coolify
generates the proxy labels and the network, so none of that is in the compose
file — hand-written Traefik labels would fight the ones it adds.

The domain comes from Coolify. Declaring this in the service environment is
what asks for one and routes it to the container:

```yaml
SERVICE_FQDN_GODOT_MCP_8086: /
MCP_ALLOWED_HOSTS: ${SERVICE_FQDN_GODOT_MCP_8086}
MCP_ALLOWED_ORIGINS: ${SERVICE_URL_GODOT_MCP_8086}
```

The magic variable name is the compose service name uppercased with hyphens
turned into underscores, plus the port: `godot-mcp` → `GODOT_MCP_8086`.
`SERVICE_FQDN_*` is the domain without a scheme and `SERVICE_URL_*` includes
it, which is exactly what the two allowlists want — so the domain is never
written down twice and never drifts from whatever Coolify assigned.

### What changes when it is reachable over a network

Two settings are not optional in HTTP mode, and the process **refuses to
start** without them:

- **`GODOT_MCP_WORKSPACE`** — every project path is confined to this directory.
  The tools read and write files; without confinement, anyone who can reach the
  server could address any path on the host.
- **`MCP_ALLOWED_HOSTS`** — the accepted `Host` headers. This is what stops DNS
  rebinding, where a page on another origin points a name at this server and
  drives it from a visitor's browser.

Pass `projectPath` relative to the workspace (`my-game`, not
`/home/you/my-game`). A path that resolves outside it is refused, symlinks
included.

Each client session gets its own server instance, so one client cannot disturb
another's state.

### Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Documentation page: routes, connection snippets and every tool with its parameters |
| `GET` | `/healthz` | Liveness probe. Returns `{status:ok,sessions:n}` |
| `POST` | `/mcp` | MCP Streamable HTTP. An `initialize` request opens a session |
| `GET` | `/mcp` | Server-sent event stream for an open session |
| `DELETE` | `/mcp` | Close a session |

Requests after `initialize` carry the `Mcp-Session-Id` header it returned.

Opening the deployment in a browser serves the documentation page, which is
rendered from a real `tools/list` against this configuration — so it shows
exactly what a connecting client sees and cannot drift from the code.

Connect a client with:

```bash
claude mcp add --transport http godot https://godot-mcp.software.nuvello.com.br/mcp
```

### Getting projects into the workspace

The workspace is a named Docker volume (`godot-projects`) so it survives
redeploys. From Coolify's terminal for the container:

```bash
cd /workspace
git clone https://your-git-host/your-game.git
```

Or copy from the host:

```bash
docker cp ./my-game <container>:/workspace/
```

To mount a host directory instead, replace the volume with an absolute bind
mount in Coolify's compose editor.

### Running it locally

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# then point a client at http://localhost:8086/mcp
```

The override publishes the port, sets the host allowlist explicitly (the magic
variable means nothing outside Coolify) and bind-mounts `./workspace` so you
can drop projects straight in.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GODOT_PATH` | auto-detected | Path to the Godot executable |
| `DEBUG` | `false` | Verbose server logging (to stderr) |
| `GODOT_DEBUG` | `false` | Verbose logging inside the bundled GDScript. Leave off: its debug paths write temp files into your project and add delays |
| `GODOT_MCP_STRICT_PATHS` | `false` | Exit at startup instead of serving with an unusable Godot path |
| `GODOT_MCP_WORKSPACE` | unset | Confine every project path to this directory. **Required for HTTP** |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | `0.0.0.0` | Bind address (HTTP) |
| `MCP_HTTP_PORT` | `8086` | Port (HTTP) |
| `MCP_HTTP_ENDPOINT` | `/mcp` | MCP endpoint path (HTTP) |
| `MCP_ALLOWED_HOSTS` | unset | Comma-separated accepted `Host` headers. **Required for HTTP** |
| `MCP_ALLOWED_ORIGINS` | unset | Comma-separated accepted `Origin` headers |
| `GODOT_MCP_TIMEOUT_MS` | `120000` | Per-operation timeout |
| `GODOT_MCP_MAX_BUFFER` | `33554432` | Max bytes captured from one operation |
| `GODOT_MCP_MAX_SCAN_DEPTH` | `8` | Directory recursion limit |
| `GODOT_MCP_MAX_OUTPUT_LINES` | `5000` | Retained output lines per run |
| `GODOT_MCP_PROCESS_TOOLS` | on for stdio, off for HTTP | Expose the four display-dependent tools |

## How it works

```
src/
  index.ts          entrypoint: load config, probe Godot, pick a transport
  config.ts         typed configuration, with the HTTP safety checks
  server.ts         builds an McpServer and registers every tool
  lib/              logging, tool errors, path containment
  godot/            engine location, operation execution, running projects, scanning
  tools/            one module per tool group, each with its Zod schema
  transport/        stdio and Streamable HTTP, plus the snake_case alias shim
  docs/             the page served at /, rendered from a real tools/list
  scripts/
    godot_operations.gd   the bundled GDScript all scene edits go through
```

Simple things (launching the editor, reading the version) use Godot's CLI
directly. Scene edits go through a single bundled GDScript that receives its
operation name and parameters as JSON, so no temporary script is written per
call.

Every invocation uses `execFile` with an argument array, never a shell string,
so no caller-supplied value is ever interpreted as a command. Node types are
restricted to bare class names, which is what prevents a caller from
instantiating an arbitrary script.

## Troubleshooting

- **Godot not found** — set `GODOT_PATH`. Add `GODOT_MCP_STRICT_PATHS=true` to
  fail loudly at startup instead of on the first tool call.
- **"Not a Godot project"** — `projectPath` must name a directory containing a
  `project.godot` file. Use `list_projects` to find them.
- **"outside the configured workspace"** — on HTTP, paths are relative to
  `GODOT_MCP_WORKSPACE`.
- **An operation was "killed before finishing"** — it hit
  `GODOT_MCP_TIMEOUT_MS` or the output limit.
- **Connection issues over HTTP** — check that the request's `Host` header is
  listed in `MCP_ALLOWED_HOSTS`.

## License

MIT — see [LICENSE](LICENSE).
