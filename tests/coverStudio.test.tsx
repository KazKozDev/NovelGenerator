import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COVER_FORMATS,
  cropRect,
  fitText,
  textLayout,
  wrapLines,
  DEFAULT_STYLE,
  renderYouTubeEditorial,
} from '../utils/cover/formats';
import { buildCoverPromptRequest, conceptPrompt, masterPrompt, parseConcepts, MASTER_RULES } from '../utils/cover/coverPrompt';
import { genreArt } from '../utils/cover/genreArt';
import { generateGeminiImage } from '../services/geminiDevPlugin';
import PromptBookWorkspace from '../components/PromptBookWorkspace';
import type { PromptBook } from '../utils/novel/promptBook';

// Each character is 10 units wide at size 10.
const measureAt = (size: number, text: string) => text.length * size;

describe('cover formats', () => {
  it('cuts the largest frame of the format around the focus, held inside the master', () => {
    expect(cropRect(2000, 3000, 1600, 2560, { x: 0.5, y: 0.5 })).toEqual({ x: 63, y: 0, w: 1875, h: 3000 });
    expect(cropRect(2000, 3000, 3000, 3000, { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 500, w: 2000, h: 2000 });
    expect(cropRect(2000, 3000, 3000, 3000, { x: 0.5, y: 0 })).toEqual({ x: 0, y: 0, w: 2000, h: 2000 });
    expect(cropRect(2000, 3000, 3000, 3000, { x: 0.5, y: 1 })).toEqual({ x: 0, y: 1000, w: 2000, h: 2000 });
  });

  it('wraps words into lines and shrinks the title until it fits', () => {
    expect(wrapLines('The Thursday Room', 90, t => t.length * 10)).toEqual(['The', 'Thursday', 'Room']);
    const fit = fitText('THE THURSDAY ROOM', 1000, 2, 100, 20, measureAt);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.lines.every(line => measureAt(fit.size, line) <= 1000)).toBe(true);
  });

  it('offers online and offline formats from specifications', () => {
    const online = COVER_FORMATS.filter(f => f.medium === 'online').map(f => f.id);
    const offline = COVER_FORMATS.filter(f => f.medium === 'offline').map(f => f.id);
    expect(online).toEqual([
      'ebook',
      'audio',
      'podcast',
      'yt_thumb',
      'yt_frame',
      'post',
      'post_square',
      'stories',
      'twitter',
      'pinterest',
    ]);
    // A front for every trim, and a full cover for every print edition and trim it prints.
    expect(offline).toEqual([
      'print_front_5x8', 'print_front_525x8', 'print_front_55x85', 'print_front_6x9',
      'print_wrap_5x8', 'print_wrap_525x8', 'print_wrap_55x85', 'print_wrap_6x9',
      'hardcover_wrap_55x85', 'hardcover_wrap_6x9',
      'ingram_wrap_5x8', 'ingram_wrap_525x8', 'ingram_wrap_55x85', 'ingram_wrap_6x9',
    ]);
    const audio = COVER_FORMATS.find(f => f.id === 'audio')!;
    const ebook = COVER_FORMATS.find(f => f.id === 'ebook')!;
    expect(textLayout(audio).authorBottom).toBeGreaterThan(0.14);
    expect(textLayout(ebook).authorBottom).toBe(0.06);
  });
});

describe('cover prompt', () => {
  const book = {
    title: 'The Thursday Room', genre: 'erotic thriller', premise: 'A counselor and a hotel room.',
    overview: 'Nora meets a nameless lover every Thursday in Room 412.', conflict: 'She must protect him from his wife.',
    chapters: ['1. No Names: keep composure'], characters: ['Nora Blake: keeps her two lives apart'],
    excerpt: 'Room 412 held the heat.',
  };

  it('reads the book from its outline, not from its first scene, and gives the genre\'s cues', () => {
    const { prompt, system } = buildCoverPromptRequest(book);
    expect(prompt).toContain('TITLE: The Thursday Room');
    expect(prompt).toContain('WHAT THE BOOK IS ABOUT:\nNora meets a nameless lover');
    expect(prompt).toContain('CENTRAL CONFLICT:');
    expect(prompt).not.toContain('Room 412 held the heat');
    expect(prompt).toMatch(/HOW COVERS IN THIS GENRE READ: desire shown through one charged detail/);
    expect(system).toContain('"object"');
    expect(system).toContain('No text, letters');
    expect(system).toContain('never gives the book away');
    expect(system).toContain('carries no writing or digits');
    // A book without an outline still has its opening to go on.
    expect(buildCoverPromptRequest({ title: 'T', excerpt: 'It began.' }).prompt).toContain('OPENING OF THE BOOK:\nIt began.');
  });

  it('keeps complete concepts from the answer and leaves out the rest', () => {
    const concepts = parseConcepts('```json\n{"concepts":[{"kind":"object","idea":"An ashtray no one uses.","subject":"a heavy veined marble ashtray on a sill","setting":"dark hotel window","light":"one seam of amber light","palette":["burgundy","amber","charcoal"],"mood":"secret, tense"},{"kind":"place","idea":"","subject":"x"},{"kind":"weird","idea":"A door.","subject":"a hotel door numbered with brass"}]}\n```');
    expect(concepts).toHaveLength(2);
    expect(concepts[1].kind).toBe('object');
    expect(parseConcepts('no json here')).toEqual([]);
  });

  it('puts the prompt together in code: the genre\'s medium, the subject, room for lettering, no text', () => {
    const concept = { kind: 'object' as const, idea: 'i', subject: 'a heavy veined marble ashtray on a sill', setting: 'dark hotel window', light: 'one seam of amber light', palette: ['burgundy', 'amber'], mood: 'secret' };
    const thriller = conceptPrompt(concept, genreArt('erotic thriller'));
    expect(thriller).toMatch(/^A moody fine-art photograph with a cinematic finish for a vertical book cover\. A heavy veined marble ashtray on a sill\. Setting: dark hotel window\./);
    expect(thriller).toContain('the same scene carries on into soft, dim, uneventful surroundings');
    expect(thriller).toContain('no borders, bands or blank panels');
    expect(thriller).not.toMatch(/plain and uncluttered|open space/);
    expect(thriller).toContain('Colour palette: burgundy, amber.');
    expect(thriller.endsWith(MASTER_RULES)).toBe(true);
    // A fantasy book is painted, not photographed with skin pores.
    expect(conceptPrompt(concept, genreArt('epic fantasy'))).toMatch(/^A painterly digital illustration/);
    expect(conceptPrompt(concept, genreArt('epic fantasy'))).not.toMatch(/photograph|pores|35mm/);
    expect(genreArt('').key).toBe('literary');
    expect(genreArt('Cozy mystery').key).toBe('cozy');
    expect(genreArt('Psychological thriller').key).toBe('thriller');
  });

  it('sends a written prompt as it is, adding the no-lettering rule only where it is missing', () => {
    expect(masterPrompt('A window in a hotel room.')).toBe(`A window in a hotel room.\n\n${MASTER_RULES}`);
    expect(masterPrompt(`A door. ${MASTER_RULES}`)).toBe(`A door. ${MASTER_RULES}`);
  });
});

describe('gemini image request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for one 2:3 4K image and returns its data', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateGeminiImage('key', { prompt: 'A window', model: 'gemini-3.1-flash-image' })).toEqual({ data: 'AAAA', mimeType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.1-flash-image:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
    expect(JSON.parse(String(init.body)).generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3', imageSize: '4K' } });
  });

  it('refuses an unknown model and reports a missing image', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateGeminiImage('key', { prompt: 'x', model: 'something-else' })).rejects.toThrow('Gemini returned no image (SAFETY).');
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain('/models/gemini-3-pro-image:generateContent');
  });
});

describe('cover stage', () => {
  it('shows the fourth stage and opens the cover studio', () => {
    const state: PromptBook = { version: 1, brief: { input: { premise: 'Save a log', chapter_count: 2, target_total_words: 1200, genre: 'thriller', author_requirements: '' }, settings: {} }, phase: 'ready', revision: 1, prompts: [], blueprint: { title: 'The Log' } as any, workspaceStage: 'cover', updatedAt: '' };
    const html = renderToStaticMarkup(<PromptBookWorkspace value={state} busy={false} onContinue={vi.fn()} onSaveBlueprint={vi.fn()} onSavePrompt={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} />);
    expect(html).toContain('4. Cover');
    expect(html).toContain('Concepts from the book');
    expect(html).toContain('Generate master');
    expect(html).toContain('Upload custom master');
    expect(html).not.toContain('Chapter prompts');
  });
});

describe('youtube editorial cover format', () => {
  it('has youtubeLayout, badgeColor, and badgeTextColor in DEFAULT_STYLE', () => {
    expect(DEFAULT_STYLE.youtubeLayout).toBe('editorial_left');
    expect(DEFAULT_STYLE.badgeColor).toBe('#e5a93c');
    expect(DEFAULT_STYLE.badgeTextColor).toBe('#18181b');
  });

  it('renders editorial left composition and pill badge without crashing', () => {
    const mockCtx: any = {
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      roundRect: vi.fn(),
    };

    renderYouTubeEditorial(
      mockCtx,
      1280,
      720,
      {
        title: 'The Thursday Room',
        author: 'Artem Kozlov',
        tagline: '',
        badge: 'FULL AUDIOBOOK',
      },
      DEFAULT_STYLE,
      'Georgia',
      measureAt
    );

    // Verify left gradient was created
    expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 1280 * 0.65, 0);
    // Verify prefix "T  H  E" or title text was rendered
    const fillTextCalls = mockCtx.fillText.mock.calls.map((call: any[]) => call[0]);
    expect(fillTextCalls.some((txt: string) => txt.includes('T  H  E'))).toBe(true);
    expect(fillTextCalls.some((txt: string) => txt.includes('THURSDAY') || txt.includes('ROOM'))).toBe(true);
    expect(fillTextCalls.some((txt: string) => txt.includes('F U L L'))).toBe(true);
    // Verify author name is NOT rendered on YouTube cover thumbnail
    expect(fillTextCalls.some((txt: string) => txt.includes('Artem') || txt.includes('KOZLOV'))).toBe(false);
  });

  it('renders all 3 YouTube A/B/C variants without author name', () => {
    const variants = [
      { id: 'A', name: 'Editorial Amber', font: 'serif' as const, badgeColor: '#e5a93c', badgeTextColor: '#18181b', color: '#fdfbf7' },
      { id: 'B', name: 'High-Punch Crimson', font: 'sans' as const, badgeColor: '#dc2626', badgeTextColor: '#ffffff', color: '#ffffff' },
      { id: 'C', name: 'Noir Cinema Gold', font: 'serif' as const, badgeColor: '#27272a', badgeTextColor: '#fbbf24', color: '#fbbf24' },
    ];

    for (const v of variants) {
      const mockCtx: any = {
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      };

      renderYouTubeEditorial(
        mockCtx,
        1280,
        720,
        {
          title: 'The Thursday Room',
          author: 'Artem Kozlov',
          tagline: '',
          badge: 'FULL AUDIOBOOK',
        },
        {
          ...DEFAULT_STYLE,
          font: v.font,
          color: v.color,
          badgeColor: v.badgeColor,
          badgeTextColor: v.badgeTextColor,
        },
        v.font === 'serif' ? 'Georgia' : 'Helvetica',
        measureAt
      );

      const calls = mockCtx.fillText.mock.calls.map((c: any[]) => c[0]);
      expect(calls.some((txt: string) => txt.includes('THURSDAY') || txt.includes('ROOM'))).toBe(true);
      expect(calls.some((txt: string) => txt.includes('Artem') || txt.includes('KOZLOV'))).toBe(false);
    }
  });

  it('renders 3-tab workflow (Art & Realism, Typography & 3D, Review & Export), AI Autopilot, De-Plastic, and A/B/C Pack in CoverStudio UI', () => {
    const state: PromptBook = {
      version: 1,
      brief: { input: { premise: 'Save a log', chapter_count: 2, target_total_words: 1200, genre: 'thriller', author_requirements: '' }, settings: {} },
      phase: 'ready',
      revision: 1,
      prompts: [],
      blueprint: { title: 'The Log' } as any,
      workspaceStage: 'cover',
      updatedAt: '',
    };
    const html = renderToStaticMarkup(
      <PromptBookWorkspace
        value={state}
        busy={false}
        onContinue={vi.fn()}
        onSaveBlueprint={vi.fn()}
        onSavePrompt={vi.fn()}
        onExport={vi.fn()}
        onSettings={vi.fn()}
      />
    );
    expect(html).toContain('AI Autopilot');
    expect(html).toContain('1. Art &amp; Realism');
    expect(html).toContain('2. Typography &amp; 3D');
    expect(html).toContain('3. Review &amp; Export');
    expect(html).toContain('YouTube A/B/C Pack');
    expect(html).toContain('De-Plastic');
    expect(html).toContain('CodeFormer Face Pores (MPS)');
    expect(html).toContain('Remove AI Plastic');
    expect(html).toContain('3D Depth Typography');
    expect(html).toContain('Aesthetic &amp; CTR Scorer');
    expect(html).toContain('Feed Simulator');
  });

  it('layers 3D depth cutout over title on standard portrait book formats', () => {
    const ebook = COVER_FORMATS.find(f => f.id === 'ebook')!;
    const mockCtx: any = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    };
    const mockCanvas: any = {
      getContext: vi.fn(() => mockCtx),
      width: ebook.width,
      height: ebook.height,
    };

    const mockMaster: any = { width: 2000, height: 3000 };
    const mockCutout: any = { width: 2000, height: 3000 };

    renderYouTubeEditorial; // Keep import referenced
    import('../utils/cover/formats').then(({ renderCover }) => {
      renderCover(
        mockMaster,
        ebook,
        { title: 'The Thursday Room', author: 'Artem Kozlov', tagline: '' },
        { ...DEFAULT_STYLE, depthBehind: true },
        { x: 0.5, y: 0.5 },
        mockCanvas,
        mockCutout
      );

      // Verify drawImage was called with mockCutout
      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        mockCutout,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        0,
        0,
        ebook.width,
        ebook.height
      );
    });
  });
});


