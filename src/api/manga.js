export const ANILIST_URL = "https://graphql.anilist.co";
export const ANILIST_FIELDS = `title{romaji english}coverImage{large}genres chapters volumes format averageScore description(asHtml:false)`;

const ANILIST_TIMEOUT_MS = 6000;
const KITSU_TIMEOUT_MS = 8000;
// Totals are a nice-to-have enrichment. Keep every provider on a short leash so
// one slow API can never hold up adding a manga to the library.
const TOTALS_TIMEOUT_MS = 2500;

async function timedFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function anilist(query, variables) {
  const res = await timedFetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ query, variables })
  }, ANILIST_TIMEOUT_MS);
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(data.errors?.[0]?.message || `HTTP ${res.status}`);
  }
  return data.data;
}

export function mapAniList(m) {
  return {
    title: m.title?.romaji || "",
    title_english: m.title?.english || null,
    images: { jpg: { image_url: m.coverImage?.large || "" } },
    genres: (m.genres || []).map(g => ({ name: g })),
    chapters: m.chapters ?? null,
    volumes: m.volumes ?? null,
    type: m.format ?? "MANGA",
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
    synopsis: m.description ? m.description.replace(/<[^>]+>/g, "") : "",
    rank: null
  };
}

export async function mangadexLookup(title) {
  try {
    const res = await timedFetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc`,
      {},
      TOTALS_TIMEOUT_MS
    );
    if (!res.ok) return { chapters: null, volumes: null };
    const d = await res.json();
    const m = d.data?.[0]?.attributes;
    if (!m) return { chapters: null, volumes: null };
    const ch = parseInt(m.lastChapter, 10);
    const vol = parseInt(m.lastVolume, 10);
    return {
      chapters: isNaN(ch) ? null : ch,
      volumes: isNaN(vol) ? null : vol
    };
  } catch {
    return { chapters: null, volumes: null };
  }
}

export async function kitsuLookup(title) {
  try {
    const res = await timedFetch(
      `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(title)}&page[limit]=1`,
      {},
      TOTALS_TIMEOUT_MS
    );
    if (!res.ok) return { chapters: null, volumes: null };
    const d = await res.json();
    const a = d.data?.[0]?.attributes;
    if (!a) return { chapters: null, volumes: null };
    return {
      chapters: a.chapterCount ?? null,
      volumes: a.volumeCount ?? null
    };
  } catch {
    return { chapters: null, volumes: null };
  }
}

export async function jikanLookup(title) {
  try {
    const res = await timedFetch(
      `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`,
      {},
      TOTALS_TIMEOUT_MS
    );
    if (!res.ok) return { chapters: null, volumes: null };
    const d = await res.json();
    const a = d.data?.[0];
    if (!a) return { chapters: null, volumes: null };
    return {
      chapters: a.chapters ?? null,
      volumes: a.volumes ?? null
    };
  } catch {
    return { chapters: null, volumes: null };
  }
}

export async function totalsLookup(title, baseChapters = null, baseVolumes = null) {
  const results = await Promise.all([
    mangadexLookup(title),
    kitsuLookup(title),
    jikanLookup(title)
  ]);
  let chapters = baseChapters ?? null;
  let volumes = baseVolumes ?? null;

  results.forEach(r => {
    if (r.chapters != null && (chapters == null || r.chapters > chapters)) chapters = r.chapters;
    if (r.volumes != null && (volumes == null || r.volumes > volumes)) volumes = r.volumes;
  });

  return { chapters, volumes };
}

export async function searchManga(query) {
  const data = await anilist(
    `query($s:String){Page(page:1,perPage:10){media(search:$s,type:MANGA,sort:SEARCH_MATCH){${ANILIST_FIELDS}}}}`,
    { s: query }
  );
  return (data.Page?.media || []).map(mapAniList);
}

export function mapKitsu(item, categories) {
  const a = item?.attributes || {};
  const title = a.canonicalTitle || a.titles?.en || a.titles?.en_jp || a.titles?.ja_jp || "";
  const average = Number(a.averageRating);
  const genreNames = (item?.relationships?.categories?.data || [])
    .map(ref => categories?.get(ref.id))
    .filter(Boolean);
  return {
    title,
    title_english: a.titles?.en || null,
    images: {
      jpg: {
        image_url: a.posterImage?.large || a.posterImage?.medium || a.posterImage?.small || ""
      }
    },
    genres: genreNames.map(name => ({ name })),
    chapters: a.chapterCount ?? null,
    volumes: a.volumeCount ?? null,
    type: a.subtype ? String(a.subtype).toUpperCase() : "MANGA",
    score: Number.isFinite(average) && average > 0 ? Math.round(average) / 10 : null,
    synopsis: a.synopsis || "",
    rank: null
  };
}

/* Kitsu is the fallback when AniList is unavailable. Its trending endpoint is
   capped to a single page, so each For You set uses a different deterministic
   ranking (popular, top rated, newest) and cross-set dedupe keeps the cycle
   free of repeated titles. */
const KITSU_SORTS = ["-userCount", "-averageRating", "-startDate"];

export async function fetchKitsuTrending(page = 1, limit = 20) {
  const safePage = Math.max(1, Math.floor(page));
  const sort = KITSU_SORTS[(safePage - 1) % KITSU_SORTS.length];
  const offset = Math.floor((safePage - 1) / KITSU_SORTS.length) * limit;
  const res = await timedFetch(
    `https://kitsu.io/api/edge/manga?page[limit]=${limit}&page[offset]=${offset}&sort=${encodeURIComponent(sort)}&filter[subtype]=manga&include=categories`,
    { headers: { Accept: "application/vnd.api+json" } },
    KITSU_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`Kitsu HTTP ${res.status}`);
  const payload = await res.json();
  const categories = new Map(
    (payload.included || [])
      .filter(item => item.type === "categories")
      .map(item => [item.id, item.attributes?.title])
      .filter(([, name]) => Boolean(name))
  );
  return (payload.data || [])
    .filter(item => item.attributes?.nsfw !== true)
    .map(item => mapKitsu(item, categories))
    .filter(manga => manga.title && manga.images?.jpg?.image_url);
}

export async function fetchTrendingManga(maxAttempts = 3, page = 1) {
  let data = null;
  let lastError = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      data = await anilist(
        `query{Page(page:${Math.max(1, Math.floor(page))},perPage:10){media(sort:TRENDING_DESC,type:MANGA,isAdult:false){${ANILIST_FIELDS}}}}`
      );
      break;
    } catch (e) {
      lastError = e;
      if (i === maxAttempts - 1) break;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  const anilistList = (data?.Page?.media || []).map(mapAniList);
  if (anilistList.length) return anilistList;

  if (lastError) {
    console.warn("AniList trending unavailable, using Kitsu:", lastError?.message || lastError);
  }
  return fetchKitsuTrending(page, 20);
}
