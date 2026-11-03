/**
 * MangaTrack - Library & Activity Service (React version)
 */

import { q, ins, upd, del } from "./supabase";
import { totalsLookup, mangaInfo } from "./manga";

/**
 * Fetch all manga entries for a user.
 */
export async function fetchUserLibrary(userId) {
  try {
    const list = await q("library", `user_id=eq.${userId}&select=*&order=created_at.desc`);
    return list || [];
  } catch {
    return [];
  }
}

/**
 * Add a manga to the user's library. The insert is the only thing on the
 * critical path: activity logging and chapter/volume enrichment happen after
 * the row exists, so a slow metadata provider cannot delay the add.
 */
export async function addMangaFromPreview(previewManga, userId, currentLib = [], options = {}) {
  if (!userId) throw new Error("Utente non autenticato");

  const {
    status = "Da leggere",
    resolveTotals = true,
    onTotals = null
  } = options;

  const title = previewManga.title_english || previewManga.title;
  if (currentLib.some(m => m.title === title)) {
    throw new Error("Già in libreria!");
  }

  // Insert with the data we already have. The previous version waited for
  // MangaDex + Kitsu + Jikan before inserting, so one slow provider could make
  // an add feel frozen for many seconds.
  const totalCh = Number(previewManga.chapters) > 0 ? Number(previewManga.chapters) : null;
  const totalVol = Number(previewManga.volumes) > 0 ? Number(previewManga.volumes) : null;
  const firstGenre = previewManga.genres?.[0];
  const genre = typeof firstGenre === "string"
    ? firstGenre
    : firstGenre?.name || "Action";

  // Feed and recommendation entries only carry a title, so their cover can be
  // empty. Resolve it once here: without this the row lands in the library
  // (and in the activity feed) with no artwork at all.
  let cover = previewManga.images?.jpg?.image_url || previewManga.cover || null;
  if (!cover) {
    const info = await mangaInfo(title);
    cover = info?.images?.jpg?.image_url || null;
  }

  const manga = {
    title,
    status,
    chapters: 0,
    total_chapters: totalCh,
    volumes: 0,
    total_volumes: totalVol,
    score: 0,
    genre,
    cover,
    favourite: false,
    review: "",
    user_id: userId
  };

  const res = await ins("library", manga);
  const created = res?.[0] || { ...manga, id: Date.now() };

  // The activity row is not needed to finish the add: don't make the user wait.
  void ins("activity", {
    user_id: userId,
    type: "added",
    manga_title: title,
    manga_cover: manga.cover,
    details: ""
  }).catch(() => {});

  // Best-effort totals enrichment in the background. If a provider is slow or
  // offline the add has already completed; the row is patched only when a
  // better chapter/volume count arrives.
  if (resolveTotals && (totalCh == null || totalVol == null)) {
    totalsLookup(title, totalCh, totalVol)
      .then(totals => {
        const patch = {};
        if (totalCh == null && totals.chapters != null && totals.chapters > 0) {
          patch.total_chapters = totals.chapters;
        }
        if (totalVol == null && totals.volumes != null && totals.volumes > 0) {
          patch.total_volumes = totals.volumes;
        }
        if (!Object.keys(patch).length) return null;

        // Never overwrite totals the user may have edited while the background
        // lookup was running: only fill fields that are still empty.
        const match = [`id=eq.${created.id}`];
        const empty = [];
        if (patch.total_chapters != null) {
          empty.push("total_chapters.is.null", "total_chapters.eq.0");
        }
        if (patch.total_volumes != null) {
          empty.push("total_volumes.is.null", "total_volumes.eq.0");
        }
        match.push(`or=(${empty.join(",")})`);

        return upd("library", match.join("&"), patch).then(updatedRows => {
          // Only merge the enriched totals locally; the user may have changed
          // the status/favourite in the meantime, and those fields are newer.
          if (Array.isArray(updatedRows) && updatedRows.length === 0) return;
          onTotals?.({ id: created.id, ...patch });
        });
      })
      .catch(() => {});
  }

  return created;
}

/**
 * Save updates to an existing manga in user library.
 */
export async function saveMangaDetail(manga, userId) {
  const fields = {
    status: manga.status,
    chapters: manga.chapters,
    volumes: manga.volumes || 0,
    score: manga.score,
    review: manga.review,
    favourite: manga.favourite
  };

  await upd("library", `id=eq.${manga.id}`, fields);

  if (userId) {
    const actType = fields.status === "Completati"
      ? "completed"
      : fields.score > 0
        ? "scored"
        : "status_changed";

    await ins("activity", {
      user_id: userId,
      type: actType,
      manga_title: manga.title,
      manga_cover: manga.cover,
      details: fields.score > 0 ? `Voto: ${fields.score}/10` : `Stato: ${fields.status}`
    }).catch(() => {});
  }

  return fields;
}

/**
 * Delete a manga from the library.
 */
export async function deleteMangaFromLibrary(mangaId) {
  await del("library", `id=eq.${mangaId}`);
}

/**
 * Best-effort cover backfill for rows saved before the social add resolved
 * artwork. Called from the detail view the first time it finds an empty cover.
 */
export async function saveMangaCover(mangaId, cover) {
  if (!mangaId || !cover) return;
  try {
    await upd("library", `id=eq.${mangaId}`, { cover });
  } catch {
    /* the detail view still shows the resolved cover */
  }
}

const REAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACKFILL_LIMIT = 30;
const BACKFILL_DELAY_MS = 350;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const numberOrZero = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// A total is missing, or clearly wrong because the user has already read more
// chapters/volumes than the stored total. This second case repairs old rows
// that got an omonym's totals (e.g. "Real" had 8 chapters instead of 106).
function needsChapters(manga) {
  const total = numberOrZero(manga?.total_chapters);
  return total <= 0 || numberOrZero(manga?.chapters) > total;
}

function needsVolumes(manga) {
  const total = numberOrZero(manga?.total_volumes);
  return total <= 0 || numberOrZero(manga?.volumes) > total;
}

// Totals smaller than the user's progress cannot be right; ask the next
// provider instead of writing a worse value.
function usableTotal(value, progress) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n >= progress ? n : null;
}

/**
 * Persist chapter/volume totals for one row. Same contract as saveMangaCover:
 * metadata only, never touches the user's reading progress.
 */
export async function saveMangaTotals(mangaId, patch) {
  if (!mangaId || !patch || !Object.keys(patch).length) return;
  try {
    await upd("library", `id=eq.${mangaId}`, patch);
  } catch {
    /* the detail view keeps showing the enriched values */
  }
}

/**
 * Fill missing or inconsistent totals for existing rows. Runs in the
 * background after the library loads; AniList is asked first (it supplies
 * identity, cover and often the totals), then the aggregated totalsLookup
 * covers titles AniList does not know and MangaUpdates catches the rest.
 * Only empty or impossible fields are patched, so progress and user edits win.
 */
export async function backfillTotals(entries, onUpdate) {
  const pending = (Array.isArray(entries) ? entries : [])
    .filter(manga => REAL_ID.test(String(manga?.id || '')))
    .filter(manga => needsChapters(manga) || needsVolumes(manga))
    .slice(0, BACKFILL_LIMIT);

  if (!pending.length) return;

  for (const manga of pending) {
    const title = (manga.title || "").trim();
    if (!title) continue;

    const progressChapters = numberOrZero(manga.chapters);
    const progressVolumes = numberOrZero(manga.volumes);
    const needChapters = needsChapters(manga);
    const needVolumes = needsVolumes(manga);
    let chapters = needChapters ? null : numberOrZero(manga.total_chapters);
    let volumes = needVolumes ? null : numberOrZero(manga.total_volumes);

    try {
      const info = await mangaInfo(title);
      if (needChapters) chapters = usableTotal(info?.chapters, progressChapters);
      if (needVolumes) volumes = usableTotal(info?.volumes, progressVolumes);

      if ((needChapters && chapters == null) || (needVolumes && volumes == null)) {
        const totals = await totalsLookup(title, chapters, volumes);
        if (needChapters && chapters == null) {
          chapters = usableTotal(totals.chapters, progressChapters);
        }
        if (needVolumes && volumes == null) {
          volumes = usableTotal(totals.volumes, progressVolumes);
        }
      }

      const patch = {};
      if (needChapters && chapters != null) {
        patch.total_chapters = chapters;
      }
      if (needVolumes && volumes != null) {
        patch.total_volumes = volumes;
      }
      if (!Object.keys(patch).length) continue;

      // Guard each field so a value written by another tab (or by the detail
      // view while the lookup was in flight) is never overwritten. For an
      // inconsistent row, allow the update when the stored total is still
      // below the user's progress.
      const empty = [];
      if (patch.total_chapters != null) {
        empty.push("total_chapters.is.null", "total_chapters.eq.0");
        if (progressChapters > 0) {
          empty.push(`total_chapters.lt.${progressChapters}`);
        }
      }
      if (patch.total_volumes != null) {
        empty.push("total_volumes.is.null", "total_volumes.eq.0");
        if (progressVolumes > 0) {
          empty.push(`total_volumes.lt.${progressVolumes}`);
        }
      }
      const filter = `id=eq.${manga.id}&or=(${empty.join(",")})`;

      const updated = await upd("library", filter, patch);
      if (Array.isArray(updated) && updated.length === 0) continue;
      onUpdate?.({ id: manga.id, ...patch });
    } catch {
      /* one unreachable provider must not stop the remaining rows */
    }

    await pause(BACKFILL_DELAY_MS);
  }
}

