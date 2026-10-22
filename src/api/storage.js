import { SB_URL, SB_KEY, api, upd } from "./supabase.js";

export async function uploadAvatar(file, session) {
  if (!file) throw new Error("Nessun file selezionato");
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Foto troppo grande (max 2MB)");
  }
  if (!session?.user?.id) throw new Error("Utente non autenticato");

  const ext = file.name.split(".").pop().toLowerCase();
  const path = `${session.user.id}/avatar.${ext}`;

  const res = await fetch(`${SB_URL}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${session.access_token}`,
      "x-upsert": "true"
    },
    body: file
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Upload fallito");
  }

  const avatarUrl = `${SB_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
  await upd("profiles", `id=eq.${session.user.id}`, { avatar_url: avatarUrl });
  return avatarUrl;
}

export async function removeAvatar(session) {
  if (!session?.user?.id) throw new Error("Utente non autenticato");
  await upd("profiles", `id=eq.${session.user.id}`, { avatar_url: null });
}

export async function updateAvatarColor(color, session) {
  if (!session?.user?.id) throw new Error("Utente non autenticato");
  await upd("profiles", `id=eq.${session.user.id}`, { avatar_color: color });
}

export async function deleteUserStorage(userId) {
  try {
    const files = await api(`/storage/v1/object/list/avatars`, {
      method: "POST",
      body: JSON.stringify({ prefix: `${userId}/` })
    });

    if (Array.isArray(files) && files.length) {
      const prefixes = files.map(f => `${userId}/${f.name}`);
      await api(`/storage/v1/object/avatars`, {
        method: "DELETE",
        body: JSON.stringify({ prefixes })
      });
    }
  } catch (e) {
    console.warn("Storage deletion warning:", e);
  }
}
