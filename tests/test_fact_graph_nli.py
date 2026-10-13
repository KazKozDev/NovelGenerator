"""Deterministic graph/provenance tests; no network or downloaded model required."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('fact_graph_nli', Path(__file__).parents[1]/'scripts/fact_graph_nli.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class FakeNLI:
    def __init__(self, skipped=False): self.calls = []; self.skipped = skipped
    def predict(self, pairs):
        self.calls.extend(pairs)
        return [None if self.skipped else {'contradiction':0.9,'entailment':0.05,'neutral':0.05} for _ in pairs]


class FactGraphTests(unittest.TestCase):
    def test_every_paragraph_and_offsets(self):
        text = '  Nora arrived. She took the key.\n\n"Where is it?"\n\n# Heading\n\nНора дома.'
        paragraphs, claims = m.extract_sources([('book',text)])
        self.assertEqual(len(paragraphs),4)
        for item in paragraphs+claims:
            self.assertEqual(text[item['start']:item['end']],item['text'])
        self.assertEqual(len(claims),5)
        self.assertEqual(claims[2]['source_hint'],'question')
        self.assertEqual(claims[3]['source_hint'],'heading')

    def test_abbreviations_and_short_assertions_not_lost(self):
        self.assertEqual([s[2] for s in m.sentences('Dr. Nora came. He died.')],['Dr. Nora came.','He died.'])

    def test_reported_thought_and_continued_quote_remain_marked(self):
        p,c = m.extract_sources([('x','Nora said, "I was in Paris. I had the key."\n\nNora remembered the key.')])
        self.assertEqual(c[0]['source_hint'],'reported_speech')
        self.assertEqual(c[1]['source_hint'],'possibly_quoted')
        self.assertEqual(c[2]['source_hint'],'belief_or_memory')

    def test_distant_matching_is_not_limited_to_adjacent_sentences(self):
        text = 'Nora had the blue key at noon.\n\n' + '\n\n'.join(f'Topic{i} moved.' for i in range(50)) + '\n\nNora did not have the blue key at noon.'
        _,c = m.extract_sources([('x',text)])
        pairs,_ = m.candidate_pairs(c,neighbors=2,max_pairs=200)
        self.assertIn((0,len(c)-1),pairs)

    def test_pair_budget_and_no_duplicate_directions(self):
        p,c = m.extract_sources([('x','Nora was home. Nora was away. Nora had a key.')])
        predictor = FakeNLI()
        r = m.analyze(p,c,predictor,max_pairs=1)
        self.assertTrue(r['coverage']['pair_budget_clipped'])
        self.assertEqual(len(predictor.calls),2)
        self.assertEqual(len(r['contradiction_candidates']),1)
        self.assertEqual(len(r['nli_edges']),2)

    def test_threshold_is_not_a_hidden_global(self):
        p,c = m.extract_sources([('x','Nora came. Nora left.')])
        self.assertEqual(len(m.analyze(p,c,FakeNLI(),threshold=0.95)['nli_edges']),0)
        self.assertEqual(len(m.analyze(p,c,FakeNLI(),threshold=0.8)['nli_edges']),2)

    def test_triage_preserves_raw_edges_but_filters_speech_time_and_different_aspects(self):
        p,c = m.extract_sources([('x','At noon Nora was in the office.\n\nAt noon Nora was not in the office.\n\nNora said she was in the office.\n\nOn Monday Claire was in Paris.\n\nOn Tuesday Claire was in Madrid.\n\nNora had the key at noon.')])
        r = m.analyze(p,c,FakeNLI())
        self.assertGreater(len(r['literal_contradictions']),len(r['contradiction_candidates']))
        pairs = [{e['source'],e['target']} for e in r['contradiction_candidates']]
        self.assertIn({'c1','c2'},pairs)
        self.assertNotIn({'c4','c5'},pairs)
        self.assertNotIn({'c1','c6'},pairs)
        self.assertFalse(any('c3' in pair for pair in pairs))

    def test_one_sided_contradiction_is_not_promoted(self):
        edges = [{'source':'c1','target':'c2','relation':'contradiction','score':0.99,'review_scope':'time_and_identity_need_review'}]
        literal,candidates = m.triage_contradictions(edges,0.8)
        self.assertEqual(len(literal),1); self.assertEqual(candidates,[])

    def test_skipped_pairs_do_not_count_as_clean(self):
        p,c = m.extract_sources([('x','Nora came. Nora left.')])
        r = m.analyze(p,c,FakeNLI(skipped=True))
        self.assertEqual(r['coverage']['directed_pairs_evaluated'],0)
        self.assertEqual(len(r['coverage']['skipped_pairs']),2)
        self.assertEqual(r['coverage']['claims_without_evaluated_pair'],['c1','c2'])

    def test_different_times_and_speech_are_review_scopes_not_author_errors(self):
        p,c = m.extract_sources([('x','Nora was in Paris on Monday.\n\nNora was in Madrid on Tuesday.\n\nNora said she was in Paris.')])
        self.assertEqual(m.review_scope(c[0],c[1]),'different_explicit_times')
        self.assertEqual(m.review_scope(c[0],c[2]),'perspective_needs_review')
        self.assertIsNone(m.analyze(p,c,FakeNLI())['nli_edges'][0]['author_error'])

    def test_labels_from_config_and_unknown_checkpoint_refusal(self):
        self.assertEqual(m.resolve_labels('other',{0:'neutral',1:'contradiction',2:'entailment'}),['neutral','contradiction','entailment'])
        self.assertEqual(m.resolve_labels(m.MODELS['en'],{}),['contradiction','entailment','neutral'])
        with self.assertRaises(ValueError): m.resolve_labels('other',{0:'LABEL_0',1:'LABEL_1',2:'LABEL_2'})

    def test_html_keeps_untrusted_prose_as_data(self):
        p,c = m.extract_sources([('x','</script><script>alert(1)</script> Nora arrived.')])
        page = m.html_view(m.analyze(p,c,FakeNLI()))
        self.assertNotIn('</script><script>alert(1)</script>',page)
        self.assertIn('\\u003c/script\\u003e',page)


if __name__ == '__main__': unittest.main()
