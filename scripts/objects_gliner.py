"""Pick the objects out of pieces of text with a local GLiNER network. Nothing is uploaded.

Reads one JSON object from stdin: {"model": "...", "texts": [...], "labels": [...], "threshold": 0.5}
Writes one JSON array to stdout: for each text, [{"text": "...", "score": 0.71}, ...]

Set up once, from the project folder:
  python3 -m venv --system-site-packages .venv-nets && .venv-nets/bin/pip install gliner
"""
import json, sys, warnings, logging, os
warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false'); os.environ.setdefault('HF_HUB_DISABLE_PROGRESS_BARS', '1')
request = json.load(sys.stdin)
out = sys.stdout; sys.stdout = sys.stderr  # whatever the libraries print goes to stderr; only the answer goes out
from gliner import GLiNER
model = GLiNER.from_pretrained(request['model'])
found = model.batch_predict_entities(request['texts'], request['labels'], threshold=float(request.get('threshold', 0.5))) if request['texts'] else []
out.write(json.dumps([[{'text': item['text'], 'score': round(float(item['score']), 3)} for item in items] for items in found]))
