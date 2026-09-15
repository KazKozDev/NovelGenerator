import { env } from '@huggingface/transformers';

/**
 * Where the local models come from.
 *
 * A browser cannot read `node_modules`. It has no filesystem at all — only a
 * sandbox keyed to the page's origin — so transformers.js there fetches weights
 * over the network and caches them in Cache Storage, while the same library in
 * Node writes plain files into its own package directory. Two caches, because
 * two runtimes, and warming one does nothing for the other.
 *
 * What the browser *can* read is whatever the application serves. The weights
 * are already on disk after the first Node run, so `scripts/warm-models.ts`
 * copies them under `public/models/`, the dev server and the build both serve
 * that directory, and the page loads 824MB from localhost instead of from
 * Hugging Face. The browser still caches them afterwards — that part is not
 * optional — but it never crosses the internet to get them.
 *
 * Remote stays allowed on purpose. A checkout without the local copy, or a
 * model the copy does not carry, silently falls back to the network and works;
 * turning that off would trade a slow first run for a broken one.
 */
let configured = false;

export function useLocalModelWeights(): void {
  if (configured) return;
  configured = true;
  try {
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    if (typeof window !== 'undefined') {
      // Served by Vite from public/models, so the path is origin-relative.
      env.localModelPath = '/models/';
    }
  } catch {
    // A runtime that does not expose env still loads models remotely.
  }
}
