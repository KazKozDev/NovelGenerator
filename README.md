# NovelGenerator

NovelGenerator turns a premise into a manuscript. One author works at a desk: it keeps its own notebook, plan and clock, writes the chapters, and can ask a reader or one of its people. Code owns the call budget, the three-act boundaries, and the count of the debts the author names. The prose is the author's.

Gemini, Ollama, Qwen or Hugging Face can serve the author. A second model can read what the author writes. Without one, the author's own model reads.

<!-- TODO(user): screenshot predates the current engine — re-capture the generation view -->
![The generation view while chapters are written](https://github.com/user-attachments/assets/e04135c1-9196-467c-a0d2-71628c28ab27)

## Run it

```bash
git clone https://github.com/KazKozDev/NovelGenerator.git
cd NovelGenerator
npm install
npm run dev
```

Open the local address Vite prints. Write a premise, set the chapter count and the providers, and start. Gemini needs `GEMINI_API_KEY`. Ollama needs a running server. The finished book exports as EPUB, PDF, TXT or Markdown. The project itself exports as JSON and restores from that file.

The same author can be started from a terminal:

```bash
npx vite-node scripts/author-book.ts --chapters 6 --words 2300 --genre mystery \
  --premise "..." --out runs/book
```

`--reader qwen3.8-max` sends the reader to Qwen. Any other reader name goes to Ollama. With no `--reader`, the author's model reads its own pages. The run writes the desk files and `journal.md` into `--out`.

## How a book is written

The author sees the premise, a budget of calls, and a desk of files. Nothing in the prompt tells it which file to write first. A chapter is written, or changed, by the tools on that desk. When the budget is spent, the book goes out as it stands.

`drama.md` is where the author names what the book owes: the turn of each act, the stakes, the question, the guns, the last act, and the rest of the shape. Code divides the chapters into three acts and checks those words against the pages. The first wording of a debt stays what the page owes. Rewriting the line in other words does not move it. While calls remain, saying the book is done does not close it if a named debt is still open.

The screen follows the desk: the notebook and plan, the chapters as they appear, and what readers, characters and the keeper of the book's facts said. Autosave writes `autosaves/latest.project.json` and a browser copy. Resume continues the saved desk.

```bash
npm test
npm run build && npm run preview
```

## Configuration

Set these in the app before a run.

| Option | Default | What it does |
|---|---|---|
| Chapters | 3 | Book length, 3–100 |
| Rough words per chapter | 4000 | A size the author is told. A chapter is as long as the author writes it |
| Genre, voice, tense, tone, audience, style, ending | fantasy, third-limited, past, serious, adult, descriptive, closed | Sent with the premise as the author's requirements |
| Author model | Gemini | Gemini, Ollama, Qwen or Hugging Face |
| Reader model | off | Another model reads chapters the author hands it |

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` | For Gemini | Gemini API key. `API_KEY` is accepted as an alias |
| `OLLAMA_HOST` | No | Ollama address the dev server proxies to. Default `http://127.0.0.1:11434` |

Node 18 or newer. The project slot uses the dev server's autosave file and the browser's IndexedDB.

## Limits

Business Source License 1.1: source-available, not an OSI open-source licence. Verified on macOS; there is no CI. A stopped run can be resumed. The debts the author named are counted; that count is not a guarantee of a coherent book.

[Issues](https://github.com/KazKozDev/NovelGenerator/issues) · [Architecture](ARCHITECTURE.md) · [License](LICENSE)
