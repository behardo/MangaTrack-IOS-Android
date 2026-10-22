import React, { useEffect, useRef, useState } from 'react';
import SplashMark from './SplashMark';

/**
 * Exact Hark app splash: animated MangaTrack mark + loading line.
 * autoHide mirrors mangatrack-app-v3.html (3100ms hold, 500ms fade-out).
 */
export default function SplashScreen({ autoHide = true, onDone, noAnim = false }) {
  const [out, setOut] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!autoHide) return undefined;
    const fade = setTimeout(() => setOut(true), 3100);
    const done = setTimeout(() => doneRef.current?.(), 3600);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [autoHide]);

  let lang = 'it';
  try {
    lang = localStorage.getItem('mt-lang') === 'en' ? 'en' : 'it';
  } catch {
    /* ignore unavailable storage */
  }

  return (
    <div
      className={`spl${out ? ' out' : ''}${noAnim ? ' no-anim' : ''}`}
      id="spl"
      role="status"
      aria-live="polite"
      aria-label={lang === 'en' ? 'Loading your library' : 'Carico la tua libreria'}
    >
      <SplashMark />
      <div className="ld">
        {lang === 'en' ? 'Loading your library…' : 'Carico la tua libreria…'}
      </div>
    </div>
  );
}
