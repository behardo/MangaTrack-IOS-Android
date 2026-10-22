import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { searchProfiles, sendRecommendation, getFollowingIds } from '../../api/social';
import { q } from '../../api/supabase';
import Avatar from '../common/Avatar';

/**
 * CS2 — v45 "Consiglia a…" balloon sheet.
 *
 * Hark recommends the title currently open in the detail view. The React
 * implementation keeps that flow but still loads the followed profiles from
 * Supabase (and still allows searching a profile outside the followed list,
 * which the previous modal supported). Each selected friend receives a real
 * recommendation row through the existing API.
 */
export default function RecommendModal({ initialManga, initialFriend, onClose, onToast }) {
  const { user, profile, session } = useAuth();
  const previewMode = import.meta.env.DEV && session?.access_token === 'dev-preview';

  const [visible, setVisible] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => (
    initialFriend?.id ? new Set([initialFriend.id]) : new Set()
  ));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const closeTimerRef = useRef(null);
  const sendTimerRef = useRef(null);
  const searchSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const mangaTitle = initialManga?.title_english || initialManga?.title || 'Manga';
  const mangaCover = initialManga?.images?.jpg?.image_url || initialManga?.cover || '';

  // The overlay and sheet start translated out of frame; the next frame adds
  // `.open`, which is what triggers Hark's cubic-bezier slide.
  useEffect(() => {
    mountedRef.current = true;
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(frame);
      clearTimeout(closeTimerRef.current);
      clearTimeout(sendTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFollowing() {
      if (!user?.id) return;
      try {
        if (previewMode) {
          const preview = await import('../../dev/previewData');
          if (!cancelled) setFriendsList(preview.PREVIEW_FOLLOWING);
          return;
        }
        const followingIds = await getFollowingIds(user.id);
        if (!followingIds.length) {
          if (!cancelled) setFriendsList([]);
          return;
        }
        const idFilter = `id=in.(${followingIds.join(',')})&select=id,username,avatar_color,avatar_url`;
        const profiles = await q('profiles', idFilter) || [];
        if (!cancelled) setFriendsList(profiles);
      } catch (err) {
        console.error('Failed to load following list', err);
      }
    }

    loadFollowing();
    return () => { cancelled = true; };
  }, [user?.id, previewMode]);

  // Keep the old ability to recommend to someone who is not in the followed
  // list; followed matches are rendered first, then global search results.
  useEffect(() => {
    const term = friendSearch.trim();
    const requestId = ++searchSeqRef.current;
    if (!term) {
      setSearchResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        if (previewMode) {
          const preview = await import('../../dev/previewData');
          if (!mountedRef.current || requestId !== searchSeqRef.current) return;
          const needle = term.toLowerCase();
          setSearchResults(
            preview.PREVIEW_FOLLOWING.filter(item => item.username.toLowerCase().includes(needle))
          );
          return;
        }
        const results = await searchProfiles(term, user?.id);
        if (!mountedRef.current || requestId !== searchSeqRef.current) return;
        setSearchResults(results);
      } catch (err) {
        if (!mountedRef.current || requestId !== searchSeqRef.current) return;
        console.error(err);
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [friendSearch, user?.id, previewMode]);

  const visibleFriends = useMemo(() => {
    const term = friendSearch.trim().toLowerCase();
    const merged = new Map();
    friendsList.forEach(friend => merged.set(friend.id, friend));
    searchResults.forEach(friend => merged.set(friend.id, friend));
    return [...merged.values()].filter(friend => (
      !term || friend.username.toLowerCase().includes(term)
    ));
  }, [friendsList, searchResults, friendSearch]);

  const selectedNames = [...selectedIds]
    .map(id => (
      friendsList.find(friend => friend.id === id) ||
      searchResults.find(friend => friend.id === id) ||
      (initialFriend?.id === id ? initialFriend : null)
    )?.username)
    .filter(Boolean);

  const buttonLabel = selectedIds.size === 1
    ? `Invia a ${selectedNames[0] || '1 amico'}`
    : selectedIds.size > 1
      ? `Invia a ${selectedIds.size} amici`
      : 'Invia';

  function closeWithAnimation() {
    if (closeTimerRef.current) return;
    setVisible(false);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose?.();
    }, 320);
  }

  const toggleFriend = id => {
    if (sending || sent) return;
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selectedIds.size || sending || sent) return;

    setSending(true);
    try {
      if (!previewMode) {
        await Promise.all(
          [...selectedIds].map(id => (
            sendRecommendation(
              user.id,
              id,
              mangaTitle,
              mangaCover || null,
              message.trim()
            )
          ))
        );
      }
      if (!mountedRef.current) return;
      setSent(true);
      onToast?.(
        selectedIds.size === 1
          ? `Consiglio inviato a @${selectedNames[0] || 'amico'}!`
          : `Consiglio inviato a ${selectedIds.size} amici!`
      );
      sendTimerRef.current = setTimeout(closeWithAnimation, 1300);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error(err);
      onToast?.('Errore durante l\'invio: ' + err.message);
    } finally {
      if (mountedRef.current) setSending(false);
    }
  };

  return (
    <>
      <div
        className={`csd ${visible ? 'open' : ''}`}
        id="csd"
        onClick={closeWithAnimation}
      />
      <div className={`csh ${visible ? 'open' : ''}`} id="csh">
        <div className="grab" />
        <button type="button" className="nxx" id="csx" aria-label="Chiudi" onClick={closeWithAnimation}>
          ✕
        </button>

        <div className="csbd">
          <div className="csttl">Consiglia a…</div>

          <div className="cssr">
            <span aria-hidden="true">⌕</span>
            <input
              id="csq"
              placeholder="Cerca tra i seguiti"
              value={friendSearch}
              onChange={event => setFriendSearch(event.target.value)}
            />
          </div>

          <div className="csrow" id="csrow">
            {visibleFriends.length ? (
              visibleFriends.map(friend => {
                const selected = selectedIds.has(friend.id);
                return (
                  <div
                    key={friend.id}
                    className={`csf ${selected ? 'on' : ''}`}
                    data-n={friend.username}
                    onClick={() => toggleFriend(friend.id)}
                  >
                    <div className="a">
                      <Avatar
                        src={friend.avatar_url}
                        name={friend.username}
                        color={friend.avatar_color || 'var(--red)'}
                        textColor="var(--ink)"
                        alt=""
                      />
                    </div>
                    <span className="notr">{friend.username}</span>
                  </div>
                );
              })
            ) : (
              <div className="csnone">
                {friendSearch.trim() ? 'Nessun utente trovato.' : 'Non segui ancora nessuno.'}
              </div>
            )}
          </div>

          <div className="cslbl">Il tuo messaggio</div>
          <div className="csbub">
            <div className="csme">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.username || user?.email}
                color={profile?.avatar_color || 'var(--red)'}
                alt=""
              />
            </div>
            <div className="csb">
              <div className="csmm">
                {mangaCover ? <img id="csimg" src={mangaCover} alt="" /> : <span id="csimg" />}
                <b id="cst">{mangaTitle}</b>
              </div>
              <textarea
                id="csmsg"
                maxLength={300}
                placeholder="Scrivi qualcosa…"
                value={message}
                onChange={event => setMessage(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="csbar">
          <button
            type="button"
            className={`cssnd ${sent ? 'ok' : ''}`}
            id="cssnd"
            disabled={!selectedIds.size || sending || sent}
            onClick={handleSend}
          >
            {sent ? '✓ Inviato' : sending ? 'Invio…' : buttonLabel}
          </button>
        </div>
      </div>
    </>
  );
}
