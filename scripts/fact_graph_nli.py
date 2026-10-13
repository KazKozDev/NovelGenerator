#!/usr/bin/env python3
"""Local evidence graph for EN/RU prose. NLI compares excerpts; it does not extract all facts.

python3 scripts/fact_graph_nli.py --file book.md --out runs/fact-graph
python3 scripts/fact_graph_nli.py --chapters runs/nora-author-facts-deepseek1 --out runs/nora-nli
Dependencies: torch transformers networkx (sentencepiece for DeBERTa).
No manuscripts are uploaded. Only model weights are downloaded from Hugging Face.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import time

MODELS = {'en': 'cross-encoder/nli-deberta-v3-base', 'ru': 'cointegrated/rubert-base-cased-nli-threeway'}
KNOWN_LABELS = {MODELS['en']: ['contradiction', 'entailment', 'neutral'], MODELS['ru']: ['entailment', 'contradiction', 'neutral']}
STOP = set('a an the and or but is was were be been being to of in on at for with by from that this it its he she her his they their them i you we as had has have do did does not no all then only said told would could should will just one so into out как и но в на с из к у по это он она они его ее её их я ты мы был была было были есть что не нет уже бы все всё сказал сказала'.split())
OBJECTS = set('key keys card cards scarf scarves body corpse room door glass watch bag drawer coat phone notebook letter pillow код ключ ключи шарф тело труп комната дверь бокал часы сумка ящик пальто телефон письмо'.split())
WEEKDAYS = r'monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье'


def sentences(text):
    """Conservative segmentation: preserve original strings and Python character offsets."""
    start = 0
    for match in re.finditer(r'[.!?…]+["”»\')\]]*(?=\s+|$)|;(?=\s+)', text):
        end = match.end()
        if re.search(r'\b(?:Mr|Mrs|Ms|Dr|Prof|St|т|г|ул|им)\.$', text[:end], re.I):
            continue
        raw = text[start:end]; trimmed = raw.strip()
        if trimmed:
            offset = start + len(raw) - len(raw.lstrip())
            yield offset, offset + len(trimmed), trimmed
        start = end
    raw = text[start:]; trimmed = raw.strip()
    if trimmed:
        offset = start + len(raw) - len(raw.lstrip())
        yield offset, offset + len(trimmed), trimmed


def source_hint(sentence, paragraph):
    if re.search(r'\?(?:["”»\')\]]*)$', sentence):
        return 'question'
    if re.search(r'\b(?:said|says|told|asked|claims?|сказал[аи]?|говорит|спросил[аи]?|утверждает)\b', sentence, re.I):
        return 'reported_speech'
    if re.search(r'\b(?:thought|thinks?|believed?|remembered?|assumed?|думал[аи]?|считает|вспомнил[аи]?|помнил[аи]?|предположил[аи]?)\b', sentence, re.I):
        return 'belief_or_memory'
    if re.search(r'\b(?:letter|record|report|document|письм[оа]|документ|записк[ае])\b', sentence, re.I):
        return 'possible_document'
    # A quote continued across sentences must not turn into objective narration.
    if re.search(r'["“”«»]', paragraph):
        return 'possibly_quoted'
    return 'unclassified_narration'


def time_hints(text):
    return sorted(set(m.group().casefold() for m in re.finditer(r'\b(?:' + WEEKDAYS + r'|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}|noon|midnight|полдень|полночь)\b', text, re.I)))


def facet_hint(text):
    if re.search(r'\b(?:was|were|is|был[аи]?|находится)\s+(?:not\s+|не\s+)?(?:in|at|в|на)\b', text, re.I): return 'location'
    if re.search(r'\b(?:had|has|have|owns?|owned|имеет|владеет)\b', text, re.I): return 'possession'
    return 'unknown'


def extract_sources(documents, entities=()):
    paragraphs, claims = [], []
    for file, text in documents:
        # Keep every non-empty paragraph, including questions, headings and long excerpts.
        for match in re.finditer(r'\S[\s\S]*?(?=\n[ \t]*\n|\Z)', text):
            raw = match.group(); paragraph = raw.rstrip(); p = {'id': f'p{len(paragraphs)+1}', 'file': file,
                'start': match.start(), 'end': match.start()+len(paragraph), 'line': text[:match.start()].count('\n')+1,
                'text': paragraph, 'claim_ids': []}
            paragraphs.append(p)
            heading = bool(re.match(r'^#{1,6}\s', paragraph))
            for start, end, sentence in sentences(paragraph):
                mentions = set()
                for name in entities:
                    if re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', sentence, re.I): mentions.add(name.casefold())
                for token in re.findall(r'\b[\w-]+\b', sentence):
                    lower = token.casefold()
                    if lower in OBJECTS or (token[:1].isupper() and lower not in STOP and lower not in time_hints(sentence)):
                        mentions.add(lower)
                c = {'id': f'c{len(claims)+1}', 'paragraph': p['id'], 'file': file, 'text': sentence,
                    'start': p['start']+start, 'end': p['start']+end,
                    'source_hint': 'heading' if heading else source_hint(sentence, paragraph), 'facet_hint': facet_hint(sentence),
                    'mentions': sorted(mentions), 'time_hints': time_hints(sentence), 'atomic': False}
                claims.append(c); p['claim_ids'].append(c['id'])
    return paragraphs, claims


def tokens(text):
    return set(t.casefold() for t in re.findall(r'\b[\w-]+\b', text) if t.casefold() not in STOP and len(t) > 1)


def candidate_pairs(claims, neighbors=8, max_pairs=5000):
    """Global lexical inverted index: distant mentions can match. No quadratic scan."""
    terms = [tokens(c['text']) | {'entity:'+m for m in c['mentions']} for c in claims]
    index = defaultdict(list)
    eligible = [i for i, c in enumerate(claims) if c['source_hint'] not in ['question', 'heading']]
    for i in eligible:
        for token in terms[i]: index[token].append(i)
    pairs = set(); clipped = False
    for i in eligible:
        scores = defaultdict(float)
        for token in sorted(terms[i]):
            postings = index[token]
            # Very common names/words provide little discrimination. Avoid n² postings.
            if len(postings) > 200: continue
            weight = math.log(1 + len(eligible)/(1+len(postings)))
            for j in postings:
                if i != j: scores[j] += weight
        for j in range(max(0, i-2), min(len(claims), i+3)):
            if j != i and claims[j]['source_hint'] not in ['question', 'heading']:
                scores[j] += 0.05
        ranked = sorted(scores, key=lambda j: (-scores[j], j))[:neighbors]
        for j in ranked:
            pair = tuple(sorted([i, j]))
            if pair not in pairs and len(pairs) >= max_pairs: clipped = True; continue
            pairs.add(pair)
    return sorted(pairs), clipped


def resolve_labels(model_id, id2label, override=None):
    labels = override or [str(id2label.get(i, id2label.get(str(i), ''))).lower() for i in range(3)]
    if set(labels) != {'entailment', 'contradiction', 'neutral'}:
        labels = override or KNOWN_LABELS.get(model_id, [])
    if len(labels) != 3 or set(labels) != {'entailment', 'contradiction', 'neutral'}:
        raise ValueError('Unknown label mapping; supply --labels in the checkpoint’s actual logit order.')
    return labels


def review_scope(a, b):
    if a['source_hint'] != 'unclassified_narration' or b['source_hint'] != 'unclassified_narration':
        return 'perspective_needs_review'
    if a['time_hints'] and b['time_hints'] and set(a['time_hints']).isdisjoint(b['time_hints']):
        return 'different_explicit_times'
    if a.get('facet_hint','unknown') != 'unknown' and b.get('facet_hint','unknown') != 'unknown' and a['facet_hint'] != b['facet_hint']:
        return 'different_aspects'
    if not set(a['mentions']).intersection(b['mentions']): return 'identity_unlinked'
    return 'time_and_identity_need_review'


def triage_contradictions(edges, threshold):
    """Preserve all literal scores; promote only bidirectional, source-compatible candidates."""
    conflicts = {}
    for edge in edges:
        if edge['relation'] != 'contradiction': continue
        key = tuple(sorted([edge['source'], edge['target']]))
        group = conflicts.setdefault(key, [])
        group.append(edge)
    literal, candidates = [], []
    for group in conflicts.values():
        edge = dict(max(group,key=lambda e:e['score']))
        edge['bidirectional_support'] = len(group) == 2 and min(e['score'] for e in group) >= threshold
        edge['directional_scores'] = {e['source']+'->'+e['target']:e['score'] for e in group}
        literal.append(edge)
        if edge['bidirectional_support'] and edge['review_scope'] == 'time_and_identity_need_review': candidates.append(edge)
    return sorted(literal,key=lambda e:-e['score']), sorted(candidates,key=lambda e:-e['score'])


class LocalNLI:
    def __init__(self, model_id, cache, device, labels=None, local_only=False):
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=cache, local_files_only=local_only)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_id, cache_dir=cache, local_files_only=local_only).eval()
        self.labels = resolve_labels(model_id, self.model.config.id2label, labels)
        if device == 'auto': device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
        self.device = device; self.model.to(device)
        self.max_length = min(512, getattr(self.model.config, 'max_position_embeddings', 512))
        self.revision = getattr(self.model.config, '_commit_hash', None)

    def predict(self, pairs):
        encoded = self.tokenizer([a for a, _ in pairs], [b for _, b in pairs], truncation=False, padding=False)
        valid = [i for i, ids in enumerate(encoded['input_ids']) if len(ids) <= self.max_length]
        results = [None] * len(pairs)
        if valid:
            batch = self.tokenizer([pairs[i][0] for i in valid], [pairs[i][1] for i in valid], truncation=False, padding=True, return_tensors='pt').to(self.device)
            with self.torch.inference_mode():
                probs = self.torch.softmax(self.model(**batch).logits, -1).cpu().tolist()
            for i, values in zip(valid, probs): results[i] = dict(zip(self.labels, values))
        return results


def analyze(paragraphs, claims, predictor, threshold=0.8, neighbors=8, max_pairs=5000, batch_size=16, progress=None):
    pairs, clipped = candidate_pairs(claims, neighbors, max_pairs)
    directed = [(i, j) for i, j in pairs for i, j in [(i, j), (j, i)]]
    edges, skipped = [], []
    evaluated_ids = set()
    for at in range(0, len(directed), batch_size):
        batch = directed[at:at+batch_size]
        scores = predictor.predict([(claims[i]['text'], claims[j]['text']) for i, j in batch])
        if len(scores) != len(batch): raise ValueError('NLI output count differs from input count.')
        for (i, j), probs in zip(batch, scores):
            if probs is None:
                skipped.append({'source': claims[i]['id'], 'target': claims[j]['id'], 'reason': 'Token limit exceeded; pair NOT evaluated, no silent truncation.'}); continue
            if set(probs) != {'entailment', 'contradiction', 'neutral'} or any(not math.isfinite(p) or p < 0 or p > 1 for p in probs.values()):
                raise ValueError('Invalid NLI probabilities.')
            evaluated_ids.update([claims[i]['id'], claims[j]['id']])
            label = max(probs, key=probs.get)
            if label != 'neutral' and probs[label] >= threshold:
                edges.append({'source': claims[i]['id'], 'target': claims[j]['id'], 'relation': label,
                    'score': probs[label], 'probabilities': probs, 'review_scope': review_scope(claims[i], claims[j]), 'author_error': None})
        if progress: progress(min(at+batch_size, len(directed)), len(directed))
    literal, candidates = triage_contradictions(edges,threshold)
    return {'paragraphs': paragraphs, 'claims': claims, 'nli_edges': edges,
        'literal_contradictions': literal, 'contradiction_candidates': candidates,
        'coverage': {'paragraphs': len(paragraphs), 'candidate_excerpts': len(claims), 'unique_pairs_selected': len(pairs),
            'directed_pairs_requested': len(directed), 'directed_pairs_evaluated': len(directed)-len(skipped),
            'claims_without_evaluated_pair': [c['id'] for c in claims if c['id'] not in evaluated_ids],
            'pair_budget_clipped': clipped, 'skipped_pairs': skipped},
        'limitations': ['Nodes are literal excerpts, not exhaustive atomic facts. Compound sentences and pronouns remain unresolved.',
            'Source/time/entity hints are lexical heuristics, not verified world state.',
            'Candidate retrieval and lexical triage are limited: absence of a review candidate does not prove consistency. All literal NLI edges remain available.',
            'Scores are model softmax scores, not calibrated probabilities of author errors.',
            'NLI edges do not establish causation; changing locations, lies and memories may be legitimate. No automatic manuscript edits.']}


def export_graph(report, out):
    import networkx as nx
    graph = nx.DiGraph()
    for p in report['paragraphs']:
        graph.add_node(p['id'], kind='paragraph', text=p['text'], file=p['file'], line=p['line'], start=p['start'], end=p['end'])
    for c in report['claims']:
        graph.add_node(c['id'], kind='statement_candidate', text=c['text'], source_hint=c['source_hint'],
            file=c['file'], start=c['start'], end=c['end'], time_hints=json.dumps(c['time_hints'], ensure_ascii=False))
        graph.add_edge(c['paragraph'], c['id'], relation='source_excerpt')
        for mention in c['mentions']:
            node = 'e:'+mention
            graph.add_node(node, kind='lexical_mention', text=mention)
            graph.add_edge(c['id'], node, relation='mentions')
    for edge in report['nli_edges']:
        graph.add_edge(edge['source'], edge['target'], relation=edge['relation'], score=edge['score'], review_scope=edge['review_scope'])
    nx.write_graphml(graph, out/'graph.graphml')
    (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (out/'view.html').write_text(html_view(report), encoding='utf-8')


def html_view(report):
    data = json.dumps(report, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    return '''<!doctype html><meta charset="utf-8"><title>Граф утверждений</title>
<style>body{font:16px system-ui;background:#f4f3ee;color:#202c32;margin:30px auto;max-width:1100px;padding:0 20px}h1{font-size:28px}button,select{font:inherit;padding:8px;max-width:100%}#pairs{width:100%;margin:14px 0}svg{width:100%;height:170px;background:white}article{white-space:pre-wrap;background:white;padding:20px;border-top:3px solid #29646a}#contexts{display:grid;grid-template-columns:1fr 1fr;gap:20px}small{color:#56666e}#scope{margin:14px 0}@media(max-width:700px){#contexts{grid-template-columns:1fr}}</style>
<h1>Граф утверждений из текста</h1><p>NLI предлагает связи между цитатами. Связь «противоречит» требует проверки времени, личности и источника.</p>
<small id="stats"></small><p><label>Связи <select id="relation"><option value="contradiction">Кандидаты для проверки согласованности</option><option value="literal">Все буквальные противоречия NLI</option><option value="entailment">Следование</option></select></label></p>
<select id="pairs" aria-label="Пара утверждений"></select>
<svg viewBox="0 0 1000 170" role="img" aria-label="Связь двух утверждений"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#29646a"/></marker></defs><rect x="20" y="45" width="370" height="80" rx="5" fill="#e3ece8"/><rect x="610" y="45" width="370" height="80" rx="5" fill="#e3ece8"/><text id="left" x="40" y="80"/><text id="right" x="630" y="80"/><path d="M400 85 L595 85" stroke="#29646a" stroke-width="2" marker-end="url(#arrow)"/><text id="label" x="405" y="65"/></svg>
<p id="scope"></p><div id="contexts"><article id="a"></article><article id="b"></article></div>
<details><summary>Пределы проверки</summary><p id="limits"></p></details>
<script type="application/json" id="data">''' + data + '''</script><script>
const d=JSON.parse(document.getElementById('data').textContent),claims=new Map(d.claims.map(c=>[c.id,c])),paragraphs=new Map(d.paragraphs.map(p=>[p.id,p]));
const el=id=>document.getElementById(id);let edges=[];
el('stats').textContent=`Абзацев: ${d.coverage.paragraphs}; фрагментов: ${d.coverage.candidate_excerpts}; проверено направленных пар: ${d.coverage.directed_pairs_evaluated}; пропущено длинных пар: ${d.coverage.skipped_pairs.length}. Ограничение пар: ${d.coverage.pair_budget_clipped?'достигнуто':'не достигнуто'}.`;
el('limits').textContent=d.limitations.join(' ');
function display(){const edge=edges[el('pairs').selectedIndex];if(!edge){for(const id of ['a','b','left','right','label','scope'])el(id).textContent='';el('scope').textContent='Нет связей выше порога. Это не доказательство отсутствия ошибок.';return;}
for(const [target,id] of [['a',edge.source],['b',edge.target]]){const c=claims.get(id),p=paragraphs.get(c.paragraph);el(target).textContent=`${c.file}, строка ${p.line}, ${c.id}\nИсточник (эвристика): ${c.source_hint}\nВремя: ${c.time_hints.join(', ')||'не определено'}\n\nЦитата:\n${c.text}\n\nПолный абзац:\n${p.text}`;}
el('left').textContent=edge.source+' · '+claims.get(edge.source).text.slice(0,32);el('right').textContent=edge.target+' · '+claims.get(edge.target).text.slice(0,32);el('label').textContent=edge.relation+' '+edge.score.toFixed(3);el('scope').textContent='Тип проверки: '+edge.review_scope+'; ошибка автора не установлена.';}
function refresh(){edges=(el('relation').value==='contradiction'?d.contradiction_candidates:el('relation').value==='literal'?d.literal_contradictions:d.nli_edges.filter(e=>e.relation==='entailment')).slice().sort((a,b)=>b.score-a.score);el('pairs').replaceChildren();for(const e of edges){const o=document.createElement('option');o.textContent=`${e.score.toFixed(3)} · ${e.source} → ${e.target} · ${claims.get(e.source).text.slice(0,65)}`;el('pairs').append(o);}display();}
el('relation').addEventListener('change',refresh);el('pairs').addEventListener('change',display);refresh();
</script>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--file'); source.add_argument('--chapters'); source.add_argument('--text')
    parser.add_argument('--out', default='runs/fact-graph'); parser.add_argument('--language', choices=['auto','en','ru'], default='auto')
    parser.add_argument('--model'); parser.add_argument('--labels', help='Comma-separated labels in actual logit order')
    parser.add_argument('--entities', default='', help='Known names/objects, comma-separated; retrieval hints only')
    parser.add_argument('--threshold', type=float, default=0.8); parser.add_argument('--neighbors', type=int, default=8)
    parser.add_argument('--max-pairs', type=int, default=5000); parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--device', choices=['auto','cpu','mps','cuda'], default='auto'); parser.add_argument('--cache-dir', default='runs/hf-nli-cache')
    parser.add_argument('--local-only', action='store_true'); parser.add_argument('--extract-only', action='store_true', help='Index all paragraphs without loading NLI; not a consistency check')
    args = parser.parse_args()
    if not 0 < args.threshold <= 1 or min(args.neighbors,args.max_pairs,args.batch_size) < 1: parser.error('Invalid threshold or budget.')
    out = Path(args.out)
    if out.exists() and any(out.iterdir()): parser.error('Output is not empty; use a new directory.')
    if args.chapters:
        files = sorted(Path(args.chapters).glob('chapter-*.md'), key=lambda p:int(re.search(r'chapter-(\d+)\.md$',p.name)[1]))
        if not files: parser.error('No chapter files.')
        numbers = [int(re.search(r'chapter-(\d+)\.md$',p.name)[1]) for p in files]
        if numbers != list(range(1,len(files)+1)): parser.error('Chapter sequence contains gaps.')
        documents = [(str(p.resolve()),p.read_text(encoding='utf-8')) for p in files]
    elif args.file:
        file = Path(args.file); documents = [(str(file.resolve()),file.read_text(encoding='utf-8'))]
    else: documents = [('inline',args.text)]
    text = '\n\n'.join(t for _,t in documents)
    if not text.strip(): parser.error('Empty input.')
    language = args.language
    if language == 'auto': language = 'ru' if len(re.findall('[А-Яа-яЁё]',text)) > len(re.findall('[A-Za-z]',text)) else 'en'
    model_id = args.model or MODELS[language]
    paragraphs, claims = extract_sources(documents,[s.strip() for s in args.entities.split(',') if s.strip()])
    out.mkdir(parents=True, exist_ok=True)
    source_info = [{'file':f,'sha256':hashlib.sha256(t.encode()).hexdigest()} for f,t in documents]
    (out/'sources.json').write_text(json.dumps({'files':source_info,'paragraphs':paragraphs,'claims':claims},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Indexed {len(paragraphs)} paragraphs, {len(claims)} candidate excerpts.',flush=True)
    if args.extract_only:
        print('Sources indexed. NLI not run; no consistency conclusion.',flush=True); return
    started = time.monotonic()
    try:
        nli = LocalNLI(model_id,args.cache_dir,args.device,args.labels.split(',') if args.labels else None,args.local_only)
        print(f'Loaded {model_id} on {nli.device}; labels={nli.labels}',flush=True)
        def progress(done,total):
            if done % (args.batch_size*20) == 0 or done == total: print(f'NLI pairs: {done}/{total}',flush=True)
        report = analyze(paragraphs,claims,nli,args.threshold,args.neighbors,args.max_pairs,args.batch_size,progress)
        report['run']={'model':model_id,'revision':nli.revision,'labels':nli.labels,'language':language,'device':nli.device,'threshold':args.threshold,
            'neighbors':args.neighbors,'max_pairs':args.max_pairs,'seconds':time.monotonic()-started,'sources':source_info}
        export_graph(report,out)
        print(f"Finished: {len(report['contradiction_candidates'])} candidate pairs, not confirmed author errors. {out/'view.html'}",flush=True)
    except Exception as error:
        (out/'failure.json').write_text(json.dumps({'error':str(error),'model':model_id,'source_index_preserved':True},ensure_ascii=False,indent=2),encoding='utf-8'); raise


if __name__ == '__main__':
    main()
