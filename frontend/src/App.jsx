/** Compose public routes and the browser-only demo login with shared navigation. */
import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import Home from './features/home/Home';
import Apply from './features/apply/Apply';
import Login from './features/admin/Login';
import { isAuthenticated, logout } from './features/admin/auth';

/**
 * Share the persisted demo session across navigation and the admin route.
 * Returns:
 *   Public pages or the login gate and authenticated session status.
 * Notes:
 *   Storage errors never imply successful login or logout.
 */
export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [authenticated, setAuthenticated] = useState(isAuthenticated);
  const [storageError, setStorageError] = useState('');

  /** Requery storage when navigation or browser session activity changes. */
  useEffect(() => {
    /** Synchronize the shared state, failing closed if reads are unavailable. */
    function refreshSession() {
      setAuthenticated(isAuthenticated());
    }
    refreshSession();
    window.addEventListener('storage', refreshSession);
    window.addEventListener('focus', refreshSession);
    return () => {
      window.removeEventListener('storage', refreshSession);
      window.removeEventListener('focus', refreshSession);
    };
  }, [pathname]);

  /** Refresh the header and gate after the login form persists the session. */
  function onLogin() {
    setAuthenticated(isAuthenticated());
    setStorageError('');
  }

  /** Return home only after session removal succeeds; retain failure feedback. */
  function onLogout() {
    const result = logout();
    if (!result.success) {
      setStorageError(result.error);
      return;
    }
    setStorageError('');
    setAuthenticated(false);
    navigate('/');
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header authenticated={authenticated} onLogout={onLogout} />
      {storageError && (
        <p className="auth-storage-error" role="alert">
          {storageError}
        </p>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/apply" element={<Apply />} />
        <Route
          path="/admin"
          element={authenticated ? (
            <main id="main-content" className="auth-page">
              <section className="auth-card submission-form" aria-labelledby="session-title">
                <h1 id="session-title">Admin Session</h1>
                <p className="auth-session-status" role="status">
                  Demo admin session is active.
                </p>
                <p className="auth-disclaimer">
                  Browser-only demo. This is not real authentication or secure access control.
                </p>
              </section>
            </main>
          ) : (
            <Login onLogin={onLogin} />
          )}
        />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}
