/** Usage: node scripts/compare-writers.mjs checkpoint.json output-directory [chapter] [scene] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { createServer } from 'vite';

const [checkpointPath, outputPath, chapterArg = '1', sceneArg = '1'] = process.argv.slice(2);
if (!checkpointPath || !outputPath) throw new Error('Usage: node scripts/compare-writers.mjs checkpoint.json output-directory [chapter] [scene]');
const run = JSON.parse(await readFile(checkpointPath, 'utf8'));
const chapterNumber = Number(chapterArg), sceneIndex = Number(sceneArg) - 1;
if (!run.chapters?.[chapterNumber - 1]?.plan.detailedScenes?.[sceneIndex]) throw new Error('Checkpoint does not contain the requested scene plan.');
if (sceneIndex && (run.chapters[chapterNumber - 1].sceneDrafts?.length || 0) < sceneIndex) throw new Error('Earlier scene context is missing.');
if (run.provider.ollamaEndpoint?.startsWith('/')) run.provider.ollamaEndpoint = 'http://127.0.0.1:3000' + run.provider.ollamaEndpoint;
const directory = path.resolve(outputPath);
await mkdir(directory, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { writeScene } = await server.ssrLoadModule('/utils/novel/writer.ts');
  const { generateText } = await server.ssrLoadModule('/services/llmService.ts');
  const assignments = randomInt(2) ? ['slots', 'scenes'] : ['scenes', 'slots'];
  const measurements = [];
  // Both treatments receive identical plans, provider and preceding manuscript; only writingMode differs.
  for (const [index, mode] of assignments.entries()) {
    const treatment = structuredClone(run);
    treatment.spec.writingMode = mode;
    treatment.chapters[chapterNumber - 1].sceneDrafts = (treatment.chapters[chapterNumber - 1].sceneDrafts || []).slice(0, sceneIndex);
    const calls = [];
    const llm = async (prompt, system, options = {}) => {
      const start = Date.now();
      let output = '';
      let success = false;
      try {
      output = await generateText(prompt, system, undefined, options.temperature ?? 0.4, undefined, undefined, treatment.provider, options.maxTokens, options.json);
      success = true;
      return output;
      } finally {
        calls.push({ success, durationMs: Date.now() - start, inputCharacters: prompt.length + system.length, outputCharacters: output.length });
      }
    };
    const label = index ? 'B' : 'A';
    const content = await writeScene(treatment, treatment.chapters[chapterNumber - 1], sceneIndex, llm);
    await writeFile(path.join(directory, `${label}.md`), content);
    measurements.push({ label, mode, calls, words: content.split(/\s+/).filter(Boolean).length });
  }
  await writeFile(path.join(directory, 'measurements-unblind.json'), JSON.stringify({ sourceRun: run.id, chapterNumber, scene: sceneIndex + 1, provider: run.provider, measurements }, null, 2));
  await writeFile(path.join(directory, 'reader-rubric.md'), `# Blind comparison\n\nRead A.md and B.md before opening measurements-unblind.json.\n\nFor each criterion, choose A, B, or no preference and cite a passage:\n\n- Causal clarity and consequential choice\n- Character motivation and emotional credibility\n- Distinct dialogue voices and subtext\n- Consistency of viewpoint and author voice\n- Pacing and desire to continue reading\n- Fidelity to the same scene plan\n\nA single pair does not establish a quality advantage. Repeat across premises and readers. Operational call counts and duration do not measure literary merit.\n`);
  console.log(`Comparison saved to ${directory}`);
} finally { await server.close(); }
