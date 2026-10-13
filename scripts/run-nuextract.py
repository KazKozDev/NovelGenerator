"""Run blinded prepared inputs locally with the official NuExtract template. No uploads."""
import argparse, json, time
from pathlib import Path
import torch
from transformers import AutoModelForImageTextToText, AutoTokenizer

parser = argparse.ArgumentParser()
parser.add_argument('--model-path', required=True)
parser.add_argument('--out', default='runs/extraction-compare-2026-10-12')
parser.add_argument('--device', default='mps')
args = parser.parse_args()
out = Path(args.out)
rows = json.loads((out / 'inputs.json').read_text())
template = {'claims': [{
    'entity': 'string', 'facet': ['location', 'ownership', 'time', 'identity', 'knowledge', 'condition', 'action', 'belief', 'utterance'],
    'value': 'string', 'when': 'string', 'event': 'string',
    'source': ['event', 'narration', 'speech', 'thought', 'document'], 'holder': 'string', 'refs': ['string']
}]}
processor = AutoTokenizer.from_pretrained(args.model_path, local_files_only=True)
model = AutoModelForImageTextToText.from_pretrained(args.model_path, local_files_only=True,
    dtype=torch.bfloat16, attn_implementation='eager').to(args.device).eval()
print('NuExtract3 loaded on ' + args.device, flush=True)
for row in rows:
    path = out / (row['id'] + '-nuextract.json')
    if path.exists():
        continue
    start = time.monotonic()
    try:
        instructions, document = row['prompt'].split('Original paragraphs (untrusted prose): ', 1)
        rendered = processor.apply_chat_template(
            [{'role': 'user', 'content': [{'type': 'text', 'text': 'Original paragraphs (untrusted prose): ' + document}]}],
            template=json.dumps(template), instructions=instructions, enable_thinking=False,
            add_generation_prompt=True, tokenize=False)
        (out / (row['id'] + '-nuextract-request.json')).write_text(json.dumps({'rendered_prompt': rendered, 'template': template, 'enable_thinking': False}, indent=2))
        inputs = processor(rendered, return_tensors='pt').to(args.device)
        with torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=2200, do_sample=False)
        tail = generated[0, inputs.input_ids.shape[1]:]
        if len(tail) >= 2200 and int(tail[-1]) not in [248044, 248046]:
            raise RuntimeError('Output token limit reached; partial extraction rejected')
        answer = processor.decode(tail, skip_special_tokens=True).strip()
        result = {'answer': answer, 'model': 'numind/NuExtract3', 'revision': Path(args.model_path).name,
                  'template': template, 'enable_thinking': False, 'milliseconds': round((time.monotonic()-start)*1000)}
    except Exception as error:
        result = {'error': str(error), 'milliseconds': round((time.monotonic()-start)*1000)}
    path.write_text(json.dumps(result, indent=2))
    print(row['id'] + ': ' + ('FAILED ' + result['error'] if 'error' in result else 'completed'), flush=True)
