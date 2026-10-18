/**
 * What a cover looks like in a genre: the medium a reader of that shelf expects, the kind of image that signals it,
 * and the clichés that make a cover look like every other. Kept in code, so a fantasy book is not drawn as a
 * photograph and a thriller is not painted, whatever the text model writes.
 */
export interface GenreArt {
  key: string;
  /** The rendering, as the image model is told it. */
  medium: string;
  /** What signals the genre on a shelf: given to the concept writer. */
  cues: string;
  /** What to stay away from. */
  avoid: string;
}

const ART: { match: RegExp; art: GenreArt }[] = [
  {
    match: /erotic|romantic suspense|steamy|dark romance/,
    art: {
      key: 'erotic',
      medium: 'a moody fine-art photograph with a cinematic finish',
      cues: 'desire shown through one charged detail (a hand, a threshold, fabric, a key, a bed corner) rather than bodies; low warm light against deep shadow',
      avoid: 'nudity, embracing couples and faces (stores restrict them), lingerie stock imagery',
    },
  },
  {
    match: /fantasy|romantasy|myth|fairy/,
    art: {
      key: 'fantasy',
      medium: 'a painterly digital illustration with the texture of an oil painting',
      cues: 'one emblematic object (a blade, crown, door, key, creature) or a small figure against a vast landscape; rich jewel colours and luminous light',
      avoid: 'generic armour, glowing eyes, crowded battle scenes',
    },
  },
  {
    match: /sci|space|cyber|dystop/,
    art: {
      key: 'scifi',
      medium: 'a cinematic concept-art illustration',
      cues: 'scale: a small figure or craft against a huge structure, planet or machine; one strong light source; clean geometric shapes',
      avoid: 'busy space battles, lens-flare overload',
    },
  },
  {
    match: /horror|gothic|ghost/,
    art: {
      key: 'horror',
      medium: 'a dark photograph with deep shadow and a single source of light',
      cues: 'an ordinary thing made subtly wrong; most of the frame in darkness; negative space that feels watched',
      avoid: 'gore, screaming faces, skulls',
    },
  },
  {
    match: /cozy|cosy/,
    art: {
      key: 'cozy',
      medium: 'a warm, detailed illustration with soft outlines',
      cues: 'an inviting place or object with one small sign of trouble; warm saturated colours',
      avoid: 'realistic violence, dark palettes',
    },
  },
  {
    match: /thriller|crime|mystery|suspense|noir|detective/,
    art: {
      key: 'thriller',
      medium: 'a cinematic photograph with high contrast',
      cues: 'one ominous object or a lone figure seen small or from behind; cold or sodium light; a strong silhouette that reads at thumbnail size',
      avoid: 'guns, blood splatter, cracked glass, running silhouettes',
    },
  },
  {
    match: /rom-?com|comedy|humou?r/,
    art: {
      key: 'romcom',
      medium: 'a bright flat graphic illustration with clean shapes',
      cues: 'one playful object or two simplified figures; cheerful saturated colours',
      avoid: 'photographic stock couples',
    },
  },
  {
    match: /romance|love/,
    art: {
      key: 'romance',
      medium: 'a soft, luminous photograph with a painterly finish',
      cues: 'a shared place or a meaningful object at golden light; closeness implied, not posed',
      avoid: 'stock-photo couples, faces looking at the camera',
    },
  },
  {
    match: /histor|period|regency|victorian/,
    art: {
      key: 'historical',
      medium: 'a painting in the manner of period oil painting',
      cues: 'one period object or a figure in period dress seen partly or from behind; muted, aged colours',
      avoid: 'anachronistic details, modern faces',
    },
  },
  {
    match: /young adult|\bya\b|teen/,
    art: {
      key: 'ya',
      medium: 'a bold, saturated illustration',
      cues: 'one striking symbol or a single figure in a graphic pose; strong colour contrast',
      avoid: 'cluttered collages',
    },
  },
];

const DEFAULT_ART: GenreArt = {
  key: 'literary',
  medium: 'a minimal fine-art photograph with a restrained palette',
  cues: 'one quiet, resonant object or place with generous empty space; the image suggests the book rather than illustrating a scene',
  avoid: 'literal plot scenes, many objects at once',
};

/** The cover art of a genre, by the first matching keyword in its name; literary fiction when none matches. */
export function genreArt(genre = ''): GenreArt {
  const name = genre.toLowerCase();
  return ART.find(entry => entry.match.test(name))?.art ?? DEFAULT_ART;
}
