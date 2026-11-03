/**
 * Funzione serverless Vercel: GET /api/totals?title=<titolo>
 *
 * Logica lato server per arricchire un manga con il numero totale di
 * capitoli e volumi. Interroga in parallelo MangaDex, Kitsu e Jikan,
 * tiene il valore più alto trovato e mette in cache la risposta.
 *
 * Perché sul server:
 *  - il browser fa una sola richiesta invece di tre;
 *  - la logica di aggregazione resta in un punto solo;
 *  - la CDN di Vercel conserva il risultato (s-maxage) e riduce le
 *    chiamate verso API esterne con limiti di frequenza.
 */

const TIMEOUT_MS = 4000;
const AGGREGATE_TIMEOUT_MS = 3000;
const CACHE = new Map();          // cache in memoria dell'istanza
const CACHE_TTL_MS = 60 * 60 * 1000;

async function timedJson(url, headers = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const toInt = v => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// MangaDex leaves lastChapter/lastVolume empty for many ongoing series. Its
// aggregate endpoint still lists the published volumes, so derive the totals
// from there before giving up.
function maxVolume(aggregate) {
  const keys = Object.keys(aggregate?.volumes || {})
    .filter(key => key !== 'none' && Number.isFinite(Number(key)));
  return keys.length ? Math.max(...keys.map(Number)) : null;
}

function maxChapter(aggregate) {
  let max = null;
  for (const volume of Object.values(aggregate?.volumes || {})) {
    for (const key of Object.keys(volume?.chapters || {})) {
      const n = Number(key);
      if (Number.isFinite(n) && (max == null || n > max)) max = n;
    }
  }
  return max;
}

async function mangadex(title) {
  const d = await timedJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc`
  );
  const manga = d?.data?.[0];
  const a = manga?.attributes;
  let chapters = toInt(a?.lastChapter);
  let volumes = toInt(a?.lastVolume);

  if (manga?.id && (chapters == null || volumes == null)) {
    const aggregate = await timedJson(
      `https://api.mangadex.org/manga/${manga.id}/aggregate`,
      {},
      AGGREGATE_TIMEOUT_MS
    );
    if (chapters == null) chapters = maxChapter(aggregate);
    if (volumes == null) volumes = maxVolume(aggregate);
  }

  return { source: 'mangadex', chapters, volumes };
}

async function kitsu(title) {
  const d = await timedJson(
    `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(title)}&page[limit]=1`,
    { Accept: 'application/vnd.api+json' }
  );
  const a = d?.data?.[0]?.attributes;
  return { source: 'kitsu', chapters: toInt(a?.chapterCount), volumes: toInt(a?.volumeCount) };
}

async function jikan(title) {
  const d = await timedJson(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`);
  const a = d?.data?.[0];
  return { source: 'jikan', chapters: toInt(a?.chapters), volumes: toInt(a?.volumes) };
}

export function mergeTotals(results) {
  let chapters = null;
  let volumes = null;
  for (const r of results) {
    const ch = toInt(r.chapters);
    const vol = toInt(r.volumes);
    if (ch != null && (chapters == null || ch > chapters)) chapters = ch;
    if (vol != null && (volumes == null || vol > volumes)) volumes = vol;
  }
  return { chapters, volumes };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const title = String(req.query.title || '').trim();
  if (!title || title.length > 200) {
    return res.status(400).json({ error: 'Parametro "title" mancante o non valido' });
  }

  const key = title.toLowerCase();
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(hit.body);
  }

  const results = await Promise.all([mangadex(title), kitsu(title), jikan(title)]);
  const totals = mergeTotals(results);
  const body = {
    title,
    ...totals,
    sources: results
      .filter(r => toInt(r.chapters) != null || toInt(r.volumes) != null)
      .map(r => r.source)
  };

  // Non salva in cache un risultato vuoto (es. API temporaneamente giù)
  if (body.sources.length) {
    CACHE.set(key, { at: Date.now(), body });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.setHeader('X-Cache', 'MISS');
  return res.status(200).json(body);
}
