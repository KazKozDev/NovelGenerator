import { afterEach, expect, it, vi } from 'vitest';
import { generateQwenBrowserText } from '../services/qwenBrowserService';
afterEach(()=>vi.unstubAllGlobals());
it('routes through the local backend without sending browser credentials',async()=>{
 const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({text:'OK'})));
 vi.stubGlobal('fetch',request);
 expect(await generateQwenBrowserText('Hello',undefined,64,'qwen3.8-flash')).toBe('OK');
 expect(request.mock.calls[0][0]).toBe('/api/qwen');
 expect(request.mock.calls[0][1].headers).toEqual({'Content-Type':'application/json'});
 expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({model:'qwen3.8-flash',maxTokens:64});
});
it('propagates backend failure instead of treating it as generated prose',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Qwen token limit'}),{status:502})));
 await expect(generateQwenBrowserText('Hello')).rejects.toThrow('Qwen token limit');
});
it('reports usage even when the backend rejects a truncated answer',async()=>{
 const metadata={finish_reason:'length',usage:{prompt_tokens:120,completion_tokens:64}};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Qwen token limit',metadata}),{status:502})));
 const reported=vi.fn();
 await expect(generateQwenBrowserText('Hello',undefined,64,undefined,undefined,undefined,reported)).rejects.toThrow('Qwen token limit');
 expect(reported).toHaveBeenCalledOnce();expect(reported).toHaveBeenCalledWith(metadata);
});
