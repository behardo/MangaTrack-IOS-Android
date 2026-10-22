import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { searchManga, fetchTrendingManga } from '../../api/manga';
import { addMangaFromPreview, deleteMangaFromLibrary } from '../../api/library';
import { upd } from '../../api/supabase';

const RECENT_SEARCHES_KEY = 'mt_searches';
const SHELVES = [
  { key: 'read', label: 'In lettura', db: 'In lettura' },
  { key: 'plan', label: 'Da leggere', db: 'Da leggere' },
];
const RECENT_SEARCH_LIMIT = 5;

/* Recent searches used to be a plain array of strings. Newer entries also keep
   the cover of the first result, how many results were found and when the
   search happened, so Hark's `.rr3` rows can show the same metadata. Old
   payloads keep working and get upgraded on the next search. */
function normalizeRecentSearch(entry) {
  if (typeof entry === 'string') {
    const term = entry.trim();
    return term ? { q: term, cover: '', count: 0, at: 0 } : null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const term = String(entry.q || entry.query || '').trim();
  if (!term) return null;
  return {
    q: term,
    cover: typeof entry.cover === 'string' ? entry.cover : '',
    count: Number(entry.count) || 0,
    at: Number(entry.at) || 0,
  };
}

function readRecentSearches() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .map(normalizeRecentSearch)
      .filter(Boolean)
      .slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

/* "2g fa" is translated to "2d ago" by the shared APP_PATTERNS table. */
function relativeSearchTime(at) {
  if (!at) return '';
  const day = 86400000;
  const diff = Date.now() - at;
  if (diff < day) return 'oggi';
  const days = Math.floor(diff / day);
  return days === 1 ? 'ieri' : `${days}g fa`;
}

/**
 * T4 — trending card that turns over after the "+" tap and asks which shelf
 * the title belongs to. The animation mirrors Hark; the chosen shelf is saved
 * through the real library API so the control is not decorative.
 */
function TrendCard({ manga, idx, library, onOpenPreview, onMangaAdded, onMangaSaved, onMangaDeleted, onToast }) {
  const { session, user } = useAuth();
  const previewMode = import.meta.env.DEV && session?.access_token === 'dev-preview';

  const title = manga.title_english || manga.title;
  const image = manga.images?.jpg?.image_url || manga.cover || '';
  const genres = (manga.genres || [])
    .slice(0, 2)
    .map(genre => (typeof genre === 'string' ? genre : genre.name))
    .join(', ');

  const existing = library.find(entry => entry.title === title);
  const [flipped, setFlipped] = useState(false);
  const [settled, setSettled] = useState(false);
  const [shelf, setShelf] = useState('read');
  const [added, setAdded] = useState(null);
  const [busy, setBusy] = useState(false);
  const undoAfterAdd = useRef(false);
  const flipBackTimer = useRef(null);
  const shelfLabel = SHELVES.find(option => option.key === shelf)?.label || SHELVES[0].label;

  const alreadyInLibrary = Boolean(existing) || Boolean(added);

  const clearFlipBack = () => {
    if (flipBackTimer.current) {
      clearTimeout(flipBackTimer.current);
      flipBackTimer.current = null;
    }
  };

  // After a successful add the back face has done its job. Return to the front
  // so the card never stays stuck flipped; the arrow stays usable in the short
  // window before this fires, and the front check opens the full preview.
  const queueFlipBack = () => {
    clearFlipBack();
    flipBackTimer.current = setTimeout(() => {
      flipBackTimer.current = null;
      setFlipped(false);
    }, 1100);
  };

  // Once the 3D flip has finished, drop the transforms entirely. Safari can
  // route taps on a transformed back face to the hidden front card, so the
  // settled back face is a plain 2D layer with normal hit-testing.
  useEffect(() => {
    if (!flipped) {
      setSettled(false);
      return undefined;
    }
    const id = setTimeout(() => setSettled(true), 720);
    return () => clearTimeout(id);
  }, [flipped]);

  useEffect(() => () => {
    if (flipBackTimer.current) clearTimeout(flipBackTimer.current);
  }, []);

  const handleFrontAdd = event => {
    event.stopPropagation();
    clearFlipBack();
    if (alreadyInLibrary) {
      onOpenPreview?.(manga);
      return;
    }
    setFlipped(true);
  };

  const handleShelf = async (nextShelf, event) => {
    event.stopPropagation();
    setShelf(nextShelf.key);
    if (busy) return;
    clearFlipBack();

    const dbStatus = nextShelf.db;

    // A second tap on the back simply moves the freshly-added title between
    // shelves; it must not create a duplicate library row.
    if (added) {
      setBusy(true);
      try {
        if (!previewMode) {
          await upd('library', `id=eq.${added.id}`, { status: dbStatus });
        }
        const updated = { ...added, status: dbStatus };
        setAdded(updated);
        onMangaSaved?.(updated);
        onToast?.(
          dbStatus === 'In lettura'
            ? 'Aggiunto ai manga in lettura'
            : 'Aggiunto ai manga da leggere'
        );
        queueFlipBack();
      } catch (err) {
        onToast?.('Errore: ' + err.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!previewMode && !user?.id) {
      onToast?.('Effettua l\'accesso per aggiungere manga');
      return;
    }

    setBusy(true);
    try {
      let created;
      if (previewMode) {
        created = {
          id: `preview-search-${title}-${Date.now()}`,
          title,
          status: dbStatus,
          chapters: 0,
          total_chapters: manga.chapters || null,
          volumes: 0,
          total_volumes: manga.volumes || null,
          score: 0,
          genre: genres.split(',')[0] || 'Manga',
          cover: image,
          favourite: false,
          created_at: new Date().toISOString(),
        };
      } else {
        created = await addMangaFromPreview(manga, user.id, library, {
          status: dbStatus,
          onTotals: updated => onMangaSaved?.(updated),
        });
      }
      setAdded(created);
      undoAfterAdd.current = true;
      onMangaAdded?.(created);
      onToast?.(`"${title}" aggiunto alla libreria!`);
      queueFlipBack();
    } catch (err) {
      onToast?.(err.message || 'Errore nell\'aggiunta');
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async event => {
    event.stopPropagation();
    clearFlipBack();
    if (busy) return;
    if (added && undoAfterAdd.current) {
      setBusy(true);
      try {
        if (!previewMode) await deleteMangaFromLibrary(added.id);
        onMangaDeleted?.(added.id);
        onToast?.('Aggiunta annullata');
      } catch (err) {
        onToast?.('Errore: ' + err.message);
      } finally {
        setBusy(false);
      }
    }
    undoAfterAdd.current = false;
    setAdded(null);
    setShelf('read');
    setFlipped(false);
  };

  return (
    <div className={`fl4 ${flipped ? 'on' : ''} ${settled && flipped ? 'settled' : ''}`}>
      <div className="in4">
        <div
          className="card trend"
          onClick={() => onOpenPreview?.(manga)}
          style={{ cursor: 'pointer' }}
          aria-hidden={flipped}
        >
          <div className="rank">{idx + 1}</div>
          {image ? (
            <img src={image} alt={title} className="cover" />
          ) : (
            <div className="cover" style={{ display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', color: 'var(--red)' }}>
              {title.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="meta">
            <div className="t">{title}</div>
            <div className="g">{genres}{manga.chapters ? ` · ${manga.chapters} cap.` : ''}</div>
            {manga.score && <span className="star">★ {manga.score}</span>}
          </div>
          <div
            className="add"
            title={alreadyInLibrary ? 'Già in libreria' : 'Aggiungi'}
            onClick={handleFrontAdd}
            role="button"
            tabIndex={flipped ? -1 : 0}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleFrontAdd(event);
              }
            }}
          >
            {alreadyInLibrary ? '✓' : '+'}
          </div>
        </div>

        <div
          className="bk4"
          onClick={event => event.stopPropagation()}
          aria-hidden={!flipped}
          aria-busy={busy}
        >
          {image ? <img src={image} alt="" /> : null}
          <div>
            <div className="D">{busy ? 'Aggiungo…' : added ? 'Aggiunto!' : 'Scegli!'}</div>
            <small>{busy ? 'un attimo…' : added ? shelfLabel : 'in quale scaffale?'}</small>
          </div>
          <div className="ch4">
            {SHELVES.map(option => (
              <button
                key={option.key}
                type="button"
                className={shelf === option.key ? 'on' : ''}
                onClick={event => handleShelf(option, event)}
                disabled={busy}
                tabIndex={flipped ? 0 : -1}
                aria-pressed={shelf === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="un4"
            aria-label="Annulla"
            title="Annulla"
            onClick={handleUndo}
            disabled={busy}
            tabIndex={flipped ? 0 : -1}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h9a6 6 0 0 1 0 12h-1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SearchView({
  isActive,
  library = [],
  onOpenPreview,
  onMangaAdded,
  onMangaSaved,
  onMangaDeleted,
  onToast,
}) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [trending, setTrending] = useState([]);
  const [trendingError, setTrendingError] = useState('');
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [recent, setRecent] = useState([]);
  const [removingRecent, setRemovingRecent] = useState([]);
  const searchTimeoutRef = useRef(null);
  const searchSeqRef = useRef(0);
  const trendingSeqRef = useRef(0);
  const trendingLoadedRef = useRef(false);
  const trendingLoadingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    setRecent(readRecentSearches());
  }, []);

  useEffect(() => {
    if (isActive && !trendingLoadedRef.current) loadTrending();
  }, [isActive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  async function loadTrending() {
    if (trendingLoadingRef.current) return;
    trendingLoadingRef.current = true;
    setLoadingTrending(true);
    setTrendingError('');
    const requestId = ++trendingSeqRef.current;

    try {
      const data = await fetchTrendingManga();
      if (!mountedRef.current || requestId !== trendingSeqRef.current) return;
      setTrending(data);
      trendingLoadedRef.current = data.length > 0;
    } catch (e) {
      if (!mountedRef.current || requestId !== trendingSeqRef.current) return;
      console.warn('Trending load error:', e);
      trendingLoadedRef.current = false;
      setTrendingError('Impossibile caricare i trending.');
    } finally {
      if (requestId === trendingSeqRef.current) {
        trendingLoadingRef.current = false;
        if (mountedRef.current) setLoadingTrending(false);
      }
    }
  }

  function handleQueryChange(val) {
    setQuery(val);
    setSearchError('');
    clearTimeout(searchTimeoutRef.current);
    const requestId = ++searchSeqRef.current;

    if (!val.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const term = val.trim();
      try {
        const results = await searchManga(term);
        if (!mountedRef.current || requestId !== searchSeqRef.current) return;
        setSearchResults(results);
        setSearchError('');
        const cover = results[0]?.images?.jpg?.image_url || results[0]?.cover || '';
        saveRecentSearch(term, { cover, count: results.length });
      } catch (e) {
        if (!mountedRef.current || requestId !== searchSeqRef.current) return;
        console.warn('Manga search failed:', e);
        setSearchResults([]);
        setSearchError('Impossibile cercare su AniList.');
      } finally {
        if (requestId === searchSeqRef.current && mountedRef.current) setSearching(false);
      }
    }, 450);
  }

  function saveRecentSearch(text, meta = {}) {
    const term = String(text || '').trim();
    if (!term) return;
    try {
      const entry = {
        q: term,
        cover: meta.cover || '',
        count: Number(meta.count) || 0,
        at: Date.now(),
      };
      const list = readRecentSearches().filter(
        item => item.q.toLowerCase() !== term.toLowerCase()
      );
      const updated = [entry, ...list].slice(0, RECENT_SEARCH_LIMIT);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      setRecent(updated);
    } catch {}
  }

  function removeRecent(term) {
    if (!term || removingRecent.includes(term)) return;
    setRemovingRecent(prev => [...prev, term]);
    // Let the row collapse exactly like the reference before dropping it.
    setTimeout(() => {
      try {
        const list = readRecentSearches().filter(item => item.q !== term);
        if (list.length) {
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
        } else {
          localStorage.removeItem(RECENT_SEARCHES_KEY);
        }
        setRecent(list);
      } catch {}
      setRemovingRecent(prev => prev.filter(item => item !== term));
    }, 320);
  }

  function clearRecent() {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecent([]);
      setRemovingRecent([]);
    } catch {}
  }

  const renderCard = (m, idx) => (
    <TrendCard
      key={(m.title_english || m.title) + idx}
      manga={m}
      idx={idx}
      library={library}
      onOpenPreview={onOpenPreview}
      onMangaAdded={onMangaAdded}
      onMangaSaved={onMangaSaved}
      onMangaDeleted={onMangaDeleted}
      onToast={onToast}
    />
  );

  return (
    <section className={`view ${isActive ? 'on' : ''}`} data-v="search">
      <h2 className="title">
        Cerca <span>online</span>
      </h2>

      {/* Comic Search Input */}
      <div className="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="q2"
          placeholder="Cerca su AniList…"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="search-clr"
            aria-label="Cancella ricerca"
            onClick={() => handleQueryChange('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* Recent Searches — Hark `.rr3` list */}
      {!query && (
        <div className={`rr3 ${recent.length === 0 ? 'none' : ''}`}>
          <div className="rr3h">
            <div className="sec">Ricerche recenti</div>
            <button type="button" className="rr3clr" onClick={clearRecent}>
              Cancella
            </button>
          </div>
          <div className="rr3l">
            {recent.map(item => {
              const when = relativeSearchTime(item.at);
              return (
                <div
                  key={item.q}
                  className={`rr3it ${removingRecent.includes(item.q) ? 'gone' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleQueryChange(item.q)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleQueryChange(item.q);
                    }
                  }}
                >
                  {item.cover ? (
                    <img className="rr3c" src={item.cover} alt="" />
                  ) : (
                    <span className="rr3c rr3c-ph" aria-hidden="true">?</span>
                  )}
                  <div className="rr3t">
                    <b className="notr">{item.q}</b>
                    <small>
                      <svg className="rri" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      {when && <span>{when}</span>}
                      {when && item.count > 0 ? ' · ' : null}
                      {item.count > 0 && <span>{`${item.count} risultati`}</span>}
                    </small>
                  </div>
                  <span
                    className="rr3f"
                    aria-label="Usa"
                    onClick={event => {
                      event.stopPropagation();
                      handleQueryChange(item.q);
                    }}
                  >
                    <svg className="rri" viewBox="0 0 24 24">
                      <path d="M17 17L7 7M7 15V7h8" />
                    </svg>
                  </span>
                  <span
                    className="rr3x"
                    aria-label="Rimuovi"
                    role="button"
                    tabIndex={0}
                    onClick={event => {
                      event.stopPropagation();
                      removeRecent(item.q);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        removeRecent(item.q);
                      }
                    }}
                  >
                    ✕
                  </span>
                </div>
              );
            })}
          </div>
          <div className="rr3e">Nessuna ricerca recente.</div>
          <div className="rr3src">
            Fonte <span><i />AniList · live</span>
          </div>
        </div>
      )}

      {/* Search Results or Trending */}
      {query ? (
        <div>
          <div className="sec">Risultati per "{query}"</div>
          {searching ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
              🔍 Ricerca in corso su AniList...
            </div>
          ) : searchError ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
              {searchError}<br />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '10px' }}
                onClick={() => handleQueryChange(query)}
              >
                ↺ Riprova
              </button>
            </div>
          ) : searchResults.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
              Nessun manga trovato per "{query}"
            </div>
          ) : (
            searchResults.map(renderCard)
          )}
        </div>
      ) : (
        <div>
          <div className="sec">Trending su AniList</div>
          {loadingTrending ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
              Caricamento trending...
            </div>
          ) : trending.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
              {trendingError || 'Nessun manga di tendenza.'}<br />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '10px' }}
                onClick={loadTrending}
              >
                ↺ Riprova
              </button>
            </div>
          ) : (
            trending.map(renderCard)
          )}
        </div>
      )}
    </section>
  );
}
