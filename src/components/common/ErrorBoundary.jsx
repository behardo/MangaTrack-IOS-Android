import React from 'react';

/**
 * Last line of defence: if a render error escapes a view, show a readable
 * screen instead of a blank page (important during a live demo).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Errore non gestito:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--bg, #130C1E)',
          color: 'var(--ink, #F5EEF8)',
          fontFamily: 'Nunito, system-ui, sans-serif',
          textAlign: 'center'
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: '0 0 12px' }}>
            Qualcosa è andato storto
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 22px', opacity: 0.8 }}>
            MangaTrack ha incontrato un errore imprevisto. I tuoi dati sono al sicuro:
            ricarica la pagina per continuare.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: 6,
              padding: '12px 20px',
              background: 'var(--red, #D91233)',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Ricarica MangaTrack
          </button>
        </div>
      </div>
    );
  }
}
