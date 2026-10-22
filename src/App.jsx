import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import Header from './components/common/Header';
import BottomBar from './components/common/BottomBar';
import SplashScreen from './components/common/SplashScreen';
import AuthView from './components/views/AuthView';
import HomeView from './components/views/HomeView';
import LibraryView from './components/views/LibraryView';
import SearchView from './components/views/SearchView';
import SocialView from './components/views/SocialView';
import SettingsView from './components/views/SettingsView';
import DetailView from './components/views/DetailView';
import PreviewSheet from './components/modals/PreviewSheet';
import RecommendModal from './components/modals/RecommendModal';
import DeleteModal from './components/modals/DeleteModal';
import { fetchUserLibrary } from './api/library';
import { getPendingRecsCount } from './api/social';
import { installAppLanguage, setAppLanguage } from './i18n/appLanguage';

const DEV_QUERY = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
const IS_PREVIEW = Boolean(DEV_QUERY?.get('preview') === 'app');
// Dev-only visual QA, mirroring the reference's #vuoto / #caricamento hashes.
const PREVIEW_LIB_VARIANT = DEV_QUERY?.get('lib');

/* v45 recolours the whole profile book through --uc/--ucd. Keep the same
   derived dark tone as the reference so the cover, spine and avatar match. */
function darkenHex(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return 'var(--red-d)';
  const n = parseInt(hex.slice(1), 16);
  const channel = c => Math.round(c * 0.68).toString(16).padStart(2, '0');
  return `#${channel(n >> 16)}${channel((n >> 8) & 255)}${channel(n & 255)}`;
}

export default function App() {
  const { user, profile, loading: authLoading, needsUsername, previewLibrary } = useAuth();

  const [activeTab, setActiveTab] = useState(() => DEV_QUERY?.get('tab') || 'home');
  const [showSplash, setShowSplash] = useState(!IS_PREVIEW);
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [unreadRecs, setUnreadRecs] = useState(0);
  const previewMode = IS_PREVIEW && Array.isArray(previewLibrary);
  const activeLibrary = previewMode
    ? (PREVIEW_LIB_VARIANT === 'vuoto' ? [] : previewLibrary)
    : library;
  const libraryBusy = previewMode
    ? PREVIEW_LIB_VARIANT === 'caricamento'
    : libraryLoading;

  // Modals & Overlays state
  const [selectedManga, setSelectedManga] = useState(null);
  const [previewManga, setPreviewManga] = useState(null);
  const [recommendData, setRecommendData] = useState(null); // { manga, friend }
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Toast notification state
  const [toastText, setToastText] = useState('');

  const viewsRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastText(msg);
  }, []);

  // Hark translates the whole document at runtime (IT source → EN).
  useEffect(() => {
    installAppLanguage();
    if (DEV_QUERY?.get('lang') === 'en') setAppLanguage('en');
  }, []);

  useEffect(() => {
    if (!toastText) return;
    const timer = setTimeout(() => {
      setToastText('');
    }, 3200);
    return () => clearTimeout(timer);
  }, [toastText]);

  // Handle Tab Switch (Hark exact behavior: scroll to top on views container)
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (viewsRef.current) {
      viewsRef.current.scrollTop = 0;
    }
  };

  // Load library & unread notifications when user logs in
  const loadUserData = useCallback(async () => {
    if (previewMode) {
      setLibraryLoading(false);
      return;
    }
    if (!user?.id) {
      setLibrary([]);
      setUnreadRecs(0);
      setLibraryLoading(false);
      return;
    }
    setLibraryLoading(true);
    try {
      const [libData, pendingCount] = await Promise.all([
        fetchUserLibrary(user.id),
        getPendingRecsCount(user.id)
      ]);
      setLibrary(libData);
      setUnreadRecs(pendingCount);
    } catch (err) {
      console.error('Error loading library/notifications:', err);
    } finally {
      setLibraryLoading(false);
    }
  }, [user?.id, previewMode]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Library update handlers
  const handleMangaSaved = (updatedManga) => {
    setLibrary(prev =>
      prev.map(m => (m.id === updatedManga.id ? { ...m, ...updatedManga } : m))
    );
  };

  const handleMangaDeleted = (deletedId) => {
    setLibrary(prev => prev.filter(m => m.id !== deletedId));
  };

  const handleMangaAdded = (newManga) => {
    setLibrary(prev => [newManga, ...prev]);
  };

  if (DEV_QUERY?.has('splash')) {
    return (
      <div className="phone">
        <SplashScreen autoHide={false} noAnim={DEV_QUERY.has('noanim')} />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="phone">
        <SplashScreen autoHide={false} />
      </div>
    );
  }

  // Unauthenticated (or authenticated but still missing a profile) -> Hark login
  if (!user || needsUsername) {
    return <AuthView onToast={showToast} />;
  }

  const userColor = profile?.avatar_color || '#D91233';
  const colorVars = {
    '--uc': userColor,
    '--ucd': darkenHex(userColor),
  };

  return (
    <div className={`phone ${activeTab === 'lib' ? 'lib-on' : ''}`} style={colorVars}>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      {/* HEADER */}
      <Header
        activeTab={activeTab}
        onNavigate={handleTabChange}
        profile={profile}
      />

      {/* VIEWS CONTAINER (All 5 views stay in DOM to preserve CSS animations & scroll) */}
      <div className="views" id="views" ref={viewsRef}>
        <HomeView
          isActive={activeTab === 'home'}
          library={activeLibrary}
          username={profile?.username}
          onSelectManga={setSelectedManga}
          onNavigate={handleTabChange}
        />

        <LibraryView
          isActive={activeTab === 'lib'}
          library={activeLibrary}
          loading={libraryBusy}
          onSelectManga={setSelectedManga}
          onNavigate={handleTabChange}
        />

        <SearchView
          isActive={activeTab === 'search'}
          library={activeLibrary}
          onOpenPreview={setPreviewManga}
          onMangaAdded={handleMangaAdded}
          onMangaSaved={handleMangaSaved}
          onMangaDeleted={handleMangaDeleted}
          onToast={showToast}
        />

        <SocialView
          isActive={activeTab === 'social'}
          library={activeLibrary}
          onOpenPreview={setPreviewManga}
          onOpenDetail={setSelectedManga}
          onOpenRecommend={(friend) => setRecommendData({ friend, manga: null })}
          onToast={showToast}
          onMangaSaved={handleMangaSaved}
          onMangaAdded={handleMangaAdded}
          onRefreshRecsCount={() => user?.id && getPendingRecsCount(user.id).then(setUnreadRecs)}
        />

        <SettingsView
          isActive={activeTab === 'settings'}
          library={activeLibrary}
          onOpenDeleteModal={() => setIsDeleteOpen(true)}
          onToast={showToast}
        />
      </div>

      {/* FLOATING ACTION BUTTON (QUICK SEARCH) */}
      <div
        className="fab press"
        title="Aggiungi manga"
        onClick={() => handleTabChange('search')}
      >
        +
      </div>

      {/* FLOATING BOTTOM NAV BAR */}
      <BottomBar
        activeTab={activeTab}
        onNavigate={handleTabChange}
        unreadCount={unreadRecs}
      />

      {/* DETAIL VIEW OVERLAY (Slides in with .ov.open) */}
      <DetailView
        manga={selectedManga}
        onClose={() => setSelectedManga(null)}
        onSaveSuccess={handleMangaSaved}
        onDeleteSuccess={handleMangaDeleted}
        onOpenRecommend={(m) => setRecommendData({ manga: m, friend: null })}
        onToast={showToast}
      />

      {/* PREVIEW SHEET DRAWER (Slides up with .sheet.open and .dim.open) */}
      <PreviewSheet
        manga={previewManga}
        library={activeLibrary}
        onClose={() => setPreviewManga(null)}
        onAddSuccess={handleMangaAdded}
        onOpenDetail={(m) => {
          setPreviewManga(null);
          setSelectedManga(m);
        }}
        onToast={showToast}
      />

      {/* RECOMMEND MODAL */}
      {recommendData && (
        <RecommendModal
          initialManga={recommendData.manga}
          initialFriend={recommendData.friend}
          library={activeLibrary}
          onClose={() => setRecommendData(null)}
          onToast={showToast}
        />
      )}

      {/* DELETE ACCOUNT MODAL */}
      {isDeleteOpen && (
        <DeleteModal
          onClose={() => setIsDeleteOpen(false)}
          onToast={showToast}
        />
      )}

      {/* TOAST POPUP */}
      {toastText && (
        <div className="toast-bubble">
          {toastText}
        </div>
      )}
    </div>
  );
}
