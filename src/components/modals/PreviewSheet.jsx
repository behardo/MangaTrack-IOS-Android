import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { addMangaFromPreview } from '../../api/library';

export default function PreviewSheet({ manga, library = [], onClose, onAddSuccess, onOpenDetail, onToast }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  const title = manga?.title_english || manga?.title || 'Manga';
  const cover = manga?.images?.jpg?.image_url || manga?.cover || '';
  const score = manga?.score || (manga?.meanScore ? (manga.meanScore / 10).toFixed(1) : '–');
  const chapters = manga?.chapters || '–';
  const volumes = manga?.volumes || '–';
  const type = manga?.type || 'Manga';
  const genres = manga?.genres?.map(g => (typeof g === 'string' ? g : g.name)) || ['Manga'];
  const synopsis = manga?.synopsis ? manga.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim() : 'Nessuna sinossi disponibile.';

  const existingManga = library.find(m => m.title === title);

  // The sheet stays mounted between titles; never carry "Leggi tutto" or a
  // busy state from the previous manga into the next one.
  useEffect(() => {
    setExpanded(false);
    setAdding(false);
  }, [title]);

  const handleAddOrOpen = async () => {
    if (existingManga) {
      onClose();
      onOpenDetail?.(existingManga);
      return;
    }

    if (!user?.id) {
      onToast?.('Effettua l\'accesso per aggiungere manga');
      return;
    }

    setAdding(true);
    try {
      const created = await addMangaFromPreview(manga, user.id, library);
      onToast?.(`"${title}" aggiunto alla libreria!`);
      onAddSuccess?.(created);
      onClose();
    } catch (err) {
      console.error('Error adding manga:', err);
      onToast?.(err.message || 'Errore nell\'aggiunta');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div
        className={`dim ${manga ? 'open' : ''}`}
        id="dim"
        onClick={onClose}
      />
      <div
        className={`sheet nx ${manga ? 'open' : ''}`}
        id="sheet"
      >
        <div className="grab" onClick={onClose} />
        <button type="button" className="nxx" id="sclose" aria-label="Chiudi" onClick={onClose}>
          ✕
        </button>

        <div className="nxb" id="nxb">
          <div className="nxtop">
            <div className="nxsp">
              <span id="nxsp">{title.toUpperCase()}</span>
              <i id="nxsv">{volumes !== '–' ? volumes : (chapters !== '–' ? chapters : 1)}</i>
            </div>
            <img id="simg" src={cover} alt={title} />
            <div className="nxin">
              <div className="t" id="st">{title}</div>
              <div className="sc" id="ssc">★ {score}</div>
              <div className="nxrow">
                <div>Capitoli<b id="sc1">{chapters}</b></div>
                <div>Volumi<b id="sc2">{volumes}</b></div>
                <div>Tipo<b>{type}</b></div>
              </div>
            </div>
          </div>

          <div className="nxgen" id="sgen">
            {genres.map((g, idx) => (
              <span key={idx}>{g}</span>
            ))}
          </div>

          <div className="nxd">
            <b className="q">“</b>
            <p className={`syn ${expanded ? '' : 'nxcl'}`} id="ssyn">
              {synopsis}
            </p>
            {synopsis.length > 160 && (
              <button
                type="button"
                className="nxmore"
                id="nxmore"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Mostra meno ▴' : 'Leggi tutto ▾'}
              </button>
            )}
          </div>
        </div>

        <div className="nxbar">
          <button
            type="button"
            className={`nxadd ${existingManga ? 'done' : ''}`}
            id="nxadd"
            onClick={handleAddOrOpen}
            disabled={adding}
          >
            {adding
              ? 'Aggiunta in corso...'
              : existingManga
                ? '✓ In libreria'
                : '+ Aggiungi alla libreria'}
          </button>
        </div>
      </div>
    </>
  );
}
