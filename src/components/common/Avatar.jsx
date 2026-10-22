import React, { useState } from 'react';

/* One initials rule for every avatar in the app: "Mario Rossi" -> MR,
   "mario_rossi" -> MR, "MangaTrack" -> MT, "beke" -> B. */
export function getInitials(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) return '?';

  const words = cleaned
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (!words.length) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Avatar renders a profile photo when one is available and falls back to
 * initials when it is missing, empty or fails to load. The component fills its
 * parent, so existing circular wrappers keep their size, border and shape.
 */
export default function Avatar({
  src,
  name,
  color = 'var(--red)',
  textColor = 'var(--bg)',
  className = '',
  style,
  alt = '',
  title,
  onClick,
}) {
  const imageSrc = typeof src === 'string' ? src.trim() : '';
  const [failedSrc, setFailedSrc] = useState('');
  const showImage = Boolean(imageSrc) && failedSrc !== imageSrc;

  return (
    <span
      className={`mt-avatar${className ? ` ${className}` : ''}`}
      style={{ '--mt-av-color': color, '--mt-av-text': textColor, ...style }}
      title={title}
      onClick={onClick}
      aria-hidden={alt ? undefined : true}
    >
      {showImage ? (
        <img src={imageSrc} alt={alt} onError={() => setFailedSrc(imageSrc)} />
      ) : (
        <b>{getInitials(name)}</b>
      )}
    </span>
  );
}
