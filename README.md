# NovelGenerator — AI novel writing app for Gemini and Ollama

Turn a one-paragraph premise into a full manuscript, chapter by chapter.

```bash
git clone https://github.com/KazKozDev/NovelGenerator.git
```

<!-- TODO(user): screenshot predates the current engine — re-capture the generation view -->
![The generation view while chapters are written and reviewed](https://github.com/user-attachments/assets/854e630c-e902-410a-b789-9706189e3abc)

Runs on your machine · Gemini or Ollama · Source available

---

## Quick start

```bash
cd NovelGenerator
npm install
npm run dev
```

```
  VITE v6.3.6  ready in 125 ms

  ➜  Local:   http://localhost:3000/
```

Open that address, pick a provider, write a premise and a chapter count, then approve
the outline. The engine plans the book, writes each chapter scene by scene, reviews every
candidate against the accepted canon, and only then accepts it. Export the finished book
as `.md`, `.epub` or `.pdf`, with the canon and review reports as `.json`.

## Write a novel from a one-paragraph premise

The premise is the whole input. From it the engine builds an outline you approve, then a
blueprint of characters and scheduled setup/payoff promises, then a scene-level plan per
chapter.

Nothing enters the canon that is not backed by a verbatim quotation from accepted prose,
so later chapters are written against what the book actually established rather than
against what the plan intended.

## Resume a run after a failed review or a closed tab

Every stage is committed to IndexedDB before it is reported as saved, so a closed tab, a
reload or a provider outage costs at most the call in flight.

A chapter that fails review is repaired against the exact passages the reviewer cited, up
to five times. When a review cannot be validated, or the repairs are exhausted, the run
stops and says why instead of accepting the chapter.

## Run a full book headlessly and inspect every model call

```bash
node scripts/run-novel.mjs --premise-file premise.txt --chapters 6 --words 4000 --out runs/demo
```

```
STATE writing chapters=6 accepted=6 scenes=23 words=22498
STATE structural_review chapters=6 accepted=6 scenes=23 words=22498
STATE complete chapters=6 accepted=6 scenes=23 words=22498
COMPLETE stage=complete title=3:14
Saved book.md and metadata.json to runs/demo
```

Every call is logged with its route, model, duration and size, and every raw response is
saved, so a contract failure can be diagnosed against what the model actually returned.
`--out` on an existing directory resumes from its checkpoint.

## How it works

Two models, two roles. The **writer** produces prose and never sees a review contract. The
**editor** reviews each chapter against the accepted canon, extracts the facts that enter
it, and audits the finished book. Configure the editor under Editor model; without one the
writer judges its own prose, which is the weakest configuration this engine allows.

Thinking is a property of the role, not of a model name. A reasoning model asked to judge
with thinking off returns an empty review, so the editor may think while the writer never
does — and Ollama returns that reasoning in a separate field that never reaches the
manuscript. Deterministic gates run before the sampled one: unfilled slots, chapters under
80% of their target, and characters from a script the book is not written in fail
outright.

```
premise → outline → blueprint → chapter plan → scenes → review → canon → book audit → export
```

## Configuration

Set in the app before generation starts.

| Option | Default | What it does |
|---|---|---|
| Chapters | 3 | Book length, 3–100 |
| Target words per chapter | 4000 | 300–10000; under 80% of it a chapter fails review |
| Language | English | Language of the manuscript |
| Genre | fantasy | Genre contract carried into every prompt |
| Narrative voice | third-limited | Point of view |
| Tense | past | `past` or `present` |
| Tone | serious | Tonal contract |
| Target audience | adult | Audience contract |
| Writing style | descriptive | Style contract |
| Ending | closed | `closed`, `open` or `series` |
| Writer provider | gemini | `gemini` or `ollama`; the Ollama model is chosen from the models it reports |
| Editor model | same as writer | A second model for review, canon extraction and the book audits |
| Editor thinking | on | Lets the editor reason before judging; its reasoning never enters the manuscript |

### Environment variables

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` | For Gemini | Gemini API key; `API_KEY` is accepted as an alias |
| `OLLAMA_HOST` | No | Ollama address the dev server proxies to, default `http://127.0.0.1:11434` |

## Requirements

- Node 18+ (required by Vite 6)
- A browser with IndexedDB — the manuscript and its revision history are stored there
- A Gemini API key, or Ollama running locally or in Ollama Cloud
- A model that honours JSON Schema output and returns long prose in your language
- Verified pairing: `qwen3.5:397b-cloud` writing, `gemma4:31b-cloud` editing with thinking on

## Limitations

- Business Source License 1.1 — source available, not an OSI open-source licence
- Verified on macOS only; there is no CI, so Linux and Windows are untested
- A model that ignores JSON Schema stalls the run; several cloud models return an empty
  review instead of reading the chapter, which the engine cannot detect for you
- Semantic review is sampled, so two passes over the same prose can disagree; an evidenced
  defect is carried forward, but a defect neither pass found is not caught
- A six-chapter book takes hours and hundreds of model calls
- Editorial gates support revision; they do not guarantee coherence or literary merit

<details>
<summary>Tests, production build, headless runs</summary>

### Tests

```bash
npm test
```

### Production build

```bash
npm run build && npm run preview
```

### Headless runs

`scripts/run-novel.mjs` drives the full pipeline outside the browser against a file
checkpoint. `scripts/compare-writers.mjs` runs both writing modes over one scene plan
under identical context for blind comparison.

</details>

---

<div align="center">

![Gemini](https://img.shields.io/badge/Gemini-333?style=flat-square&logo=googlegemini&logoColor=fff) ![Ollama](https://img.shields.io/badge/Ollama-333?style=flat-square&logo=ollama&logoColor=fff) ![React](https://img.shields.io/badge/React_19-333?style=flat-square&logo=react&logoColor=fff) ![License](https://img.shields.io/badge/License-BUSL_1.1-333?style=flat-square)

[Issues](https://github.com/KazKozDev/NovelGenerator/issues) · [Architecture](ARCHITECTURE.md) · [License](LICENSE)

</div>
