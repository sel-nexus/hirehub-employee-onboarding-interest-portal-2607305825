/** Compose public routes and the browser-only demo login with shared navigation. */
import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import Home from './features/home/Home';
import Apply from './features/apply/Apply';
import Login from './features/admin/Login';
import Dashboard from './features/admin/Dashboard';
import { isAuthenticated, logout } from './features/admin/auth';
import { DemoFooter } from './features/demo/DemoFooter';
import { initializeDemo, DEMO_RESET_EVENT } from './features/demo/storage';

/**
 * Share the persisted demo session across navigation and the admin route.
 * Returns:
 *   Public pages or the login gate and authenticated submissions dashboard.
 * Notes:
 *   Storage errors never imply successful login or logout.
 */
export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [authenticated, setAuthenticated] = useState(isAuthenticated);
  const [storageError, setStorageError] = useState('');
  const [demoFeedback] = useState(initializeDemo);
  const [demoRevision, setDemoRevision] = useState(0);

  /** Refresh mounted consumers and legacy auth after a successful local reset. */
  useEffect(() => {
    /** Remount stale route data without changing the current URL. */
    function onDemoReset() {
      setAuthenticated(isAuthenticated());
      setStorageError('');
      setDemoRevision((revision) => revision + 1);
    }
    window.addEventListener(DEMO_RESET_EVENT, onDemoReset);
    return () => window.removeEventListener(DEMO_RESET_EVENT, onDemoReset);
  }, []);

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
      <Routes key={demoRevision}>
        <Route path="/" element={<Home />} />
        <Route path="/apply" element={<Apply />} />
        <Route
          path="/admin"
          element={authenticated ? (
            <Dashboard onLogout={onLogout} />
          ) : (
            <Login onLogin={onLogin} />
          )}
        />
        <Route path="*" element={<Home />} />
      </Routes>
      <DemoFooter feedback={demoFeedback} />
    </>
  );
}
