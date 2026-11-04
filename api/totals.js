/**
 * Funzione serverless Vercel: GET /api/totals?title=<titolo>
 *
 * Logica lato server per arricchire un manga con il numero totale di
 * capitoli e volumi. Interroga in parallelo MangaDex, Kitsu e Jikan, tiene il
 * valore più alto trovato e mette in cache la risposta. Integra anche
 * MangaUpdates: copre le serie assenti dalle altre fonti e, per le serie in
 * corso, ha spesso un conteggio capitoli più aggiornato di MangaDex.
 *
 * Perché sul server:
 *  - il browser fa una sola richiesta invece di tre;
 *  - la logica di aggregazione resta in un punto solo;
 *  - la CDN di Vercel conserva il risultato (s-maxage) e riduce le
 *    chiamate verso API esterne con limiti di frequenza.
 */

// Keep each provider on a short leash: Jikan in particular can hang until the
// timeout, and without this cap one slow API adds seconds to every lookup.
const MANGADEX_TIMEOUT_MS = 2500;
const KITSU_TIMEOUT_MS = 2000;
const JIKAN_TIMEOUT_MS = 1200;
const AGGREGATE_TIMEOUT_MS = 1500;
const MANGAUPDATES_TIMEOUT_MS = 1200;
const CACHE = new Map();          // cache in memoria dell'istanza
const CACHE_TTL_MS = 60 * 60 * 1000;

async function timedJson(url, headers = {}, timeoutMs = MANGADEX_TIMEOUT_MS, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
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
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc`,
    {},
    MANGADEX_TIMEOUT_MS
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
    { Accept: 'application/vnd.api+json' },
    KITSU_TIMEOUT_MS
  );
  const a = d?.data?.[0]?.attributes;
  return { source: 'kitsu', chapters: toInt(a?.chapterCount), volumes: toInt(a?.volumeCount) };
}

async function jikan(title) {
  const d = await timedJson(
    `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`,
    {},
    JIKAN_TIMEOUT_MS
  );
  const a = d?.data?.[0];
  return { source: 'jikan', chapters: toInt(a?.chapters), volumes: toInt(a?.volumes) };
}

const normalizeTitle = value =>
  (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Search MangaUpdates: it covers many series that are missing from
// MangaDex/Kitsu/Jikan and often has a more complete chapter count for ongoing
// series. The search response has no totals, so the detail is fetched by the
// helper below.
async function mangaupdatesSearch(title) {
  const d = await timedJson(
    'https://api.mangaupdates.com/v1/series/search',
    {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'MangaTrack/1.0'
    },
    MANGAUPDATES_TIMEOUT_MS,
    { method: 'POST', body: JSON.stringify({ search: title, perpage: 5 }) }
  );
  const rows = d?.results || [];
  if (!rows.length) return null;
  const wanted = normalizeTitle(title);
  const exact = rows.find(r =>
    normalizeTitle(r?.record?.title) === wanted || normalizeTitle(r?.hit_title) === wanted
  );
  const best = exact || rows[0];
  return best?.record?.series_id
    ? { id: best.record.series_id, title: best.record.title, exact: Boolean(exact) }
    : null;
}

async function mangaupdatesDetail(candidate) {
  if (!candidate?.id) return null;
  const d = await timedJson(
    `https://api.mangaupdates.com/v1/series/${candidate.id}`,
    { Accept: 'application/json', 'User-Agent': 'MangaTrack/1.0' },
    MANGAUPDATES_TIMEOUT_MS
  );
  const volumes = toInt(String(d?.status || '').match(/(\d+)\s+Volumes?/i)?.[1]);
  return {
    source: 'mangaupdates',
    chapters: toInt(d?.latest_chapter),
    volumes
  };
}

async function mangaupdates(title) {
  const candidate = await mangaupdatesSearch(title);
  if (!candidate) return null;
  const detail = await mangaupdatesDetail(candidate);
  return detail ? { ...candidate, ...detail } : null;
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

  // Version the key so a deploy that fixes a provider does not keep serving an
  // old empty/wrong aggregate from a warm instance or the CDN.
  const key = `v4:${title.toLowerCase()}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(hit.body);
  }

  // MangaUpdates runs together with the main providers: for ongoing series
  // MangaDex often reports only the uploaded chapters, while MangaUpdates has
  // the current chapter count. Its volumes are used only when the primary
  // sources have none (MangaUpdates can overcount volumes for some series).
  const [results, fallback] = await Promise.all([
    Promise.all([mangadex(title), kitsu(title), jikan(title)]),
    mangaupdates(title)
  ]);
  const totals = mergeTotals(results);

  if (fallback) {
    const fallbackChapters = toInt(fallback.chapters);
    const fallbackVolumes = toInt(fallback.volumes);
    let used = false;

    // Only an exact title match may raise an already-known chapter count:
    // a fuzzy match could be an unrelated series.
    if (
      fallbackChapters != null &&
      (totals.chapters == null || (fallback.exact && fallbackChapters > totals.chapters))
    ) {
      totals.chapters = fallbackChapters;
      used = true;
    }
    if (totals.volumes == null && fallbackVolumes != null) {
      totals.volumes = fallbackVolumes;
      used = true;
    }
    if (used) results.push(fallback);
  }

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
