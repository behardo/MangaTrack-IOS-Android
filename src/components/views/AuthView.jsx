import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SHELF_ITEMS } from '../../data/loginArt';
import SplashMark from '../common/SplashMark';

/* --------------------------------------------------------------------------
   Copy of the Hark login-v3 experience (IT/EN), wired to the real Supabase
   auth flow. Markup and class names intentionally mirror login-v3.html.
   -------------------------------------------------------------------------- */

const T = {
  it: {
    h: 'Ogni manga che leggi,<br><em>al suo posto.</em>',
    p: 'Traccia, vota e condividi la tua libreria.',
    s: ['manga', 'capitoli', 'voto medio'],
    f: ['Progresso', '★ Voti', 'Amici', 'Consigli'],
    cta: 'Inizia',
    gh: 'Ho già un account',
    in: 'Accedi',
    reg: 'Registrati',
    ph: ['Username', 'Email', 'Password'],
    fg: 'Password dimenticata?',
    go: ['Entra!', 'Crea account'],
    q: [
      'Bentornato! Accedi per riprendere a leggere.',
      'Piacere! Crea il tuo account e inizia la libreria.'
    ],
    pickUser: 'Scegli il tuo username per iniziare.',
    cont: 'Continua',
    replay: "↻ Rivedi l'intro",
    errFill: 'Compila tutti i campi',
    errUser: 'Scegli un username',
    errEmail: 'Inserisci la tua email per recuperare la password',
    resetSent: 'Ti abbiamo inviato un link per reimpostare la password.',
    errCred: 'Email o password non corretti.',
    errConfirm: 'Devi confermare la tua email prima di accedere.',
    errGeneric: 'Si è verificato un errore. Riprova.',
    terms: 'Termini',
    privacy: 'Privacy',
    legal: {
      terms: {
        title: 'Termini di utilizzo',
        body: [
          'MangaTrack è un progetto amatoriale per tracciare i manga che leggi, votarli e condividerli con gli amici.',
          'I dati che inserisci (email, username, libreria, voti, attività, consigli) vengono usati solo per far funzionare l\'app. Non vengono venduti a terzi.',
          'Puoi eliminare il tuo account in qualsiasi momento dalle Impostazioni.'
        ]
      },
      privacy: {
        title: 'Privacy',
        body: [
          'Email, username e password sono gestiti da Supabase Auth. La password non è mai visibile a MangaTrack.',
          'Libreria, voti, follow, attività e consigli sono conservati nel database Supabase e associati al tuo account.',
          'Eliminando l\'account dalle Impostazioni vengono rimossi profilo, libreria, attività, follow e consigli.'
        ]
      }
    }
  },
  en: {
    h: 'Every manga you read,<br><em>in its place.</em>',
    p: 'Track, rate and share your library.',
    s: ['manga', 'chapters', 'avg rating'],
    f: ['Progress', '★ Ratings', 'Friends', 'Picks'],
    cta: 'Get started',
    gh: 'I already have an account',
    in: 'Log in',
    reg: 'Sign up',
    ph: ['Username', 'Email', 'Password'],
    fg: 'Forgot password?',
    go: ["Let's go!", 'Create account'],
    q: [
      'Welcome back! Log in to keep reading.',
      'Nice to meet you! Create your account and start your library.'
    ],
    pickUser: 'Choose your username to get started.',
    cont: 'Continue',
    replay: '↻ Replay intro',
    errFill: 'Fill in all the fields',
    errUser: 'Choose a username',
    errEmail: 'Enter your email to reset your password',
    resetSent: 'We sent you a password reset link.',
    errCred: 'Wrong email or password.',
    errConfirm: 'Confirm your email before logging in.',
    errGeneric: 'Something went wrong. Try again.',
    terms: 'Terms',
    privacy: 'Privacy',
    legal: {
      terms: {
        title: 'Terms of use',
        body: [
          'MangaTrack is a hobby project to track the manga you read, rate them and share them with friends.',
          'The data you enter (email, username, library, ratings, activity, recommendations) is only used to run the app. It is never sold to third parties.',
          'You can delete your account at any time from Settings.'
        ]
      },
      privacy: {
        title: 'Privacy',
        body: [
          'Email, username and password are handled by Supabase Auth. Your password is never visible to MangaTrack.',
          'Library, ratings, follows, activity and recommendations are stored in the Supabase database and linked to your account.',
          'Deleting your account from Settings removes your profile, library, activity, follows and recommendations.'
        ]
      }
    }
  }
};

const STATS = [
  { to: 13, label: 0 },
  { to: 1347, label: 1 },
  { to: 8.4, label: 2 }
];

function styleFrom(str) {
  const out = {};
  str.split(';').forEach(part => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) return;
    out[key.startsWith('--') ? key : key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  });
  return out;
}

function friendlyError(message, t) {
  const msg = String(message || '');
  if (/invalid login credentials/i.test(msg)) return t.errCred;
  if (/email not confirmed/i.test(msg)) return t.errConfirm;
  return msg || t.errGeneric;
}

export default function AuthView() {
  const { login, register, setupUsername, resetPassword, needsUsername } = useAuth();

  const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const previewAuth = preview?.get('screen') === 'auth';
  const previewNoAnim = preview?.has('noanim');

  const [lang, setLang] = useState(() => {
    if (preview?.get('lang') === 'en') return 'en';
    if (preview?.get('lang') === 'it') return 'it';
    try {
      return localStorage.getItem('mt-lang') === 'en' ? 'en' : 'it';
    } catch {
      return 'it';
    }
  });
  const [screen, setScreen] = useState(() => (needsUsername || previewAuth ? 'auth' : 'intro'));
  const [reg, setReg] = useState(() => !!needsUsername || preview?.get('mode') === 'reg');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [legal, setLegal] = useState(null);
  const [introNonce, setIntroNonce] = useState(0);
  const [iconNonce, setIconNonce] = useState(0);
  const [qNonce, setQNonce] = useState(0);
  const [flipNonce, setFlipNonce] = useState(0);

  const statRefs = useRef([]);

  const t = T[lang];
  const showReg = !!needsUsername || reg;
  const qText = needsUsername ? t.pickUser : t.q[reg ? 1 : 0];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /* The app shell styles body; the login page owns the viewport instead. */
  useEffect(() => {
    document.body.classList.add('login-active');
    return () => document.body.classList.remove('login-active');
  }, []);

  /* Animated stat counters, exactly like login-v3's count() helper. */
  useEffect(() => {
    if (screen !== 'intro') return undefined;

    const els = statRefs.current.filter(Boolean);
    els.forEach(el => { el.textContent = '0'; });

    const frames = [];
    const timer = setTimeout(() => {
      els.forEach(el => {
        const to = parseFloat(el.dataset.to);
        const dec = String(to).includes('.');
        const t0 = performance.now();
        const step = now => {
          const p = Math.min(1, Math.max(0, (now - t0) / 1200));
          const e = 1 - Math.pow(1 - p, 3);
          el.textContent = dec ? (to * e).toFixed(1) : String(Math.round(to * e));
          if (p < 1) frames.push(requestAnimationFrame(step));
        };
        frames.push(requestAnimationFrame(step));
      });
    }, 1600);

    return () => {
      clearTimeout(timer);
      frames.forEach(cancelAnimationFrame);
    };
  }, [screen, introNonce]);

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function enter(registerMode) {
    clearMessages();
    setScreen('auth');
    setReg(registerMode);
    setQNonce(n => n + 1);
    setIconNonce(n => n + 1);
  }

  function replayIntro() {
    clearMessages();
    setScreen('intro');
    setIntroNonce(n => n + 1);
  }

  function setMode(registerMode) {
    if (needsUsername) return;
    clearMessages();
    setReg(registerMode);
    setQNonce(n => n + 1);
  }

  function changeLang(next) {
    if (next === lang) return;
    setLang(next);
    setQNonce(n => n + 1);
    setFlipNonce(n => n + 1);
    try {
      localStorage.setItem('mt-lang', next);
    } catch {
      /* private mode: language simply resets next visit */
    }
  }

  async function handleForgot() {
    clearMessages();
    if (!email.trim()) {
      setError(t.errEmail);
      return;
    }
    try {
      await resetPassword(email.trim());
      setSuccess(t.resetSent);
    } catch (err) {
      setError(friendlyError(err?.message, t));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessages();

    if (needsUsername) {
      if (!username.trim()) {
        setError(t.errUser);
        return;
      }
      setSubmitting(true);
      try {
        await setupUsername(username.trim());
      } catch (err) {
        setError(friendlyError(err?.message, t));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!email.trim() || !password || (reg && !username.trim())) {
      setError(reg && !username.trim() ? t.errUser : t.errFill);
      return;
    }

    setSubmitting(true);
    try {
      if (reg) {
        await register(email.trim(), password, username.trim());
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      if (err?.code === 'confirm-email') {
        setSuccess(err.message);
      } else {
        setError(friendlyError(err?.message, t));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const ctaLabel = submitting
    ? '...'
    : needsUsername
      ? t.cont
      : t.go[reg ? 1 : 0];

  return (
    <div className={`login-root${previewNoAnim ? ' no-anim' : ''}`}>
      <div className="stagewrap">
        <div className="vv" id="vk1">
          <div className="login-phone">
            {/* ---------------- Intro / onboarding ---------------- */}
            <div
              key={`intro-${introNonce}`}
              className={`scr phx o4 scrn${screen === 'intro' ? ' on' : ''} go4`}
            >
              <div className="hd">
                <h3
                  key={`h-${lang}-${flipNonce}`}
                  className="flip"
                  dangerouslySetInnerHTML={{ __html: t.h }}
                />
                <p key={`p-${lang}-${flipNonce}`} className="flip">{t.p}</p>
              </div>

              <div className="shelf4">
                {SHELF_ITEMS.map((item, i) =>
                  item.kind === 'cov' ? (
                    <img
                      key={`cov-${i}`}
                      className="cov"
                      src={item.src}
                      alt=""
                      style={styleFrom(item.style)}
                    />
                  ) : (
                    <div key={`sp-${i}`} className="spn" style={styleFrom(item.style)} />
                  )
                )}
              </div>

              <div className="stats4">
                {STATS.map((stat, i) => (
                  <div key={stat.to}>
                    <b
                      data-to={stat.to}
                      ref={el => { statRefs.current[i] = el; }}
                    >
                      0
                    </b>
                    {t.s[stat.label]}
                  </div>
                ))}
              </div>

              <div className="feat">
                {t.f.map((feat, i) => (
                  <span
                    key={feat}
                    style={{ '--d': `${2.2 + i * 0.15}s` }}
                  >
                    {feat}
                  </span>
                ))}
              </div>

              <div className="bot">
                <button type="button" className="cta press" onClick={() => enter(true)}>
                  {t.cta}
                </button>
                <button type="button" className="ghost4" onClick={() => enter(false)}>
                  {t.gh}
                </button>
              </div>
            </div>

            {/* ---------------- Login / register ---------------- */}
            <div
              className={
                `scr phx lg a3 scrn${screen === 'auth' ? ' on' : ''}${showReg ? ' reg' : ''}`
              }
            >
              <div className="ic">
                <SplashMark
                  key={`icon-${iconNonce}`}
                  active={screen === 'auth'}
                />
              </div>

              <div key={`q-${lang}-${qNonce}`} className="q pop">
                {qText}
              </div>

              {!needsUsername && (
                <div className="segx tg2">
                  <div
                    className={!reg ? 'on' : ''}
                    data-t="in"
                    role="button"
                    tabIndex={0}
                    onClick={() => setMode(false)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setMode(false); }}
                  >
                    {t.in}
                  </div>
                  <div
                    className={reg ? 'on' : ''}
                    data-t="reg"
                    role="button"
                    tabIndex={0}
                    onClick={() => setMode(true)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setMode(true); }}
                  >
                    {t.reg}
                  </div>
                </div>
              )}

              <form className="auth-form" onSubmit={handleSubmit} style={{ display: 'contents' }}>
                <div className="fsx">
                  {showReg && (
                    <div className="pill user">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
                      </svg>
                      <input
                        type="text"
                        placeholder={t.ph[0]}
                        aria-label={t.ph[0]}
                        value={username}
                        onChange={e => { setUsername(e.target.value); clearMessages(); }}
                        autoCapitalize="none"
                        autoComplete="username"
                      />
                    </div>
                  )}

                  {!needsUsername && (
                    <>
                      <div className="pill">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                        <input
                          type="email"
                          placeholder={t.ph[1]}
                          aria-label={t.ph[1]}
                          value={email}
                          onChange={e => { setEmail(e.target.value); clearMessages(); }}
                          autoCapitalize="none"
                          autoComplete="email"
                        />
                      </div>

                      <div className="pill">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="5" y="11" width="14" height="10" rx="2" />
                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                        <input
                          type="password"
                          placeholder={t.ph[2]}
                          aria-label={t.ph[2]}
                          value={password}
                          onChange={e => { setPassword(e.target.value); clearMessages(); }}
                          autoComplete={reg ? 'new-password' : 'current-password'}
                        />
                      </div>
                    </>
                  )}
                </div>

                {error && <div className="lg-err" role="alert">{error}</div>}
                {success && <div className="lg-ok" role="status">{success}</div>}

                {!needsUsername && (
                  <a
                    className="forgot"
                    href="#"
                    onClick={e => { e.preventDefault(); handleForgot(); }}
                  >
                    {t.fg}
                  </a>
                )}

                <button type="submit" className="cta go2 press" disabled={submitting}>
                  {ctaLabel}
                </button>
              </form>

              <div className="foot">
                {lang === 'it' ? (
                  <>
                    Continuando accetti i{' '}
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); setLegal('terms'); }}
                    >
                      Termini
                    </a>{' '}
                    e la{' '}
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); setLegal('privacy'); }}
                    >
                      Privacy
                    </a>
                  </>
                ) : (
                  <>
                    By continuing you accept the{' '}
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); setLegal('terms'); }}
                    >
                      Terms
                    </a>{' '}
                    and{' '}
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); setLegal('privacy'); }}
                    >
                      Privacy
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* ---------------- Language tab ---------------- */}
            <div className="lng k1">
              <span
                data-l="it"
                className={lang === 'it' ? 'on' : ''}
                role="button"
                tabIndex={0}
                onClick={() => changeLang('it')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') changeLang('it'); }}
              >
                IT
              </span>
              <span
                data-l="en"
                className={lang === 'en' ? 'on' : ''}
                role="button"
                tabIndex={0}
                onClick={() => changeLang('en')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') changeLang('en'); }}
              >
                EN
              </span>
            </div>
          </div>

          {!needsUsername && (
            <button type="button" className="replay" onClick={replayIntro}>
              {t.replay}
            </button>
          )}
        </div>
      </div>

      {legal && (
        <div
          className="terms-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t.legal[legal].title}
          onClick={() => setLegal(null)}
        >
          <div className="terms-card" onClick={e => e.stopPropagation()}>
            <h3>{t.legal[legal].title}</h3>
            {t.legal[legal].body.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            <button type="button" className="cta press" onClick={() => setLegal(null)}>
              {lang === 'it' ? 'Chiudi' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
