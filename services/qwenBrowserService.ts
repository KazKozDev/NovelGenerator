/** The local server owns credentials and the upstream endpoint. */
export async function generateQwenBrowserText(prompt: string, system?: string, maxTokens=16384,
  model='qwen3.8-flash', temperature=0.2, schema?:object,onUsage?:(metadata:unknown)=>void):Promise<string> {
  const response=await fetch('/api/qwen', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({prompt,system,maxTokens,model,temperature,schema})});
  const data=await response.json();
  if(data.metadata)onUsage?.(data.metadata);
  if(!response.ok)throw new Error(data.error||'Qwen request failed');
  if(typeof data.text!=='string'||!data.text.trim())throw new Error('Qwen returned no content');
  return data.text;
}

/** The model ids a provider's own server reports, through the local development server that holds the key. */
export async function fetchProviderModels(provider: 'qwen' | 'gemini' | 'anthropic'): Promise<string[]> {
  const response = await fetch(`/api/${provider}/models`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Model list failed');
  return Array.isArray(data.models) ? data.models : [];
}
