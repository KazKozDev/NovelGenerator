"""
Who speaks, and who a pronoun means.

The engine's own reading of both is a large model's judgement, made from scratch every round, and
across every stored run "a character uses knowledge the story has not given them" is the second most
frequent finding of all — 213 of 930. Before that can be checked against a record rather than an
opinion, the record needs two things this script produces and nothing in the engine does: the speaker
of each line of dialogue, and the character each pronoun refers to.

Run through .venv-booknlp, which pins the versions these two 2022 libraries still expect:

    .venv-booknlp/bin/python scripts/speech-map.py chapter.txt out.json

English only. BookNLP and F-Coref are both English models; a Russian chapter produces nothing usable
here, and the script says so rather than returning an empty map that would read as "no dialogue".

What it produces is evidence, not verdicts. On the first passage it was tried against it put every
line of dialogue with the right speaker and still folded "the caretaker" into the wrong character —
so a knowledge record built on this has to carry the reference it used, the way canon carries the
quotation that proves a fact.
"""
import json
import re
import sys
import tempfile
from pathlib import Path

import torch

# BookNLP's checkpoints carry bert.embeddings.position_ids, a buffer transformers dropped in 4.31.
# It is not a weight, and discarding it on load is what strict=False would do for that one key.
_torch_load = torch.load


def _load(*args, **kwargs):
    kwargs.setdefault("weights_only", False)
    state = _torch_load(*args, **kwargs)
    if isinstance(state, dict):
        state.pop("bert.embeddings.position_ids", None)
    return state


torch.load = _load


def looks_english(text: str) -> bool:
    letters = re.findall(r"\p{L}" if False else r"[^\W\d_]", text, re.UNICODE)
    if not letters:
        return False
    latin = sum(1 for character in letters if character.isascii())
    return latin / len(letters) > 0.8


def speech_map(text: str) -> dict:
    from booknlp.booknlp import BookNLP

    model = BookNLP("en", {"pipeline": "entity,quote,coref", "model": "small"})
    with tempfile.TemporaryDirectory() as work:
        source = Path(work) / "chapter.txt"
        source.write_text(text, encoding="utf8")
        model.process(str(source), work, "chapter")

        characters = {}
        for line in (Path(work) / "chapter.entities").read_text(encoding="utf8").splitlines()[1:]:
            coref, start, _end, prop, category, mention = line.split("\t")
            if category != "PER":
                continue
            person = characters.setdefault(int(coref), {"id": int(coref), "names": [], "mentions": 0})
            person["mentions"] += 1
            # A proper name is what the record should be keyed on; pronouns only prove the reference.
            if prop == "PROP" and mention not in person["names"]:
                person["names"].append(mention)

        quotes = []
        for line in (Path(work) / "chapter.quotes").read_text(encoding="utf8").splitlines()[1:]:
            start, _end, _mention_start, _mention_end, phrase, speaker, quote = line.split("\t")
            quotes.append({
                "speaker": int(speaker) if speaker.isdigit() else None,
                "attributedTo": phrase,
                "startToken": int(start),
                "text": quote.strip(),
            })

    return {"characters": sorted(characters.values(), key=lambda item: -item["mentions"]), "quotes": quotes}


def coreference(text: str) -> list:
    from fastcoref import FCoref

    clusters = FCoref(device="cpu").predict(texts=[text])[0].get_clusters()
    # Only chains that tie a pronoun to something named are of any use to a knowledge record.
    return [cluster for cluster in clusters if any(len(mention.split()) > 1 or mention[:1].isupper() for mention in cluster)]


if __name__ == "__main__":
    text = Path(sys.argv[1]).read_text(encoding="utf8")
    if not looks_english(text):
        json.dump({"error": "These models are English-only; this chapter is not in Latin script."}, open(sys.argv[2], "w"))
        sys.exit(2)
    result = speech_map(text)
    result["coreference"] = coreference(text)
    json.dump(result, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
    print(f"{len(result['characters'])} characters, {len(result['quotes'])} attributed lines, {len(result['coreference'])} chains")
