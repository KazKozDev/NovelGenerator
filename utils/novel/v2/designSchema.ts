// Output examples shared by the successive design levels.
export const DESIGN_SCHEMA = {
  "contract": {
    "working_title": "",
    "explicit_requirements": [],
    "premise_givens": [
      {
        "given": "",
        "kind": "person | thing | situation | fact"
      }
    ],
    "premise_names": [],
    "inferred_decisions": [
      {
        "decision": "",
        "reason": ""
      }
    ],
    "tense": "",
    "narrative_perspective": "",
    "genre_expectations_selected": []
  },
  "profile": {
    "pressure_curve": "rising | oscillating | investigative | flat | descending",
    "curve_reason": "",
    "declared_motifs": [
      {
        "motif": "",
        "allowed_uses": 0,
        "reason": ""
      }
    ],
    "cost_kinds": [],
    "dialogue_weight": "low | medium | high",
    "staging_variety": "low | medium | high",
    "mechanism_reuse": "low | medium | high",
    "open_ending": false,
    "mechanism_ledger": [],
    "ending_invariants": []
  },
  "dramatic_core": {
    "distinctive_situation": "",
    "central_conflict": "",
    "stakes": "",
    "why_now": "",
    "sources_of_development": []
  },
  "style_contract": {
    "narrative_distance": "",
    "attention": "",
    "register": "",
    "humor": "",
    "emotional_expression": ""
  },
  "characters": [
    {
      "id": "C01",
      "name": "",
      "story_function": "",
      "goal": "",
      "motives": [],
      "capabilities": [],
      "limitations": [],
      "relationships": [],
      "behavior": "",
      "voice_and_perception": "",
      "initial_knowledge": [],
      "initial_beliefs": []
    }
  ],
  "world_rules": [
    {
      "id": "R01",
      "rule": "",
      "relevant_consequences": [],
      "subject": "",
      "attribute": ""
    }
  ],
  "causal_map": [
    {
      "id": "E01",
      "before_story": false,
      "cause": "",
      "actor_id": "",
      "action_or_event": "",
      "consequence": "",
      "requires": [],
      "enables": []
    }
  ],
  "ending": {
    "central_resolution": "",
    "decisive_action_or_choice": "",
    "required_setup": [],
    "intentionally_open_questions": []
  },
  "chapter_map": [
    {
      "chapter": 1,
      "function": "",
      "main_change": "",
      "event_ids": [],
      "dependencies": [],
      "setup_or_payoff": [],
      "pov_id": null,
      "target_words": 0,
      "mechanism": "",
      "cost": "",
      "pressure_rung": 1
    }
  ]
} as const;
