import React from 'react';
import { COVER_FORMATS, type CoverFormat } from '../utils/cover/formats';

/** Where a format is seen, as a reader meets it on a phone. */
export function feedPlace(format: CoverFormat): string {
  if (format.id === 'ebook') return 'Amazon Kindle search';
  if (format.category === 'print_front' || format.category === 'print_wrap') return 'Amazon paperback search';
  if (format.id === 'audio') return 'Audible library';
  if (format.id === 'podcast') return 'Apple Podcasts';
  if (format.category === 'video') return 'YouTube feed';
  if (format.id === 'stories') return 'Stories & Reels';
  if (format.id === 'twitter') return 'X timeline';
  if (format.id === 'pinterest') return 'Pinterest board';
  return 'Instagram feed';
}

interface FeedPreviewProps {
  format: CoverFormat;
  /** The rendered cover of this format. */
  image: string;
  title: string;
  author: string;
}

const Stars: React.FC = () => (
  <span className="text-[9px] text-[#f59e0b] tracking-tight" aria-hidden="true">★★★★☆ <span className="text-zinc-400">1,284</span></span>
);

/** The front panel of a wrap, as a store shows it: the right part of the spread at the front cover's proportions. */
const FrontOfWrap: React.FC<{ format: CoverFormat; image: string }> = ({ format, image }) => {
  const front = COVER_FORMATS.find(f => f.id === format.id.replace('print_wrap', 'print_front'));
  const ratio = front ? front.width / front.height : 2 / 3;
  return (
    <div className="relative h-full overflow-hidden" style={{ aspectRatio: String(ratio) }}>
      <img src={image} alt="" className="absolute right-0 top-0 h-full max-w-none" />
    </div>
  );
};

/** The cover at the size a reader sees it on a phone, in the place the format is made for. */
const CoverFeedPreview: React.FC<FeedPreviewProps> = ({ format, image, title, author }) => {
  const name = title || 'Untitled';
  const by = author || 'Author name';

  if (format.category === 'books' || format.category === 'print_front' || format.category === 'print_wrap') {
    const podcast = format.id === 'podcast';
    const audio = format.id === 'audio' || podcast;
    return (
      <div className="w-full rounded-lg border border-zinc-800 bg-white p-2.5 shadow-lg">
        <div className="mb-2 h-5 rounded bg-zinc-100 px-2 text-[9px] leading-5 text-zinc-400">{podcast ? 'Search Podcasts' : audio ? 'Search Audible' : 'Search Amazon'}</div>
        {[0, 1].map(row => (
          <div key={row} className={`flex gap-2.5 py-2 ${row ? 'border-t border-zinc-200 opacity-40' : ''}`}>
            <div className={`shrink-0 overflow-hidden bg-zinc-200 ${audio ? 'h-[72px] w-[72px]' : 'h-[110px]'}`}>
              {row ? <div className={audio ? 'h-full w-full' : 'h-full w-[72px]'} /> :
                format.category === 'print_wrap' ? <FrontOfWrap format={format} image={image} /> :
                <img src={image} alt="Cover at feed size" className="h-full w-auto" />}
            </div>
            <div className="min-w-0 space-y-0.5 text-left">
              <p className="line-clamp-2 text-[11px] font-medium leading-snug text-zinc-900">{row ? 'Another book in the results' : name}</p>
              <p className="truncate text-[9px] text-zinc-500">{podcast ? `${by} · Fiction` : audio ? `By ${by} · Narrated by ${by}` : by}</p>
              <Stars />
              <p className="text-[9px] text-zinc-500">{podcast ? '12 episodes · Weekly' : audio ? 'Length: 9 hrs and 12 mins' : format.id === 'ebook' ? 'Kindle Edition' : 'Paperback'}</p>
              <p className="text-[12px] font-semibold text-zinc-900">{podcast ? 'Follow' : audio ? 'Free with trial' : format.id === 'ebook' ? '$4.99' : '$14.99'}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (format.category === 'video') {
    return (
      <div className="w-full space-y-2 rounded-lg border border-zinc-800 bg-[#0f0f0f] p-2 shadow-lg">
        <div className="relative aspect-video w-full overflow-hidden rounded bg-zinc-900">
          <img src={image} alt="Cover at feed size" className="h-full w-full object-cover" />
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 font-mono text-[9px] font-medium text-white">1:48:20</span>
        </div>
        <div className="flex items-start gap-2 pt-0.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[10px] font-bold text-zinc-300">{by[0]}</div>
          <div className="min-w-0 space-y-0.5 text-left">
            <p className="truncate text-[11px] font-semibold leading-tight text-zinc-200">{name} — Full Audiobook</p>
            <p className="truncate text-[9px] text-zinc-400">{by} · 84K views · 3 days ago</p>
          </div>
        </div>
      </div>
    );
  }

  if (format.id === 'stories') {
    return (
      <div className="mx-auto w-[170px] overflow-hidden rounded-[18px] border-4 border-zinc-800 bg-black shadow-lg">
        <div className="relative aspect-[9/16]">
          <img src={image} alt="Cover at feed size" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-2 top-2 flex gap-1">
            <span className="h-0.5 flex-1 rounded bg-white" /><span className="h-0.5 flex-1 rounded bg-white/40" /><span className="h-0.5 flex-1 rounded bg-white/40" />
          </div>
          <div className="absolute left-2 top-4 flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full border border-white/70 bg-zinc-700" />
            <span className="text-[9px] font-semibold text-white drop-shadow">{by}</span>
          </div>
          <div className="absolute inset-x-2 bottom-2 rounded-full border border-white/60 px-2 py-1 text-[8px] text-white/80">Send message</div>
        </div>
      </div>
    );
  }

  if (format.id === 'pinterest') {
    return (
      <div className="grid w-full grid-cols-2 gap-1.5 rounded-lg border border-zinc-800 bg-white p-1.5 shadow-lg">
        <div className="space-y-1">
          <img src={image} alt="Cover at feed size" className="w-full rounded-xl" />
          <p className="truncate px-0.5 text-[9px] font-medium text-zinc-800">{name}</p>
        </div>
        <div className="space-y-1.5 opacity-40">
          <div className="aspect-[3/4] rounded-xl bg-zinc-200" />
          <div className="aspect-square rounded-xl bg-zinc-200" />
        </div>
      </div>
    );
  }

  const x = format.id === 'twitter';
  return (
    <div className={`w-full overflow-hidden border shadow-lg ${x ? 'rounded-lg border-zinc-800 bg-black p-2.5' : 'rounded-lg border-zinc-800 bg-white'}`}>
      <div className={`flex items-center gap-2 ${x ? 'mb-1.5' : 'px-2.5 py-2'}`}>
        <span className={`h-6 w-6 shrink-0 rounded-full ${x ? 'bg-zinc-700' : 'bg-gradient-to-tr from-amber-400 to-fuchsia-500 p-[2px]'}`}>{!x && <span className="block h-full w-full rounded-full border-2 border-white bg-zinc-300" />}</span>
        <div className="min-w-0 text-left">
          <p className={`truncate text-[10px] font-semibold ${x ? 'text-zinc-100' : 'text-zinc-900'}`}>{by} {x && <span className="font-normal text-zinc-500">@{by.toLowerCase().replace(/[^a-z0-9]+/g, '')} · 2h</span>}</p>
          {x && <p className="truncate text-[10px] text-zinc-200">{name} is out now.</p>}
        </div>
      </div>
      <img src={image} alt="Cover at feed size" className={`w-full ${x ? 'rounded-xl border border-zinc-800' : ''}`} />
      <div className={`flex gap-3 text-[11px] ${x ? 'pt-1.5 text-zinc-500' : 'px-2.5 py-1.5 text-zinc-800'}`} aria-hidden="true">
        <span>♡</span><span>💬</span><span>↻</span>
      </div>
      {!x && <p className="truncate px-2.5 pb-2 text-left text-[9px] text-zinc-700"><b>{by}</b> {name} is out now.</p>}
    </div>
  );
};

export default CoverFeedPreview;
