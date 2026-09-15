# NovelGenerator — local AI novel generator for Gemini and Ollama

NovelGenerator is a source-available AI novel writer that turns a one-paragraph premise
into a full manuscript, chapter by chapter. Run it with Gemini or use Ollama as a local AI
writer with your own model.

It is built for long-form story generation rather than isolated prompts: causal planning,
persistent story memory, explicit scene handoffs and continuity checks keep characters,
facts and open plot threads available as the novel grows.



<!-- TODO(user): screenshot predates the current engine — re-capture the generation view -->
![The generation view while chapters are written and reviewed](https://github.com/user-attachments/assets/e04135c1-9196-467c-a0d2-71628c28ab27)

AI novel generator · Local LLM and Ollama · Long-form fiction · Persistent story memory · Continuity checking

---

## Run the AI novel generator locally

```bash
git clone https://github.com/KazKozDev/NovelGenerator.git
```

```bash
cd NovelGenerator
npm install
npm run dev
```

```
  VITE v6.3.6  ready in 118 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.177:3000/
```

Open that address, pick a provider, set a model, write a premise and a chapter count, then
start. Gemini needs `GEMINI_API_KEY` in the environment; Ollama needs to be running. The
engine designs the book, reviews its own construction, then writes chapter by chapter and
scene by scene without asking you to approve anything mid-run. Export the finished book as
EPUB, PDF, TXT or Markdown, and the audit as JSON.

### Use Ollama as a local AI novel writer

Select **Ollama** in the app to write with a model served from your machine. This is the
local/private path: manuscript generation does not require sending the premise or chapters
to Gemini. You can use one model for prose and a separate Ollama model for planning,
continuity review and the final audit.

## Write a full novel chapter by chapter

The premise is the whole input. From it the engine builds one compact construction — cast,
world rules, a causal map, an ending and a chapter map — and refuses to write against a
construction its own review found incoherent. A premise name nobody in the cast answers to
fails that review in code, not by opinion.

A measured run: 7 chapters, 15,390 words, 122 model calls, about 40 minutes on Ollama
cloud models.

## Keep continuity without rereading the book

Every scene is folded into story memory before the next one is written. One call extracts
what changed — events, locations, who knows what, which promises opened and closed — and
each record must cite the paragraph that proves it; a citation pointing nowhere is rejected
and asked again.

The accepted scene produces an explicit handoff: what the reader already knows, what
actually changed, which question remains open and what the next scene must accomplish
differently. The next scene's causal plan is rebased on that handoff before prose is
written, so chapter 7 follows what the book established, not merely what chapter 1
intended. A scene that contradicts confirmed state is rewritten once, with the
contradiction named.

## Run a full book from the terminal and inspect every model call

```bash
npx vite-node scripts/run-book.ts --writer deepseek-v4.1-flash:cloud \
  --editor mistral-large-3:675b-cloud --chapters 3 --premise "..." --out runs/demo
```

```
STAGE design calls=0
STAGE chapter ch1 calls=2
STAGE chapter ch2 calls=15
STAGE chapter ch3 calls=29
STAGE audit calls=46
DONE status=COMPLETE_WITH_WARNINGS calls=47 tokens~362683
```

Every call is logged with its route, model, prompt size and duration. `--out` holds
`manuscript.md`, `snapshot.json` and `run.log`. `--provider gemini` runs the same pipeline
against the Gemini transport instead, with `--writer`/`--editor` as model names.

## How it works

Two models, two roles. The **writer** produces prose. The **editor** plans, reviews,
extracts memory and audits the finished book; without a separate editor the writer judges
its own prose, which is the weakest configuration this engine allows. Eight prompts live as
files under `prompts/`, one per stage, and code never hand-builds them — it names a prompt
and supplies its variables. Before any prose exists, structural doubts about a scene (no
viewpoint, an outcome that changes nothing, a location the memory contradicts) go to a
readiness review that turns a blocking verdict into an instruction for the writer instead
of stopping the book. Every stage is committed to IndexedDB, so a closed tab or a failed
scene costs at most the call in flight: reopening offers to continue, and finished chapters
keep their manuscript and memory.

```
premise → design → plan review → chapter plan → scene → handoff → rebase → next scene → audit → export
```

## Configuration

Set in the app before generation starts.

| Option | Default | What it does |
|---|---|---|
| Chapters | 3 | Book length, 3–100 |
| Target words per chapter | 4000 | 300–10000 |
| Genre | fantasy | Genre contract carried into every prompt |
| Narrative voice | third-limited | Point of view |
| Tense | past | `past` or `present` |
| Tone | serious | Tonal contract |
| Target audience | adult | Audience contract |
| Writing style | descriptive | Style contract |
| Ending | closed | `closed`, `open` or `series` |
| Writer provider | Gemini | `gemini` or `ollama`; Gemini defaults to `gemini-3.6-flash` |
| Separate editor model | off | A second model for planning, review and the audit — strongly recommended |
| Reasoning (think) | off | Lets a reasoning model think before answering; capped calls get cut off with it on |
| Semantic pre-write check | light | Local models read each chapter plan against finished prose: `light` (~90MB), `full` (~700MB), `off` |

### Environment variables

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` | For Gemini | Gemini API key; `API_KEY` is accepted as an alias |
| `OLLAMA_HOST` | No | Ollama address the dev server proxies to, default `http://127.0.0.1:11434` |

## Requirements

- Node 18+ (required by Vite 6)
- A browser with IndexedDB — the manuscript, its memory and the audit are stored there
- A Gemini API key, or Ollama running locally or in Ollama Cloud
- A model that honours JSON Schema output and returns long English prose
- Known to complete a book: `deepseek-v4.1-flash:cloud` and `mistral-large-3:675b-cloud`

## Limitations

- Business Source License 1.1 — source available, not an OSI open-source licence
- Verified on macOS only; there is no CI, so Linux and Windows are untested
- The construction review can still end a run before a page is written, but only over what
  code charges — a premise name nobody in the cast answers to; its own remaining objections
  travel into the contract instead, and the error screen offers a way back to the form
- A model that ignores JSON Schema stalls the run, and a capped output budget fails a call
  outright rather than returning a short answer
- Prose texture is measured only as repeated phrasing: the audit reports a beat the book
  returns to at a rate ("breath hitched", seven times), not sentence rhythm or register
- The writer/editor split was only recently made explicit at the call site; the books
  measured above were written before that fix, with the editor model drafting every scene,
  so the pairing above is verified to finish a book but not yet as the roles now read
- Editorial gates support revision; they do not guarantee coherence or literary merit

<details>
<summary>Tests, production build</summary>

### Tests

```bash
npm test
```

```
 Test Files  13 passed (13)
      Tests  141 passed (141)
```

### Production build

```bash
npm run build && npm run preview
```

</details>

---

<div align="center">

![macOS](https://img.shields.io/badge/macOS-333?style=flat-square&logo=apple&logoColor=fff) ![Gemini](https://img.shields.io/badge/Gemini-333?style=flat-square&logo=googlegemini&logoColor=fff) ![Ollama](https://img.shields.io/badge/Ollama-333?style=flat-square&logo=ollama&logoColor=fff) ![React](https://img.shields.io/badge/React_19-333?style=flat-square&logo=react&logoColor=fff) ![License](https://img.shields.io/badge/License-BUSL_1.1-333?style=flat-square)

[Issues](https://github.com/KazKozDev/NovelGenerator/issues) · [Architecture](ARCHITECTURE.md) · [License](LICENSE)

</div>

## Local models

Two models run locally and are on by default: a cross-encoder (544MB) and an NLI head
(233MB). They are what catches a scene retold in fresh words, or a plan that contradicts
what the book already established. There is no setting: the lighter one that
existed reported coverage it did not have, and a check you can quietly turn down is a check
nobody can trust the absence of.

The browser fetches them from Hugging Face on first use. To serve them from the application
instead, fetch them once and stage them where Vite can reach them:

```bash
npx vite-node scripts/warm-models.ts
```

They land in `public/models/` (git-ignored, ~780MB) and the page loads them from localhost
after that. 