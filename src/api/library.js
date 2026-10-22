/**
 * MangaTrack - Library & Activity Service (React version)
 */

import { q, ins, upd, del } from "./supabase";
import { totalsLookup } from "./manga";

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
  const totalCh = previewManga.chapters ?? null;
  const totalVol = previewManga.volumes ?? null;
  const firstGenre = previewManga.genres?.[0];
  const genre = typeof firstGenre === "string"
    ? firstGenre
    : firstGenre?.name || "Action";

  const manga = {
    title,
    status,
    chapters: 0,
    total_chapters: totalCh,
    volumes: 0,
    total_volumes: totalVol,
    score: 0,
    genre,
    cover: previewManga.images?.jpg?.image_url || null,
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
        if (totalCh == null && totals.chapters != null) {
          patch.total_chapters = totals.chapters;
        }
        if (totalVol == null && totals.volumes != null) {
          patch.total_volumes = totals.volumes;
        }
        if (!Object.keys(patch).length) return null;

        // Never overwrite totals the user may have edited while the background
        // lookup was running: only fill fields that are still empty.
        const match = [`id=eq.${created.id}`];
        if (patch.total_chapters != null) match.push("total_chapters=is.null");
        if (patch.total_volumes != null) match.push("total_volumes=is.null");

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

