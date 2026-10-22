import React, { useState, useMemo, useEffect, useRef } from 'react';

const STATUS_MAP = {
  all: { label: 'Tutti', db: null, height: '100%', bg: 'var(--ink)', color: 'var(--bg)' },
  read: { label: 'Leggo', db: 'In lettura', height: '82%', bg: 'var(--red)', color: 'var(--ink)' },
  done: { label: 'Finiti', db: 'Completati', height: '92%', bg: 'var(--green)', color: 'var(--bg)' },
  pause: { label: 'Pausa', db: 'In pausa', height: '76%', bg: 'var(--amber)', color: 'var(--bg)' },
  drop: { label: 'Mollati', db: 'Abbandonati', height: '70%', bg: 'var(--card2)', color: 'var(--ink)' },
};

const SORTS = [
  ['A–Z', (a, b) => a.title.localeCompare(b.title)],
  ['Voto', (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)],
  ['Capitoli', (a, b) => (Number(b.chapters) || 0) - (Number(a.chapters) || 0)],
  ['Data', (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)],
];

const SL = {
  'In lettura': ['In lettura', 'b-read'],
  'Completati': ['Completato', 'b-done'],
  'In pausa': ['In pausa', 'b-pause'],
  'Abbandonati': ['Abbandonato', 'b-drop'],
  'Da leggere': ['Da leggere', 'b-read'],
};

export default function LibraryView({ isActive, library = [], loading = false, onSelectManga, onNavigate }) {
  const [statusKey, setStatusKey] = useState('all');
  const [genre, setGenre] = useState('all');
  const [search, setSearch] = useState('');
  const [sortI, setSortI] = useState(0);
  const [mode, setMode] = useState('grid'); // 'grid' | 'list'

  const shelfRef = useRef(null);

  // Animate the sliding indicator underneath active shelf spine
  useEffect(() => {
    if (!isActive || !shelfRef.current) return;
    const box = shelfRef.current;
    const on = box.querySelector('.o.on');
    const ind = box.querySelector('.ind');
    if (!on || !on.offsetWidth || !ind) return;
    ind.style.left = on.offsetLeft + 'px';
    ind.style.width = on.offsetWidth + 'px';
  }, [isActive, statusKey]);

  // Extract unique genres
  const genres = useMemo(() => {
    const set = new Set();
    library.forEach(m => {
      if (m.genre) set.add(m.genre);
    });
    return ['all', ...Array.from(set).sort()];
  }, [library]);

  // Counts per status
  const counts = useMemo(() => {
    const res = { all: library.length };
    Object.keys(STATUS_MAP).forEach(k => {
      if (k === 'all') return;
      res[k] = library.filter(m => m.status === STATUS_MAP[k].db).length;
    });
    return res;
  }, [library]);

  // Filter and sort
  const filteredList = useMemo(() => {
    const term = search.trim().toLowerCase();
    const targetDb = STATUS_MAP[statusKey]?.db;

    return library
      .filter(m => {
        const matchStatus = !targetDb || m.status === targetDb;
        const matchGenre = genre === 'all' || m.genre === genre;
        const matchSearch = !term || m.title.toLowerCase().includes(term);
        return matchStatus && matchGenre && matchSearch;
      })
      .sort(SORTS[sortI][1]);
  }, [library, statusKey, genre, search, sortI]);

  const toggleSort = () => {
    setSortI(prev => (prev + 1) % SORTS.length);
  };

  // v54 E4: with an empty library the chrome disappears and the empty state
  // takes over, exactly like the reference's `.libempty` view class.
  const isLibEmpty = !loading && library.length === 0;

  return (
    <section className={`view ${isActive ? 'on' : ''}${isLibEmpty ? ' libempty' : ''}`} data-v="lib">
      <div className="libtop">
        {/* Title and Grid/List toggle */}
        <div className="lt2">
          <div className="t">
            La tua <span>libreria</span>
          </div>
          <div className="vt" id="vt">
            <div
              className={mode === 'grid' ? 'on' : ''}
              data-m="grid"
              onClick={() => setMode('grid')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="2" />
                <rect x="13" y="3" width="8" height="8" rx="2" />
                <rect x="3" y="13" width="8" height="8" rx="2" />
                <rect x="13" y="13" width="8" height="8" rx="2" />
              </svg>
            </div>
            <div
              className={mode === 'list' ? 'on' : ''}
              data-m="list"
              onClick={() => setMode('list')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
              </svg>
            </div>
          </div>
        </div>

        {/* Comic Search Input */}
        <div className="srch2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="q"
            placeholder="Cerca nella libreria…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Comic Book Spines Shelf */}
        <div className="shelf" id="stseg" ref={shelfRef}>
          <div className="ind" />
          {Object.entries(STATUS_MAP).map(([key, info]) => {
            const active = statusKey === key;
            return (
              <div
                key={key}
                className={`o ${active ? 'on' : ''}`}
                data-s={key}
                style={{
                  height: info.height,
                  background: info.bg,
                  color: info.color
                }}
                onClick={() => setStatusKey(key)}
              >
                <span className="w">{info.label}</span>
                <b>{counts[key] || (key === 'all' ? 0 : '–')}</b>
              </div>
            );
          })}
        </div>

        {/* Genre Chips */}
        <div className="g2t" id="gtabs">
          {genres.map(g => (
            <div
              key={g}
              className={genre === g ? 'on' : ''}
              data-g={g}
              onClick={() => setGenre(g)}
            >
              {g === 'all' ? 'Tutti' : g}
            </div>
          ))}
        </div>

        {/* Sort and Count bar */}
        <div className="lbt">
          <div className="s" id="sortbtn" onClick={toggleSort}>
            Ordina per <b id="sortlbl">{SORTS[sortI][0]}</b> ▾
          </div>
          <span className="c" id="libcnt">
            {filteredList.length} manga
          </span>
        </div>
      </div>

      {/* Grid or List of Manga Tiles */}
      <div className={`grid ${mode === 'list' ? 'aslist' : ''}`} id="grid">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={`skeleton-${idx}`}>
              <div className="skt cvk" />
              <div className="skt l1" />
              <div className="skt l2" />
            </div>
          ))
        ) : filteredList.length === 0 ? (
          <div className="e4w">
            <div className="e4">
              <div
                className="e4add"
                role="button"
                tabIndex={0}
                aria-label="Aggiungi manga"
                onClick={() => onNavigate?.('search')}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onNavigate?.('search');
                  }
                }}
              >
                +
              </div>
              <div />
              <div />
            </div>
            <div className="ttl">{library.length ? 'Nessun manga qui' : '0 manga'}</div>
            <p className="sub">
              {library.length
                ? 'Prova un altro filtro, o tocca + per aggiungerne uno.'
                : 'Tocca il + per aggiungere il primo.'}
            </p>
          </div>
        ) : (
          filteredList.map((m, idx) => {
            const chapters = Number(m.chapters) || 0;
            const totalChapters = Number(m.total_chapters) || 0;
            const pct = totalChapters ? Math.min(100, Math.round((chapters / totalChapters) * 100)) : null;
            const prog = chapters
              ? (totalChapters ? `${chapters} / ${totalChapters} cap.` : `${chapters} cap.`)
              : '';

            const badgeInfo = SL[m.status] || ['Da leggere', 'b-read'];
            const badgeLabel = badgeInfo[0];
            const badgeClass = badgeInfo[1];

            return (
              <div
                key={m.id || idx}
                className="tile press"
                style={{ animationDelay: `${idx * 45}ms` }}
                onClick={() => onSelectManga?.(m)}
              >
                <div className="cv">
                  <img src={m.cover || ''} alt="" />
                  <span className={`badge ${badgeClass} tb2`}>{badgeLabel}</span>
                  {Number(m.score) > 0 && <span className="rt">★ {m.score}</span>}
                  <div className="bt">
                    {prog && <div className="p">{prog}</div>}
                    {pct !== null && (
                      <div className="trail">
                        <div
                          className="fill"
                          style={{ width: `calc(${pct}% - ${pct >= 100 ? 7 : 0}px)` }}
                        />
                        <div
                          className="pin"
                          style={{
                            left: `calc(${pct}% - ${pct >= 100 ? 7 : 0}px)`,
                            ...(pct >= 100 ? { background: 'var(--red)', borderStyle: 'solid' } : {})
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">{m.title}</div>
                  <div className="g">
                    {mode === 'list' && (
                      <span className={`badge ${badgeClass}`} style={{ margin: '6px 0 4px', display: 'inline-block' }}>
                        {badgeLabel}
                      </span>
                    )}
                    {mode === 'list' && <br />}
                    {m.genre || 'Manga'}
                    {mode === 'list' && prog ? ` · ${prog}` : ''}
                    {mode === 'list' && Number(m.score) > 0 ? (
                      <> · <span className="star">★ {m.score}</span></>
                    ) : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
