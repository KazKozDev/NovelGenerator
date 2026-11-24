# NovelGenerator

NovelGenerator turns a premise into a manuscript using the 2-layer Craft 2.0 Engine. One model drafts while specialized agents enact, observe, and review every scene against physical grounding and causal truth.

<!-- TODO(user): screenshot predates the current engine — re-capture the generation view -->
![The generation view while chapters are written](https://github.com/user-attachments/assets/e04135c1-9196-467c-a0d2-71628c28ab27)

## Core Architecture (Craft 2.0)

- **Deterministic Phased Pipeline**: Strictly decoupled sequential stages:
  `Dossier` → `Scene Cards` → `Preflight` → `Blind Write` → `Observer` → `Dual Review`.
- **Strict Relational Scene Matrix (`packet.json`)**: 3 scenes per chapter governed by the "Therefore / But" causal law, 3 layers of conflict (internal, interpersonal, external), and value charge shifts (`+ to -` or `- to +`).
- **Strict POV Barrier**: Scene prompts are strictly isolated from future narrative facts (`povKnows`, `learnsAt < order`), blocking omniscience leaks.
- **Anti-Metaphorical Directive**: Eliminates abstract clichés and filler prose in favor of concrete physical sensory action, verified by an independent Observer.
- **Embedded Continuous Checks**: A Blind Reader generates forward-looking hypotheses before each scene, while Dual Reviewers verify causal integrity throughout.
- **Cover Studio & AI Realism Suite**:
  - **14 Production Formats**: Instant cropping and high-resolution rendering for Amazon KDP eBook, ACX Audible, YouTube 16:9 thumbnails, Instagram/TikTok/X socials, and 300 DPI KDP paperback print wraps.
  - **Structured 3-Tab Workflow**:
    - **1. Art & Realism**: Master prompt generation/upload, crosshair focal point cropping, and **De-Plasticizer**: CodeFormer face pore restoration on Apple Silicon MPS/CoreML + dual-scale 35mm film grain and frequency separation with instant Before/After comparison.
    - **2. Typography & 3D**: Smart Art Director auto-layout, genre style presets, full lettering controls, and **3D Depth Typography** (`Depth-Anything-V2`) layering titles behind foreground subjects with threshold tuning.
    - **3. Review & Export**: **Aesthetic & CTR Scorer** (`cafeai/cafe_aesthetic` 0–10 score and mobile legibility bars), interactive **YouTube Mobile Feed Simulator**, and **YouTube Studio A/B/C Test Pack** (Amber, Crimson, Gold archetypes).
- **Author Desk & Publishing Studio**:
  - **In-Place Editorial Review**: Real-time continuity & POV analysis with autonomous "Apply Review" revision passes.
  - **Manuscript Editor**: Instant in-place editing with keyboard shortcuts (`Cmd+S` / `Ctrl+S`).
  - **Cover Artwork & Imprint**: Drag-and-drop cover uploads with automatic persistence, ISBNs, and publishing colophon metadata.
  - **Publishing-Grade Exports**: Fully validated EPUB 3.0 (with embedded cover and semantic TOC) and print-ready PDF (full-bleed cover, flush-left colophon, automatic TOC with dot leaders, and repeating `thead`/`tfoot` page margin spacers).

## Run it

```bash
git clone https://github.com/KazKozDev/NovelGenerator.git
cd NovelGenerator
npm install
npm run dev
```

Open the local address printed by Vite. Enter a premise, select chapter count and providers, and start generation. Gemini requires `GEMINI_API_KEY`. Ollama requires a local running server. The completed book exports as EPUB 3.0, print-ready PDF, TXT, or Markdown. The project exports and restores from portable JSON snapshots.

To run a headless generation via terminal:

```bash
npx vite-node scripts/run-hp-book.ts
```

To let an agent (Hermes Agent, OpenClaw, Claude Code) run each stage, connect the MCP server: see [docs/MCP.md](docs/MCP.md).

## Testing & Build

```bash
npm test
npm run build && npm run preview
```

## Configuration

Set options in the UI before starting a run:

| Option | Default | What it does |
|---|---|---|
| Chapters | 3 | Book length, 3–100 |
| Rough words per chapter | 4000 | Target word count guidance for scene generation |
| Genre, voice, tense, tone, style | fantasy, third-limited, past, serious, descriptive | Passed with premise as author constraints |
| Author model | Gemini | Model used for dossier, scene projection, and drafting |
| Reader model | off | Serves Observer, Blind Reader, and Dual Audit |

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` | For Gemini | Gemini API key (`API_KEY` accepted as alias) |
| `OLLAMA_HOST` | No | Ollama host URL for proxying (default `http://127.0.0.1:11434`) |
| `COMPATIBLE_BASE_URL` | For API Compatible | Base URL for OpenAI-compatible LLM endpoints |
| `COMPATIBLE_API_KEY` | Optional | API key for OpenAI-compatible LLM endpoints |

Node 18 or newer required. Autosave uses the local server file and browser IndexedDB.

## License

Business Source License 1.1: source-available.

[Issues](https://github.com/KazKozDev/NovelGenerator/issues) · [Architecture](ARCHITECTURE.md) · [License](LICENSE)
