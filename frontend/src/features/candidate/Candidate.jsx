/** Personal local applications, accessible progress milestones and mock interview schedules. */
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { getSession } from '../admin/auth';
import { MILESTONES, readCandidateApplications, stageFor } from './candidateService';
import ProfileEdit from './ProfileEdit';

/** Requery owned applications on visits, focus and storage events. @returns {JSX.Element} */
export default function Candidate() {
  const { pathname } = useLocation();
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const session = getSession();

  const refresh = useCallback(() => {
    try {
      const records = readCandidateApplications();
      setApplications(records);
      setError('');
      setEditing((current) => current && records.some((record) => record.id === current.id) ? current : null);
    } catch (caught) {
      setApplications([]);
      setEditing(null);
      setError(caught.message);
    }
  }, []);
  const cancel = useCallback(() => setEditing(null), []);

  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [pathname, refresh]);

  if (session?.role !== 'candidate') return <Navigate to={session ? '/admin' : '/login'} replace />;

  return (
    <main id="main-content" className="dashboard-page" tabIndex={-1}>
      <div className="dashboard-heading" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1>
            Candidate Portal
          </h1>
          <p style={{ marginTop: 'var(--space-3)' }}>
            Welcome, {session.displayName}.
          </p>
        </div>
        <Link className="back-home-link" style={{ margin: 0 }} to="/apply">
          Apply for a role
        </Link>
      </div>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
        Your applications and hiring progress are local to this browser. Interview schedules are mock demo information.
      </p>
      {notice && (
        <p role="status" className="submission-success">
          {notice}
        </p>
      )}
      {error ? (
        <div>
          <p role="alert" className="submission-storage-error">
            {error}
          </p>
          <button type="button" className="cancel-button" onClick={refresh}>
            Retry applications
          </button>
        </div>
      ) : applications.length === 0 ? (
        <section aria-labelledby="empty-title">
          <h2 id="empty-title">
            No applications yet
          </h2>
          <p style={{ marginBlock: 'var(--space-4)' }}>
            Your account is ready. Submit an application to start following your hiring progress.
          </p>
          <Link to="/apply" className="back-home-link" style={{ margin: 0 }}>
            Start an application
          </Link>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-8)' }}>
          {applications.map((application) => {
            const stage = stageFor(application.status);
            return (
              <section
                key={application.id}
                aria-labelledby={`application-${application.id}`}
                style={{ padding: 'var(--space-6)', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-card)' }}
              >
                <ol
                  aria-label="Hiring progress"
                  style={{ display: 'flex', listStyle: 'none', padding: 0, margin: '0 0 var(--space-6)', gap: 'var(--space-3)' }}
                >
                  {MILESTONES.map((milestone, index) => (
                    <li
                      key={milestone}
                      aria-current={index === stage.index ? 'step' : undefined}
                      style={{ flex: '1 1 0', minWidth: 0, fontSize: 13, overflowWrap: 'anywhere',
                        borderTop: `2px solid ${index === stage.index ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        paddingTop: 'var(--space-2)', color: index === stage.index ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                    >
                      {index === stage.index && (
                        <svg
                          role="img" aria-label="Current stage" width="20" height="20" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.5"
                        >
                          <circle cx="12" cy="12" r="8" />
                          <path d="m9 12 2 2 4-4" />
                        </svg>
                      )}
                      <span style={{ display: 'block' }}>
                        {milestone}
                      </span>
                      <span>
                        {index < stage.index ? 'Completed' : index === stage.index ? 'Current' : 'Upcoming'}
                      </span>
                    </li>
                  ))}
                </ol>
                <h2 id={`application-${application.id}`} style={{ fontSize: 22 }}>
                  {application.department} application
                </h2>
                <p role="status" style={{ marginBlock: 'var(--space-3)', fontWeight: 600 }}>
                  {stage.label}
                </p>
                <p style={{ marginBottom: 'var(--space-5)' }}>
                  {stage.next}
                </p>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-4)', overflowWrap: 'anywhere' }}>
                  {[
                    ['Full name', application.fullName], ['Email', application.email], ['Mobile', application.mobile],
                    ['Submitted', new Date(application.submittedAt).toLocaleDateString()], ['Sample resume', application.sampleResume || 'No sample selected'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt style={{ color: 'var(--color-text-muted)' }}>
                        {label}
                      </dt>
                      <dd style={{ margin: 0 }}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {application.portfolioUrl && (
                  <p style={{ marginBlock: 'var(--space-4)', overflowWrap: 'anywhere' }}>
                    <a href={application.portfolioUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                      View portfolio (opens in a new tab)
                    </a>
                  </p>
                )}
                <h3 style={{ marginTop: 'var(--space-5)' }}>
                  Interview schedule
                </h3>
                {application.interviewSchedule ? (
                  <p style={{ marginBlock: 'var(--space-3)' }}>
                    <time dateTime={application.interviewSchedule.dateTime}>
                      {new Date(application.interviewSchedule.dateTime).toLocaleString()}
                    </time>
                    {' — '}{application.interviewSchedule.format}{' — '}{application.interviewSchedule.location}
                  </p>
                ) : (
                  <p style={{ marginBlock: 'var(--space-3)' }}>
                    No interview schedule has been shared yet.
                  </p>
                )}
                <button className="cancel-button" type="button" onClick={() => { setNotice(''); setEditing(application); }}>
                  Edit contact details
                </button>
              </section>
            );
          })}
        </div>
      )}
      {editing && (
        <ProfileEdit
          key={editing.id}
          application={editing}
          onCancel={cancel}
          onSaved={() => { refresh(); setEditing(null); setNotice('Contact details saved to your local profile.'); }}
        />
      )}
    </main>
  );
}
