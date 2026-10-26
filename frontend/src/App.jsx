/** Compose public routes and the browser-only demo login with shared navigation. */
import { useState, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Register from './features/access/Register';
import { Header } from './components/Header';
import Home from './features/home/Home';
import Apply from './features/apply/Apply';
import Login from './features/admin/Login';
import Dashboard from './features/admin/Dashboard';
import { readSession, logout } from './features/admin/auth';
import { seedDemoData } from './features/demo/mockData';
import { DemoBar } from './features/demo/DemoBar';

/**
 * Share validated persistent identity across public, candidate and recruiter routes.
 * Returns:
 *   Public pages, role-specific access gates, candidate entry or recruiter dashboard.
 * Notes:
 *   Storage errors never imply successful login or logout.
 */
export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [session, setSession] = useState(readSession);
  const [storageError, setStorageError] = useState('');
  const [demoReady, setDemoReady] = useState(false);
  const [demoError, setDemoError] = useState('');

  /** Seed after commit so no storage mutation occurs during a React render. */
  useEffect(() => {
    const result = seedDemoData();
    setDemoError(result.error);
    setDemoReady(true);
  }, []);

  /** Refresh the cleared session and return home after a confirmed successful reset. */
  function onReset() {
    setDemoError('');
    setStorageError('');
    setSession(readSession());
    navigate('/');
  }

  /** Requery storage when navigation or browser session activity changes. */
  useEffect(() => {
    /** Synchronize the shared state, failing closed if reads are unavailable. */
    function refreshSession() {
      setSession(readSession());
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
    const identity = readSession();
    setSession(identity);
    setStorageError('');
    if (identity && pathname !== '/admin') navigate(identity.role === 'admin' ? '/admin' : '/candidate');
    else if (identity?.role === 'candidate') navigate('/candidate');
  }

  /** Return home only after session removal succeeds; retain failure feedback. */
  function onLogout() {
    const result = logout();
    if (!result.success) {
      setStorageError(result.error);
      return;
    }
    setStorageError('');
    setSession(null);
    navigate('/');
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header authenticated={Boolean(session)} session={session} onLogout={onLogout} />
      {storageError && (
        <p className="auth-storage-error" role="alert">
          {storageError}
        </p>
      )}
      {demoReady ? (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/apply" element={<Apply />} />
          <Route
            path="/login"
            element={session ? (
              <Navigate to={session.role === 'admin' ? '/admin' : '/candidate'} replace />
            ) : (
              <Login onLogin={onLogin} />
            )}
          />
          <Route
            path="/register"
            element={session ? (
              <Navigate to={session.role === 'admin' ? '/admin' : '/candidate'} replace />
            ) : (
              <Register onRegister={onLogin} />
            )}
          />
          <Route
            path="/candidate"
            element={session?.role === 'candidate' ? (
              <main id="main-content" className="auth-page">
                <section className="auth-card" aria-labelledby="candidate-title">
                  <h1 id="candidate-title">Candidate portal</h1>
                  <p>Welcome, {session.displayName}.</p>
                  <p>Your candidate account is ready. Application progress and contact profile tools are not available in this access demo yet.</p>
                  <Link to="/apply">Submit an application</Link>
                  <p className="auth-disclaimer">Browser-only demo. Your session remains in this browser until you log out.</p>
                  <Link to="/admin">Recruiter access</Link>
                </section>
              </main>
            ) : session ? (
              <main id="main-content" className="auth-page">
                <section className="auth-card">
                  <h1>Candidate access only</h1>
                  <p>This account belongs to a recruiter. Use your administrator dashboard.</p>
                  <Link to="/admin">Go to Admin</Link>
                </section>
              </main>
            ) : (
              <Login key="candidate-gate" onLogin={onLogin} />
            )}
          />
          <Route
            path="/admin"
            element={session?.role === 'admin' ? (
              <Dashboard onLogout={onLogout} />
            ) : session ? (
              <main id="main-content" className="auth-page">
                <section className="auth-card">
                  <h1>Recruiter access only</h1>
                  <p>Candidate accounts cannot access recruiter submissions.</p>
                  <Link to="/candidate">Return to Candidate portal</Link>
                </section>
              </main>
            ) : (
              <Login key="admin-gate" initialRole="admin" onLogin={onLogin} />
            )}
          />
          <Route path="*" element={<Home />} />
        </Routes>
      ) : (
        <main id="main-content" aria-busy="true">
          <p role="status">
            Preparing local demo data…
          </p>
        </main>
      )}
      <DemoBar initializationError={demoError} onReset={onReset} />
    </>
  );
}
