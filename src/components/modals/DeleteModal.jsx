import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function DeleteModal({ onClose, onToast }) {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Inserisci la password per confermare');
      return;
    }

    setLoading(true);
    try {
      await deleteAccount(password);
      onToast?.('Account e dati eliminati definitivamente');
    } catch (err) {
      console.error(err);
      if (err.message.includes('Invalid login') || err.message.includes('password')) {
        setError('Password errata');
      } else {
        setError('Errore: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '3px solid var(--red)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '360px',
          boxShadow: '8px 8px 0 var(--red)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--red)',
            color: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ fontFamily: 'var(--display)', fontSize: '18px' }}>
            ⚠ Elimina Account
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--display)',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--bg)'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleConfirm} style={{ padding: '16px' }}>
          <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--ink)', marginBottom: '14px', fontWeight: 600 }}>
            Questa azione è <strong>irreversibile</strong>. Tutti i tuoi dati, la tua libreria, i punteggi, le recensioni e i follow verranno cancellati per sempre dai server.
          </p>

          {error && (
            <div
              style={{
                background: 'rgba(231, 76, 60, 0.15)',
                border: '1.5px solid var(--red)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--red)',
                marginBottom: '12px'
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
              Conferma con la tua password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '2px solid var(--line)',
                fontFamily: 'inherit',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn"
              style={{ flex: 1, padding: '10px', fontFamily: 'var(--display)' }}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-danger"
              style={{
                flex: 1.5,
                padding: '10px',
                fontFamily: 'var(--display)',
                background: 'var(--red)',
                color: 'var(--bg)'
              }}
            >
              {loading ? 'Eliminazione...' : 'Conferma ed Elimina'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
