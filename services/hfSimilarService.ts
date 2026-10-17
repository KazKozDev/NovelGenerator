/**
 * Search by meaning on Hugging Face's own inference: one text and many lines in, a likeness for each line out.
 * Node only: the token never enters the browser bundle.
 */
import { readEnvSetting } from './envService';

export async function similarHuggingFace(model: string, source: string, sentences: string[]): Promise<number[]> {
  const token = readEnvSetting('HF_TOKEN');
  if (!token) throw new Error('Set HF_TOKEN in .env.local or the environment.');
  if (!sentences.length) return [];
  const batch = async (part: string[]): Promise<number[]> => {
    for (let attempt = 0; ; attempt++) {
      const wait = () => new Promise(resolve => setTimeout(resolve, process.env.VITEST ? 0 : 2000 * (attempt + 1)));
      let response: Response;
      try { response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: { source_sentence: source, sentences: part } }) }); }
      catch (error) { if (attempt < 3) { await wait(); continue; } throw error; }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) { await wait(); continue; }
      const text = await response.text();
      if (!response.ok) throw new Error(`Hugging Face search by meaning failed [${response.status}]. ${text.slice(0, 200)}`);
      return (JSON.parse(text) as number[]).map(Number);
    }
  };
  const parts = Array.from({ length: Math.ceil(sentences.length / 250) }, (_, at) => sentences.slice(at * 250, (at + 1) * 250));
  return (await Promise.all(parts.map(batch))).flat();
}
