/** Collect candidate interest with validated materials and honest local account linkage. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SubmissionFields } from '../../components/SubmissionFields';
import { validateSubmission } from './validation';
import { createSubmission, readSubmissions, validateSubmissionMetadata } from './submissions';
import { readSession, readUsers } from '../admin/auth';

const EMPTY_VALUES = { fullName: '', email: '', mobile: '', department: '', portfolioUrl: '', sampleResume: '' };
export const SUCCESS_MESSAGE = 'Thank you! Your interest has been submitted successfully.';

/**
 * Render a public application form, binding candidate identity only to a valid demo account.
 * Returns:
 *   Accessible fields, recoverable errors and timed save confirmation.
 * Notes:
 *   Session and account are rechecked at submit time. Public/admin applications remain unlinked.
 */
export default function Apply() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [storageError, setStorageError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successGeneration, setSuccessGeneration] = useState(0);
  const [candidate, setCandidate] = useState(null);

  /** Read and repair submissions, then prefill a validated candidate email, not a guessed identity. */
  useEffect(() => {
    try {
      readSubmissions();
      const session = readSession();
      if (session?.role === 'candidate') {
        const user = readUsers().find((account) => account.id === session.userId);
        setCandidate({ userId: user.id, email: user.username });
        setValues((current) => ({ ...current, email: user.username }));
      }
    } catch (error) {
      setStorageError(error.message);
    }
  }, []);

  /** Restart each successful save's deadline and release the timer on unmount or failure. */
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(false), 4000);
    return () => clearTimeout(timer);
  }, [success, successGeneration]);

  /** Allow typing and paste only into form fields; never accept synthetic identity changes. */
  function handleChange(event) {
    const { name, value } = event.target;
    if (!Object.hasOwn(EMPTY_VALUES, name) || (name === 'email' && candidate)) return;
    setValues((current) => ({ ...current, [name]: value }));
  }

  /** Validate, recheck current account ownership, and clear fields only after persistence succeeds. */
  function handleSubmit(event) {
    event.preventDefault();
    setSuccess(false);
    setStorageError('');
    const result = validateSubmission(values);
    const fieldErrors = { ...result.errors, ...validateSubmissionMetadata(values) };
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    try {
      const session = readSession();
      if (candidate && (session?.role !== 'candidate' || session.userId !== candidate.userId)) {
        throw new Error('Your candidate session changed. Sign in again and reload this form before submitting.');
      }
      let identity = {};
      if (session?.role === 'candidate') {
        const user = readUsers().find((account) => account.id === session.userId);
        if (!user || result.values.email.toLowerCase() !== user.username.toLowerCase()) {
          setErrors({ email: 'Use the email of your signed-in candidate account. Reload this form if your account email changed.' });
          return;
        }
        identity = { userId: user.id, email: user.username, status: 'applied' };
      }
      const materials = Object.fromEntries(['portfolioUrl', 'sampleResume']
        .filter((key) => values[key] !== '').map((key) => [key, values[key]]));
      createSubmission({ ...result.values, ...materials, ...identity });
      setValues({ ...EMPTY_VALUES, email: identity.email || '' });
      setSuccessGeneration((current) => current + 1);
      setSuccess(true);
    } catch (error) {
      if (error.fieldErrors) setErrors(error.fieldErrors);
      else setStorageError(error.message);
    }
  }

  return (
    <main id="main-content" className="apply-page" tabIndex={-1}>
      <div className="apply-container">
        <h1>
          Join Our Team
        </h1>
        <p className="apply-subtitle">
          Express your interest in working with us.
        </p>
        {candidate && (
          <p>
            This application will be linked to your signed-in local demo candidate account.
          </p>
        )}
        <form className="submission-form" noValidate onSubmit={handleSubmit} aria-label="Application form">
          {success && (
            <p className="submission-success" role="status">
              {SUCCESS_MESSAGE}
            </p>
          )}
          {storageError && (
            <p className="submission-storage-error" role="alert">
              {storageError}
            </p>
          )}
          <SubmissionFields
            values={values}
            errors={errors}
            onChange={handleChange}
            readOnlyEmail={Boolean(candidate)}
            includeMaterials
          />
          <button className="submission-button" type="submit">
            Submit Application
          </button>
        </form>
        <Link className="back-home-link" to="/">
          ← Back to Home
        </Link>
      </div>
    </main>
  );
}
