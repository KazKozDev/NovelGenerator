import { generateQwenText } from '../services/qwenService';
const answer = await generateQwenText('Return only the JSON object {"ready":true,"issues":[]}.', 'You check structured responses.', 256,
  'qwen3.8-flash', 0.2, metadata => console.log('Qwen metadata:', JSON.stringify(metadata)));
const parsed = JSON.parse(answer);
if (parsed.ready !== true || !Array.isArray(parsed.issues) || parsed.issues.length) throw new Error('Unexpected Qwen smoke-test response.');
console.log('Qwen connection verified; thinking disabled.');
