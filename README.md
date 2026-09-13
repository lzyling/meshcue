# MeshCue

**Point at the model. Let the Agent read what you meant.**

MeshCue is a browser workbench for reviewing 3D models with an AI agent. The
agent publishes a draft, you open it in your own browser, mark the surfaces that
are wrong — lettered pins and painted regions, on the mesh, in three dimensions —
and hand the batch back. The agent reads positions, not a screenshot, and
publishes the next version. Every version stays open for marking.

It is not a CAD or sculpting tool. It is the step between "here is a draft" and
"here is what to change", which until now was a screenshot and a paragraph.

## Why positions

Telling an agent "the fillet on the left bracket is too sharp" costs a sentence
and buys an argument about which bracket. A mark carries the mesh, the face, the
barycentric coordinate and the version it was made against. The agent gets an
address, not a description, and can say back which surface it understood.

## The loop

1. The agent runs `precheck` on the model file, then `open` to publish it.
2. You open the URL in Chrome, Safari or any modern WebGL browser.
3. Double-click a surface to drop a lettered pin; paint regions with the brush,
   eraser and fill. Nothing is submitted until you say so.
4. Press **Send to Agent**. The batch is frozen against the version you marked.
5. The agent calls `read`, replies in your conversation, and `open`s the next
   version. Older versions keep their own marks and stay selectable.

There is no "finish the round" button. The next version *is* the end of the last
one.

## Three ways in, one implementation

The core does not know which harness is talking to it. All three entry points
drive the same instance manager, with the same actions and the same results.

| Entry point | How | Who owns a review |
| --- | --- | --- |
| OpenClaw extension | native `meshcue` tool | derived from the host's session |
| `meshcue` CLI | `meshcue <action> --owner <id> …`, JSON in, JSON out | stated by the caller |
| `meshcue-mcp` | stdio MCP server, added to your client's `mcp_servers` | the workspace, or `MESHCUE_OWNER` |

Ownership decides who may change a draft or switch the displayed version.
A second owner asking about the same project is refused with `RESUME_REQUIRED`
until someone says, explicitly, that the review is being continued.

### Being told, or asking

Only a host that can write into its own conversation can announce a submission.
A client reached over a tool protocol cannot: the protocol has no way to wake a
conversation. MeshCue does not pretend otherwise.

`status.notifier` reports what the host actually offers. Where `send` is false,
a submitted batch has the status `waiting` — durable, listed, collected by
calling `read`. It is not a delivery that failed, it counts as no attempt, and it
never becomes stalled. An agent on such a host should read when the reviewer says
they are done rather than waiting for a message that cannot arrive.

## Model limits

| Limit | Threshold | On exceeding |
| --- | --- | --- |
| Triangles | 600,000 | publish refused, `MODEL_LIMIT` |
| File size | 80 MB | publish refused, `MODEL_LIMIT` |
| Texture pixels | 8192×8192 each, 33,554,432 total | publish refused, `TEXTURE_LIMIT` |
| Subdivision budget | 600,000 | **no error** — see below |

The review mesh divides one budget across every source face, and each face costs
at least one triangle of it. Past roughly 300,000 source faces the remainder per
face drops below one, large flat spans stop subdividing, and the brush skips
across them. That model publishes successfully and says nothing, which is why
`precheck` exists: run it on every file before `open` and simplify when the
verdict is `degraded` or `reject`.

## Running it

Node.js 22 or newer, and a browser with WebGL.

```sh
npm ci
npm run samples      # generate the parametric sample models
npm test             # 140 unit and integration tests
npm run test:browser # 55 real-Chromium tests, isolated port and data
```

For an OpenClaw install, build and install the extension:

```sh
npm run build:integration -- tmp/candidate/package
openclaw plugins install ./tmp/candidate/package
```

For any MCP client, point it at the server:

```toml
[mcp_servers.meshcue]
command = "npx"
args = ["meshcue-mcp"]
```

The workbench listens on the loopback address by default. LAN mode binds one
verified private IPv4 and always requires authorization — see
[SECURITY.md](SECURITY.md) for the trust model, how a browser is admitted, and
how long that lasts.

## Documentation

- [AGENT-INTERFACE.md](AGENT-INTERFACE.md) — the contract an agent implements
- [SECURITY.md](SECURITY.md) — network exposure, browser trust, reporting a flaw
- [docs/zh/](docs/zh/) — design documents, in Chinese: positioning,
  requirements, versioning rules, roadmap

## License

Apache-2.0. See [LICENSE](LICENSE).
