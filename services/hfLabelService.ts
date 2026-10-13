/**
 * A small classifier on Hugging Face's own inference: sentences in, and for each the score of the first label.
 * Not a model that talks. Node only: the token never enters the browser bundle.
 */
import { qwenSetting } from './qwenService';

export async function labelHuggingFace(model: string, inputs: string[], labels: string[], template: string): Promise<number[]> {
  const token = qwenSetting('HF_TOKEN');
  if (!token) throw new Error('Set HF_TOKEN in .env.local or the environment.');
  if (!inputs.length) return [];
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, parameters: { candidate_labels: labels, hypothesis_template: template } }) });
    // A network that was asleep answers 503 while it loads.
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) { await new Promise(resolve => setTimeout(resolve, process.env.VITEST ? 0 : 2500 * (attempt + 1))); continue; }
    const text = await response.text();
    if (!response.ok) throw new Error(`Hugging Face labelling failed [${response.status}]. ${text.slice(0, 200)}`);
    const rows = JSON.parse(text) as unknown[];
    return rows.map(row => {
      const pairs = Array.isArray(row) ? row as { label: string; score: number }[] : ((row as { labels: string[]; scores: number[] }).labels || []).map((label, at) => ({ label, score: (row as { scores: number[] }).scores[at] }));
      return pairs.find(pair => pair.label === labels[0])?.score ?? 0;
    });
  }
}

/** The classifiers Hugging Face serves itself, from its public list. No token needed. */
export async function listHuggingFaceLabelModels(): Promise<{ id: string; providers: string[] }[]> {
  const response = await fetch('https://huggingface.co/api/models?pipeline_tag=zero-shot-classification&inference_provider=hf-inference&limit=60');
  if (!response.ok) throw new Error(`Hugging Face model list failed [${response.status}].`);
  return ((await response.json()) as { id: string }[]).map(model => ({ id: model.id, providers: ['hf-inference'] }));
}
