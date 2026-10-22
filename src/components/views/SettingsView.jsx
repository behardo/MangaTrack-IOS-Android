import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { uploadAvatar, removeAvatar, updateAvatarColor } from '../../api/storage';
import { useAppLanguage } from '../../i18n/appLanguage';
import Avatar from '../common/Avatar';

const AVATAR_COLORS = [
  { value: '#D91233', name: 'Rosso MangaTrack' },
  { value: '#C0392B', name: 'Rosso' },
  { value: '#D35400', name: 'Arancio' },
  { value: '#F39C12', name: 'Ambra' },
  { value: '#27AE60', name: 'Verde' },
  { value: '#16A085', name: 'Smeraldo' },
  { value: '#2E86C1', name: 'Blu' },
  { value: '#8E44AD', name: 'Viola' },
  { value: '#2C3E50', name: 'Notte' },
  { value: '#E8175D', name: 'Fucsia' },
  { value: '#00BCD4', name: 'Ciano' },
];
const PASSWORD_COLORS = ['var(--red)', 'var(--amber)', '#9fd65a', 'var(--green)'];
const PASSWORD_LABELS = ['Debole', 'Così così', 'Buona', 'Fortissima'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function passwordStrength(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/[^\w]/.test(value) || value.length >= 12) score += 1;
  return value ? Math.max(1, score) : 0;
}

const INSTALL_STEPS = {
  ios: [
    ['Apri in Safari', 'non Chrome o Brave'],
    ['Tocca Condividi', 'il quadrato con la freccia in basso'],
    ['Aggiungi a schermata Home', 'scorri il menu fino alla voce'],
    ['Tocca Aggiungi', 'in alto a destra, e hai finito'],
  ],
  and: [
    ['Apri in Chrome', 'il browser di Android'],
    ['Tocca il menu ⋮', 'in alto a destra'],
    ['Installa app', 'oppure “Aggiungi a schermata Home”'],
    ['Conferma Installa', 'l’icona appare nella Home'],
  ],
};

const INSTALL_POSITIONS = {
  ios: [[60, 10], [78, 213], [60, 170], [110, 10]],
  and: [[60, 10], [106, 213], [60, 178], [60, 120]],
};

const INSTALL_ICONS = {
  ios: [
    'M15 6l-6 6 6 6',
    'M9 6l6 6-6 6',
    'M12 3v12M8 7l4-4 4 4',
    'M4 6h16M4 12h16M4 18h16',
  ],
  and: [
    'M3 11l9-7 9 7v9H3z',
    'M4 6h16M4 12h16',
    'M12 5h.01M12 12h.01M12 19h.01',
  ],
};

export default function SettingsView({ isActive, library = [], onOpenDeleteModal, onToast }) {
  const { session, user, profile, refreshProfile, setMyProfile, signOut, verifyPassword, updatePassword } = useAuth();
  const [lang, setLang] = useAppLanguage();

  const [openAccordions, setOpenAccordions] = useState({
    install: false,
    pass: false,
    danger: false,
  });
  const [selectedRow, setSelectedRow] = useState(null);
  const [installTab, setInstallTab] = useState('ios');
  const [installStep, setInstallStep] = useState(0);

  // v50 FB3 — photo & colour sheet opened by the pencil on the cover.
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (!photoMenuOpen) return undefined;
    const close = () => {
      setPhotoMenuOpen(false);
      setColorOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [photoMenuOpen]);

  useEffect(() => {
    if (!openAccordions.install) return undefined;
    setInstallStep(0);
    const timer = setInterval(() => {
      setInstallStep(step => (step + 1) % 4);
    }, 2300);
    return () => clearInterval(timer);
  }, [openAccordions.install, installTab]);

  // v48 CP4 — password change, three pages
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [passPage, setPassPage] = useState(0);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState('');
  const [passVisible, setPassVisible] = useState({ current: false, next: false, confirm: false });
  const currentPassRef = useRef(null);
  const newPassRef = useRef(null);
  const confirmPassRef = useRef(null);
  const passTimersRef = useRef([]);

  const later = (fn, ms) => {
    const timer = setTimeout(fn, ms);
    passTimersRef.current.push(timer);
    return timer;
  };

  useEffect(() => () => {
    passTimersRef.current.forEach(clearTimeout);
  }, []);

  const resetPasswordFlow = () => {
    setCurrentPass('');
    setNewPass('');
    setNewPassConfirm('');
    setPassPage(0);
    setPassError('');
    setPassLoading(false);
    setPassVisible({ current: false, next: false, confirm: false });
  };

  const toggleAccordion = (key) => {
    setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const closePasswordPanel = () => {
    setOpenAccordions(prev => ({ ...prev, pass: false }));
    setSelectedRow(null);
    // The focused field becomes visibility:hidden with the panel; return focus
    // to the trigger instead of leaving it on an invisible input.
    document.getElementById('c4o')?.focus({ preventScroll: true });
  };

  const togglePasswordPanel = () => {
    const opening = !openAccordions.pass;
    if (opening) {
      passTimersRef.current.forEach(clearTimeout);
      passTimersRef.current = [];
      resetPasswordFlow();
      setOpenAccordions(prev => ({ ...prev, pass: true }));
    } else {
      closePasswordPanel();
    }
  };

  const passwordLevel = passwordStrength(newPass);
  const canAdvance =
    passPage === 0
      ? currentPass.length > 0
      : passPage === 1
        ? newPass.length >= 8 && /\d/.test(newPass)
        : passPage === 2
          ? newPassConfirm.length > 0 && newPassConfirm === newPass
          : false;

  const passPageClass = index => {
    if (index < passPage) return 'g';
    if (index > passPage) return 'w';
    return '';
  };

  const passStepClass = index => {
    if (index < passPage) return 'dn';
    if (index === passPage) return 'on';
    return '';
  };

  const handlePasswordNext = async () => {
    if (!canAdvance || passLoading) return;
    setPassError('');

    if (passPage === 0) {
      setPassPage(1);
      later(() => newPassRef.current?.focus({ preventScroll: true }), 350);
      return;
    }

    if (passPage === 1) {
      setPassPage(2);
      later(() => confirmPassRef.current?.focus({ preventScroll: true }), 350);
      return;
    }

    setPassLoading(true);
    try {
      if (!(import.meta.env.DEV && session?.access_token === 'dev-preview')) {
        try {
          await verifyPassword(currentPass);
        } catch (err) {
          console.warn('Current password check failed:', err);
          setPassPage(0);
          setPassError('Password attuale errata');
          later(() => currentPassRef.current?.focus({ preventScroll: true }), 350);
          return;
        }
        await updatePassword(newPass);
      }
      setPassPage(3);
      onToast?.('Password cambiata!');
      later(closePasswordPanel, 1800);
      later(resetPasswordFlow, 2300);
    } catch (err) {
      console.error(err);
      const message = String(err?.message || '');
      if (/weak|short|password/i.test(message) && !/invalid login/i.test(message)) {
        setPassPage(1);
        setPassError('La nuova password non è valida');
      } else {
        setPassError('Errore durante il cambio password');
      }
    } finally {
      setPassLoading(false);
    }
  };

  const togglePassVisibility = key => {
    setPassVisible(previous => ({ ...previous, [key]: !previous[key] }));
  };


  const mangaCount = library.length;
  const totalChapters = library.reduce((acc, m) => acc + (Number(m.chapters) || 0), 0);
  const scoredManga = library.filter(m => Number(m.score) > 0);
  const avgScore = scoredManga.length
    ? (scoredManga.reduce((acc, m) => acc + Number(m.score), 0) / scoredManga.length).toFixed(1)
    : '0.0';

  const username = profile?.username || user?.email?.split('@')[0] || 'Lettore';
  const email = user?.email || '';
  const avatarColor = profile?.avatar_color || '#D91233';

  const installSteps = INSTALL_STEPS[installTab];
  const currentInstallStep = installSteps[installStep] || installSteps[0];
  const installPositions = INSTALL_POSITIONS[installTab];
  const highlightPosition = installPositions[installStep] || installPositions[0];

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPhotoMenuOpen(false);
    setColorOpen(false);
    onToast?.('Caricamento foto in corso...');
    try {
      await uploadAvatar(file, session);
      await refreshProfile();
      onToast?.('Foto aggiornata');
    } catch (err) {
      console.error(err);
      onToast?.('Errore nel caricamento foto: ' + err.message);
    }
  };

  const handleRemovePhoto = async () => {
    if (!profile?.avatar_url) return;
    setPhotoMenuOpen(false);
    setColorOpen(false);

    // Dev preview has no Supabase session; reflect the removal in memory.
    if (import.meta.env.DEV && session?.access_token === 'dev-preview') {
      setMyProfile(previous => ({ ...previous, avatar_url: null }));
      onToast?.('Foto rimossa');
      return;
    }

    try {
      await removeAvatar(session);
      await refreshProfile();
      onToast?.('Foto rimossa');
    } catch (err) {
      console.error(err);
      onToast?.('Errore rimozione: ' + err.message);
    }
  };

  const handleChangeColor = async (color) => {
    // Dev preview has no Supabase session; update the in-memory profile so the
    // v45 shelf and the whole book cover can be checked without fake writes.
    if (import.meta.env.DEV && session?.access_token === 'dev-preview') {
      setMyProfile(previous => ({ ...previous, avatar_color: color }));
      return;
    }
    try {
      await updateAvatarColor(color, session);
      await refreshProfile();
    } catch (err) {
      console.error(err);
      onToast?.('Errore aggiornamento colore: ' + err.message);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Sei sicuro di voler uscire?')) {
      await signOut();
      onToast?.('Disconnesso');
    }
  };

  return (
    <section className={`view ${isActive ? 'on' : ''}`} data-v="settings">
      {/* MANGA BOOK VOLUME SPINE PROFILE CARD + FB3 sheet */}
      <div className="fb3w">
        <div className="p2">
          <div className="spine">
            <span>MANGATRACK</span>
            <i>{mangaCount || 1}</i>
          </div>
          <div className="cov">
            <div className="vol">VOL. {mangaCount || 1}</div>
            <div className="ttl">
              LA LIBRERIA DI<b>@{username}</b>
            </div>
            <Avatar
              className="av"
              src={profile?.avatar_url}
              name={username}
              color={avatarColor}
              alt=""
            />
            <div className="bot">
              <span className="em">{email}</span>
              <button
                type="button"
                className="pen press"
                id="fb3pen"
                aria-label="Modifica"
                aria-expanded={photoMenuOpen}
                onClick={event => {
                  event.stopPropagation();
                  setPhotoMenuOpen(previous => !previous);
                  setColorOpen(false);
                }}
              >
                ✎
              </button>
            </div>
          </div>
        </div>

        <div
          className={`bl3${photoMenuOpen ? ' on' : ''}${colorOpen ? ' col' : ''}`}
          id="fb3"
          onClick={event => event.stopPropagation()}
        >
          <div className="pn3">
            <button
              type="button"
              className="cf"
              onClick={() => {
                setPhotoMenuOpen(false);
                setColorOpen(false);
                avatarInputRef.current?.click();
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span>{profile?.avatar_url ? 'Cambia foto' : 'Aggiungi foto'}</span>
            </button>
            <button
              type="button"
              className="rm"
              disabled={!profile?.avatar_url}
              onClick={handleRemovePhoto}
            >
              <svg viewBox="0 0 24 24">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
              </svg>
              <span>Togli foto</span>
            </button>
            <button
              type="button"
              className={`co${colorOpen ? ' act' : ''}`}
              onClick={() => setColorOpen(previous => !previous)}
            >
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <circle cx="9" cy="10" r="1.3" />
                <circle cx="14" cy="8.5" r="1.3" />
                <circle cx="16" cy="13" r="1.3" />
                <path d="M12 21c-2 0-2-3 0-4s1-3-1-3" />
              </svg>
              <span>Colore</span>
            </button>
          </div>
          <div className="str3" id="fb3s">
            {AVATAR_COLORS.map(color => {
              const active = avatarColor.toLowerCase() === color.value.toLowerCase();
              return (
                <i
                  key={color.value}
                  className={active ? 'on' : ''}
                  data-c={color.value}
                  title={color.name}
                  role="button"
                  tabIndex={0}
                  aria-label={`Colore ${color.name}`}
                  aria-pressed={active}
                  style={{ background: color.value }}
                  onClick={event => {
                    event.stopPropagation();
                    handleChangeColor(color.value);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleChangeColor(color.value);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          id="fb3f"
          style={{ display: 'none' }}
          onChange={handleAvatarFile}
        />
      </div>

      {/* STATS UNDER PROFILE */}
      <div className="p2s">
        <div>
          <b>{mangaCount}</b>manga
        </div>
        <div>
          <b>{totalChapters}</b>capitoli
        </div>
        <div>
          <b style={{ color: 'var(--amber)' }}>{avgScore}</b>voto medio
        </div>
      </div>

      {/* SECTION SETTINGS */}
      <div className="sec">Impostazioni</div>

      <div className="i7l" id="i7l">
        {/* LINGUA */}
        <button
          type="button"
          className={`i7c i7lang ${selectedRow === 'lang' ? 'sel' : ''}`}
          id="i7lang"
          style={{ '--d': '0.0s' }}
          onClick={() => {
            setSelectedRow('lang');
            setLang(lang === 'it' ? 'en' : 'it');
          }}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
          </svg>
          <span>
            Lingua<small className="notr">{lang === 'it' ? 'Italiano' : 'English'}</small>
          </span>
          <span className="lt7 notr">
            <b data-l="it" className={lang === 'it' ? 'on' : ''}>IT</b>
            <b data-l="en" className={lang === 'en' ? 'on' : ''}>EN</b>
          </span>
        </button>

        {/* INSTALLA L'APP ACCORDION */}
        <button
          type="button"
          className={`i7c ${selectedRow === 'install' ? 'sel' : ''}`}
          style={{ '--d': '0.03s' }}
          onClick={() => {
            setSelectedRow('install');
            toggleAccordion('install');
          }}
        >
          <svg viewBox="0 0 24 24">
            <rect x="7" y="3" width="10" height="18" rx="2" />
            <path d="M11 17h2" />
          </svg>
          <span style={{ flex: 1 }}>
            Installa l'app<small>Aggiungi alla Home</small>
          </span>
        </button>

        {/* v45 I1 — animated install walkthrough */}
        <div className={`in1p ${openAccordions.install ? 'open' : ''}`} id="in1p">
          <div className="in1b" id="in1b">
            <div className={`in1os ${installTab === 'and' ? 'an' : ''}`}>
              <i />
              <span
                data-o="ios"
                className={installTab === 'ios' ? 'on' : ''}
                onClick={() => setInstallTab('ios')}
              >
                iOS
              </span>
              <span
                data-o="and"
                className={installTab === 'and' ? 'on' : ''}
                onClick={() => setInstallTab('and')}
              >
                Android
              </span>
            </div>

            <div className={`in1ph ${installStep === 2 ? 'm' : ''} ${installStep === 3 ? 'd' : ''}`}>
              <div className="scrn">
                <div className="url notr">
                  {installTab === 'ios' ? 'Safari' : 'Chrome'} · manga-track…
                </div>
                <div className="menu">
                  <div>Copia</div>
                  <div className="h">{installTab === 'ios' ? 'Aggiungi a Home' : 'Installa app'}</div>
                  <div>Segnalibro</div>
                </div>
                <div className="bt">
                  {INSTALL_ICONS[installTab].map((path, index) => (
                    <svg key={index} viewBox="0 0 24 24">
                      <path d={path} />
                    </svg>
                  ))}
                </div>
                <div className="ic"><div>M</div></div>
              </div>
              <div
                className="hl"
                style={{ left: `${highlightPosition[0]}px`, top: `${highlightPosition[1]}px` }}
              />
            </div>

            <div className="in1cur">
              <b>{currentInstallStep[0]}</b>
              <small>{currentInstallStep[1]}</small>
            </div>
            <div className="in1st">
              {installSteps.map((step, index) => (
                <i
                  key={step[0]}
                  className={installStep === index ? 'on' : ''}
                  onClick={() => setInstallStep(index)}
                >
                  {index + 1}
                </i>
              ))}
            </div>
          </div>
        </div>

        {/* v48 CP4 — CAMBIA PASSWORD IN TRE PAGINE */}
        <button
          type="button"
          className={`i7c ${selectedRow === 'pass' ? 'sel' : ''}`}
          id="c4o"
          style={{ '--d': '0.06s' }}
          onClick={() => {
            setSelectedRow('pass');
            togglePasswordPanel();
          }}
          aria-expanded={openAccordions.pass}
        >
          <svg viewBox="0 0 24 24">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span style={{ flex: 1 }}>
            Cambia password<small>Sicurezza account</small>
          </span>
        </button>

        <div className={`c4p ${openAccordions.pass ? 'open' : ''}`} id="c4p">
          <div className="c4s">
            {[0, 1, 2].map(index => (
              <React.Fragment key={index}>
                {index > 0 && <b />}
                <i className={passStepClass(index)}>
                  {index < passPage ? '✓' : index + 1}
                </i>
              </React.Fragment>
            ))}
          </div>

          <div className="c4c">
            <div className={`c4g ${passPageClass(0)}`}>
              <div className="c4t">Password attuale</div>
              <p>Per sicurezza, prima quella che usi ora.</p>
              <div className="c4f">
                <label htmlFor="c4pc">ATTUALE</label>
                <input
                  id="c4pc"
                  ref={currentPassRef}
                  type={passVisible.current ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="off"
                  value={currentPass}
                  aria-invalid={Boolean(passError)}
                  onChange={event => {
                    setCurrentPass(event.target.value);
                    setPassError('');
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && canAdvance) {
                      event.preventDefault();
                      handlePasswordNext();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`c4e ${passVisible.current ? 'on' : ''}`}
                  aria-label={passVisible.current ? 'Nascondi' : 'Mostra'}
                  onClick={() => togglePassVisibility('current')}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                className="c4n"
                disabled={!canAdvance || passLoading}
                onClick={handlePasswordNext}
              >
                Avanti ›
              </button>
              {passError && (
                <div className="c4l" style={{ color: 'var(--red)' }}>{passError}</div>
              )}
            </div>

            <div className={`c4g ${passPageClass(1)}`}>
              <div className="c4t">Nuova password</div>
              <p>Almeno 8 caratteri e un numero.</p>
              <div className="c4f">
                <label htmlFor="c4pn">NUOVA</label>
                <input
                  id="c4pn"
                  ref={newPassRef}
                  type={passVisible.next ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={newPass}
                  onChange={event => {
                    setNewPass(event.target.value);
                    setPassError('');
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && canAdvance) {
                      event.preventDefault();
                      handlePasswordNext();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`c4e ${passVisible.next ? 'on' : ''}`}
                  aria-label={passVisible.next ? 'Nascondi' : 'Mostra'}
                  onClick={() => togglePassVisibility('next')}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              <div className="c4m">
                {[0, 1, 2, 3].map(index => (
                  <i
                    key={index}
                    style={{
                      background: index < passwordLevel ? PASSWORD_COLORS[passwordLevel - 1] : '',
                    }}
                  />
                ))}
              </div>
              <div className="c4l">
                {passError ? (
                  <span style={{ color: 'var(--red)' }}>{passError}</span>
                ) : passwordLevel ? (
                  <><span>Sicurezza:</span> <span>{PASSWORD_LABELS[passwordLevel - 1]}</span></>
                ) : null}
              </div>
              <button
                type="button"
                className="c4n"
                disabled={!canAdvance || passLoading}
                onClick={handlePasswordNext}
              >
                Avanti ›
              </button>
            </div>

            <div className={`c4g ${passPageClass(2)}`}>
              <div className="c4t">Conferma</div>
              <p>Riscrivila uguale.</p>
              <div className="c4f">
                <label htmlFor="c4pf">CONFERMA</label>
                <input
                  id="c4pf"
                  ref={confirmPassRef}
                  type={passVisible.confirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={newPassConfirm}
                  onChange={event => {
                    setNewPassConfirm(event.target.value);
                    setPassError('');
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && canAdvance) {
                      event.preventDefault();
                      handlePasswordNext();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`c4e ${passVisible.confirm ? 'on' : ''}`}
                  aria-label={passVisible.confirm ? 'Nascondi' : 'Mostra'}
                  onClick={() => togglePassVisibility('confirm')}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                className="c4n"
                disabled={!canAdvance || passLoading}
                onClick={handlePasswordNext}
              >
                {passLoading ? 'Salvataggio…' : 'Salva'}
              </button>
              {passError && (
                <div className="c4l" style={{ color: 'var(--red)' }}>{passError}</div>
              )}
            </div>

            <div className={`c4g ${passPageClass(3)}`}>
              <div className="c4d">
                <div className="c4k">✓</div>
                <div className="c4t">Password cambiata!</div>
              </div>
            </div>
          </div>
        </div>

        {/* SEGNALA UN PROBLEMA */}
        <a
          href="mailto:?subject=MangaTrack%20-%20Segnalazione%20problema"
          className={`i7c ${selectedRow === 'report' ? 'sel' : ''}`}
          style={{ '--d': '0.09s', textDecoration: 'none' }}
          onClick={() => setSelectedRow('report')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 21V4M6 4h11l-2 4 2 4H6" />
          </svg>
          <span>
            Segnala un problema<small>Scrivici</small>
          </span>
        </a>

        {/* ESCI DALL'ACCOUNT */}
        <button
          type="button"
          className={`i7c ex ${selectedRow === 'logout' ? 'sel' : ''}`}
          style={{ '--d': '0.12s' }}
          onClick={() => {
            setSelectedRow('logout');
            handleLogout();
          }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
          </svg>
          <span>Esci dall'account</span>
        </button>
      </div>

      {/* ZONA PERICOLOSA */}
      <div className={`i7dz ${openAccordions.danger ? 'open' : ''}`} id="danger">
        <div className="h" onClick={() => toggleAccordion('danger')} style={{ cursor: 'pointer' }}>
          ⚠ Zona pericolosa <span>▾</span>
        </div>
        <div className="dzw">
          <div className="bst">!!</div>
          <div className="b">
            <p>Libreria, attività, follow e profilo verranno cancellati per sempre. Non è reversibile.</p>
            <button type="button" onClick={onOpenDeleteModal}>
              Elimina account
            </button>
          </div>
        </div>
      </div>

      <div className="ver">MangaTrack v3.1 · AniList API · Supabase</div>
    </section>
  );
}
