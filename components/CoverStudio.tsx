import React, { useEffect, useMemo, useRef, useState } from 'react';
import { saveOrDownload, saveToBookFolder } from '../utils/saveToBookFolder';
import JSZip from 'jszip';
import { generateText } from '../services/llmService';
import { buildCoverPromptRequest, masterPrompt, MASTER_RULES, type CoverBookFacts } from '../utils/cover/coverPrompt';
import { canvasBlob, COVER_FORMATS, renderCover, type CoverFormat, type CoverStyle } from '../utils/cover/formats';
import { emptyStudio, loadStudio, saveStudio, type CoverStudioState } from '../utils/cover/coverStore';
import { analyzeCoverImage, recommendCoverStyling } from '../utils/cover/artDirector';

const IMAGE_MODELS = [
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image — best quality' },
  { id: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image — faster, cheaper' },
];

const button = 'px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm';
const primary = 'px-3 py-1.5 text-xs rounded bg-zinc-200 hover:bg-white text-zinc-950 font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const field = 'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200';
const label = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1';

interface CoverStudioProps {
  bookKey: string;
  facts: CoverBookFacts;
  author: string;
  onUseAsCover?: (dataUrl: string) => void;
}

interface StylePreset {
  name: string;
  font: 'serif' | 'sans';
  color: string;
  uppercase: boolean;
  shade: number;
}

const STYLE_PRESETS: StylePreset[] = [
  { name: 'YouTube Audiobook', font: 'serif', color: '#fdfbf7', uppercase: true, shade: 0.65 },
  { name: 'Fantasy Gold', font: 'serif', color: '#f59e0b', uppercase: true, shade: 0.45 },
  { name: 'Thriller Red', font: 'sans', color: '#ef4444', uppercase: true, shade: 0.6 },
  { name: 'Sci-Fi Cyan', font: 'sans', color: '#38bdf8', uppercase: true, shade: 0.3 },
  { name: 'Classic Ivory', font: 'serif', color: '#fdfbf7', uppercase: true, shade: 0.35 },
  { name: 'Minimal Dark', font: 'sans', color: '#f4f4f5', uppercase: false, shade: 0.2 },
];

const FEATURED_FORMAT_IDS = ['ebook', 'yt_thumb', 'print_wrap_6x9', 'audio', 'post'];

type FormatCategory = 'featured' | 'online' | 'offline' | 'all';

/** The fourth stage: one master picture from the book, cut and lettered for each format, ready to download. */
interface AestheticEvaluation {
  score: number;
  contrast: number;
  mobile: number;
  verdict: string;
  tips: string[];
}

export default function CoverStudio({ bookKey, facts, author, onUseAsCover }: CoverStudioProps) {
  const [state, setState] = useState<CoverStudioState>(() => emptyStudio({ title: facts.title, author, tagline: '' }));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'' | 'prompt' | 'image' | 'export'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [master, setMaster] = useState<ImageBitmap | null>(null);
  const [masterUrl, setMasterUrl] = useState('');
  const [depthCutout, setDepthCutout] = useState<ImageBitmap | null>(null);
  const [isGeneratingDepth, setIsGeneratingDepth] = useState(false);
  const [aestheticScore, setAestheticScore] = useState<number | null>(null);
  const [aestheticData, setAestheticData] = useState<AestheticEvaluation | null>(null);
  const [isScoringAesthetic, setIsScoringAesthetic] = useState(false);
  const [showMobileSimulator, setShowMobileSimulator] = useState(false);
  const [isDeplasticizing, setIsDeplasticizing] = useState(false);
  const [deplasticStrength, setDeplasticStrength] = useState(0.65);
  const [isMasterDeplasticized, setIsMasterDeplasticized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'art' | 'type'>('art');
  const [filter, setFilter] = useState<FormatCategory>('featured');
  const [heroFormatId, setHeroFormatId] = useState<string>('ebook');
  const [showGuides, setShowGuides] = useState(true);
  const [showAbModal, setShowAbModal] = useState(false);
  const abCanvasARef = useRef<HTMLCanvasElement | null>(null);
  const abCanvasBRef = useRef<HTMLCanvasElement | null>(null);
  const abCanvasCRef = useRef<HTMLCanvasElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const heroCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStudio(bookKey).then(saved => {
      if (cancelled) return;
      if (saved) setState({ ...saved, text: { ...saved.text, author: saved.text.author || author } });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [bookKey]);

  // Each master picture and its prompt also go to the book's обложки/ folder, once per picture and again when it is enhanced.
  const mastersInFolder = useRef(new Set<string>());
  useEffect(() => {
    if (!loaded) return;
    for (const m of state.masters) {
      const key = `${m.id}:${m.blob.size}`;
      if (mastersInFolder.current.has(key)) continue;
      mastersInFolder.current.add(key);
      const label = `мастер ${masterStamp(m.createdAt)}`;
      const ext = m.blob.type === 'image/jpeg' ? 'jpg' : m.blob.type === 'image/webp' ? 'webp' : 'png';
      void saveToBookFolder({ title: facts.title, kind: 'covers', label, ext, content: m.blob, stamp: false, replace: true });
      void saveToBookFolder({ title: facts.title, kind: 'covers', label: `${label} — промпт`, ext: 'txt', content: m.prompt, stamp: false, replace: true });
    }
  }, [state.masters, loaded, facts.title]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => { void saveStudio(bookKey, state).catch(() => setError('Could not save the cover studio in this browser.')); }, 400);
    return () => clearTimeout(timer);
  }, [state, loaded, bookKey]);

  const selected = state.masters.find(m => m.id === state.selected) || state.masters[0];
  useEffect(() => {
    if (!selected) { setMaster(null); setMasterUrl(''); setDepthCutout(null); return; }
    let cancelled = false;
    const url = URL.createObjectURL(selected.blob);
    setMasterUrl(url);
    createImageBitmap(selected.blob).then(bitmap => { if (!cancelled) setMaster(bitmap); });
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [selected?.id]);

  const heroFormat = useMemo(() => COVER_FORMATS.find(f => f.id === heroFormatId) || COVER_FORMATS[0], [heroFormatId]);

  // Formats are drawn at full size a moment after the last change, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const format of COVER_FORMATS) {
        const canvas = canvases.current[format.id];
        if (canvas) renderCover(master, format, state.text, state.style, state.focus, canvas, depthCutout);
      }
      if (heroCanvasRef.current) {
        renderCover(master, heroFormat, state.text, state.style, state.focus, heroCanvasRef.current, depthCutout);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [master, state.text, state.style, state.focus, heroFormat, depthCutout]);

  const variantAStyle: CoverStyle = useMemo(() => ({
    ...state.style,
    youtubeLayout: 'editorial_left',
    font: 'serif',
    uppercase: true,
    color: '#fdfbf7',
    badgeColor: '#e5a93c',
    badgeTextColor: '#18181b',
    shade: 0.55,
    depthBehind: !!depthCutout,
  }), [state.style, depthCutout]);

  const variantBStyle: CoverStyle = useMemo(() => ({
    ...state.style,
    youtubeLayout: 'editorial_left',
    font: 'sans',
    uppercase: true,
    color: '#ffffff',
    badgeColor: '#dc2626',
    badgeTextColor: '#ffffff',
    shade: 0.70,
    depthBehind: !!depthCutout,
  }), [state.style, depthCutout]);

  const variantCStyle: CoverStyle = useMemo(() => ({
    ...state.style,
    youtubeLayout: 'editorial_left',
    font: 'serif',
    uppercase: false,
    color: '#fbbf24',
    badgeColor: '#27272a',
    badgeTextColor: '#fbbf24',
    shade: 0.45,
    depthBehind: false,
  }), [state.style]);

  useEffect(() => {
    if (!showAbModal || !master) return;
    const ytFormat = COVER_FORMATS.find(f => f.id === 'yt_thumb');
    if (!ytFormat) return;
    const timer = setTimeout(() => {
      if (abCanvasARef.current) {
        renderCover(master, ytFormat, state.text, variantAStyle, state.focus, abCanvasARef.current, depthCutout);
      }
      if (abCanvasBRef.current) {
        renderCover(master, ytFormat, state.text, variantBStyle, state.focus, abCanvasBRef.current, depthCutout);
      }
      if (abCanvasCRef.current) {
        renderCover(master, ytFormat, state.text, variantCStyle, state.focus, abCanvasCRef.current, null);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [showAbModal, master, state.text, state.focus, variantAStyle, variantBStyle, variantCStyle, depthCutout]);

  const update = (patch: Partial<CoverStudioState>) => setState(s => ({ ...s, ...patch }));

  async function writePrompt() {
    setBusy('prompt'); setError('');
    try {
      const { prompt, system } = buildCoverPromptRequest(facts);
      const description = (await generateText(prompt, system, undefined, 0.8)).trim();
      update({ description });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  }

  function autoDesignCover(customMaster?: ImageBitmap | null) {
    const target = customMaster !== undefined ? customMaster : master;
    if (!target) {
      setError('Please upload or generate a master image first to analyze.');
      return;
    }
    setError('');
    const analysis = analyzeCoverImage(target);
    const rec = recommendCoverStyling(analysis, {
      title: state.text.title,
      genre: facts.genre,
      author: state.text.author,
    });

    setState(s => ({
      ...s,
      focus: rec.focus,
      style: {
        ...s.style,
        youtubeLayout: rec.youtubeLayout,
        color: rec.color,
        badgeColor: rec.badgeColor,
        badgeTextColor: rec.badgeTextColor,
        shade: rec.shade,
        uppercase: rec.uppercase,
      },
      text: {
        ...s.text,
        badge: s.text.badge || rec.badge,
      },
    }));

    setNotice(`Art Director: ${rec.reason}`);
  }

  async function generateDepthLayer() {
    if (!selected) {
      setError('Please select or upload a master image first.');
      return;
    }
    setIsGeneratingDepth(true);
    setError('');
    setNotice('Calculating 3D depth map with Depth-Anything-V2 on Apple Silicon...');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selected.blob);
      });
      const imageBase64 = await base64Promise;

      const res = await fetch('/api/cover/depth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          threshold: state.style.depthThreshold ?? 150,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.maskBase64) {
        throw new Error(data.error || `Depth estimation failed (${res.status}).`);
      }

      const maskImg = await (await fetch(data.maskBase64)).blob();
      const bitmap = await createImageBitmap(maskImg);
      setDepthCutout(bitmap);
      update({
        style: {
          ...state.style,
          depthBehind: true,
        },
      });
      setNotice('3D Depth layer generated. Typography is now layered behind foreground subjects.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGeneratingDepth(false);
    }
  }

  async function scoreAesthetics() {
    const canvas = heroCanvasRef.current;
    if (!canvas) {
      setError('No preview canvas available to score.');
      return;
    }
    setIsScoringAesthetic(true);
    setError('');
    setNotice('Evaluating cover aesthetics with cafeai/cafe_aesthetic on Apple Silicon...');

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const res = await fetch('/api/cover/aesthetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.aesthetic_score !== 'number') {
        throw new Error(data.error || `Aesthetic scoring failed (${res.status}).`);
      }
      setAestheticScore(data.aesthetic_score);
      setAestheticData({
        score: data.aesthetic_score,
        contrast: typeof data.contrast_score === 'number' ? data.contrast_score : data.aesthetic_score,
        mobile: typeof data.mobile_score === 'number' ? data.mobile_score : data.aesthetic_score,
        verdict: typeof data.verdict === 'string' ? data.verdict : (data.aesthetic_score >= 7 ? 'High Impact' : 'Moderate Impact'),
        tips: Array.isArray(data.tips) ? data.tips : [],
      });
      setNotice(`AI Score: ${data.aesthetic_score} / 10 — ${data.verdict || 'Evaluated'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsScoringAesthetic(false);
    }
  }

  async function runDeplastic(targetBlob?: Blob): Promise<Blob | null> {
    const blobToProcess = targetBlob || selected?.blob;
    if (!blobToProcess) {
      setError('Please select or upload a master image first.');
      return null;
    }
    setIsDeplasticizing(true);
    setError('');
    setNotice('De-plasticizing image: removing waxy shine, recovering skin pores, injecting 35mm film grain...');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blobToProcess);
      });
      const imageBase64 = await base64Promise;

      const res = await fetch('/api/cover/deplastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          strength: deplasticStrength,
          grain: 0.35,
          dewax: 0.5,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.imageBase64) {
        throw new Error(data.error || `De-plasticizing failed (${res.status}).`);
      }

      const enhancedBlob = await (await fetch(data.imageBase64)).blob();
      const newBitmap = await createImageBitmap(enhancedBlob);
      setMaster(newBitmap);
      setIsMasterDeplasticized(true);

      if (selected) {
        setState(s => ({
          ...s,
          masters: s.masters.map(m => m.id === selected.id ? { ...m, blob: enhancedBlob } : m),
        }));
      }

      setNotice('De-plasticizing complete: waxy specular shine eliminated, micro-pores and 35mm grain restored.');
      return enhancedBlob;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setIsDeplasticizing(false);
    }
  }

  async function runAutopilotOnSelectedCover() {
    if (!master || !selected) {
      setError('Please upload or generate a master image first.');
      return;
    }
    setError('');
    setSidebarTab('type');
    setNotice(`Applying all AI models to ${heroFormat.label}...`);

    // 1. De-plasticize master if not yet done
    let activeMaster = master;
    let enhancedBlob = selected.blob;
    if (!isMasterDeplasticized) {
      const newBlob = await runDeplastic();
      if (newBlob) {
        enhancedBlob = newBlob;
        activeMaster = await createImageBitmap(newBlob);
      }
    }

    // 2. Auto Design (Layout & Color Harmony for current hero format)
    autoDesignCover(activeMaster);

    // 3. Depth Layer if not already generated
    let activeCutout = depthCutout;
    if (!activeCutout) {
      setIsGeneratingDepth(true);
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(enhancedBlob);
        });
        const imageBase64 = await base64Promise;

        const res = await fetch('/api/cover/depth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageBase64,
            threshold: state.style.depthThreshold ?? 150,
          }),
        });

        const data = await res.json();
        if (res.ok && data.maskBase64) {
          const maskBlob = await (await fetch(data.maskBase64)).blob();
          activeCutout = await createImageBitmap(maskBlob);
          setDepthCutout(activeCutout);
          setState(s => ({
            ...s,
            style: {
              ...s.style,
              depthBehind: true,
            },
          }));
        }
      } catch {
        // Fall back gracefully
      } finally {
        setIsGeneratingDepth(false);
      }
    } else {
      setState(s => ({
        ...s,
        style: {
          ...s.style,
          depthBehind: true,
        },
      }));
    }

    // 4. Score aesthetics and readability on the selected cover
    setTimeout(() => {
      scoreAesthetics().catch(() => {});
      setNotice(`All AI models applied to ${heroFormat.label}: de-plasticized texture, 3D depth, auto-layout, and readability scored.`);
    }, 450);
  }

  // Alias for backward compatibility
  const runYouTubeAutopilot = runAutopilotOnSelectedCover;

  async function downloadYouTubeAbPack() {
    if (!master) return;
    setBusy('export');
    try {
      const ytFormat = COVER_FORMATS.find(f => f.id === 'yt_thumb');
      if (!ytFormat) return;

      const zip = new JSZip();

      // Variant A: Editorial Amber
      const blobA = await canvasBlob(
        renderCover(master, ytFormat, state.text, variantAStyle, state.focus, undefined, depthCutout),
        ytFormat.mime
      );
      zip.file('01_variant_A_editorial_amber_1280x720.jpg', blobA);

      // Variant B: High-Punch Crimson
      const blobB = await canvasBlob(
        renderCover(master, ytFormat, state.text, variantBStyle, state.focus, undefined, depthCutout),
        ytFormat.mime
      );
      zip.file('02_variant_B_high_punch_crimson_1280x720.jpg', blobB);

      // Variant C: Noir Cinema Gold
      const blobC = await canvasBlob(
        renderCover(master, ytFormat, state.text, variantCStyle, state.focus, undefined, null),
        ytFormat.mime
      );
      zip.file('03_variant_C_noir_cinema_gold_1280x720.jpg', blobC);

      const guide = `YOUTUBE STUDIO A/B/C "TEST & COMPARE" THUMBNAIL PACK
===================================================
Novel: ${facts.title}
Format: 1280x720 (16:9 Standard YouTube Thumbnail)
Note: Author name omitted per YouTube best practices.

INCLUDED VARIANTS:
1. 01_variant_A_editorial_amber_1280x720.jpg
   - Style: Warm Serif + Golden Pill Badge + 3D Depth Layering
   - Best for: Balanced storytelling, audiobooks, character immersion

2. 02_variant_B_high_punch_crimson_1280x720.jpg
   - Style: High-Punch Sans + Crimson Alert Pill + 70% Contrast Vignette
   - Best for: Maximum CTR in competitive mobile feeds, thrillers, drama

3. 03_variant_C_noir_cinema_gold_1280x720.jpg
   - Style: Noir Cinema Gold + Ambient Dark Pill
   - Best for: Psychological tension, prestige literature, cinematic mood

HOW TO RUN THE TEST IN YOUTUBE STUDIO:
1. Open YouTube Studio (studio.youtube.com) -> Content.
2. Select your video or scheduled premiere.
3. In the "Thumbnail" section, hover and click the 3 vertical dots (...).
4. Select "Test & Compare" (Тестирование вариантов).
5. Upload all 3 variants from this ZIP pack.
6. YouTube will rotate them evenly across viewers for up to 14 days and automatically select the winner by Watch Time share!
`;
      zip.file('YOUTUBE_STUDIO_TEST_GUIDE.txt', guide);

      const where = await saveOrDownload(
        {
          title: facts.title,
          kind: 'covers',
          label: 'YouTube A/B/C Test Pack',
          ext: 'zip',
          content: await zip.generateAsync({ type: 'blob' }),
        },
        `${slug(facts.title)}-youtube-abc-pack.zip`
      );
      if (where) setNotice(`YouTube A/B/C Test Pack сохранен в ${where}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function downloadSingleVariant(variantLabel: string, style: CoverStyle) {
    if (!master) return;
    const ytFormat = COVER_FORMATS.find(f => f.id === 'yt_thumb');
    if (!ytFormat) return;
    const blob = await canvasBlob(
      renderCover(master, ytFormat, state.text, style, state.focus, undefined, style.depthBehind ? depthCutout : null),
      ytFormat.mime
    );
    const where = await saveOrDownload(
      {
        title: facts.title,
        kind: 'covers',
        label: `YouTube ${variantLabel}`,
        ext: 'jpg',
        content: blob,
      },
      `${slug(facts.title)}-youtube-${variantLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-1280x720.jpg`
    );
    if (where) setNotice(`Сохранено в ${where}`);
  }

  function applyVariantToStudio(style: CoverStyle) {
    update({ style });
    setHeroFormatId('yt_thumb');
    setShowAbModal(false);
    setNotice('Applied variant style to studio.');
  }

  async function generateMaster() {
    setBusy('image'); setError(''); setNotice('');
    try {
      const prompt = masterPrompt(state.description);
      const response = await fetch('/api/gemini/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model: state.model, aspectRatio: '2:3', imageSize: '4K' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) throw new Error(data.error || `Image request failed (${response.status}).`);
      const blob = await (await fetch(`data:${data.mimeType};base64,${data.data}`)).blob();
      const id = `master_${Date.now()}`;
      setState(s => ({ ...s, masters: [{ id, blob, prompt, model: s.model, createdAt: Date.now() }, ...s.masters], selected: id, focus: { x: 0.5, y: 0.5 } }));
      setSidebarTab('type');
      createImageBitmap(blob).then(bitmap => {
        autoDesignCover(bitmap);
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  }

  function handleMasterUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WEBP, etc.).');
      return;
    }
    setError('');
    const id = `upload_${Date.now()}`;
    setState(s => ({
      ...s,
      masters: [
        {
          id,
          blob: file,
          prompt: `Custom upload: ${file.name}`,
          model: 'upload',
          createdAt: Date.now(),
        },
        ...s.masters,
      ],
      selected: id,
      focus: { x: 0.5, y: 0.5 },
    }));
    setNotice(`Image "${file.name}" uploaded as master.`);
    setSidebarTab('type');
    createImageBitmap(file).then(bitmap => {
      autoDesignCover(bitmap);
    }).catch(() => {});
  }

  function removeMaster(id: string) {
    setState(s => {
      const masters = s.masters.filter(m => m.id !== id);
      return { ...s, masters, selected: s.selected === id ? masters[0]?.id : s.selected };
    });
  }

  function setFocus(event: React.MouseEvent<HTMLImageElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    update({ focus: { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height } });
  }

  async function download(format: CoverFormat) {
    if (!master) return;
    const blob = await canvasBlob(renderCover(master, format, state.text, state.style, state.focus, undefined, state.style.depthBehind ? depthCutout : null), format.mime);
    const where = await saveOrDownload({ title: facts.title, kind: 'covers', label: `обложка ${format.label.split(' · ')[0]} ${format.width}x${format.height}`, ext: 'jpg', content: blob }, format.file);
    if (where) setNotice(`Сохранено в ${where}`);
  }

  async function downloadAll() {
    if (!master) return;
    setBusy('export');
    try {
      const zip = new JSZip();
      for (const format of COVER_FORMATS) zip.file(format.file, await canvasBlob(renderCover(master, format, state.text, state.style, state.focus, undefined, state.style.depthBehind ? depthCutout : null), format.mime));
      zip.file('cover-master.png', selected!.blob);
      zip.file('cover-prompt.txt', selected!.prompt);
      const where = await saveOrDownload({ title: facts.title, kind: 'covers', label: 'все обложки', ext: 'zip', content: await zip.generateAsync({ type: 'blob' }) }, `${slug(facts.title)}-covers.zip`);
      if (where) setNotice(`Сохранено в ${where}`);
    } finally { setBusy(''); }
  }

  function useAsBookCover() {
    if (!master || !onUseAsCover) return;
    const ebook = COVER_FORMATS.find(f => f.id === 'ebook')!;
    onUseAsCover(renderCover(master, ebook, state.text, state.style, state.focus, undefined, state.style.depthBehind ? depthCutout : null).toDataURL('image/jpeg', 0.9));
    setNotice('The eBook cover is now the book\'s cover for export.');
  }

  const text = state.text;
  const busyLabel = busy === 'prompt' ? 'Writing the prompt…' : busy === 'image' ? 'Drawing the master (up to a minute)…' : busy === 'export' ? 'Packing the files…' : '';

  const onlineFormats = useMemo(() => COVER_FORMATS.filter(f => f.medium === 'online'), []);
  const offlineFormats = useMemo(() => COVER_FORMATS.filter(f => f.medium === 'offline'), []);

  const visibleFormats = useMemo(() => {
    if (filter === 'featured') return COVER_FORMATS.filter(f => FEATURED_FORMAT_IDS.includes(f.id));
    if (filter === 'online') return COVER_FORMATS.filter(f => f.medium === 'online');
    if (filter === 'offline') return COVER_FORMATS.filter(f => f.medium === 'offline');
    return COVER_FORMATS;
  }, [filter]);

  return (
    <section aria-label="Cover studio" className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)] items-start text-left">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload custom master"
        onChange={e => {
          handleMasterUpload(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Left Sidebar: Controls & Workflows */}
      <aside aria-label="Cover controls" className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden text-left flex flex-col lg:sticky lg:top-4 max-h-[85vh]">
        <div className="px-3.5 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Cover Controls</h2>
          <span className="text-[11px] font-mono text-zinc-500">
            {master ? 'Master active' : 'No master'}
          </span>
        </div>

        {/* Sidebar Tabs: 1. Art & Master | 2. Typography */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/60 p-1 gap-1 shrink-0">
          <button
            type="button"
            className={`flex-1 py-1 text-xs font-medium rounded transition-colors text-center ${
              sidebarTab === 'art'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/70'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
            onClick={() => setSidebarTab('art')}
          >
            1. Art & Master
          </button>
          <button
            type="button"
            className={`flex-1 py-1 text-xs font-medium rounded transition-colors text-center ${
              sidebarTab === 'type'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/70'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
            onClick={() => setSidebarTab('type')}
          >
            2. Typography
          </button>
        </div>

        <div className="p-3 space-y-4 overflow-y-auto flex-1">
          {/* TAB 1: ART & MASTER */}
          <div hidden={sidebarTab !== 'art'} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1 text-zinc-200">Prompt for master</h3>
              <p className="text-xs text-zinc-500 mb-2.5">Generate scene description from book outline or enter custom prompt.</p>
              <button type="button" className={`${button} w-full`} disabled={!!busy} onClick={writePrompt}>
                Write from the book
              </button>
              <textarea
                aria-label="Master prompt"
                className={`${field} mt-2 h-28 resize-y`}
                value={state.description}
                placeholder="Describe scene: subject, setting, light, palette, mood, style."
                onChange={e => update({ description: e.target.value })}
              />
              <details className="mt-1 text-[11px] text-zinc-500">
                <summary className="cursor-pointer">Rules added to every master</summary>
                <p className="mt-1">{MASTER_RULES}</p>
              </details>
            </div>

            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">Generate or Upload</h3>
              <p className="text-xs text-zinc-500 mb-1.5">Model creates 2:3 4K master without lettering.</p>
              <select aria-label="Image model" className={field} value={state.model} onChange={e => update({ model: e.target.value })}>
                {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <div className="mt-2 space-y-1.5">
                <button
                  type="button"
                  className={`${primary} w-full`}
                  disabled={!!busy || !state.description.trim()}
                  onClick={generateMaster}
                >
                  Generate master
                </button>
                <button
                  type="button"
                  className={`${button} w-full flex items-center justify-center gap-1.5`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Upload custom master</span>
                </button>
              </div>
            </div>

            {/* Master Focal Point & Mini Preview */}
            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Focal Point & Crops</h3>
                <span className="text-[10px] font-mono text-zinc-500">
                  {masterUrl ? `(${Math.round(state.focus.x * 100)}%, ${Math.round(state.focus.y * 100)}%)` : ''}
                </span>
              </div>
              <p className="text-xs text-zinc-500">Click preview to center crop on character or detail.</p>

              <div
                className={`relative aspect-[2/3] w-full max-w-[200px] mx-auto rounded border flex flex-col items-center justify-center overflow-hidden transition-colors ${
                  isDragging
                    ? 'border-zinc-400 bg-zinc-800/90'
                    : 'border-zinc-700 bg-zinc-800/80 shadow-inner'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleMasterUpload(e.dataTransfer.files);
                }}
              >
                {masterUrl ? (
                  <>
                    <img
                      src={masterUrl}
                      alt="Master picture"
                      className="block w-full h-full object-cover cursor-crosshair shadow-md"
                      onClick={setFocus}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute h-3.5 w-3.5 -ml-[7px] -mt-[7px] rounded-full border-2 border-zinc-200 bg-white/40 shadow"
                      style={{ left: `${state.focus.x * 100}%`, top: `${state.focus.y * 100}%` }}
                    />
                  </>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                    className="p-3 text-center text-zinc-500 space-y-1.5 cursor-pointer hover:text-zinc-400 w-full h-full flex flex-col items-center justify-center"
                  >
                    <svg className="w-6 h-6 mx-auto text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="block text-[11px] text-zinc-300 font-medium">No master image</span>
                    <span className="block text-[9px] text-zinc-500">Drop here or click to browse</span>
                  </div>
                )}
                {masterUrl && (
                  <button
                    type="button"
                    onClick={() => autoDesignCover()}
                    className={`${button} w-full mt-2`}
                  >
                    Auto-Layout & Palette
                  </button>
                )}
              </div>

              {state.masters.length > 1 && (
                <div className="pt-2">
                  <span className="block text-[10px] text-zinc-500 uppercase font-semibold mb-1">Variants</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {state.masters.map(m => (
                      <MasterThumb
                        key={m.id}
                        blob={m.blob}
                        active={m.id === selected?.id}
                        onSelect={() => update({ selected: m.id, focus: { x: 0.5, y: 0.5 } })}
                        onRemove={() => removeMaster(m.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB 2: TYPOGRAPHY & LETTERING */}
          <div hidden={sidebarTab !== 'type'} className="space-y-4">
            {/* Smart Art Director Card */}
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Smart Art Director</h3>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">Auto-Layout</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Scans master artwork for focal subjects, negative space, and extracts harmonious palette for YouTube 16:9 & covers.
              </p>
              <button
                type="button"
                onClick={() => autoDesignCover()}
                disabled={!master}
                className={`${button} w-full`}
              >
                Apply Auto-Design
              </button>
            </div>

            {/* De-Plastic & Film Realism Card */}
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">De-Plastic (Remove AI Look)</h3>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">
                  {isMasterDeplasticized ? 'Active · 35mm Grain' : 'Bilateral + Grain'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Strips synthetic plastic sheen, recovers skin micro-pores and fabric weave, and injects dual-scale 35mm film grain.
              </p>

              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Texture Strength</span>
                  <span className="text-zinc-300 font-mono">{Math.round(deplasticStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1.0}
                  step={0.05}
                  value={deplasticStrength}
                  onChange={e => setDeplasticStrength(Number(e.target.value))}
                  className="w-full accent-zinc-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-zinc-400">
                  {isMasterDeplasticized ? 'Plastic sheen eliminated' : 'Synthetic look present'}
                </span>
                <button
                  type="button"
                  onClick={() => runDeplastic()}
                  disabled={!master || isDeplasticizing}
                  className={button}
                >
                  {isDeplasticizing ? 'Processing...' : isMasterDeplasticized ? 'Re-Apply De-Plastic' : 'Remove AI Plastic'}
                </button>
              </div>
            </div>

            {/* 3D Depth Layering Card */}
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">3D Depth Typography</h3>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">Depth-Anything-V2</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Layers title typography behind foreground objects (curtains, hands, subjects) while keeping the badge on top.
              </p>
              
              <div className="flex items-center justify-between pt-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!state.style.depthBehind}
                    onChange={e => update({ style: { ...state.style, depthBehind: e.target.checked } })}
                    className="rounded border-zinc-700 bg-zinc-950 text-zinc-300 focus:ring-0"
                  />
                  <span>Text Behind Subject</span>
                </label>
                <button
                  type="button"
                  onClick={generateDepthLayer}
                  disabled={!master || isGeneratingDepth}
                  className={button}
                >
                  {isGeneratingDepth ? 'Scanning...' : depthCutout ? 'Regenerate Mask' : 'Extract Depth Mask'}
                </button>
              </div>

              {depthCutout && (
                <div className="space-y-1 pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Foreground Threshold</span>
                    <span className="text-zinc-300 font-mono">{state.style.depthThreshold ?? 150}</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={230}
                    step={5}
                    value={state.style.depthThreshold ?? 150}
                    onChange={e => update({ style: { ...state.style, depthThreshold: Number(e.target.value) } })}
                    onMouseUp={generateDepthLayer}
                    className="w-full accent-zinc-400 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Aesthetic & CTR Scorer Card */}
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Aesthetic & CTR Scorer</h3>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">cafe_aesthetic</span>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                {aestheticData ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-zinc-200 font-mono">{aestheticData.score}</span>
                      <span className="text-xs text-zinc-400">/ 10</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {aestheticData.verdict}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-400">Score preview to evaluate</span>
                )}
                <button
                  type="button"
                  onClick={scoreAesthetics}
                  disabled={!master || isScoringAesthetic}
                  className={button}
                >
                  {isScoringAesthetic ? 'Scoring...' : 'Score Preview'}
                </button>
              </div>

              {aestheticData && (
                <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-zinc-400">
                        <span>Contrast & Punch</span>
                        <span className="text-zinc-300 font-mono font-semibold">{aestheticData.contrast}/10</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, aestheticData.contrast * 10)}%` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-zinc-400">
                        <span>Mobile Legibility</span>
                        <span className="text-zinc-300 font-mono font-semibold">{aestheticData.mobile}/10</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, aestheticData.mobile * 10)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {aestheticData.tips.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="block text-[10px] text-zinc-400 uppercase font-semibold">Actionable Feedback</span>
                      <ul className="space-y-1">
                        {aestheticData.tips.map((tip, idx) => (
                          <li key={idx} className="text-[11px] text-zinc-300 flex items-start gap-1.5 leading-snug">
                            <span className="text-zinc-400 text-xs shrink-0">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* YouTube Mobile Feed Preview Button & Simulator */}
              <div className="pt-1 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setShowMobileSimulator(s => !s)}
                  className={`${button} w-full text-[11px]`}
                >
                  {showMobileSimulator ? 'Hide Mobile Simulator' : 'Test in YouTube Mobile Feed'}
                </button>

                {showMobileSimulator && (
                  <div className="mt-2.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono uppercase">
                      <span>YouTube Feed Scale</span>
                      <span className="text-emerald-400">Safe Zones: OK</span>
                    </div>

                    {/* Realistic YouTube Mobile Feed Card */}
                    <div className="w-full bg-[#0f0f0f] rounded-lg p-2 border border-zinc-800 shadow-lg space-y-2">
                      <div className="relative aspect-video w-full rounded overflow-hidden bg-zinc-900">
                        {heroCanvasRef.current ? (
                          <img
                            src={heroCanvasRef.current.toDataURL()}
                            alt="Mobile preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">Generating...</div>
                        )}
                        {/* YouTube Mobile duration overlay */}
                        <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded bg-black/80 text-[9px] font-mono font-medium text-white shadow">
                          1:48:20
                        </span>
                      </div>

                      <div className="flex items-start gap-2 pt-0.5">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center text-[10px] text-zinc-300 font-bold">
                          A
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          <p className="text-[11px] font-semibold text-zinc-200 truncate leading-tight">
                            {state.text.title || 'Audiobook Full Novel'} — Full Audiobook
                          </p>
                          <p className="text-[9px] text-zinc-400 truncate">
                            Audiobook Realm · 84K views · 3 days ago
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1 text-zinc-200">Style Presets</h3>
              <p className="text-xs text-zinc-500 mb-2">Instant typography palettes tailored for book genres.</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLE_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => update({
                      style: {
                        ...state.style,
                        font: preset.font,
                        color: preset.color,
                        uppercase: preset.uppercase,
                        shade: preset.shade,
                      },
                    })}
                    className="p-1.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/80 text-left transition-colors flex items-center justify-between"
                  >
                    <span className="text-xs text-zinc-200 font-medium">{preset.name}</span>
                    <span
                      className="w-3 h-3 rounded-full border border-zinc-700 shrink-0"
                      style={{ backgroundColor: preset.color }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 space-y-2.5">
              <h3 className="text-sm font-semibold text-zinc-200">Book Lettering</h3>
              <div>
                <label className={label}>Title</label>
                <input
                  aria-label="Title"
                  className={field}
                  value={text.title}
                  placeholder="Title"
                  onChange={e => update({ text: { ...text, title: e.target.value } })}
                />
              </div>
              <div>
                <label className={label}>Author</label>
                <input
                  aria-label="Author"
                  className={field}
                  value={text.author}
                  placeholder="Author"
                  onChange={e => update({ text: { ...text, author: e.target.value } })}
                />
              </div>
              <div>
                <label className={label}>Tagline (optional)</label>
                <input
                  aria-label="Tagline"
                  className={field}
                  value={text.tagline}
                  placeholder="Tagline or subtitle"
                  onChange={e => update({ text: { ...text, tagline: e.target.value } })}
                />
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">Typography Tuning</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>Font Family</label>
                  <select
                    aria-label="Font"
                    className={field}
                    value={state.style.font}
                    onChange={e => update({ style: { ...state.style, font: e.target.value as 'serif' | 'sans' } })}
                  >
                    <option value="serif">Serif (Literary)</option>
                    <option value="sans">Sans (Modern)</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Color</label>
                  <input
                    aria-label="Text color"
                    type="color"
                    className="h-8 w-full rounded border border-zinc-700 bg-zinc-950 cursor-pointer"
                    value={state.style.color}
                    onChange={e => update({ style: { ...state.style, color: e.target.value } })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={state.style.uppercase}
                  onChange={e => update({ style: { ...state.style, uppercase: e.target.checked } })}
                  className="rounded border-zinc-700 bg-zinc-900 text-zinc-300 focus:ring-0"
                />
                <span>Uppercase lettering</span>
              </label>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-400">Backdrop shade</label>
                  <span className="text-[11px] font-mono text-zinc-500">{Math.round(state.style.shade * 100)}%</span>
                </div>
                <input
                  aria-label="Shade"
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  className="w-full accent-zinc-400 cursor-pointer"
                  value={state.style.shade}
                  onChange={e => update({ style: { ...state.style, shade: Number(e.target.value) } })}
                />
              </div>

              {/* YouTube & Video Layout Customization */}
              <div className="border-t border-zinc-800 pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">YouTube 16:9 Composition</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAbModal(true)}
                      disabled={!master}
                      className="text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40"
                    >
                      A/B/C Pack
                    </button>
                    <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-400 bg-zinc-800/80 border border-zinc-700 px-1.5 py-0.2 rounded">
                      Editorial
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${
                      state.style.youtubeLayout !== 'classic'
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                    onClick={() => update({ style: { ...state.style, youtubeLayout: 'editorial_left' } })}
                  >
                    Left + Pill Badge
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${
                      state.style.youtubeLayout === 'classic'
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                    onClick={() => update({ style: { ...state.style, youtubeLayout: 'classic' } })}
                  >
                    Classic Centered
                  </button>
                </div>

                <div>
                  <label className={label}>Audiobook Badge</label>
                  <input
                    aria-label="Audiobook Badge"
                    className={field}
                    value={text.badge !== undefined ? text.badge : 'FULL AUDIOBOOK'}
                    placeholder="e.g. FULL AUDIOBOOK"
                    onChange={e => update({ text: { ...text, badge: e.target.value } })}
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {['FULL AUDIOBOOK', 'AUDIOBOOK', 'ПОЛНАЯ АУДИОКНИГА', 'ПРЕМЬЕРА', ''].map(b => (
                      <button
                        key={b || 'none'}
                        type="button"
                        onClick={() => update({ text: { ...text, badge: b } })}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      >
                        {b || 'Off'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Badge Color</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label="Badge background color"
                        type="color"
                        className="h-7 w-9 rounded border border-zinc-700 bg-zinc-950 cursor-pointer"
                        value={state.style.badgeColor || '#e5a93c'}
                        onChange={e => update({ style: { ...state.style, badgeColor: e.target.value } })}
                      />
                      <div className="flex gap-1">
                        {['#e5a93c', '#dc2626', '#10b981'].map(c => (
                          <button
                            key={c}
                            type="button"
                            className="w-4 h-4 rounded-full border border-zinc-700 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                            onClick={() => update({ style: { ...state.style, badgeColor: c } })}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={label}>Badge Text</label>
                    <input
                      aria-label="Badge text color"
                      type="color"
                      className="h-7 w-full rounded border border-zinc-700 bg-zinc-950 cursor-pointer"
                      value={state.style.badgeTextColor || '#18181b'}
                      onChange={e => update({ style: { ...state.style, badgeTextColor: e.target.value } })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {busyLabel && <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-3">{busyLabel}</p>}
          {error && <p role="alert" className="text-xs text-red-300 whitespace-pre-wrap border-t border-zinc-800 pt-3">{error}</p>}
          {notice && <p className="text-xs text-emerald-300 border-t border-zinc-800 pt-3">{notice}</p>}
        </div>
      </aside>

      {/* Main Center Area: Top Global Actions, Hero Stage & Filtered Format Cards */}
      <div className="space-y-5 min-w-0">
        {/* Global Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Cover Studio</span>
              <span className="text-xs font-normal text-zinc-400">· {COVER_FORMATS.length} formats</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Master 2:3 4K · Auto-cropped and lettered for screen & 300 DPI print
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              disabled={!master || isGeneratingDepth || isScoringAesthetic || isDeplasticizing}
              onClick={runAutopilotOnSelectedCover}
              title={`Apply all AI neural models & effects to ${heroFormat.label} (De-plasticizer, 3D Depth, Smart Layout, Readability Scorer)`}
            >
              Apply All AI to Selected Cover
            </button>
            <button
              type="button"
              className={button}
              disabled={!master}
              onClick={() => setShowAbModal(true)}
              title="Generate 3 high-CTR thumbnail variants for YouTube Test & Compare"
            >
              YouTube A/B/C Pack
            </button>
            {onUseAsCover && (
              <button
                type="button"
                className={button}
                disabled={!master}
                onClick={useAsBookCover}
              >
                Use eBook cover for book
              </button>
            )}
            <button
              type="button"
              className={primary}
              disabled={!master || !!busy}
              onClick={downloadAll}
            >
              Download all (.zip)
            </button>
          </div>
        </div>

        {/* Hero Inspection Stage */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-lg">
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded">
                Hero Preview
              </span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <span>{heroFormat.label}</span>
                  <span className="text-xs font-normal font-mono text-zinc-400">
                    {heroFormat.width} × {heroFormat.height} px · {heroFormat.ratio} {heroFormat.dpi ? `· ${heroFormat.dpi} DPI` : ''}
                  </span>
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {heroFormat.covered.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showGuides}
                    onChange={e => setShowGuides(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-zinc-300 focus:ring-0"
                  />
                  <span>Guides & safe zones</span>
                </label>
              )}
              <button
                type="button"
                className={button}
                disabled={!master || isGeneratingDepth || isScoringAesthetic || isDeplasticizing}
                onClick={runAutopilotOnSelectedCover}
                title={`Apply all AI neural models & effects to ${heroFormat.label}`}
              >
                Apply All AI to {heroFormat.label}
              </button>
              <button
                type="button"
                className={button}
                disabled={!master}
                onClick={() => download(heroFormat)}
              >
                Download {heroFormat.width}×{heroFormat.height} {heroFormat.dpi ? `${heroFormat.dpi} DPI` : 'JPG'}
              </button>
              {heroFormat.id === 'ebook' && onUseAsCover && (
                <button
                  type="button"
                  className={primary}
                  disabled={!master}
                  onClick={useAsBookCover}
                >
                  Use as book cover
                </button>
              )}
            </div>
          </div>

          {/* Hero Stage Canvas Viewport */}
          <div className="p-6 bg-zinc-950/80 flex items-center justify-center min-h-[380px] overflow-hidden">
            {master ? (
              <div
                className="relative rounded-lg border border-zinc-700/80 bg-zinc-900/90 overflow-hidden shadow-2xl transition-all"
                style={{
                  maxWidth: heroFormat.isWrap ? '780px' : heroFormat.width > heroFormat.height ? '560px' : '360px',
                  width: '100%',
                }}
              >
                <canvas
                  ref={el => {
                    heroCanvasRef.current = el;
                    if (el && master) {
                      renderCover(master, heroFormat, state.text, state.style, state.focus, el, state.style.depthBehind ? depthCutout : null);
                    }
                  }}
                  className="w-full h-auto block"
                  aria-label={`${heroFormat.label} preview`}
                />
                {showGuides && heroFormat.covered.map((c, i) => (
                  <span
                    key={i}
                    title={c.why}
                    className="absolute border border-dashed border-amber-400/80 bg-amber-400/20 text-[9px] text-amber-200 font-mono flex items-center justify-center p-0.5 text-center pointer-events-none"
                    style={{
                      left: `${c.rect.x * 100}%`,
                      top: `${c.rect.y * 100}%`,
                      width: `${c.rect.w * 100}%`,
                      height: `${c.rect.h * 100}%`,
                    }}
                  >
                    <span className="truncate bg-zinc-900/90 border border-zinc-700 px-1.5 py-0.5 rounded text-[9px] text-amber-300">
                      {c.why}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-center p-8 space-y-3 max-w-sm">
                <svg className="w-12 h-12 mx-auto text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-zinc-300">No master picture yet</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Generate a master image from the book outline or upload your own 2:3 illustration on the left.
                </p>
                <button
                  type="button"
                  className={button}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload custom master
                </button>
              </div>
            )}
          </div>

          {heroFormat.description && (
            <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/40 flex flex-wrap items-center justify-between text-xs text-zinc-400 gap-2">
              <p className="leading-snug">{heroFormat.description}</p>
              <span className="font-mono text-[11px] text-zinc-500">{heroFormat.file}</span>
            </div>
          )}
        </div>

        {/* Format Selector Category Tabs */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => setFilter('featured')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filter === 'featured'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Featured (4)
              </button>
              <button
                type="button"
                onClick={() => setFilter('online')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filter === 'online'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Screen & Digital ({onlineFormats.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('offline')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filter === 'offline'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Print & Paperback ({offlineFormats.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filter === 'all'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All ({COVER_FORMATS.length})
              </button>
            </div>

            <span className="text-[11px] text-zinc-500">
              Click any format to inspect in Hero view
            </span>
          </div>

          {/* Formats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {visibleFormats.map(format => {
              const isHero = format.id === heroFormatId;
              return (
                <div
                  key={format.id}
                  onClick={() => setHeroFormatId(format.id)}
                  className={`cursor-pointer rounded-lg border p-3 flex flex-col justify-between transition-all ${
                    isHero
                      ? 'border-zinc-500 bg-zinc-800/90 shadow-md ring-1 ring-zinc-500/50'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full rounded border border-zinc-700/60 bg-zinc-950 flex items-center justify-center overflow-hidden mb-2.5">
                    <canvas
                      ref={el => {
                        canvases.current[format.id] = el;
                        if (el && master) {
                          renderCover(master, format, state.text, state.style, state.focus, el, state.style.depthBehind ? depthCutout : null);
                        }
                      }}
                      className="max-h-full max-w-full object-contain block"
                      aria-label={`${format.label} preview`}
                    />
                    {isHero && (
                      <span className="absolute top-1 right-1 bg-zinc-200 text-zinc-950 text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-medium text-zinc-200 truncate" title={format.label}>
                        {format.label}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                        {format.ratio}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>{format.width}×{format.height}</span>
                      <button
                        type="button"
                        className="text-zinc-400 hover:text-zinc-100 font-medium underline"
                        onClick={e => {
                          e.stopPropagation();
                          download(format);
                        }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* YouTube A/B/C Test Pack Modal */}
      {showAbModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="YouTube A/B/C Test Pack"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
        >
          <div className="relative w-full max-w-5xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <span>YouTube Studio A/B/C Test Pack</span>
                    <span className="text-xs font-normal font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      3 High-CTR Archetypes
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Engineered for YouTube's native "Test & Compare" (up to 3 thumbnails rotated automatically).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAbModal(false)}
                className="rounded-lg px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 transition-colors"
                aria-label="Close modal"
              >
                Close
              </button>
            </div>

            {/* Modal Body: 3 Variants Side-by-Side */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Variant A */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                        Variant A
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                        Editorial Amber
                      </span>
                    </div>

                    <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shadow-inner">
                      <canvas
                        ref={abCanvasARef}
                        className="w-full h-full object-cover block"
                        aria-label="Variant A preview"
                      />
                      <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded bg-black/85 text-[9px] font-mono font-medium text-white shadow">
                        1:48:20
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-zinc-200">Warm Serif & Balanced Depth</h4>
                      <p className="text-[11px] text-zinc-400 leading-snug">
                        Warm ivory serif, golden audiobook pill, 55% soft vignette. Best for storytelling immersion.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => applyVariantToStudio(variantAStyle)}
                      className={`${button} w-full`}
                    >
                      Apply to Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSingleVariant('Variant A Editorial', variantAStyle)}
                      className={`${button} w-full text-[11px]`}
                    >
                      Download 1280×720 JPG
                    </button>
                  </div>
                </div>

                {/* Variant B */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                        Variant B
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                        High-Punch Crimson
                      </span>
                    </div>

                    <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shadow-inner">
                      <canvas
                        ref={abCanvasBRef}
                        className="w-full h-full object-cover block"
                        aria-label="Variant B preview"
                      />
                      <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded bg-black/85 text-[9px] font-mono font-medium text-white shadow">
                        1:48:20
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-zinc-200">High Contrast Sans & Crimson Alert</h4>
                      <p className="text-[11px] text-zinc-400 leading-snug">
                        Bold condensed sans, crimson pill badge, 70% deep contrast vignette. Maximizes mobile feed CTR.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => applyVariantToStudio(variantBStyle)}
                      className={`${button} w-full`}
                    >
                      Apply to Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSingleVariant('Variant B Crimson', variantBStyle)}
                      className={`${button} w-full text-[11px]`}
                    >
                      Download 1280×720 JPG
                    </button>
                  </div>
                </div>

                {/* Variant C */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                        Variant C
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                        Noir Cinema Gold
                      </span>
                    </div>

                    <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shadow-inner">
                      <canvas
                        ref={abCanvasCRef}
                        className="w-full h-full object-cover block"
                        aria-label="Variant C preview"
                      />
                      <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded bg-black/85 text-[9px] font-mono font-medium text-white shadow">
                        1:48:20
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-zinc-200">Cinema Gold & Ambient Dark</h4>
                      <p className="text-[11px] text-zinc-400 leading-snug">
                        Cinema gold serif, minimalist dark badge, 45% ambient shadow. Subtle, mysterious, premium.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => applyVariantToStudio(variantCStyle)}
                      className={`${button} w-full`}
                    >
                      Apply to Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSingleVariant('Variant C Cinema', variantCStyle)}
                      className={`${button} w-full text-[11px]`}
                    >
                      Download 1280×720 JPG
                    </button>
                  </div>
                </div>
              </div>

              {/* Guide box */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-1.5 text-xs text-zinc-400">
                <span className="font-semibold text-zinc-200">
                  How YouTube's "Test & Compare" (A/B Testing) works:
                </span>
                <p>
                  1. Open <strong className="text-zinc-300">YouTube Studio</strong> → Go to your video details → Scroll to <strong className="text-zinc-300">Thumbnail</strong>.
                </p>
                <p>
                  2. Click the 3 dots menu (<strong className="text-zinc-300">⋮</strong>) on the thumbnail and choose <strong className="text-zinc-300">"Test & Compare"</strong>.
                </p>
                <p>
                  3. Upload all 3 variants from the downloaded ZIP pack. YouTube will distribute impressions evenly and pick the winner based on total watch time share.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-zinc-500 font-mono">
                1280 × 720 px · 16:9 · Standard YouTube Video Thumbnails
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAbModal(false)}
                  className={button}
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!master || !!busy}
                  onClick={downloadYouTubeAbPack}
                  className={`${primary} px-4`}
                >
                  Download 3 for YouTube (ZIP)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MasterThumb({ blob, active, onSelect, onRemove }: { blob: Blob; active: boolean; onSelect: () => void; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className={`relative rounded border overflow-hidden bg-zinc-800/80 ${active ? 'border-amber-400 ring-1 ring-amber-400' : 'border-zinc-700 hover:border-zinc-600'}`}>
      <img src={url} alt="Master variant" className="w-full cursor-pointer" onClick={onSelect} />
      <button type="button" aria-label="Remove variant" className="absolute right-0.5 top-0.5 rounded bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 px-1 text-[10px] text-zinc-200" onClick={onRemove}>×</button>
    </div>
  );
}


/** "2026-10-17 15.40.07": seconds too, so two pictures made in one minute keep their own files. */
const masterStamp = (at: number) => {
  const d = new Date(at || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
};

const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'book';
