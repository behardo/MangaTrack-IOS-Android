import React from 'react';

export default function BottomBar({ activeTab, onNavigate, unreadCount = 0 }) {
  return (
    <nav className="bar" id="bar">
      <div
        className={`tb ${activeTab === 'home' ? 'on' : ''}`}
        data-v="home"
        onClick={() => onNavigate?.('home')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-5h4v5" />
        </svg>
        Home
      </div>

      <div
        className={`tb ${activeTab === 'lib' ? 'on' : ''}`}
        data-v="lib"
        onClick={() => onNavigate?.('lib')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="5" height="18" rx="1.5" />
          <rect x="10" y="3" width="5" height="18" rx="1.5" />
          <path d="m17 4.5 3.5 1-3.8 15-3.4-.9" />
        </svg>
        Libreria
      </div>

      <div
        className={`tb ${activeTab === 'search' ? 'on' : ''}`}
        data-v="search"
        onClick={() => onNavigate?.('search')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Cerca
      </div>

      <div
        className={`tb ${activeTab === 'social' ? 'on' : ''}`}
        data-v="social"
        onClick={() => onNavigate?.('social')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
          <path d="M18 14a6.5 6.5 0 0 1 3.5 6" />
        </svg>
        Social
        {unreadCount > 0 && <span className="bd" />}
      </div>

      <div
        className={`tb ${activeTab === 'settings' ? 'on' : ''}`}
        data-v="settings"
        onClick={() => onNavigate?.('settings')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
        Impost.
      </div>
    </nav>
  );
}
