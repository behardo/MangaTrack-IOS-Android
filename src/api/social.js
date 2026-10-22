/**
 * MangaTrack - Social, Follows & Recommendations Service (React version)
 */

import { q, ins, del } from "./supabase";

/**
 * Fetch users that the current user is following.
 */
export async function getFollowingIds(userId) {
  if (!userId) return [];
  const follows = await q("follows", `follower_id=eq.${userId}&select=following_id`) || [];
  return follows.map(f => f.following_id);
}

/**
 * Follow a user.
 */
export async function followUser(currentUserId, targetId) {
  if (!currentUserId) throw new Error("Utente non autenticato");
  return ins("follows", {
    follower_id: currentUserId,
    following_id: targetId
  });
}

/**
 * Unfollow a user.
 */
export async function unfollowUser(currentUserId, targetId) {
  if (!currentUserId) throw new Error("Utente non autenticato");
  return del("follows", `follower_id=eq.${currentUserId}&following_id=eq.${targetId}`);
}

/**
 * Check if current user is following target user.
 */
export async function checkIsFollowing(currentUserId, targetId) {
  if (!currentUserId || !targetId) return false;
  const rows = await q("follows", `follower_id=eq.${currentUserId}&following_id=eq.${targetId}&select=id`) || [];
  return rows.length > 0;
}

/**
 * Fetch follower count for a user.
 */
export async function getFollowerCount(userId) {
  if (!userId) return 0;
  const rows = await q("follows", `following_id=eq.${userId}&select=id`) || [];
  return rows.length;
}

/**
 * Search user profiles by username prefix/substring.
 */
export async function searchProfiles(query, currentUserId) {
  if (!query || !query.trim()) return [];
  const results = await q(
    "profiles",
    `username=ilike.%25${encodeURIComponent(query.trim())}%25&select=id,username,avatar_color,avatar_url&limit=15`
  ) || [];
  return results.filter(p => p.id !== currentUserId);
}

/**
 * Fetch pending recommendation count for current user.
 */
export async function getPendingRecsCount(userId) {
  if (!userId) return 0;
  try {
    const recs = await q("recommendations", `to_id=eq.${userId}&select=id`) || [];
    return recs.length;
  } catch {
    return 0;
  }
}

/**
 * Send a manga recommendation to another user.
 */
export async function sendRecommendation(fromUserId, targetUserId, mangaTitle, mangaCover, message) {
  if (!fromUserId) throw new Error("Utente non autenticato");

  return ins("recommendations", {
    from_id: fromUserId,
    to_id: targetUserId,
    manga_title: mangaTitle,
    manga_cover: mangaCover || null,
    message: message || ""
  });
}

/**
 * Delete / dismiss a recommendation.
 */
export async function dismissRecommendation(recId) {
  return del("recommendations", `id=eq.${recId}`);
}
