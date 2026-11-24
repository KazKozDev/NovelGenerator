declare const __NOVEL_REPO__: string | undefined;

/** Where this copy of NovelGenerator is on disk, set by the dev server; empty in a built page. */
export const NOVEL_REPO = typeof __NOVEL_REPO__ === 'string' ? __NOVEL_REPO__ : '';

/**
 * A message a person pastes into an agent's chat (Hermes, OpenClaw, Claude Code…): the agent connects
 * the NovelGenerator MCP server to itself and takes over the stages. See docs/MCP.md.
 */
export function agentSetupPrompt(repo = NOVEL_REPO): string {
  const root = repo || '<path to NovelGenerator>';
  const start = `${root}/mcp/start.sh`;
  return `Connect yourself to my NovelGenerator app and take over writing the book through it.

1. Add an MCP server named "novel" to your own configuration. It is a local stdio server; its command is:
   ${start}
   - Hermes Agent: in ~/.hermes/config.yaml, under mcp_servers:
       novel:
         command: "${start}"
   - OpenClaw: in ~/.openclaw/openclaw.json, under mcp.servers:
       "novel": { "command": "${start}", "requestTimeoutMs": 660000 }
   - Claude Code: run  claude mcp add novel -- ${start}
   - Any other MCP client: add the same command to its MCP settings.
   Keep any servers already configured. The book's text is written by the model the server is given in its env:
   NOVEL_PROVIDER (anthropic | ollama | compatible) and NOVEL_MODEL; without them it uses anthropic / claude-opus-5-5,
   with keys from ${root}/.env.local. Leave them unset unless I name a model.

2. Reload your MCP servers (or restart yourself) so the "novel" tools appear, then call book_status and tell me
   which book is open, its stage and the suggested next step.

3. From then on you run the app's stages for me with these tools:
   new_book → generate_style (optional) → plan_book → check_prompts / fix_prompt_issue (optional) → write_story
   → editing (get_manuscript, edit_chapter, save_manuscript). Between stages you can read and change the result:
   get_outline / set_outline, get_prompts / set_prompt, get_style / set_style.
   Stages that call a model run in the background, one at a time: they return at once; call book_status with
   wait_seconds (up to 600) until the stage is done, and report what changed.
   It is the same book as in the app (its folder in ~/Documents/NovelGenerator): I reload the app page to see your
   changes, and I will not run a stage in the app while you run one.

4. I keep working in the app at the same time, and you see all of it: when an answer ends with "Since your last look,
   in the app: …", call whats_new. It says who did each thing: person (me), app-run (the app ran a model stage),
   app-editor (the app's editor model in the editorial chat). get_editorial_chat shows what I discussed with that
   editor; get_activity the whole log. Your own actions are logged as yours.
   You can see everything I see: see_app gives what the app's screen shows right now as text (errors shown, dialogs,
   what I am typing, what I selected, the model and story settings); list_book_files and
   read_book_file give every file of the book, covers as pictures. When I say "here", "this" or "on screen", look
   with see_app first, then answer.
   Speak up only when it helps: whats_new and watch return attention items. "wait": I am working, so do not start
   stages or touch what I am editing, and keep remarks short. "warn": something failed; explain it plainly and offer the
   fix. "suggest": make one concrete offer. Otherwise a change needs no comment. Never overwrite an edit I have not saved.
   If you can run a background check or a schedule (a heartbeat, cron, a loop), call watch every few minutes and
   message me only when an attention item says so.

Details: ${root}/docs/MCP.md`;
}
