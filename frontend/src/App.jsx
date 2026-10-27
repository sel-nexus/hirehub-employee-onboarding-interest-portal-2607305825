/** Compose public access and validated local role routes with one-time demo initialization. */
import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { DemoUtility } from './components/DemoUtility';
import { useTheme } from './features/theme/theme';
import Home from './features/home/Home';
import Apply from './features/apply/Apply';
import Login from './features/admin/Login';
import Register from './features/auth/Register';
import Dashboard from './features/admin/Dashboard';
import Candidate from './features/candidate/Candidate';
import { getSession, logout } from './features/admin/auth';
import { seedMockData, readMockData } from './features/data/mockData';

/** Seed once outside rendering, refresh current local identity and mount role-appropriate portals. @returns {JSX.Element} */
export default function App() {
  const { theme, error: themeError, toggleTheme, refreshTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [, setSession] = useState(null);
  const [storageError, setStorageError] = useState('');
  const [recovery, setRecovery] = useState('');
  const session = getSession();
  const portal = session?.role === 'admin' ? '/admin' : '/candidate';

  /** Initialize or retry; failed seeding never reports a ready dataset. */
  function initialize() {
    refreshTheme();
    const result = seedMockData();
    const current = readMockData();
    setReady(result.success && current.success);
    setStorageError(result.error || current.error);
    setRecovery(result.recovered.length ? `Recovered corrupt local demo data: ${result.recovered.join(', ')}. Defaults restored.` : '');
    setSession(getSession());
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize();
    }
  }, []);

  useEffect(() => {
    /** Synchronize without seeding or clearing persisted data. */
    function refreshSession() {
      setSession(getSession());
      const current = readMockData();
      if (!current.success) setStorageError((previous) => previous || current.error);
    }
    refreshSession();
    window.addEventListener('storage', refreshSession);
    window.addEventListener('focus', refreshSession);
    return () => {
      window.removeEventListener('storage', refreshSession);
      window.removeEventListener('focus', refreshSession);
    };
  }, [pathname]);

  /** Open the correct portal only after a validated session is persisted. */
  function onLogin() {
    const current = getSession();
    setSession(current);
    if (!current) return;
    setStorageError('');
    navigate(current.role === 'admin' ? '/admin' : '/candidate');
  }

  /** Remove session before navigation; retain failed logout for retry. */
  function onLogout() {
    const result = logout();
    if (!result.success) {
      setStorageError(result.error);
      return;
    }
    setSession(null);
    setStorageError('');
    navigate('/');
  }

  /** Refresh shell identity and return home after the footer successfully restores defaults. */
  function onReset() {
    setSession(null);
    setStorageError('');
    setRecovery('');
    setReady(true);
    navigate('/', { replace: true });
  }

  const candidatePage = session?.role === 'candidate' ? (
    <Candidate />
  ) : (
    <Navigate to={session ? '/admin' : '/login'} replace />
  );
  const adminPage = session?.role === 'admin' ? (
    <Dashboard onLogout={onLogout} />
  ) : session ? (
    <Navigate to="/candidate" replace />
  ) : (
    <Login initialRole="admin" onLogin={onLogin} />
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header session={session} onLogout={onLogout} theme={theme} onToggleTheme={toggleTheme} />
      {themeError && (
        <p className="auth-storage-error" role="alert">
          {themeError}
        </p>
      )}
      {recovery && (
        <p className="auth-storage-error" role="status">
          {recovery}
        </p>
      )}
      {storageError && (
        <div className="auth-storage-error">
          <p role="alert">
            {storageError}
          </p>
          <button className="cancel-button" type="button" onClick={initialize}>
            Retry demo initialization
          </button>
        </div>
      )}
      {ready ? (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/apply" element={<Apply />} />
          <Route
            path="/login"
            element={session ? (
              <Navigate to={portal} replace />
            ) : (
              <Login onLogin={onLogin} />
            )}
          />
          <Route
            path="/register"
            element={session ? (
              <Navigate to={portal} replace />
            ) : (
              <Register onRegister={onLogin} />
            )}
          />
          <Route path="/candidate" element={candidatePage} />
          <Route path="/admin" element={adminPage} />
          <Route path="*" element={<Home />} />
        </Routes>
      ) : (
        <main id="main-content" className="auth-page" tabIndex={-1}>
          <h1>
            Demo data unavailable
          </h1>
          <p>
            Enable local storage and retry initialization to continue.
          </p>
        </main>
      )}
      <DemoUtility onReset={onReset} />
    </div>
  );
}
