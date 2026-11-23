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

Arguments are camelCase (`projectPath`), and `snake_case` (`project_path`) is
accepted as an alias.

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

```bash
docker compose up -d --build
```

Two things change when the server is reachable over a network, and the process
**refuses to start** without them:

- **`GODOT_MCP_WORKSPACE`** — every project path is confined to this directory.
  The tools read and write files; without confinement, anyone who can reach the
  server could address any path on the host.
- **`MCP_ALLOWED_HOSTS`** — the accepted `Host` headers. This is what stops DNS
  rebinding, where a page on another origin points a name at this server and
  drives it from a visitor's browser.

Put your Godot projects under `./workspace`, and pass `projectPath` relative to
it (`my-game`, not `/home/you/my-game`).

Each client session gets its own server instance, so one client's
`stop_project` cannot kill another client's run. `GET /healthz` is a liveness
probe for the container and the reverse proxy.

To run it locally without a reverse proxy:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# then point a client at http://localhost:8080/mcp
```

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
| `MCP_HTTP_PORT` | `8080` | Port (HTTP) |
| `MCP_HTTP_ENDPOINT` | `/mcp` | MCP endpoint path (HTTP) |
| `MCP_ALLOWED_HOSTS` | unset | Comma-separated accepted `Host` headers. **Required for HTTP** |
| `MCP_ALLOWED_ORIGINS` | unset | Comma-separated accepted `Origin` headers |
| `GODOT_MCP_TIMEOUT_MS` | `120000` | Per-operation timeout |
| `GODOT_MCP_MAX_BUFFER` | `33554432` | Max bytes captured from one operation |
| `GODOT_MCP_MAX_SCAN_DEPTH` | `8` | Directory recursion limit |
| `GODOT_MCP_MAX_OUTPUT_LINES` | `5000` | Retained output lines per run |

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
