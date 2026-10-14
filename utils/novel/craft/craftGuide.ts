// Vite supports raw text imports; for Node environments without Vite transform, we fall back to readFileSync
let guideText = '';

try {
  // @ts-ignore
  import('./craft_guide_2_0.txt?raw').then(m => {
    if (m?.default) guideText = m.default;
  }).catch(() => {});
} catch {}

export function getCraftGuide(): string {
  if (guideText) return guideText;
  try {
    // Node environment fallback
    const fs = require('node:fs');
    const path = require('node:path');
    const filePath = path.resolve(__dirname, 'craft_guide_2_0.txt');
    if (fs.existsSync(filePath)) {
      guideText = fs.readFileSync(filePath, 'utf8');
      return guideText;
    }
  } catch {}
  return 'Core Craft Principles: Promise, Progress, Payoff; 4 Layers of Truth; Cause-Choice-Action-Consequence; Anti-Metaphor Directive.';
}
