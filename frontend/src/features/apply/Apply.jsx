/** Collect and persist candidate interest with custom validation and timed confirmation. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SubmissionFields } from '../../components/SubmissionFields';
import { validateSubmission } from './validation';
import { createSubmission, readSubmissions, SAMPLE_RESUMES, validateMaterials } from './submissions';
import { getSession } from '../admin/auth';

const EMPTY_VALUES = { fullName: '', email: '', mobile: '', department: '', portfolioUrl: '', sampleResume: '' };
export const SUCCESS_MESSAGE = 'Thank you! Your interest has been submitted successfully.';

/**
 * Render the candidate form and preserve entered details on any failed save.
 * Returns:
 *   The application landmark with field errors, storage alerts, and success status.
 * Notes:
 *   The success timer is cancelled on subsequent attempts and on unmount.
 */
export default function Apply() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [storageError, setStorageError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successGeneration, setSuccessGeneration] = useState(0);

  /** Read and repair the local dataset on mount, surfacing storage failures. */
  useEffect(() => {
    try {
      readSubmissions();
    } catch (error) {
      setStorageError(error.message);
    }
  }, []);

  /** Restart the four-second deadline for each successful save and release pending timers. */
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(false), 4000);
    return () => clearTimeout(timer);
  }, [success, successGeneration]);

  /**
   * Keep native input changes controlled without filtering typing or paste.
   * Args:
   *   event: The input or select change event.
   */
  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  /**
   * Validate all fields and report success only after storage accepts the record.
   * Args:
   *   event: The form submission event.
   */
  function handleSubmit(event) {
    event.preventDefault();
    setSuccess(false);
    setStorageError('');
    const result = validateSubmission(values);
    const materials = validateMaterials(values);
    const fieldErrors = { ...result.errors, ...materials.errors };
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    try {
      createSubmission({ ...result.values, ...materials.values });
      setValues(EMPTY_VALUES);
      setSuccessGeneration((current) => current + 1);
      setSuccess(true);
    } catch (error) {
      if (error.fieldErrors) {
        setErrors(error.fieldErrors);
      } else {
        setStorageError(error.message);
      }
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
          <SubmissionFields values={values} errors={errors} onChange={handleChange} />
          <div className="submission-field">
            <label htmlFor="apply-portfolio">
              Portfolio URL (optional)
            </label>
            <input
              id="apply-portfolio" name="portfolioUrl" type="url" value={values.portfolioUrl} onChange={handleChange}
              aria-invalid={Boolean(errors.portfolioUrl)} aria-describedby={errors.portfolioUrl ? 'apply-portfolio-error' : undefined}
            />
            {errors.portfolioUrl && (
              <p id="apply-portfolio-error" role="alert" className="field-error">
                {errors.portfolioUrl}
              </p>
            )}
          </div>
          <div className="submission-field">
            <label htmlFor="apply-resume">
              Sample resume (optional)
            </label>
            <select
              id="apply-resume" name="sampleResume" value={values.sampleResume} onChange={handleChange}
              aria-invalid={Boolean(errors.sampleResume)} aria-describedby={errors.sampleResume ? 'apply-resume-error' : undefined}
            >
              <option value="">
                Select a sample resume
              </option>
              {SAMPLE_RESUMES.map((resume) => (
                <option key={resume} value={resume}>
                  {resume}
                </option>
              ))}
            </select>
            {errors.sampleResume && (
              <p id="apply-resume-error" role="alert" className="field-error">
                {errors.sampleResume}
              </p>
            )}
          </div>
          <button className="submission-button" type="submit">
            Submit Application
          </button>
        </form>
        {getSession()?.role === 'candidate' && (
          <Link className="back-home-link" to="/candidate">
            View my applications
          </Link>
        )}
        <Link className="back-home-link" to="/">
          ← Back to Home
        </Link>
      </div>
    </main>
  );
}
