import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { q, ins, upd, del } from '../../api/supabase';
import { useAuth } from '../../context/AuthContext';
import { fetchTrendingManga } from '../../api/manga';
import { addMangaFromPreview } from '../../api/library';
import Avatar from '../common/Avatar';

/* Hark shows a single "added N manga" card when a reader imports several
   titles at once. Our activity rows are one per title, so merge consecutive
   "added" rows from the same user that were written within two minutes. */
const MULTI_ADD_WINDOW = 120000;
const FOR_YOU_PAGE_SIZE = 6;
const FOR_YOU_PAGES = 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function mangaTitle(manga) {
  return manga?.title_english || manga?.title || '';
}

/* AniList pages can overlap after rankings move. Never render the same title
   twice in the same hand of cards. */
function dedupeManga(list) {
  const seen = new Set();
  return (list || []).filter(manga => {
    const title = mangaTitle(manga).trim().toLowerCase();
    if (!title || seen.has(title)) return false;
    seen.add(title);
    return true;
  });
}

function groupFeed(rows) {
  const out = [];
  rows.forEach(row => {
    const prev = out[out.length - 1];
    const last = prev?.items?.[prev.items.length - 1];
    const sameBurst = prev
      && prev.type === 'added'
      && row.type === 'added'
      && prev.user_id === row.user_id
      && Math.abs(new Date(last.created_at).getTime() - new Date(row.created_at).getTime()) <= MULTI_ADD_WINDOW;

    if (sameBurst) {
      prev.items.push(row);
      return;
    }

    out.push({ ...row, items: [row] });
  });
  return out;
}

/* The "Seguiti" cards show how many titles a reader has and what they are
   reading right now, mirroring Hark's SGR data (cover, title, chapter). */
function followingMetaFromLibrary(entries = []) {
  const reading = entries.find(entry => entry.status === 'In lettura') || entries[0] || null;
  return {
    count: entries.length,
    reading: reading
      ? {
          title: reading.title || 'Manga',
          cover: reading.cover || '',
          chapters: Number(reading.chapters) || 0,
        }
      : null,
  };
}

/**
 * M3 — the stack of covers that Hark shows for a multi-add activity.
 * Swiping, "Prossimo" and adding all use the same order; adding calls the real
 * library service, so the deck is not just a visual carousel.
 */
function FeedDeck({ items, library = [], onOpenPreview, onMangaAdded, onToast }) {
  const { session, user } = useAuth();
  const previewMode = import.meta.env.DEV && session?.access_token === 'dev-preview';

  const [order, setOrder] = useState(() => items.map((_, index) => index));
  const [added, setAdded] = useState({});
  const [busy, setBusy] = useState(false);
  const deckRef = useRef(null);
  const gesture = useRef({ x0: null, moved: 0, animating: false });
  const ids = items.map(item => item.id).join('|');

  useEffect(() => {
    setOrder(items.map((_, index) => index));
    gesture.current = { x0: null, moved: 0, animating: false };
  }, [ids]);

  const currentIndex = order[0] ?? 0;
  const current = items[currentIndex];
  if (!current) return null;

  const currentTitle = current.manga_title;
  const currentCover = current.manga_cover;
  const inLibrary = library.some(entry => entry.title === currentTitle);
  const currentAdded = inLibrary || Boolean(added[currentTitle]);

  const topElement = () => deckRef.current?.querySelector(`.dk3 .it[data-i="${currentIndex}"]`);

  const cardTransform = position =>
    `translateX(${position * 14}px) rotate(${position * 5 - 2}deg) scale(${1 - position * 0.05})`;
  const cardOpacity = position => (position > 3 ? 0 : 1);

  // The swipe animation writes transform/opacity directly on the card. React
  // only re-applies a style value when its prop changes, so a card moved from
  // the front (opacity 1) to the back (opacity 1) would keep the inline 0 and
  // disappear for good. Repaint it explicitly after every order change.
  const paintCard = (element, position) => {
    if (!element) return;
    element.style.transition = '';
    element.style.zIndex = String(10 - position);
    element.style.transform = cardTransform(position);
    element.style.opacity = String(cardOpacity(position));
  };

  const next = (direction = 1) => {
    if (gesture.current.animating || order.length < 2) return;
    gesture.current.animating = true;
    const element = topElement();
    if (element) {
      element.style.transform = `translateX(${direction * 240}px) rotate(${direction * 30}deg)`;
      element.style.opacity = 0;
    }
    const backPosition = order.length - 1;
    setTimeout(() => {
      setOrder(previous => {
        if (previous.length < 2) return previous;
        return [...previous.slice(1), previous[0]];
      });
      paintCard(element, backPosition);
      gesture.current.animating = false;
    }, 250);
  };

  const openCurrent = () => {
    onOpenPreview?.({ title: currentTitle, cover: currentCover });
  };

  const handleAdd = async event => {
    event.stopPropagation();
    if (busy) return;
    if (currentAdded) {
      openCurrent();
      return;
    }

    if (!previewMode && !user?.id) {
      onToast?.('Effettua l\'accesso per aggiungere manga');
      return;
    }

    setBusy(true);
    try {
      const previewManga = {
        title: currentTitle,
        images: { jpg: { image_url: currentCover } },
        genres: [],
      };
      if (!previewMode) {
        const created = await addMangaFromPreview(previewManga, user.id, library);
        onMangaAdded?.(created);
      }
      setAdded(previous => ({ ...previous, [currentTitle]: true }));
      onToast?.(`"${currentTitle}" aggiunto alla libreria!`);
      setTimeout(() => next(1), 650);
    } catch (err) {
      onToast?.(err.message || 'Errore nell\'aggiunta');
    } finally {
      setBusy(false);
    }
  };

  const handlePointerDown = event => {
    if (event.target.closest('.dk3b')) return;
    gesture.current.x0 = event.clientX;
    gesture.current.moved = 0;
    const element = topElement();
    if (element) element.style.transition = 'none';
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture can be unavailable for synthetic pointers */
    }
  };

  const handlePointerMove = event => {
    if (gesture.current.x0 === null) return;
    const dx = event.clientX - gesture.current.x0;
    gesture.current.moved = Math.max(gesture.current.moved, Math.abs(dx));
    const element = topElement();
    if (element) element.style.transform = `translateX(${dx}px) rotate(${dx / 10 - 2}deg)`;
  };

  const finishPointer = event => {
    if (gesture.current.x0 === null) return;
    const dx = event.clientX - gesture.current.x0;
    const moved = gesture.current.moved;
    gesture.current.x0 = null;
    const element = topElement();
    if (element) element.style.transition = '';
    if (moved < 5) {
      paintCard(element, 0);
      openCurrent();
    } else if (Math.abs(dx) > 50) {
      next(dx < 0 ? -1 : 1);
    } else {
      paintCard(element, 0);
    }
  };

  return (
    <>
      <div
        className="dk3"
        ref={deckRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        {items.map((item, index) => {
          const position = Math.max(0, order.indexOf(index));
          return (
            <div
              key={item.id}
              className="it"
              data-i={index}
              style={{
                zIndex: 10 - position,
                transform: cardTransform(position),
                opacity: cardOpacity(position),
              }}
            >
              <img src={item.manga_cover || ''} alt={item.manga_title} />
            </div>
          );
        })}
      </div>
      <div className="dk3c">
        <span className="notr">{currentTitle}</span>
        <small>
          {current.user?.username
            ? `Dalla libreria di @${current.user.username}`
            : 'Aggiunto di recente'}
        </small>
      </div>
      <div className="dk3b">
        <span className="n" onClick={event => { event.stopPropagation(); next(1); }}>Prossimo ›</span>
        <span className="r a" onClick={handleAdd}>
          {currentAdded ? '✓ In libreria' : '+ In libreria'}
        </span>
      </div>
    </>
  );
}

export default function SocialView({ isActive, library = [], onOpenPreview, onOpenDetail, onToast, onRefreshRecsCount, onMangaSaved, onMangaAdded }) {
  const { session, user } = useAuth();
  const currentUserId = user?.id || session?.user?.id;
  const previewMode = import.meta.env.DEV && session?.access_token === 'dev-preview';

  const [tab, setTab] = useState('feed'); // 'feed' | 'foryou' | 'following' | 'find' | 'recs'
  const [feed, setFeed] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followCards, setFollowCards] = useState([]);
  const [unfollowedIds, setUnfollowedIds] = useState([]);
  const [followingMeta, setFollowingMeta] = useState({});
  const [followingQuery, setFollowingQuery] = useState('');
  const [openFollowId, setOpenFollowId] = useState(null);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [recs, setRecs] = useState([]);
  const [forYouDecks, setForYouDecks] = useState([]);
  const [forYouIndex, setForYouIndex] = useState(0);
  const [forYouLabel, setForYouLabel] = useState('aggiornato ora');
  const [forYouLoading, setForYouLoading] = useState(false);
  const [forYouError, setForYouError] = useState('');
  const [pageTurning, setPageTurning] = useState(false);
  const forYouList = forYouDecks[forYouIndex] || [];
  const [favOverrides, setFavOverrides] = useState({});
  const [recBusy, setRecBusy] = useState(null);
  const recBusyRef = useRef(false);
  const feedGroups = useMemo(() => groupFeed(feed), [feed]);

  // v45 L2 — sliding user-library overlay
  const [libraryUser, setLibraryUser] = useState(null);
  const [userLibrary, setUserLibrary] = useState([]);
  const [userLibTab, setUserLibTab] = useState('all');
  const [userLibOpen, setUserLibOpen] = useState(false);
  const [userLibLoading, setUserLibLoading] = useState(false);

  // v46 S1 — bookmark and page-turn state
  const f3Ref = useRef(null);
  const s1shRef = useRef(null);
  const s1bmRef = useRef(null);
  const pageTurningRef = useRef(false);
  const forYouDecksRef = useRef([]);
  const forYouIndexRef = useRef(0);
  const forYouLoadingRef = useRef(false);
  const forYouRequestRef = useRef(0);
  const mountedRef = useRef(true);

  const stabRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    forYouDecksRef.current = forYouDecks;
  }, [forYouDecks]);

  useEffect(() => {
    forYouIndexRef.current = forYouIndex;
  }, [forYouIndex]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hark sliding indicator
  useEffect(() => {
    if (!isActive || !stabRef.current) return undefined;
    const box = stabRef.current;
    let frame = 0;
    let cancelled = false;
    const place = () => {
      if (cancelled) return;
      const on = box.querySelector('.o.on');
      const ind = box.querySelector('.ind');
      if (!on || !on.offsetWidth || !ind) return;
      ind.style.left = on.offsetLeft + 'px';
      ind.style.width = on.offsetWidth + 'px';
    };
    frame = requestAnimationFrame(place);
    // The display font can finish loading after the first paint; Hark measures
    // the active tab at click time, so re-measure once fonts are ready.
    document.fonts?.ready.then(place).catch(() => {});
    window.addEventListener('resize', place);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
    };
  }, [isActive, tab]);

  // The full-screen user library belongs to Social; leaving the tab closes it,
  // just like Hark's bottom navigation handlers.
  useEffect(() => {
    if (!isActive) setUserLibOpen(false);
  }, [isActive]);

  // Load content whenever tab changes
  useEffect(() => {
    if (!currentUserId) return;
    loadTabContent(tab);
  }, [tab, currentUserId]);

  async function loadForYouCandidates(setIndex) {
    if (previewMode) {
      const preview = await import('../../dev/previewData');
      return preview.PREVIEW_FOR_YOU[setIndex % preview.PREVIEW_FOR_YOU.length] || [];
    }
    // Each set is one deterministic AniList (or Kitsu) page. Fetching more than
    // the six cards shown lets us skip titles that already appeared in another
    // set without leaving a hole in the cycle. The provider fallback makes a
    // single AniList attempt enough: a failure goes straight to Kitsu.
    return dedupeManga(await fetchTrendingManga(1, setIndex + 1));
  }

  function storeForYouDeck(setIndex, deck) {
    const next = [...forYouDecksRef.current];
    next[setIndex] = deck;
    forYouDecksRef.current = next;
    setForYouDecks(next);
  }

  function unusedForYouCandidates(candidates, targetIndex) {
    const used = new Set();
    forYouDecksRef.current.forEach((deck, index) => {
      if (index === targetIndex) return;
      (deck || []).forEach(manga => {
        const title = mangaTitle(manga).trim().toLowerCase();
        if (title) used.add(title);
      });
    });
    return candidates.filter(manga => {
      const title = mangaTitle(manga).trim().toLowerCase();
      return title && !used.has(title);
    });
  }

  async function ensureForYou() {
    if (
      forYouDecksRef.current.some(deck => deck?.length) ||
      forYouLoadingRef.current ||
      pageTurningRef.current
    ) return;

    forYouLoadingRef.current = true;
    setForYouLoading(true);
    setForYouError('');
    setForYouLabel('Caricamento…');
    const requestId = ++forYouRequestRef.current;

    try {
      const candidates = await loadForYouCandidates(0);
      if (!mountedRef.current || requestId !== forYouRequestRef.current) return;
      const deck = dedupeManga(candidates).slice(0, FOR_YOU_PAGE_SIZE);
      if (deck.length) {
        storeForYouDeck(0, deck);
        forYouIndexRef.current = 0;
        setForYouIndex(0);
        setForYouLabel('aggiornato ora');
        setForYouError('');
      } else {
        setForYouError('Nessun manga disponibile.');
        setForYouLabel('↺ Riprova');
      }
    } catch (err) {
      if (!mountedRef.current || requestId !== forYouRequestRef.current) return;
      console.warn('For You load failed:', err);
      setForYouError('Impossibile caricare i consigli.');
      setForYouLabel('↺ Riprova');
    } finally {
      if (requestId === forYouRequestRef.current) {
        forYouLoadingRef.current = false;
        if (mountedRef.current) setForYouLoading(false);
      }
    }
  }

  /* Load the manga count + current reading title for the followed readers.
     `merge` keeps metadata already fetched for other cards. */
  async function loadFollowingMeta(ids, merge = false) {
    const wanted = (ids || []).filter(Boolean);
    if (!wanted.length) {
      if (!merge) setFollowingMeta({});
      return;
    }

    if (previewMode) {
      const preview = await import('../../dev/previewData');
      const meta = {};
      wanted.forEach(id => {
        meta[id] = followingMetaFromLibrary(preview.PREVIEW_USER_LIBRARIES?.[id] || []);
      });
      setFollowingMeta(prev => (merge ? { ...prev, ...meta } : meta));
      return;
    }

    try {
      const rows = await q(
        'library',
        `user_id=in.(${wanted.join(',')})&select=user_id,title,cover,status,chapters`
      ) || [];
      const grouped = {};
      rows.forEach(row => {
        if (!grouped[row.user_id]) grouped[row.user_id] = [];
        grouped[row.user_id].push(row);
      });
      const meta = {};
      wanted.forEach(id => {
        meta[id] = followingMetaFromLibrary(grouped[id] || []);
      });
      setFollowingMeta(prev => (merge ? { ...prev, ...meta } : meta));
    } catch (err) {
      console.error(err);
      if (!merge) setFollowingMeta({});
    }
  }

  async function loadTabContent(activeTab) {
    if (!currentUserId) return;

    // Dev-only shell preview: real Supabase calls would 401 with the fake
    // session, so mimic the reference account's social data instead.
    if (import.meta.env.DEV && session?.access_token === 'dev-preview') {
      const preview = await import('../../dev/previewData');
      if (activeTab === 'feed') {
        setFollowing(preview.PREVIEW_FOLLOWING);
        setFeed(
          preview.PREVIEW_ACTIVITY.map(a => ({
            ...a,
            user: preview.PREVIEW_FOLLOWING.find(u => u.id === a.user_id),
          }))
        );
      } else if (activeTab === 'following') {
        const profiles = preview.PREVIEW_FOLLOWING;
        setFollowing(profiles);
        setFollowCards(profiles);
        setUnfollowedIds([]);
        setFollowingQuery('');
        setOpenFollowId(null);
        await loadFollowingMeta(profiles.map(u => u.id));
      } else if (activeTab === 'foryou') {
        await ensureForYou();
      } else if (activeTab === 'recs') {
        setRecs(
          preview.PREVIEW_RECS.map(r => ({
            ...r,
            fromUser: preview.PREVIEW_FOLLOWING.find(u => u.id === r.from_id),
          }))
        );
      }
      return;
    }

    try {
      if (activeTab === 'feed') {
        const follows = await q('follows', `follower_id=eq.${currentUserId}&select=following_id`) || [];
        if (follows.length) {
          const ids = follows.map(f => f.following_id);
          const [activity, profiles] = await Promise.all([
            q('activity', `user_id=in.(${ids.join(',')})&select=*&order=created_at.desc&limit=30`) || [],
            q('profiles', `id=in.(${ids.join(',')})&select=*`) || []
          ]);
          const pm = {};
          profiles.forEach(p => { pm[p.id] = p; });
          setFollowing(profiles);
          setFeed((activity || []).map(a => ({ ...a, user: pm[a.user_id] })));
        } else {
          setFollowing([]);
          setFeed([]);
        }
      } else if (activeTab === 'foryou') {
        await ensureForYou();
      } else if (activeTab === 'following') {
        const follows = await q('follows', `follower_id=eq.${currentUserId}&select=following_id`) || [];
        const ids = follows.map(f => f.following_id);
        const profiles = ids.length
          ? (await q('profiles', `id=in.(${ids.join(',')})&select=*`) || [])
          : [];
        setFollowing(profiles);
        setFollowCards(profiles);
        setUnfollowedIds([]);
        setFollowingQuery('');
        setOpenFollowId(null);
        await loadFollowingMeta(profiles.map(u => u.id));
      } else if (activeTab === 'recs') {
        const rList = await q('recommendations', `to_id=eq.${currentUserId}&select=*&order=created_at.desc`) || [];
        if (rList.length) {
          const sids = [...new Set(rList.map(r => r.from_id))];
          const profiles = await q('profiles', `id=in.(${sids.join(',')})&select=*`) || [];
          const pm = {};
          profiles.forEach(p => { pm[p.id] = p; });
          setRecs(rList.map(r => ({ ...r, fromUser: pm[r.from_id] })));
        } else {
          setRecs([]);
        }
        onRefreshRecsCount?.();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Handle Find Users search
  useEffect(() => {
    if (!searchUserQuery.trim()) {
      setUserSearchResults([]);
      return;
    }
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        if (import.meta.env.DEV && session?.access_token === 'dev-preview') {
          const preview = await import('../../dev/previewData');
          const term = searchUserQuery.trim().toLowerCase();
          setUserSearchResults(
            preview.PREVIEW_FOLLOWING.filter(u => u.username.toLowerCase().includes(term))
          );
          return;
        }
        const term = encodeURIComponent(searchUserQuery.trim());
        const results = await q('profiles', `username=ilike.%25${term}%25&id=neq.${currentUserId}&select=*&limit=15`) || [];
        setUserSearchResults(results);
      } catch (e) {
        setUserSearchResults([]);
      }
    }, 300);
  }, [searchUserQuery, currentUserId, session?.access_token]);

  const handleToggleFollow = async (targetId, { keepCard = false } = {}) => {
    if (!currentUserId) return;
    const isFollowing = following.some(u => u.id === targetId);

    try {
      if (isFollowing) {
        if (!previewMode) {
          await del('follows', `follower_id=eq.${currentUserId}&following_id=eq.${targetId}`);
        }
        setFollowing(prev => prev.filter(u => u.id !== targetId));
        if (keepCard) {
          // Hark keeps the card visible (dimmed) so "Segui di nuovo" works
          // inline without leaving the tab.
          setUnfollowedIds(prev => (prev.includes(targetId) ? prev : [...prev, targetId]));
        } else {
          setFollowCards(prev => prev.filter(u => u.id !== targetId));
        }
        onToast?.('Non segui più questo utente');
      } else {
        if (!previewMode) {
          await ins('follows', { follower_id: currentUserId, following_id: targetId });
        }
        let targetProfile = followCards.find(u => u.id === targetId) || null;
        if (!targetProfile && previewMode) {
          const preview = await import('../../dev/previewData');
          targetProfile = preview.PREVIEW_FOLLOWING.find(u => u.id === targetId) || null;
        }
        if (!targetProfile && !previewMode) {
          targetProfile = (await q('profiles', `id=eq.${targetId}&select=*`))?.[0] || null;
        }
        if (targetProfile) {
          setFollowing(prev => (
            prev.some(u => u.id === targetId) ? prev : [...prev, targetProfile]
          ));
          setFollowCards(prev => (
            prev.some(u => u.id === targetId) ? prev : [...prev, targetProfile]
          ));
          await loadFollowingMeta([targetId], true);
        }
        setUnfollowedIds(prev => prev.filter(id => id !== targetId));
        onToast?.('Ora segui questo utente!');
      }
    } catch (err) {
      console.error(err);
      onToast?.('Errore follow: ' + err.message);
    }
  };

  const handleAddRecToLib = async (rec) => {
    if (recBusyRef.current) return;
    recBusyRef.current = true;
    setRecBusy({ id: rec.id, action: 'add' });
    try {
      const alreadyOwned = library.some(entry => entry.title === rec.manga_title);

      if (previewMode) {
        setRecs(prev => prev.filter(item => item.id !== rec.id));
        onToast?.(
          alreadyOwned
            ? `"${rec.manga_title}" è già nella tua libreria`
            : `"${rec.manga_title}" aggiunto alla tua libreria!`
        );
        return;
      }

      if (!alreadyOwned) {
        const mangaPreview = {
          title: rec.manga_title,
          images: { jpg: { image_url: rec.manga_cover } },
          genres: [{ name: 'Manga' }]
        };
        const created = await addMangaFromPreview(mangaPreview, currentUserId, library);
        onMangaAdded?.(created);
      }

      await del('recommendations', `id=eq.${rec.id}`);
      setRecs(prev => prev.filter(item => item.id !== rec.id));
      onToast?.(
        alreadyOwned
          ? `"${rec.manga_title}" è già nella tua libreria`
          : `"${rec.manga_title}" aggiunto alla tua libreria!`
      );
      onRefreshRecsCount?.();
    } catch (err) {
      onToast?.(err.message || 'Errore');
    } finally {
      recBusyRef.current = false;
      setRecBusy(null);
    }
  };

  const handleDismissRec = async (id) => {
    if (recBusyRef.current) return;
    recBusyRef.current = true;
    setRecBusy({ id, action: 'ignore' });
    try {
      if (!previewMode) {
        await del('recommendations', `id=eq.${id}`);
      }
      setRecs(prev => prev.filter(rec => rec.id !== id));
      onToast?.('Consiglio rimosso');
      if (!previewMode) onRefreshRecsCount?.();
    } catch (err) {
      onToast?.('Errore rimozione');
    } finally {
      recBusyRef.current = false;
      setRecBusy(null);
    }
  };

  const refreshForYou = async () => {
    if (pageTurningRef.current || forYouLoadingRef.current) return;
    pageTurningRef.current = true;
    setPageTurning(true);
    setForYouLabel('nuova pagina…');

    const currentIndex = forYouIndexRef.current;
    const nextIndex = currentIndex >= FOR_YOU_PAGES - 1 ? 0 : currentIndex + 1;
    const requestId = ++forYouRequestRef.current;
    let nextDeck = forYouDecksRef.current[nextIndex];
    let refreshError = '';

    // Fetch before starting the page turn so the reader keeps looking at the
    // current cards instead of a half-closed, empty deck while the API answers.
    if (!nextDeck?.length) {
      try {
        const candidates = await loadForYouCandidates(nextIndex);
        nextDeck = unusedForYouCandidates(candidates, nextIndex)
          .slice(0, FOR_YOU_PAGE_SIZE);
      } catch (err) {
        console.warn('For You refresh failed:', err);
        refreshError = 'Impossibile aggiornare i consigli';
      }
    }

    if (!mountedRef.current || requestId !== forYouRequestRef.current) {
      pageTurningRef.current = false;
      if (mountedRef.current) setPageTurning(false);
      return;
    }

    if (refreshError || !nextDeck?.length) {
      const message = refreshError || 'Nessun nuovo manga disponibile';
      setForYouError(message);
      setForYouLabel('↺ Riprova');
      onToast?.(message);
      pageTurningRef.current = false;
      setPageTurning(false);
      return;
    }

    // We have a deck: flip the book closed, swap the cards, then open it again.
    const bookmark = s1bmRef.current;
    const deck = f3Ref.current;
    const shading = s1shRef.current;

    if (bookmark) {
      bookmark.classList.remove('pr');
      void bookmark.offsetWidth;
      bookmark.classList.add('pr');
      setTimeout(() => bookmark.classList.remove('pr'), 250);
    }
    if (shading) shading.style.opacity = 1;
    if (deck) {
      deck.style.transition = 'transform .38s cubic-bezier(.6,0,.9,.6)';
      deck.style.transform = 'rotateY(-90deg)';
    }

    await sleep(390);
    if (!mountedRef.current || requestId !== forYouRequestRef.current) {
      pageTurningRef.current = false;
      if (mountedRef.current) setPageTurning(false);
      return;
    }

    if (nextDeck !== forYouDecksRef.current[nextIndex]) {
      storeForYouDeck(nextIndex, nextDeck);
    }
    forYouIndexRef.current = nextIndex;
    setForYouIndex(nextIndex);
    setForYouError('');

    if (deck) {
      deck.style.transition = 'none';
      deck.style.transformOrigin = 'right center';
      deck.style.transform = 'rotateY(90deg)';
      void deck.offsetWidth;
      deck.style.transition = 'transform .5s cubic-bezier(.2,1.2,.4,1)';
      deck.style.transform = '';
    }
    if (shading) shading.style.opacity = 0;

    await sleep(520);
    if (!mountedRef.current) {
      pageTurningRef.current = false;
      return;
    }

    if (deck) {
      deck.style.transformOrigin = '';
      deck.style.transition = '';
    }
    setForYouLabel('aggiornato ora');
    pageTurningRef.current = false;
    setPageTurning(false);
  };

  const isActivityFavourite = (activity) => {
    const title = activity.manga_title;
    if (favOverrides[title] !== undefined) return favOverrides[title];
    const entry = library.find(m => m.title === title);
    return Boolean(entry?.favourite);
  };

  const handleToggleFavourite = async (activity) => {
    const title = activity.manga_title;
    const entry = library.find(m => m.title === title);
    const current = isActivityFavourite(activity);
    const next = !current;

    setFavOverrides(prev => ({ ...prev, [title]: next }));

    // The dev preview has no real session/storage; keep the optimistic state so
    // the shell can be reviewed, but never hit Supabase with the fake user.
    if (import.meta.env.DEV && session?.access_token === 'dev-preview') {
      onToast?.(next ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
      return;
    }

    try {
      if (entry) {
        await upd('library', `id=eq.${entry.id}`, { favourite: next });
        onMangaSaved?.({ ...entry, favourite: next });
      } else {
        const created = await addMangaFromPreview(
          {
            title,
            images: { jpg: { image_url: activity.manga_cover } },
            genres: [{ name: 'Manga' }]
          },
          currentUserId,
          library
        );
        await upd('library', `id=eq.${created.id}`, { favourite: true });
        onMangaAdded?.({ ...created, favourite: true });
      }
      onToast?.(next ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
    } catch (err) {
      setFavOverrides(prev => ({ ...prev, [title]: current }));
      onToast?.('Errore: ' + err.message);
    }
  };

  const openUserLibrary = async profileOrId => {
    const target = typeof profileOrId === 'string'
      ? following.find(item => item.id === profileOrId) || { id: profileOrId, username: 'lettore' }
      : profileOrId;

    setLibraryUser(target);
    setUserLibrary([]);
    setUserLibTab('all');
    setUserLibOpen(true);
    setUserLibLoading(true);

    try {
      if (import.meta.env.DEV && session?.access_token === 'dev-preview') {
        const preview = await import('../../dev/previewData');
        setUserLibrary(preview.PREVIEW_USER_LIBRARIES?.[target.id] || []);
      } else {
        const list = await q('library', `user_id=eq.${target.id}&select=*&order=created_at.desc`) || [];
        setUserLibrary(list);
      }
    } catch (err) {
      console.error(err);
      setUserLibrary([]);
    } finally {
      setUserLibLoading(false);
    }
  };

  const closeUserLibrary = () => setUserLibOpen(false);

  const userLibraryTabs = [
    { key: 'all', label: 'Tutti', status: null },
    { key: 'read', label: 'In lettura', status: 'In lettura' },
    { key: 'done', label: 'Completati', status: 'Completati' },
    { key: 'plan', label: 'Da leggere', status: 'Da leggere' },
    { key: 'pause', label: 'In pausa', status: 'In pausa' },
  ];
  const activeUserLibraryTab = userLibraryTabs.find(item => item.key === userLibTab) || userLibraryTabs[0];
  const visibleUserLibrary = activeUserLibraryTab.status
    ? userLibrary.filter(entry => entry.status === activeUserLibraryTab.status)
    : userLibrary;
  const userLibraryChapters = userLibrary.reduce(
    (total, entry) => total + (Number(entry.total_chapters || entry.chapters) || 0),
    0
  );
  const ratedUserLibrary = userLibrary.filter(entry => Number(entry.score) > 0);
  const userLibraryAverage = ratedUserLibrary.length
    ? (ratedUserLibrary.reduce((total, entry) => total + Number(entry.score), 0) / ratedUserLibrary.length).toFixed(1)
    : '–';
  const ownTitles = new Set(library.map(entry => entry.title));
  const libraryUserIndex = following.findIndex(item => item.id === libraryUser?.id);
  const libraryVolume = String(Math.max(1, libraryUserIndex + 1)).padStart(2, '0');

  const unfollowedSet = new Set(unfollowedIds);
  const activeFollowCount = followCards.filter(u => !unfollowedSet.has(u.id)).length;
  const followTerm = followingQuery.trim().toLowerCase();
  const visibleFollowCards = followTerm
    ? followCards.filter(u => String(u.username || '').toLowerCase().includes(followTerm))
    : followCards;

  const libraryOverlay = (
    <div className={`ul2 ${userLibOpen ? 'open' : ''}`} id="ul2" aria-hidden={!userLibOpen}>
      <div className="top">
        <span className="bk" id="ul2b" onClick={closeUserLibrary}>← Indietro</span>
      </div>
      <div className="scroll" id="ul2s">
        {libraryUser && (
          <>
            <div
              className="l2h"
              style={{
                '--c': libraryUser.avatar_color || 'var(--red)',
                '--k': 'var(--ink)',
              }}
            >
              <div className="sp">MANGATRACK · {libraryVolume}</div>
              <div className="c">
                <Avatar
                  className="av"
                  src={libraryUser.avatar_url}
                  name={libraryUser.username}
                  color={libraryUser.avatar_color || 'var(--red)'}
                  textColor="var(--ink)"
                  alt=""
                />
                <div className="D">
                  LA LIBRERIA DI<b className="notr">@{libraryUser.username}</b>
                </div>
                <div className="vol">VOL. {libraryVolume}</div>
              </div>
            </div>

            <div className="l2s">
              <div><b>{userLibrary.length}</b>manga</div>
              <div><b>{userLibraryChapters}</b>capitoli</div>
              <div><b style={{ color: 'var(--amber)' }}>{userLibraryAverage}</b>voto medio</div>
            </div>

            <div className="l2t">
              {userLibraryTabs.map(item => (
                <span
                  key={item.key}
                  className={userLibTab === item.key ? 'on' : ''}
                  onClick={() => setUserLibTab(item.key)}
                >
                  {item.label}
                </span>
              ))}
            </div>

            <div className="l2g">
              {userLibLoading ? (
                <div className="l2e">Caricamento…</div>
              ) : visibleUserLibrary.length ? (
                visibleUserLibrary.map((entry, index) => (
                  <div
                    key={entry.id || `${entry.title}-${index}`}
                    className="it"
                    style={{ animationDelay: `${index * 45}ms` }}
                    onClick={() => onOpenPreview?.({
                      title: entry.title,
                      images: { jpg: { image_url: entry.cover } },
                      genres: entry.genre ? [{ name: entry.genre }] : [],
                      chapters: entry.total_chapters,
                      volumes: entry.total_volumes,
                      score: entry.score || null,
                    })}
                  >
                    <img src={entry.cover || ''} alt="" />
                    {Number(entry.score) > 0 && <span className="s">★{entry.score}</span>}
                    {ownTitles.has(entry.title) && <span className="cm">ANCHE TU</span>}
                    <div className="t notr">{entry.title}</div>
                  </div>
                ))
              ) : (
                <div className="l2e">Nessun manga qui.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const portalTarget = typeof document !== 'undefined' ? document.querySelector('.phone') : null;

  return (
    <>
    <section className={`view ${isActive ? 'on' : ''}`} data-v="social">
      <h2 className="title"><span>Social</span></h2>

      {/* SUBTABS WITH SLIDING INDICATOR */}
      <div className="stab" id="stab" ref={stabRef}>
        <div className="ind" />
        <div className={`o ${tab === 'feed' ? 'on' : ''}`} onClick={() => setTab('feed')}>
          Feed
        </div>
        <div className={`o ${tab === 'foryou' ? 'on' : ''}`} onClick={() => setTab('foryou')}>
          Per te
        </div>
        <div className={`o ${tab === 'following' ? 'on' : ''}`} onClick={() => setTab('following')}>
          Seguiti
        </div>
        <div className={`o ${tab === 'find' ? 'on' : ''}`} onClick={() => setTab('find')}>
          Cerca
        </div>
        <div className={`o ${recs.length > 0 ? 'dot' : ''} ${tab === 'recs' ? 'on' : ''}`} onClick={() => setTab('recs')}>
          Consigli
        </div>
      </div>

      {/* 1. FEED SUBPANEL */}
      <div className={`sp ${tab === 'feed' ? 'on' : ''}`} data-p="feed">
        {/* Following avatars horizontal reel */}
        <div className="people">
          {following.map(u => (
            <div key={u.id} className="p press" onClick={() => openUserLibrary(u)}>
              <Avatar
                className="ar"
                src={u.avatar_url}
                name={u.username}
                color={u.avatar_color || 'var(--red)'}
                alt=""
              />
              {u.username}
            </div>
          ))}
          <div className="p add press" onClick={() => setTab('find')}>
            <div className="ar">+</div>
            Trova amici
          </div>
        </div>

        {/* Activity feed list */}
        {feed.length === 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
            Nessuna attività recente.<br />
            Segui altri lettori nella tab <strong>Cerca</strong>!
          </div>
        ) : (
          feedGroups.map(a => {
            const u = a.user || {};
            const multi = a.items.length > 1;
            return (
              <div key={a.id} className="feedg">
                <div className="hd">
                  <Avatar
                    className="hdav"
                    src={u.avatar_url}
                    name={u.username}
                    color={u.avatar_color || 'var(--red)'}
                    alt=""
                    onClick={() => openUserLibrary(u)}
                  />
                  <div className="w">
                    <b onClick={() => openUserLibrary(u)}>@{u.username || 'lettore'}</b>{' '}
                    {a.type === 'added' ? 'ha aggiunto' : a.type === 'completed' ? 'ha completato' : 'ha aggiornato'}{' '}
                    <em>{multi ? `${a.items.length} manga` : a.manga_title}</em>
                  </div>
                  <div className="tm">
                    {a.details || ''}
                  </div>
                </div>

                {multi ? (
                  <FeedDeck
                    items={a.items}
                    library={library}
                    onOpenPreview={onOpenPreview}
                    onMangaAdded={onMangaAdded}
                    onToast={onToast}
                  />
                ) : (
                  <div className="single">
                    <img
                      src={a.manga_cover || ''}
                      alt=""
                      onClick={() => onOpenPreview?.({ title: a.manga_title, cover: a.manga_cover })}
                    />
                    <div>
                      <div className="t">{a.manga_title}</div>
                      <div className="acts2">
                        <button
                          type="button"
                          onClick={() => onOpenPreview?.({ title: a.manga_title, cover: a.manga_cover })}
                        >
                          + In libreria
                        </button>
                        <button
                          type="button"
                          className={`hb ${isActivityFavourite(a) ? 'on' : ''}`}
                          aria-label="Preferito"
                          aria-pressed={isActivityFavourite(a)}
                          onClick={() => handleToggleFavourite(a)}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M12 20.5c-.4 0-7.9-4.7-9.5-9.6C1.3 7.4 3.4 4 6.9 4c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3 3.5 0 5.6 3.4 4.4 6.9-1.6 4.9-9.1 9.6-9.5 9.6z" />
                          </svg>
                          <i />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 2. PER TE SUBPANEL (V46 S1 BOOKMARK PAGE TURN) */}
      <div className={`sp ${tab === 'foryou' ? 'on' : ''}`} data-p="perte">
        {(() => {
          const curator = following[0] || null;
          return (
            <>
              <div className="f3h">
                <div
                  className="who"
                  onClick={() => curator && openUserLibrary(curator)}
                  style={{ cursor: curator ? 'pointer' : 'default' }}
                >
                  {curator && (
                    <i>
                      <Avatar
                        src={curator.avatar_url}
                        name={curator.username}
                        color={curator.avatar_color || 'var(--red)'}
                        alt=""
                      />
                    </i>
                  )}
                  <span>
                    {curator ? <>Scelti da <b>@{curator.username}</b></> : 'Scelti per te'}
                  </span>
                </div>
                <small className="pr1t" id="pr1t">{forYouLabel}</small>
              </div>

              <div className="pr1w s1w">
                <div className="s1sh" id="s1sh" ref={s1shRef} />
                <button
                  type="button"
                  className="s1bm"
                  id="s1bm"
                  ref={s1bmRef}
                  aria-label="Nuovi manga"
                  disabled={pageTurning || forYouLoading}
                  onClick={refreshForYou}
                >
                  NUOVI
                </button>
                <div
                  className="f3"
                  id="f3"
                  ref={f3Ref}
                  data-count={forYouList.length}
                  aria-busy={forYouLoading || pageTurning}
                >
                  {forYouList.length === 0 ? (
                    <div className="deck-state">
                      {forYouLoading || !forYouError ? (
                        'Caricamento…'
                      ) : (
                        <>
                          {forYouError}
                          <button
                            type="button"
                            onClick={ensureForYou}
                            disabled={forYouLoading}
                          >
                            ↺ Riprova
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    forYouList.map((m, idx) => {
                      const letter = ['a', 'b', 'c', 'd', 'e', 'f'][idx] || 'a';
                      const title = mangaTitle(m) || 'Manga';
                      const numericScore = Number(m.score);
                      const score = numericScore > 0 ? `★${Math.round(numericScore)}` : null;

                      return (
                        <div
                          key={`${forYouIndex}-${title}-${idx}`}
                          className={`p ${letter}`}
                          data-info={title}
                          onClick={() => onOpenPreview?.(m)}
                        >
                          <img src={m.images?.jpg?.image_url || m.cover || ''} alt="" />
                          <div className="lb">
                            {title}
                            {score && <span className="sc">{score}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* 3. SEGUITI SUBPANEL (HARK SGR READER CARDS) */}
      <div className={`sp ${tab === 'following' ? 'on' : ''}`} data-p="seguiti">
        <div className="cnt-h">
          Segui <span>{activeFollowCount}</span> lettori
        </div>

        <div className="sg1s">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            placeholder="Cerca tra i seguiti…"
            value={followingQuery}
            onChange={event => setFollowingQuery(event.target.value)}
          />
        </div>

        <div className="sg1" id="b3">
          {visibleFollowCards.map((u, index) => {
            const meta = followingMeta[u.id] || { count: 0, reading: null };
            const off = unfollowedSet.has(u.id);
            return (
              <div
                key={u.id}
                className={`ts ${off ? 'off' : ''} ${openFollowId === u.id ? 'on' : ''}`}
                data-n={String(u.username || '').toLowerCase()}
                style={{
                  '--c': u.avatar_color || 'var(--red)',
                  '--f': 'var(--ink)',
                  animationDelay: `${index * 60}ms`,
                }}
                onClick={() => setOpenFollowId(prev => (prev === u.id ? null : u.id))}
              >
                <div className="tt">
                  <span className="av">
                    <Avatar
                      src={u.avatar_url}
                      name={u.username}
                      color="var(--bg)"
                      textColor="var(--ink)"
                      alt=""
                    />
                  </span>
                  <div className="nm">
                    @{u.username}
                    <small>{meta.count} manga</small>
                  </div>
                  <span className="no">N.{String(index + 1).padStart(2, '0')}</span>
                </div>

                <div className="tb">
                  {meta.reading ? (
                    <div className="tr">
                      {meta.reading.cover ? (
                        <img className="cv" src={meta.reading.cover} alt="" />
                      ) : (
                        <span className="cv sg1-nocover" aria-hidden="true" />
                      )}
                      <div>
                        <div className="kk">STA LEGGENDO</div>
                        <div className="ttl notr">{meta.reading.title}</div>
                        <div className="ch">cap. {meta.reading.chapters}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="sg1-empty">Nessun manga in lettura.</div>
                  )}
                  <div className="bts">
                    <button
                      type="button"
                      className="v"
                      onClick={event => {
                        event.stopPropagation();
                        openUserLibrary(u);
                      }}
                    >
                      Vedi libreria
                    </button>
                    <button
                      type="button"
                      className="x"
                      onClick={event => {
                        event.stopPropagation();
                        handleToggleFollow(u.id, { keepCard: true });
                      }}
                    >
                      {off ? 'Segui di nuovo' : 'Smetti di seguire'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {followCards.length === 0 && (
            <div className="sg1-empty">Non segui ancora nessuno.</div>
          )}

          <div className="ad" onClick={() => setTab('find')}>
            + Trova altri lettori
          </div>
        </div>
      </div>

      {/* 4. CERCA SUBPANEL (FIND USERS) */}
      <div className={`sp ${tab === 'find' ? 'on' : ''}`} data-p="cerca">
        <div className="pnl usearch">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            placeholder="Cerca per username…"
            value={searchUserQuery}
            onChange={e => setSearchUserQuery(e.target.value)}
          />
        </div>

        {searchUserQuery ? (
          <div>
            {userSearchResults.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)' }}>
                Nessun utente trovato per "{searchUserQuery}"
              </div>
            ) : (
              userSearchResults.map(u => {
                const isF = following.some(f => f.id === u.id);
                return (
                  <div key={u.id} className="feedg" style={{ marginBottom: '8px' }}>
                    <div className="hd" style={{ alignItems: 'center' }}>
                      <Avatar
                        className="search-av"
                        src={u.avatar_url}
                        name={u.username}
                        color={u.avatar_color || 'var(--red)'}
                        alt=""
                      />
                      <div className="w">
                        <b>@{u.username}</b>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ height: '32px', fontSize: '11px', padding: '0 12px' }}
                        onClick={() => handleToggleFollow(u.id)}
                      >
                        {isF ? 'Smetti' : 'Segui'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="empty2">
            <div className="bb">Chi cerchi?</div>
            <svg width="150" height="60" viewBox="0 0 150 60" fill="none">
              <path d="M10 50 C 40 50, 50 15, 85 20 S 120 40, 130 18" stroke="#D91233" strokeWidth="2.5" strokeDasharray="7 7" strokeLinecap="round" />
              <circle cx="133" cy="14" r="8" stroke="#D91233" strokeWidth="2.5" strokeDasharray="4 4" />
            </svg>
            <p>Cerca un utente per username</p>
          </div>
        )}
      </div>

      {/* 5. CONSIGLI SUBPANEL */}
      <div className={`sp ${tab === 'recs' ? 'on' : ''}`} data-p="consigli">
        <div className="c4" id="c4">
          {recs.map(r => (
            <div key={r.id} className="it">
              <div className="cv">
                {r.manga_cover ? (
                  <img src={r.manga_cover} alt="" />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'var(--card2)' }} />
                )}
              </div>
              <div className="pn">
                <div className="t">{r.manga_title}</div>
                {r.message && <div className="q">“{r.message}”</div>}
                <div className="w">— @{r.fromUser?.username || 'amico'}</div>
                <div className="bt">
                  <button
                    type="button"
                    className="a"
                    disabled={Boolean(recBusy)}
                    aria-busy={recBusy?.id === r.id && recBusy.action === 'add'}
                    onClick={() => handleAddRecToLib(r)}
                  >
                    {recBusy?.id === r.id && recBusy.action === 'add'
                      ? 'Aggiungo…'
                      : '+ Aggiungi'}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(recBusy)}
                    aria-busy={recBusy?.id === r.id && recBusy.action === 'ignore'}
                    onClick={() => handleDismissRec(r.id)}
                  >
                    {recBusy?.id === r.id && recBusy.action === 'ignore'
                      ? 'Ignoro…'
                      : 'Ignora'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {recs.length === 0 && (
            <div className="c4empty" id="c4e" style={{ display: 'block' }}>
              Bacheca vuota! Nessun nuovo consiglio.
            </div>
          )}
        </div>
      </div>
    </section>
    {portalTarget ? createPortal(libraryOverlay, portalTarget) : libraryOverlay}
    </>
  );
}
