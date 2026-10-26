/** Share controlled, accessible candidate fields between application and later editing. */
import PropTypes from 'prop-types';
import { DEPARTMENTS } from '../features/apply/validation';
import { SAMPLE_RESUMES } from '../features/demo/mockData';

const TEXT_FIELDS = [
  { name: 'fullName', label: 'Full Name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email Address', type: 'email', autoComplete: 'email' },
  { name: 'mobile', label: 'Mobile Number', type: 'tel', autoComplete: 'tel-national' },
];

/**
 * Render labeled inputs with adjacent, associated validation errors.
 * Args:
 *   values: Controlled contact strings and optional material strings.
 *   errors: Field-specific validation messages.
 *   onChange: The native change handler supplied by the owning form.
 *   readOnlyEmail: Whether email should remain visible but immutable.
 *   includeMaterials: Opt into optional portfolio and locally bundled sample selection.
 *   idPrefix: A stable prefix to avoid IDs colliding across forms.
 * Returns:
 *   Contact controls and, when requested, optional material controls with associated errors.
 */
export function SubmissionFields({ values, errors = {}, onChange, readOnlyEmail = false, includeMaterials = false, idPrefix = 'submission' }) {
  return (
    <>
      {TEXT_FIELDS.map(({ name, label, type, autoComplete }) => (
        <div className="submission-field" key={name}>
          <label htmlFor={`${idPrefix}-${name}`}>
            {label}
          </label>
          <input
            id={`${idPrefix}-${name}`}
            name={name}
            type={type}
            autoComplete={autoComplete}
            inputMode={name === 'mobile' ? 'numeric' : undefined}
            value={values[name]}
            onChange={onChange}
            readOnly={name === 'email' && readOnlyEmail}
            aria-required="true"
            aria-invalid={Boolean(errors[name])}
            aria-describedby={errors[name] ? `${idPrefix}-${name}-error` : undefined}
          />
          {errors[name] && (
            <p className="field-error" id={`${idPrefix}-${name}-error`} role="alert">
              {errors[name]}
            </p>
          )}
        </div>
      ))}
      <div className="submission-field">
        <label htmlFor={`${idPrefix}-department`}>
          Department of Interest
        </label>
        <select
          id={`${idPrefix}-department`}
          name="department"
          value={values.department}
          onChange={onChange}
          aria-required="true"
          aria-invalid={Boolean(errors.department)}
          aria-describedby={errors.department ? `${idPrefix}-department-error` : undefined}
        >
          <option value="">
            Select a department
          </option>
          {DEPARTMENTS.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
        {errors.department && (
          <p className="field-error" id={`${idPrefix}-department-error`} role="alert">
            {errors.department}
          </p>
        )}
      </div>
      {includeMaterials && (
        <>
          <div className="submission-field">
            <label htmlFor={`${idPrefix}-portfolioUrl`}>
              Portfolio URL (optional)
            </label>
            <input
              id={`${idPrefix}-portfolioUrl`}
              name="portfolioUrl"
              type="url"
              value={values.portfolioUrl || ''}
              onChange={onChange}
              aria-invalid={Boolean(errors.portfolioUrl)}
              aria-describedby={errors.portfolioUrl ? `${idPrefix}-portfolioUrl-error` : undefined}
            />
            {errors.portfolioUrl && (
              <p className="field-error" id={`${idPrefix}-portfolioUrl-error`} role="alert">
                {errors.portfolioUrl}
              </p>
            )}
          </div>
          <div className="submission-field">
            <label htmlFor={`${idPrefix}-sampleResume`}>
              Sample Resume (optional)
            </label>
            <select
              id={`${idPrefix}-sampleResume`}
              name="sampleResume"
              value={values.sampleResume || ''}
              onChange={onChange}
              aria-invalid={Boolean(errors.sampleResume)}
              aria-describedby={errors.sampleResume ? `${idPrefix}-sampleResume-error` : `${idPrefix}-materials-help`}
            >
              <option value="">
                No sample resume
              </option>
              {Object.keys(SAMPLE_RESUMES).map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
            <p id={`${idPrefix}-materials-help`}>
              Bundled mock resume text only; no upload or remote PDF request.
            </p>
            {errors.sampleResume && (
              <p className="field-error" id={`${idPrefix}-sampleResume-error`} role="alert">
                {errors.sampleResume}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

SubmissionFields.propTypes = {
  values: PropTypes.shape({
    fullName: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    mobile: PropTypes.string.isRequired,
    department: PropTypes.string.isRequired,
    portfolioUrl: PropTypes.string,
    sampleResume: PropTypes.string,
  }).isRequired,
  errors: PropTypes.objectOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  readOnlyEmail: PropTypes.bool,
  includeMaterials: PropTypes.bool,
  idPrefix: PropTypes.string,
};
