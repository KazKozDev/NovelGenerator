/** One-shot model probe through the app transport. Usage:
 *   npx vite-node scripts/probe-once.ts --model qwen3:8b --prompt "Reply ok"
 */
import { generateOllamaText } from '../services/ollamaService';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const model = arg('model', 'qwen3:8b');
const prompt = arg('prompt', 'Reply with exactly: ok');
const endpoint = arg('endpoint', 'http://127.0.0.1:11434');

const started = Date.now();
try {
  const answer = await generateOllamaText(prompt, 'You are a test probe.', undefined, 0.1, model, endpoint, 64);
  console.log(`PROBE-OK ${((Date.now() - started) / 1000).toFixed(0)}s: ${answer.slice(0, 200)}`);
} catch (error) {
  console.log(`PROBE-FAIL ${((Date.now() - started) / 1000).toFixed(0)}s: ${error instanceof Error ? error.message.slice(0, 200) : error}`);
  process.exit(1);
}
