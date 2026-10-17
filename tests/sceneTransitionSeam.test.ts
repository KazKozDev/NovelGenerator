import { describe, it, expect, vi } from 'vitest';
import {
  extractSentences,
  computeSentenceSimilarity,
  applyDeterministicDedup,
  buildSeamPolisherPrompt,
  smoothSceneTransition,
  joinScenesWithCameraBreaks,
  smoothAndJoinChapterScenes,
} from '../utils/novel/craft/craftRules';

describe('Scene-to-Scene Seam Smoothing & Transition Logic', () => {
  describe('Part 2: Deterministic Dedup Filter', () => {
    it('extracts sentences accurately from a paragraph', () => {
      const p = 'The lock gave under his thumb. Bruce stepped inside and pulled the door shut behind him! What next?';
      const sentences = extractSentences(p);
      expect(sentences).toHaveLength(3);
      expect(sentences[0]).toBe('The lock gave under his thumb.');
      expect(sentences[1]).toBe('Bruce stepped inside and pulled the door shut behind him!');
      expect(sentences[2]).toBe('What next?');
    });

    it('computes high similarity for identical and near-duplicate sentences', () => {
      const s1 = 'Bruce stepped inside and pulled the door shut behind him.';
      const s2 = 'Bruce stepped inside and pulled the door shut behind him.';
      expect(computeSentenceSimilarity(s1, s2)).toBe(1.0);

      const s3 = 'Bruce stepped inside and pulled the heavy door shut behind him.';
      expect(computeSentenceSimilarity(s1, s3)).toBeGreaterThanOrEqual(0.70);
    });

    it('computes low similarity for different sentences', () => {
      const s1 = 'Bruce stepped inside and pulled the door shut behind him.';
      const s2 = 'The terminal screen flickered green in the dark corner.';
      expect(computeSentenceSimilarity(s1, s2)).toBeLessThan(0.40);
    });

    it('strips duplicate first sentence from Scene B when similarity >= 0.70', () => {
      const sceneA = `Bruce checked the corridor once more before slipping through the hatch.

The lock gave under his thumb. Bruce stepped inside and pulled the door shut behind him.`;

      const sceneB = `Bruce stepped inside and pulled the door shut behind him. The air smelled of salt and rust.

He clicked on his flashlight and aimed it at the rows of shipping containers.`;

      const deduped = applyDeterministicDedup(sceneA, sceneB);
      expect(deduped).not.toContain('Bruce stepped inside and pulled the door shut behind him.');
      expect(deduped).toContain('The air smelled of salt and rust.');
      expect(deduped).toContain('He clicked on his flashlight');
    });

    it('removes entire first paragraph if it consists only of the duplicate sentence', () => {
      const sceneA = `He pressed the button.

The door swung wide open.`;

      const sceneB = `The door swung wide open.

A wave of icy wind swept through the threshold.`;

      const deduped = applyDeterministicDedup(sceneA, sceneB);
      expect(deduped.trim()).toBe('A wave of icy wind swept through the threshold.');
    });

    it('removes entire first paragraph if it duplicates the closing multi-sentence paragraph beat', () => {
      const sceneA = `Bruce stepped up to the terminal and plugged in the decryptor module.

The status bar clicked to 41% with a soft electronic tone. The drive continued spinning in the dark subbasement.`;

      const sceneB = `The status bar clicked to 41% with a soft electronic tone. The drive continued spinning in the dark subbasement.

He waited for the remaining sectors to finish mapping.`;

      const deduped = applyDeterministicDedup(sceneA, sceneB);
      expect(deduped.trim()).toBe('He waited for the remaining sectors to finish mapping.');
    });

    it('preserves Scene B unchanged when sentences are dissimilar', () => {
      const sceneA = `The lock clicked into place.`;
      const sceneB = `Miles away, the siren began to wail across the bay.`;

      const deduped = applyDeterministicDedup(sceneA, sceneB);
      expect(deduped).toBe(sceneB);
    });
  });

  describe('Part 3: Fast LLM Micro-Seam Polisher', () => {
    it('constructs prompt with exact metadata, tags, and rules', () => {
      const tailA = 'The lock clicked shut.';
      const headB = 'He stood in the dark corridor.';
      const anchorB = 'Water dripped from a broken pipe.';
      const prompt = buildSeamPolisherPrompt(tailA, headB, anchorB, {
        locA: 'Outer Airlock',
        locB: 'Control Room',
        timeA: 'Morning',
        timeB: 'Evening',
      });

      expect(prompt).toContain('Location A: Outer Airlock');
      expect(prompt).toContain('Location B: Control Room');
      expect(prompt).toContain('Time/Location Jump: True');
      expect(prompt).toContain('[TAIL_A] (Read-only context — end of Scene A):\nThe lock clicked shut.');
      expect(prompt).toContain('[HEAD_B] (Target to edit — first paragraph of Scene B):\nHe stood in the dark corridor.');
      expect(prompt).toContain('[ANCHOR_B] (Read-only continuation — second paragraph of Scene B):\nWater dripped from a broken pipe.');
      expect(prompt).toContain('RULES:');
      expect(prompt).toContain('output ONLY the exact word: PASS');
    });

    it('keeps original head_B when Fast LLM returns PASS', async () => {
      const sceneA = 'Paragraph one of scene A.\n\nBruce turned the key and stepped inside.';
      const sceneB = 'The air smelled of damp earth.\n\nHe walked toward the light.';

      const mockLlm = vi.fn().mockResolvedValue('PASS');
      const smoothed = await smoothSceneTransition(sceneA, sceneB, {}, mockLlm);

      expect(mockLlm).toHaveBeenCalledTimes(1);
      expect(smoothed).toBe(sceneB);
    });

    it('replaces head_B when Fast LLM returns edited paragraph', async () => {
      const sceneA = 'Paragraph one of scene A.\n\nBruce stepped into the control room.';
      const sceneB = 'Stepping into the control room, Bruce saw the glowing screens.\n\nThe monitors hummed loudly.';

      const editedHeadB = 'Across the room, the monitors hummed with emergency telemetry.';
      const mockLlm = vi.fn().mockResolvedValue(editedHeadB);

      const smoothed = await smoothSceneTransition(sceneA, sceneB, {}, mockLlm);

      expect(smoothed).toContain(editedHeadB);
      expect(smoothed).toContain('The monitors hummed loudly.');
      expect(smoothed).not.toContain('Stepping into the control room, Bruce saw the glowing screens.');
    });

    it('falls back safely to original text when Fast LLM fails or throws', async () => {
      const sceneA = 'Bruce turned the key and stepped inside.';
      const sceneB = 'The room was cold and empty.\n\nHe checked his watch.';

      const mockFailingLlm = vi.fn().mockRejectedValue(new Error('Network timeout'));
      const smoothed = await smoothSceneTransition(sceneA, sceneB, {}, mockFailingLlm);

      expect(smoothed).toBe(sceneB);
    });

    it('ignores JSON responses from test mocks and preserves prose', async () => {
      const sceneA = 'Bruce turned the key and stepped inside.';
      const sceneB = 'The room was cold and empty.\n\nHe checked his watch.';

      const mockJsonLlm = vi.fn().mockResolvedValue(JSON.stringify({ issues: [], passed: true }));
      const smoothed = await smoothSceneTransition(sceneA, sceneB, {}, mockJsonLlm);

      expect(smoothed).toBe(sceneB);
    });
  });

  describe('Chapter Assembly with Camera Breaks and Seam Smoothing', () => {
    it('joinScenesWithCameraBreaks inserts * * * on POV shift and dedups same-POV seams', () => {
      const s1 = { text: 'Bruce watched the road.\n\nHe drew his coat tighter.', pov: 'Bruce' };
      const s2 = { text: 'He drew his coat tighter. The wind bit through the wool.\n\nHe kept walking.', pov: 'Bruce' };
      const s3 = { text: 'Nora watched from the upper window.', pov: 'Nora' };

      const joined = joinScenesWithCameraBreaks([s1, s2, s3]);

      // Same POV s1 -> s2: dedup stripped the duplicate first sentence
      expect(joined).toContain('Bruce watched the road.\n\nHe drew his coat tighter.\n\nThe wind bit through the wool.');
      // POV shift s2 -> s3: camera break inserted
      expect(joined).toContain('\n\n* * *\n\nNora watched from the upper window.');
    });

    it('smoothAndJoinChapterScenes runs full seam smoothing pipeline on chapter assembly', async () => {
      const s1 = { text: 'Bruce stood in the rain.\n\nThe key turned with a metallic snap.', pov: 'Bruce', location: 'Street' };
      const s2 = { text: 'The hallway was pitch dark.\n\nHe reached for the switch.', pov: 'Bruce', location: 'Hallway' };

      const mockLlm = vi.fn().mockResolvedValue('PASS');
      const chapterText = await smoothAndJoinChapterScenes([s1, s2], mockLlm);

      expect(mockLlm).toHaveBeenCalledTimes(1);
      expect(chapterText).toBe('Bruce stood in the rain.\n\nThe key turned with a metallic snap.\n\nThe hallway was pitch dark.\n\nHe reached for the switch.');
    });
  });
});
