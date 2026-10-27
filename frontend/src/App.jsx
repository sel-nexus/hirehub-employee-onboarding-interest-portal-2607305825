/** Compose public access and validated local role routes with one-time demo initialization. */
import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { Header } from './components/Header';
import Home from './features/home/Home';
import Apply from './features/apply/Apply';
import Login from './features/admin/Login';
import Register from './features/auth/Register';
import Dashboard from './features/admin/Dashboard';
import { getSession, logout } from './features/admin/auth';
import { seedMockData, readMockData } from './features/data/mockData';
import { validateSubmission } from './features/apply/validation';

/**
 * Seed once outside rendering, share session refresh, and protect incompatible legacy mutations.
 * Notes: Candidate portal and extended-record maintenance are wired by the next slices.
 * @returns {JSX.Element}
 */
export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [, setSession] = useState(null);
  const [, setData] = useState(null);
  // Inspect current storage before mounting legacy components, even on a new route.
  const data = readMockData();
  const [storageError, setStorageError] = useState('');
  const [recovery, setRecovery] = useState('');
  // Revalidate on every render as well as browser events; never trust cached role state.
  const session = getSession();
  const portal = session?.role === 'admin' ? '/admin' : '/candidate';
  const legacyCompatible = data?.success && data.submissions.every((record) => (
    Object.keys(record).length === 6 && !Object.keys(validateSubmission(record).errors).length
  ));

  /** Initialize or explicitly retry; a failed save never unlocks a destructive legacy reader. */
  function initialize() {
    const result = seedMockData();
    const current = readMockData();
    setData(current);
    setReady(result.success && current.success);
    setStorageError(result.error || current.error);
    setRecovery(result.recovered.length ? `Recovered corrupt local demo data: ${result.recovered.join(', ')}. Defaults restored.` : '');
    setSession(getSession());
  }

  /** Initialize once, including StrictMode effect replay, without rendering storage writes. */
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize();
    }
  }, []);

  /** Requery users/session/data on navigation and cross-tab or window-focus changes. */
  useEffect(() => {
    /** Synchronize without seeding or clearing any persisted data. */
    function refreshSession() {
      setSession(getSession());
      const current = readMockData();
      setData(current);
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

  /** Open the correct portal only after the form has persisted a validated session. */
  function onLogin() {
    const current = getSession();
    setSession(current);
    if (!current) return;
    setStorageError('');
    navigate(current.role === 'admin' ? '/admin' : '/candidate');
  }

  /** Remove the session before navigation and retain failure feedback for retry. */
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

  /** Prevent the unchanged legacy public service from resetting extended seeded records. @param {Event} event */
  function protectApplicationSave(event) {
    const current = readMockData();
    if (!current.success || current.submissions.some((record) => Object.keys(record).length !== 6)) {
      event.preventDefault();
      event.stopPropagation();
      setStorageError(current.error || 'Application saving is awaiting candidate data integration. Your demo records have been preserved.');
    }
  }

  const candidatePage = session?.role === 'candidate' ? (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-card" aria-labelledby="candidate-title">
        <h1 id="candidate-title">
          Candidate Portal
        </h1>
        <p>
          Welcome, {session.displayName}.
        </p>
        <p role="status">
          Your local candidate session is active. Application self-service will be available in the next feature slice.
        </p>
        <Link to="/apply">
          Apply for a role
        </Link>
      </section>
    </main>
  ) : (
    <Navigate to={session ? '/admin' : '/login'} replace />
  );

  const adminPage = session?.role === 'admin' ? (
    legacyCompatible ? (
      <Dashboard onLogout={onLogout} />
    ) : (
      <main id="main-content" className="dashboard-page" tabIndex={-1}>
        <div className="dashboard-heading">
          <h1>
            Submissions Dashboard
          </h1>
          <button className="session-control logout-button" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
        <p role="status">
          Seeded application preview. Editing and pipeline controls await the compatible data-service slice; records are preserved.
        </p>
        {data.success && (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="submissions-table">
              <caption>
                {data.submissions.length} local submissions
              </caption>
              <thead>
                <tr>
                  {['Name', 'Email', 'Mobile', 'Department', 'Submitted', 'Stage'].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {record.fullName}
                    </td>
                    <td>
                      {record.email}
                    </td>
                    <td>
                      {record.mobile}
                    </td>
                    <td>
                      {record.department}
                    </td>
                    <td>
                      {new Date(record.submittedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td>
                      {record.status || 'received'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    )
  ) : session ? (
    <Navigate to="/candidate" replace />
  ) : (
    <Login initialRole="admin" onLogin={onLogin} />
  );

  return (
    <div
      style={{
        '--color-primary': '#4F46E5',
        '--color-primary-hover': '#4338CA',
        '--color-primary-light': '#EEF2FF',
        '--color-bg': '#F8FAFC',
        background: 'var(--color-bg)',
      }}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header session={session} onLogout={onLogout} />
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
          <Route
            path="/apply"
            element={legacyCompatible ? (
              <div onSubmitCapture={protectApplicationSave}>
                <Apply />
              </div>
            ) : (
              <main id="main-content" className="apply-page" tabIndex={-1}>
                <div className="apply-container">
                  <h1>
                    Join Our Team
                  </h1>
                  <p role="status">
                    Application saving is awaiting candidate data integration. Your demo records have been preserved.
                  </p>
                  <Link to="/login">
                    Candidate Login
                  </Link>
                  <Link to="/register">
                    Create a candidate account
                  </Link>
                </div>
              </main>
            )}
          />
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
    </div>
  );
}
