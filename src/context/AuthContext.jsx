import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, q, ins, del, setTokenProvider } from '../api/supabase';
import { deleteUserStorage } from '../api/storage';

const AuthContext = createContext(null);

const STORAGE_SESSION_KEY = 'mt_s';

// Dev-only visual QA session: `?preview=app` boots the shell with demo data,
// without touching Supabase auth or storage. Never active in a production build.
const DEV_PREVIEW =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('preview') === 'app';
const AVATAR_COLORS = [
  "#D91233", "#C0392B", "#D35400", "#F39C12", "#27AE60",
  "#16A085", "#2E86C1", "#8E44AD", "#2C3E50", "#E8175D", "#00BCD4"
];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [previewLibrary, setPreviewLibrary] = useState(null);

  // Set the token provider whenever session changes
  useEffect(() => {
    setTokenProvider(() => session?.access_token);
  }, [session]);

  // Initial load
  useEffect(() => {
    async function loadSession() {
      if (DEV_PREVIEW) {
        const { PREVIEW_USER, PREVIEW_PROFILE, PREVIEW_LIBRARY } = await import('../dev/previewData');
        setSession({
          access_token: 'dev-preview',
          refresh_token: 'dev-preview',
          user: PREVIEW_USER,
        });
        setMyProfile(PREVIEW_PROFILE);
        setPreviewLibrary(PREVIEW_LIBRARY);
        setLoading(false);
        return;
      }

      try {
        // Check hash
        const hash = window.location.hash;
        if (hash.includes('access_token')) {
          const params = new URLSearchParams(hash.slice(1));
          const tokenSession = {
            access_token: params.get('access_token'),
            refresh_token: params.get('refresh_token'),
            user: null
          };
          const u = await api('/auth/v1/user', {
            headers: { Authorization: `Bearer ${tokenSession.access_token}` }
          }).catch(() => null);
          if (u?.id) {
            tokenSession.user = u;
            // The provider must know the new token before loadProfile queries
            // Supabase: the session effect runs after this async function.
            setTokenProvider(() => tokenSession.access_token);
            setSession(tokenSession);
            localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(tokenSession));
          }
          window.history.replaceState(null, '', window.location.pathname);
          await loadProfile(tokenSession);
          setLoading(false);
          return;
        }

        // Check localStorage
        const saved = localStorage.getItem(STORAGE_SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.refresh_token) {
            const refreshed = await api('/auth/v1/token?grant_type=refresh_token', {
              method: 'POST',
              body: JSON.stringify({ refresh_token: parsed.refresh_token })
            }).catch(() => null);

            if (refreshed?.access_token) {
              const activeSession = { ...refreshed, user: refreshed.user };
              setTokenProvider(() => activeSession.access_token);
              setSession(activeSession);
              localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(activeSession));
              await loadProfile(activeSession);
            } else {
              localStorage.removeItem(STORAGE_SESSION_KEY);
            }
          }
        }
      } catch (err) {
        console.warn('Auth restore error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  async function loadProfile(activeSession) {
    if (DEV_PREVIEW) return;
    if (!activeSession?.user?.id) return;
    try {
      const profiles = await q('profiles', `id=eq.${activeSession.user.id}&select=*`);
      if (profiles && profiles.length > 0) {
        setMyProfile(profiles[0]);
        setNeedsUsername(false);
      } else {
        setNeedsUsername(true);
      }
    } catch (e) {
      console.warn('Profile load error:', e);
    }
  }

  async function login(email, password) {
    const data = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data?.access_token) {
      const newSession = { ...data, user: data.user };
      setTokenProvider(() => newSession.access_token);
      setSession(newSession);
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(newSession));
      await loadProfile(newSession);
      return newSession;
    }
    throw new Error('Impossibile accedere');
  }

  async function register(email, password, username) {
    // Check if username taken
    const existing = await q('profiles', `username=eq.${encodeURIComponent(username)}&select=id`).catch(() => []);
    if (existing && existing.length > 0) {
      throw new Error('Username già in uso');
    }

    const data = await api('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data?.access_token) {
      const newSession = { ...data, user: data.user };
      setTokenProvider(() => newSession.access_token);
      setSession(newSession);
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(newSession));
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      await ins('profiles', { id: newSession.user.id, username, avatar_color: color });
      const profile = { id: newSession.user.id, username, avatar_color: color };
      setMyProfile(profile);
      setNeedsUsername(false);
      return newSession;
    }
    const confirmError = new Error('Controlla la tua email per confermare la registrazione');
    confirmError.code = 'confirm-email';
    throw confirmError;
  }

  async function resetPassword(email) {
    return api('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async function setupUsername(username) {
    if (!session?.user?.id) throw new Error('Non autenticato');
    const existing = await q('profiles', `username=eq.${encodeURIComponent(username)}&select=id`).catch(() => []);
    if (existing && existing.length > 0) {
      throw new Error('Username già in uso');
    }
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    await ins('profiles', { id: session.user.id, username, avatar_color: color });
    const profile = { id: session.user.id, username, avatar_color: color };
    setMyProfile(profile);
    setNeedsUsername(false);
  }

  async function logout() {
    // Fire the remote invalidation with the current token, but clear the local
    // session immediately: an unreachable network must never block sign-out.
    api('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    setTokenProvider(() => null);
    setSession(null);
    setMyProfile(null);
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }

  async function verifyPassword(password) {
    if (!session?.user?.email) throw new Error('Utente non autenticato');
    const data = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: session.user.email, password })
    });
    if (!data?.access_token) throw new Error('Password attuale errata');
    return true;
  }

  async function changePassword(newPassword) {
    return api('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword })
    });
  }

  async function deleteAccount(password) {
    if (!session?.user?.id) throw new Error('Utente non autenticato');

    // Verify password
    await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: session.user.email, password })
    });

    const uid = session.user.id;
    await deleteUserStorage(uid);

    await del('library', `user_id=eq.${uid}`).catch(() => {});
    await del('activity', `user_id=eq.${uid}`).catch(() => {});
    await del('follows', `follower_id=eq.${uid}`).catch(() => {});
    await del('follows', `following_id=eq.${uid}`).catch(() => {});
    await del('recommendations', `from_id=eq.${uid}`).catch(() => {});
    await del('recommendations', `to_id=eq.${uid}`).catch(() => {});
    await del('profiles', `id=eq.${uid}`).catch(() => {});

    await logout();
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user,
      myProfile,
      profile: myProfile,
      loading,
      needsUsername,
      previewLibrary,
      login,
      register,
      setupUsername,
      resetPassword,
      logout,
      signOut: logout,
      changePassword,
      updatePassword: changePassword,
      verifyPassword,
      deleteAccount,
      setMyProfile,
      refreshProfile: () => loadProfile(session)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
