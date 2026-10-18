#!/usr/bin/env python3
"""
Transcribes a finished audiobook with word timestamps, for the Audio stage's Timecodes tab.

The recognizer only writes down what is said and when; finding where each chapter starts is the app's own code
(utils/audiobook/chapterTimecodes.ts). Progress goes to stdout as one JSON object per line, the transcript to --output.

  python3 scripts/audio_timecodes.py --input book.mp3 --output words.json [--engine auto|mlx|faster] [--language en]

Engines: whisper-large-v3-turbo in MLX (Apple silicon), else faster-whisper base on the CPU. Both come from the
Hugging Face cache.
"""
import argparse
import json
import sys
import time

MLX_MODEL = "mlx-community/whisper-large-v3-turbo"
FASTER_MODEL = "base"
SAMPLE_RATE = 16000


def emit(**event):
    print(json.dumps(event), flush=True)


class Progress:
    """Stands in for tqdm inside mlx_whisper, which counts mel frames as it decodes."""

    def __init__(self, total=None, **_):
        self.total = total or 1
        self.done = 0
        self.last = -1.0

    def update(self, n=1):
        self.done += n
        share = min(1.0, self.done / self.total)
        if share - self.last >= 0.005 or share >= 1.0:
            self.last = share
            emit(stage="transcribing", progress=round(share, 4))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def word_rows(words):
    rows = []
    for w in words:
        text = (w.get("word") if isinstance(w, dict) else w.word) or ""
        start = w.get("start") if isinstance(w, dict) else w.start
        end = w.get("end") if isinstance(w, dict) else w.end
        text = text.strip()
        if text and start is not None:
            rows.append([text, round(float(start), 2), round(float(end if end is not None else start), 2)])
    return rows


def run_mlx(path, language):
    import importlib
    import types
    import mlx_whisper
    from mlx_whisper.audio import load_audio

    emit(stage="decoding")
    audio = load_audio(path)
    duration = len(audio) / SAMPLE_RATE
    emit(stage="loading", duration=round(duration, 2))
    module = importlib.import_module("mlx_whisper.transcribe")
    setattr(module, "tqdm", types.SimpleNamespace(tqdm=Progress))
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=MLX_MODEL,
        word_timestamps=True,
        condition_on_previous_text=False,
        language=language,
        verbose=False,
    )
    words = []
    segments: list = result.get("segments") or []  # type: ignore[assignment]
    for segment in segments:
        words.extend(word_rows(segment.get("words", [])))
    return {"engine": "mlx", "model": MLX_MODEL, "language": result.get("language"), "duration": duration, "words": words}


def run_faster(path, language):
    from faster_whisper import WhisperModel

    emit(stage="loading")
    model = WhisperModel(FASTER_MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(path, word_timestamps=True, language=language, condition_on_previous_text=False)
    duration = float(info.duration or 0)
    emit(stage="transcribing", progress=0, duration=round(duration, 2))
    words, last = [], -1.0
    for segment in segments:
        words.extend(word_rows(segment.words or []))
        share = min(1.0, segment.end / duration) if duration else 0
        if share - last >= 0.005:
            last = share
            emit(stage="transcribing", progress=round(share, 4))
    return {"engine": "faster-whisper", "model": f"faster-whisper-{FASTER_MODEL}", "language": info.language, "duration": duration, "words": words}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--engine", default="auto", choices=["auto", "mlx", "faster"])
    parser.add_argument("--language", default=None)
    args = parser.parse_args()

    started = time.time()
    engines = {"mlx": [run_mlx], "faster": [run_faster], "auto": [run_mlx, run_faster]}[args.engine]
    result, errors = None, []
    for run in engines:
        try:
            result = run(args.input, args.language)
            break
        except ImportError as err:
            errors.append(f"{run.__name__}: {err}")
    if result is None:
        print("No speech recognizer is installed (mlx-whisper or faster-whisper). " + "; ".join(errors), file=sys.stderr)
        sys.exit(2)
    result["seconds"] = round(time.time() - started, 1)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    emit(stage="done", words=len(result["words"]), engine=result["engine"])


if __name__ == "__main__":
    main()
