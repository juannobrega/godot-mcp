import type { ServerConfig } from '../config.js';
import type { ToolInfo } from './introspect.js';

/** HTML-escape text that came from a schema, a config value or a header. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #fbfbfa; --panel: #fff; --ink: #1a1a18; --muted: #6b6b66;
  --line: #e4e4e0; --accent: #478cbf; --code-bg: #f3f3f1;
  --ok: #2f7d4f; --warn: #8a5a00;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a; --panel: #1d1d22; --ink: #ececea; --muted: #9a9a94;
    --line: #2e2e36; --accent: #6aa9d8; --code-bg: #24242b;
    --ok: #6cc08b; --warn: #d9a84a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 56rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
h1 { font-size: 1.75rem; margin: 0 0 .25rem; letter-spacing: -.02em; }
h2 { font-size: 1.1rem; margin: 2.75rem 0 .85rem; letter-spacing: -.01em; }
h3 { font-size: .95rem; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
p { margin: .6rem 0; }
.lede { color: var(--muted); margin: 0 0 1.5rem; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .86em; }
code { background: var(--code-bg); padding: .12em .4em; border-radius: 4px; }
pre {
  background: var(--code-bg); padding: .9rem 1rem; border-radius: 8px;
  overflow-x: auto; border: 1px solid var(--line); margin: .7rem 0;
}
pre code { background: none; padding: 0; }
table { width: 100%; border-collapse: collapse; margin: .7rem 0; display: block; overflow-x: auto; }
th, td { text-align: left; padding: .5rem .7rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; }
td code { white-space: nowrap; }
.tool {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 1rem 1.15rem; margin: .7rem 0;
}
.tool-head { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
.tool p { color: var(--muted); margin: .35rem 0 0; }
.tag {
  font-size: .68rem; text-transform: uppercase; letter-spacing: .05em;
  padding: .15em .5em; border-radius: 4px; border: 1px solid var(--line);
  color: var(--muted); font-weight: 600;
}
.tag.read { color: var(--ok); border-color: currentColor; }
.params { margin: .7rem 0 0; font-size: .88rem; }
.params th, .params td { padding: .3rem .6rem .3rem 0; border-bottom: none; }
.req { color: var(--accent); font-weight: 600; }
.note {
  border-left: 3px solid var(--warn); background: var(--panel);
  padding: .8rem 1rem; border-radius: 0 8px 8px 0; margin: 1rem 0;
}
.note strong { color: var(--warn); }
footer { margin-top: 3.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem; }
a { color: var(--accent); }
`;

export interface PageOptions {
  config: ServerConfig;
  tools: ToolInfo[];
  version: string;
  /** Public host, taken from the request so the examples are copy-pasteable. */
  host: string;
  secure: boolean;
}

export function renderDocsPage(options: PageOptions): string {
  const { config, tools, version, host, secure } = options;
  const origin = `${secure ? 'https' : 'http'}://${host}`;
  const endpoint = `${origin}${config.http.endpoint}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Godot MCP server</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>Godot MCP server</h1>
  <p class="lede">
    Model Context Protocol server for the Godot game engine &middot; v${escape(version)}
  </p>

  <p>
    This server lets an MCP client inspect and edit Godot projects: creating scenes,
    adding nodes, attaching textures, exporting MeshLibraries and managing resource UIDs.
    Scene edits run through a bundled GDScript executed by a real headless Godot.
  </p>

  <h2>Routes</h2>
  <table>
    <thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td><code>GET</code></td><td><code>/</code></td><td>This page</td></tr>
      <tr><td><code>GET</code></td><td><code>/healthz</code></td><td>Liveness probe. Returns <code>{"status":"ok","sessions":n}</code></td></tr>
      <tr><td><code>POST</code></td><td><code>${escape(config.http.endpoint)}</code></td><td>MCP Streamable HTTP. An <code>initialize</code> request opens a session</td></tr>
      <tr><td><code>GET</code></td><td><code>${escape(config.http.endpoint)}</code></td><td>Server-sent event stream for an open session</td></tr>
      <tr><td><code>DELETE</code></td><td><code>${escape(config.http.endpoint)}</code></td><td>Close a session</td></tr>
    </tbody>
  </table>
  <p>
    Every request to <code>${escape(config.http.endpoint)}</code> after the first carries the
    <code>Mcp-Session-Id</code> header returned by <code>initialize</code>. Each session gets its
    own server instance, so clients cannot disturb one another.
  </p>

  <h2>Connecting</h2>
  <pre><code>claude mcp add --transport http godot ${escape(endpoint)}</code></pre>
  <p>Or, for a client configured by file:</p>
  <pre><code>{
  "mcpServers": {
    "godot": {
      "type": "http",
      "url": "${escape(endpoint)}"
    }
  }
}</code></pre>

  <h2>Which filesystem the paths refer to</h2>
  <div class="note">
    <p>
      <strong>This server's own disk, not yours.</strong>
      Every tool that takes a path acts on the projects stored in this server's
      workspace. There is no file transport: a project on your laptop is not visible
      here, and these tools cannot read or modify it.
    </p>
    <p>
      So this endpoint is for projects that live on this host. To work on a project on
      your own machine, run the server locally over stdio instead &mdash; the tools then
      act on your filesystem, and the display-dependent tools work too.
    </p>
  </div>
  <p>
    Paths are resolved inside the workspace root and one that escapes it is refused,
    symlinks included. Pass <code>projectPath</code> relative to that root &mdash;
    <code>my-game</code>, not an absolute path.
  </p>
  ${renderProcessToolNote(config)}

  <h2>Tools <span class="tag">${tools.length}</span></h2>
  ${tools.map(renderTool).join('\n')}

  <footer>
    Godot MCP v${escape(version)} &middot;
    engine invoked at <code>${escape(config.godotPath ?? 'auto-detected')}</code> &middot;
    <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
  </footer>
</main>
</body>
</html>`;
}

function renderProcessToolNote(config: ServerConfig): string {
  if (config.processTools) return '';

  return `<div class="note">
    <p>
      <strong>Not available over HTTP:</strong>
      <code>launch_editor</code>, <code>run_project</code>, <code>get_debug_output</code>
      and <code>stop_project</code>.
    </p>
    <p>
      Those drive a Godot process with a window, which needs a display on the machine
      running the engine. This server is headless, so they are not exposed rather than
      listed and failing obscurely. Run the server over stdio on your own machine to use
      them, or set <code>GODOT_MCP_PROCESS_TOOLS=true</code> if you have added a virtual
      display to the image.
    </p>
  </div>`;
}

function renderTool(tool: ToolInfo): string {
  const tag = tool.readOnly
    ? '<span class="tag read">read only</span>'
    : '<span class="tag">writes</span>';

  const params = tool.parameters.length === 0
    ? '<p>No parameters.</p>'
    : `<table class="params"><tbody>${tool.parameters.map(renderParameter).join('')}</tbody></table>`;

  return `<div class="tool">
    <div class="tool-head"><h3>${escape(tool.name)}</h3>${tag}</div>
    ${tool.description ? `<p>${escape(tool.description)}</p>` : ''}
    ${params}
  </div>`;
}

function renderParameter(parameter: { name: string; type: string; required: boolean; description?: string }): string {
  const name = parameter.required
    ? `<code class="req">${escape(parameter.name)}</code>`
    : `<code>${escape(parameter.name)}</code>`;

  return `<tr>
    <td>${name}</td>
    <td><code>${escape(parameter.type)}</code></td>
    <td>${parameter.description ? escape(parameter.description) : ''}</td>
  </tr>`;
}
