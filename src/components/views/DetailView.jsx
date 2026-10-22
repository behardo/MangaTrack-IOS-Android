import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { saveMangaDetail, deleteMangaFromLibrary } from '../../api/library';
import Avatar from '../common/Avatar';

const STATUS_ICONS = {
  read: (
    <>
      <path className="f" d="M3 6c3-1 6-1 9 1v13c-3-2-6-2-9-1z" />
      <path d="M3 6c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z M12 7v13" />
    </>
  ),
  done: (
    <>
      <path className="f" d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" />
    </>
  ),
  pause: (
    <>
      <path className="f" d="M7 3h10v18l-5-4-5 4z" />
      <path d="M7 3h10v18l-5-4-5 4z" />
    </>
  ),
  drop: (
    <>
      <path className="f" d="M5 4h12v16H5z" />
      <path d="M5 4h12v16H5zM5 4l-1 1v16h12M9 9l4 4M13 9l-4 4" />
    </>
  ),
  plan: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.3" />
      <circle cx="4.5" cy="12" r="1.3" />
      <circle cx="4.5" cy="18" r="1.3" />
    </>
  ),
};

const STATUS_OPTIONS = [
  { key: 'read', label: 'In lettura', sub: 'Stai leggendo', dbStatus: 'In lettura', color: 'var(--red)' },
  { key: 'done', label: 'Completati', sub: 'Finito', dbStatus: 'Completati', color: 'var(--green)' },
  { key: 'pause', label: 'In pausa', sub: 'In sospeso', dbStatus: 'In pausa', color: 'var(--amber)' },
  { key: 'drop', label: 'Abbandonati', sub: 'Lasciato perdere', dbStatus: 'Abbandonati', color: 'var(--muted)' },
  { key: 'plan', label: 'Da leggere', sub: 'Lista desideri', dbStatus: 'Da leggere', color: 'var(--ink)' },
];

const VW = [
  'Tocca una stella', 'Pessimo', 'Brutto', 'Scarso', 'Mediocre',
  'Sufficiente', 'Discreto', 'Buono', 'Ottimo', 'Eccellente', 'Capolavoro'
];

export default function DetailView({ manga, onClose, onSaveSuccess, onDeleteSuccess, onOpenRecommend, onToast }) {
  const { user, profile } = useAuth();

  const [statusKey, setStatusKey] = useState('read');
  const [chapters, setChapters] = useState(0);
  const [volumes, setVolumes] = useState(1);
  const [score, setScore] = useState(0);
  const [review, setReview] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Progress interactions ported from Hark: the pin flashes on every chapter
  // change, the stepper repeats while held, and the trail can be dragged.
  const [dragging, setDragging] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const trailRef = useRef(null);
  const pinTimer = useRef(null);
  const holdTimeout = useRef(null);
  const holdInterval = useRef(null);
  const closeTimer = useRef(null);

  const flashPin = useCallback(() => {
    setShowPin(true);
    clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => setShowPin(false), 900);
  }, []);

  const stopHold = useCallback(() => {
    clearTimeout(holdTimeout.current);
    clearInterval(holdInterval.current);
    holdTimeout.current = null;
    holdInterval.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopHold();
      clearTimeout(pinTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, [stopHold]);

  useEffect(() => {
    if (!manga) return;
    const sObj = STATUS_OPTIONS.find(s => s.dbStatus === manga.status) || STATUS_OPTIONS[0];
    setStatusKey(sObj.key);
    setChapters(Number(manga.chapters) || 0);
    setVolumes(Number(manga.volumes) || 1);
    setScore(Number(manga.score) || 0);
    setReview(manga.review || '');
    setFavourite(!!manga.favourite);
    setShowPin(false);
    setDragging(false);
    setSaved(false);
    clearTimeout(closeTimer.current);
    stopHold();
  }, [manga, stopHold]);

  const handleStatusChange = (key) => {
    setStatusKey(key);
    const sObj = STATUS_OPTIONS.find(s => s.key === key);
    if (sObj?.dbStatus === 'Completati') {
      const total = Number(manga?.total_chapters) || 0;
      const totalVol = Number(manga?.total_volumes) || 0;
      if (total && (!chapters || chapters < total)) setChapters(total);
      if (totalVol && (!volumes || volumes < totalVol)) setVolumes(totalVol);
    }
  };

  const clampChapter = (value) => {
    const max = Number(manga?.total_chapters) || 9999;
    return Math.max(0, Math.min(max, value));
  };

  const handleStepCh = (delta) => {
    setChapters(prev => clampChapter((prev || 0) + delta));
    flashPin();
  };

  const handleStepVol = (delta) => {
    setVolumes(prev => Math.max(1, (prev || 1) + delta));
  };

  const handleHoldStart = (delta) => {
    stopHold();
    holdTimeout.current = setTimeout(() => {
      holdInterval.current = setInterval(() => {
        setChapters(prev => clampChapter((prev || 0) + delta));
        flashPin();
      }, 70);
    }, 420);
  };

  const handleHoldEnd = () => stopHold();

  const setChaptersFromX = (clientX) => {
    const total = Number(manga?.total_chapters) || 0;
    const trail = trailRef.current;
    if (!total || !trail) return;
    const rect = trail.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setChapters(Math.round(ratio * total));
  };

  const handleTrailDown = (event) => {
    if (!manga?.total_chapters) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture is unavailable for synthetic/ended pointers */
    }
    setDragging(true);
    setShowPin(true);
    clearTimeout(pinTimer.current);
    setChaptersFromX(event.clientX);
  };

  const handleTrailMove = (event) => {
    if (!dragging) return;
    setChaptersFromX(event.clientX);
  };

  const handleTrailEnd = () => {
    if (!dragging) return;
    setDragging(false);
    flashPin();
  };

  const currentStatusObj = STATUS_OPTIONS.find(s => s.key === statusKey) || STATUS_OPTIONS[0];
  const totalCh = Number(manga?.total_chapters) || null;
  const pct = totalCh ? Math.min(100, Math.round(((chapters || 0) / totalCh) * 100)) : 0;

  const handleSave = async () => {
    if (!manga || saving || saved) return;
    setSaving(true);
    try {
      const updated = {
        id: manga.id,
        title: manga.title,
        cover: manga.cover,
        status: currentStatusObj.dbStatus,
        chapters: Number(chapters) || 0,
        volumes: Number(volumes) || 0,
        score: Number(score) || 0,
        review: review.trim(),
        favourite: Boolean(favourite),
      };

      await saveMangaDetail(updated, user?.id);
      onSaveSuccess?.(updated);
      // v54: the reference confirms on the button itself (1.5 s) and stays put.
      setSaved(true);
      closeTimer.current = setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('Error saving manga:', err);
      onToast?.('Errore nel salvataggio: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!manga) return;
    if (!window.confirm(`Rimuovere "${manga.title}" dalla libreria?`)) return;
    try {
      await deleteMangaFromLibrary(manga.id);
      onToast?.('Manga rimosso dalla libreria');
      onDeleteSuccess?.(manga.id);
      onClose();
    } catch (err) {
      console.error('Error deleting manga:', err);
      onToast?.('Errore nella rimozione: ' + err.message);
    }
  };

  return (
    <div className={`ov ${manga ? 'open' : ''}`} id="det">
      <div className="top">
        <span className="bk" id="detback" onClick={onClose}>
          ← Indietro
        </span>
        <span className="tt" id="dtt">
          {manga?.title || ''}
        </span>
      </div>

      <div className="scroll">
        {/* HERO CARD */}
        <div className="dhero ht">
          <img id="dimg" src={manga?.cover || ''} alt="" />
          <div>
            <div className="t" id="dt">{manga?.title || ''}</div>
            <div className="g" id="dg">{manga?.genre || 'Manga'}</div>
            <div className="dsb" id="dst" style={{ color: currentStatusObj.color }}>
              {currentStatusObj.dbStatus}
            </div>
          </div>
          <div className="bub">Vol. {volumes}</div>
        </div>

        {/* STATO LETTURA */}
        <div className="dsec">
          <div className="cap-t">Stato lettura</div>
          <div className="stati" id="stati">
            {STATUS_OPTIONS.map((opt) => {
              const active = statusKey === opt.key;
              return (
                <div
                  key={opt.key}
                  className={`stato ${active ? 'on' : ''}`}
                  data-s={opt.key}
                  style={{ '--c': opt.color }}
                  onClick={() => handleStatusChange(opt.key)}
                >
                  <div className="ic">
                    <svg viewBox="0 0 24 24">{STATUS_ICONS[opt.key]}</svg>
                  </div>
                  <div className="l">{opt.label}</div>
                  <div className="s">{opt.sub}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PROGRESSO */}
        <div className="dsec">
          <div className="cap-t">Progresso</div>
          <div className="pnl prog">
            <div className="row">
              <span className="l">Capitoli</span>
              <div className="stepper">
                <button
                  type="button"
                  data-k="c"
                  data-d="-1"
                  onClick={() => handleStepCh(-1)}
                  onPointerDown={() => handleHoldStart(-1)}
                  onPointerUp={handleHoldEnd}
                  onPointerLeave={handleHoldEnd}
                  onPointerCancel={handleHoldEnd}
                >
                  −
                </button>
                <span id="pc">{chapters}</span>
                <button
                  type="button"
                  data-k="c"
                  data-d="1"
                  onClick={() => handleStepCh(1)}
                  onPointerDown={() => handleHoldStart(1)}
                  onPointerUp={handleHoldEnd}
                  onPointerLeave={handleHoldEnd}
                  onPointerCancel={handleHoldEnd}
                >
                  +
                </button>
              </div>
              <span className="tot" id="ptot">
                {totalCh ? `/ ${totalCh}` : '/ ?'}
              </span>
            </div>

            <div className="row">
              <span className="l">Volumi</span>
              <div className="stepper">
                <button type="button" data-k="v" data-d="-1" onClick={() => handleStepVol(-1)}>
                  −
                </button>
                <span id="pv">{volumes}</span>
                <button type="button" data-k="v" data-d="1" onClick={() => handleStepVol(1)}>
                  +
                </button>
              </div>
            </div>

            <div className="big">
              <span className="t-lbl" style={{ color: 'var(--muted)' }}>completato</span>
              <span className="D" id="ppct">{totalCh ? `${pct}%` : '–'}</span>
            </div>

            <div
              className={`trail drag${showPin ? ' show' : ''}${dragging ? ' held' : ''}`}
              id="ptr"
              ref={trailRef}
              onPointerDown={handleTrailDown}
              onPointerMove={handleTrailMove}
              onPointerUp={handleTrailEnd}
              onPointerCancel={handleTrailEnd}
            >
              <div className="fill" id="pfill" style={{ width: `${pct}%` }} />
              <div className="pin" id="ppin" style={{ left: `${pct}%` }}>
                <b id="ppb">cap. {chapters}</b>
              </div>
            </div>
          </div>
        </div>

        {/* VOTO */}
        <div className="dsec">
          <div className="cap-t">Voto</div>
          <div className="pnl voto">
            <div className="v1h">
              <div className="D" id="vv">
                {score > 0 ? score : '–'}
                <small> /10</small>
              </div>
              <span className="w" id="vw">
                {VW[score] || 'Tocca una stella'}
              </span>
            </div>
            <div className="v1s" id="vbar">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                <span
                  key={val}
                  className={val <= score ? 'on' : ''}
                  onClick={() => setScore(val === score ? 0 : val)}
                >
                  ★
                </span>
              ))}
            </div>
            <div className="v1n">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>
        </div>

        {/* RECENSIONE */}
        <div className="dsec">
          <div className="cap-t">Recensione</div>
          <div className="r1w">
            <div className="r1av">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.username}
                color={profile?.avatar_color || 'var(--red)'}
                alt=""
              />
            </div>
            <div className="r1b">
              <textarea
                placeholder="Cosa ne pensi?"
                maxLength={500}
                value={review}
                onChange={e => setReview(e.target.value)}
              />
              <div className="cn">{review.length} / 500</div>
            </div>
          </div>

          <div className="r1i az1">
            <div
              id="fav"
              className={`t f ${favourite ? 'on' : ''}`}
              onClick={() => setFavourite(!favourite)}
            >
              <b className="ic">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
                </svg>
              </b>
              <span>
                Preferito<small>Tra i tuoi top</small>
              </span>
            </div>
            <div
              id="rcons"
              className="t c"
              onClick={() => onOpenRecommend?.(manga)}
            >
              <b className="ic">
                <svg viewBox="0 0 24 24">
                  <path d="M22 3L11 13M22 3l-7 18-4-8-8-4z" />
                </svg>
              </b>
              <span>
                Consiglia<small>A un amico</small>
              </span>
            </div>
          </div>

          <div className="r1f">
            <button
              className={`sv${saved ? ' ok' : ''}`}
              onClick={handleSave}
              disabled={saving}
            >
              <svg viewBox="0 0 24 24">
                <path d="M5 12l5 5 9-10" />
              </svg>
              <span>{saved ? 'Salvato!' : (saving ? 'Salvataggio...' : 'Salva')}</span>
            </button>
            <button className="rm" title="Rimuovi dalla libreria" onClick={handleDelete}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
