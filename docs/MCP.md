# Agents: the MCP server

Every stage of the app is a tool an agent can call — Hermes Agent, OpenClaw, Claude Code or any MCP client.
The server works on the same book as the app: the autosave in `~/Documents/NovelGenerator/<book>/`.

```bash
npm run mcp          # or: mcp/start.sh, from any folder
```

It speaks MCP over stdio, so the agent starts it itself; you do not run it by hand.

## Connect

**Hermes Agent** — `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  novel:
    command: "/Users/artemk/projects/NovelGenerator/mcp/start.sh"
    env:
      NOVEL_PROVIDER: "anthropic"
      NOVEL_MODEL: "claude-opus-5-5"
```

**OpenClaw** — `~/.openclaw/openclaw.json`:

```json
{
  "mcp": {
    "servers": {
      "novel": {
        "command": "/Users/artemk/projects/NovelGenerator/mcp/start.sh",
        "env": { "NOVEL_PROVIDER": "anthropic", "NOVEL_MODEL": "claude-opus-5-5" },
        "requestTimeoutMs": 660000
      }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add novel -- /Users/artemk/projects/NovelGenerator/mcp/start.sh
```

## Who writes

The app keeps its model choice in the browser, which the server cannot read, so the server takes it from its environment:

| Variable | Meaning | Default |
|---|---|---|
| `NOVEL_PROVIDER` | `anthropic`, `ollama` or `compatible` | `anthropic` |
| `NOVEL_MODEL` | the writer's model id | `claude-opus-5-5` for Anthropic; required otherwise |
| `NOVEL_VALIDATOR_PROVIDER`, `NOVEL_VALIDATOR_MODEL` | a separate editor model | the writer |
| `OLLAMA_ENDPOINT` | Ollama address | `http://127.0.0.1:11434` |
| `NOVEL_DOCUMENTS_DIR` | where the books are | `~/Documents/NovelGenerator` |

Keys come from `.env.local` in the repository, the same file the app's key window writes.

## Stages

| Stage | Tools |
|---|---|
| Book | `book_status`, `list_books`, `open_book`, `new_book` |
| Style | `generate_style`*, `get_style`, `set_style` |
| Plan | `plan_book`*, `get_outline`, `set_outline`, `get_prompts`, `set_prompt` |
| Prompt check | `check_prompts`*, `get_reviews`, `fix_prompt_issue`* |
| Writing | `write_story`* |
| Editing | `get_manuscript`, `edit_chapter`, `save_manuscript` |
| App tab | `set_stage`, `stop_stage` |

\* Asks a model and runs in the background, one stage at a time: the tool returns at once, and
`book_status` with `wait_seconds` (up to 600) waits for it and says what to do next. A stage
continues where it stopped, like the app's Continue.

## The agent sees the app

| Tool | What it gives |
|---|---|
| `whats_new` | What happened in the app since the agent last asked, each change with who made it: `person`, `app-run` (the app ran a model stage), `app-editor` (the editor model in the editorial chat) |
| `watch` | Waits until something happens in the app, then returns the same |
| `get_editorial_chat` | The editorial chat: what the person said, what the editor answered, its problems and proposed edits |
| `get_activity` | The book's log with who did each thing |

| `see_app` | What the app's screen shows right now, as text: visible text, dialogs, errors, the focused field and what is typed, the selection, work in progress, settings kept in the browser (no keys) |
| `list_book_files`, `read_book_file` | Every file in the book's folder; text as text, covers as pictures |

The app describes its screen while it runs under `npm run dev`: every two seconds at most, only when something
changed, to `~/Documents/NovelGenerator/.screen.json`. The tab the person looks at wins over one in the background.

Every answer ends with a one-line note when something in the app is still untold. The agent's own actions go into the
app's log as `agent` and are never reported back to it.

**When to speak up.** `whats_new` and `watch` return attention items:

- `wait`: the person is working (typing in a field, an unsaved edit, or a change in the last two minutes). Do not start stages, do not touch it, keep remarks short.
- `warn`: a run failed, or the app shows an error on screen. Explain it and offer the fix.
- `suggest`: an unanswered chat message, problems the app's editor raised, major prompt-review findings not fixed, chapters written from an outline or prompts that changed since.

`set_outline`, `set_prompt` and `set_style` refuse to replace an edit the person has not saved, unless they pass `force`.

What the agent sees comes from the book folder (the project autosave and `план/рабочее состояние.json`: the
editorial chat, unsaved drafts, the editor's undo history) and from the app's description of its screen.

## The app and the agent together

- Every tool reads the book from its folder first, so the agent sees what was changed in the app.
- The app reads the folder when the page loads: reload the page to see what the agent did.
- Do not run a stage in the app and in the agent at the same time: the later save wins.
- Editing tools refuse while a stage is running.
- Not here yet: the editorial chat studio's own model review, and the cover studio.
