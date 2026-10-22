import React, { useEffect, useRef } from 'react';

export default function HomeView({ isActive, library = [], username, onSelectManga, onNavigate }) {
  const totManga = library.length;
  const totChapters = library.reduce((acc, m) => acc + (parseInt(m.chapters, 10) || 0), 0);
  const scored = library.filter(m => Number(m.score) > 0);
  const avgScore = scored.length ? (scored.reduce((acc, m) => acc + Number(m.score), 0) / scored.length).toFixed(1) : '0.0';
  const completed = library.filter(m => m.status === 'Completati').length;
  const favs = library.filter(m => m.favourite);

  // In reading mangas sorted by latest
  const inReading = library
    .filter(m => m.status === 'In lettura')
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

  const recent = [...library]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  const topContinue = inReading[0] || library[0];

  const chRef = useRef(null);
  const mngRef = useRef(null);

  // Hark cubic easing counter animation
  useEffect(() => {
    if (!isActive) return;

    function count(el, to, ms = 1100) {
      if (!el) return;
      const t0 = performance.now();
      function step(t) {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(to * e);
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    count(chRef.current, totChapters, 1100);
    count(mngRef.current, totManga, 1100);
  }, [isActive, totChapters, totManga]);

  return (
    <section className={`view ${isActive ? 'on' : ''}`} data-v="home">
      {/* BENTORNATO */}
      <div className="hello">
        Bentornato,<b>@{username || 'lettore'}</b>
      </div>

      {/* 4-PANEL COMIC TAVOLA */}
      <div className="tav">
        <div className="p1 ht">
          <div className="D">
            <span ref={chRef} data-count={totChapters}>
              {totChapters}
            </span>
          </div>
          <div className="t-lbl">capitoli letti</div>
        </div>

        <div className="p2">
          <div className="D">
            <span ref={mngRef} data-count={totManga}>
              {totManga}
            </span>
          </div>
          <div className="t-lbl">manga</div>
        </div>

        <div className="p3 ht-w">
          <div className="D">★{avgScore}</div>
          <div className="t-lbl">voto medio</div>
        </div>

        <div className="p4">
          <span className="D">{completed}</span>
          <span className="t-lbl">completati</span>
          <span className="sp" />
          <span className="D hfav">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h12v18l-6-4-6 4z" />
            </svg>
            {favs.length}
          </span>
          <span className="t-lbl">preferiti</span>
        </div>
      </div>

      {/* CONTINUA A LEGGERE */}
      {topContinue && (
        <>
          <div className="sec">Continua a leggere</div>
          <div
            className="h2c press"
            id="h2c"
            onClick={() => onSelectManga?.(topContinue)}
          >
            <div
              className="bg"
              style={{
                backgroundImage: topContinue.cover ? `url(${topContinue.cover})` : 'none'
              }}
            />
            <div className="in">
              <div className="bal">
                {topContinue.chapters ? `Eri rimasto al cap. ${topContinue.chapters}!` : 'Inizia la lettura!'}
              </div>
              <div className="h2t">{topContinue.title}</div>
              <div className="h2s">{topContinue.genre || 'Manga'}</div>
              <button
                type="button"
                className="h2go"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectManga?.(topContinue);
                }}
              >
                Riprendi →
              </button>
            </div>
          </div>
        </>
      )}

      {/* AGGIUNTI DI RECENTE */}
      <div className="sec">Aggiunti di recente</div>
      <div className="a7" id="a7">
        {recent.length === 0 ? (
          <div
            style={{
              padding: '28px 0',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '13.5px',
              fontWeight: 800
            }}
          >
            Nessun manga in libreria.<br />
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '12px', fontSize: '13px' }}
              onClick={() => onNavigate?.('search')}
            >
              Cerca manga online +
            </button>
          </div>
        ) : (
          recent.map((m, idx) => {
            const isFirst = idx === 0;
            const fstClass =
              m.status === 'In lettura' ? 'r' :
              m.status === 'Completati' ? 'c' :
              m.status === 'In pausa' ? 'p' : 'd';

            return (
              <div
                key={m.id || idx}
                className={`fs ${isFirst ? 'first' : ''} press`}
                data-t={m.title}
                onClick={() => onSelectManga?.(m)}
              >
                <div
                  className="bg"
                  style={{
                    backgroundImage: m.cover ? `url(${m.cover})` : 'none'
                  }}
                />
                <span className="n">{idx + 1}</span>
                <div className="t">
                  {m.title}
                  <small>{m.genre || 'Manga'}</small>
                </div>
                <span className={`fst ${fstClass}`}>
                  {m.status ? m.status.toUpperCase() : 'MANGA'}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* PREFERITI */}
      {favs.length > 0 && (
        <>
          <div className="sec" style={{ marginTop: '24px' }}>★ Preferiti</div>
          <div className="a7" style={{ marginTop: '4px' }}>
            {favs.slice(0, 4).map((m, idx) => (
              <div
                key={m.id || idx}
                className="fs press"
                onClick={() => onSelectManga?.(m)}
              >
                <div
                  className="bg"
                  style={{
                    backgroundImage: m.cover ? `url(${m.cover})` : 'none'
                  }}
                />
                <span className="n" style={{ color: 'var(--amber)' }}>★</span>
                <div className="t">
                  {m.title}
                  <small>{m.genre || 'Manga'}</small>
                </div>
                {m.score > 0 && (
                  <span className="fst" style={{ background: 'var(--amber)', color: 'var(--bg)' }}>
                    {m.score} / 10
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
