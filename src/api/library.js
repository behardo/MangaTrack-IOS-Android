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
 * Add a manga to user's library with automatic chapter/volume totals lookup and activity logging.
 */
export async function addMangaFromPreview(previewManga, userId, currentLib = []) {
  if (!userId) throw new Error("Utente non autenticato");

  const title = previewManga.title_english || previewManga.title;
  if (currentLib.some(m => m.title === title)) {
    throw new Error("Già in libreria!");
  }

  const { chapters: totalCh, volumes: totalVol } = await totalsLookup(
    title,
    previewManga.chapters || null,
    previewManga.volumes || null
  );

  const manga = {
    title,
    status: "Da leggere",
    chapters: 0,
    total_chapters: totalCh,
    volumes: 0,
    total_volumes: totalVol,
    score: 0,
    genre: previewManga.genres?.[0]?.name || "Action",
    cover: previewManga.images?.jpg?.image_url || null,
    favourite: false,
    review: "",
    user_id: userId
  };

  const res = await ins("library", manga);
  const created = res?.[0] || { ...manga, id: Date.now() };

  // Log activity
  await ins("activity", {
    user_id: userId,
    type: "added",
    manga_title: title,
    manga_cover: manga.cover,
    details: ""
  }).catch(() => {});

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

