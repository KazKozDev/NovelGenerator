/** The model ids a provider's own server reports, through the local development server that holds the key. */
export async function fetchProviderModels(provider: 'gemini' | 'anthropic' | 'compatible'): Promise<string[]> {
  const response = await fetch(`/api/${provider}/models`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Model list failed');
  return Array.isArray(data.models) ? data.models : [];
}
