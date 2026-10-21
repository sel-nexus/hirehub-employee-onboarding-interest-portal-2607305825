/** Share controlled, accessible candidate fields between application and later editing. */
import PropTypes from 'prop-types';
import { DEPARTMENTS } from '../features/apply/validation';

const TEXT_FIELDS = [
  { name: 'fullName', label: 'Full Name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email Address', type: 'email', autoComplete: 'email' },
  { name: 'mobile', label: 'Mobile Number', type: 'tel', autoComplete: 'tel-national' },
];

/**
 * Render labeled inputs with adjacent, associated validation errors.
 * Args:
 *   values: The four controlled string values.
 *   errors: Field-specific validation messages.
 *   onChange: The native change handler supplied by the owning form.
 *   readOnlyEmail: Whether email should remain visible but immutable.
 *   idPrefix: A stable prefix to avoid IDs colliding across forms.
 * Returns:
 *   Three text inputs and the fixed department selector.
 */
export function SubmissionFields({ values, errors = {}, onChange, readOnlyEmail = false, idPrefix = 'submission' }) {
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
    </>
  );
}

SubmissionFields.propTypes = {
  values: PropTypes.shape({
    fullName: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    mobile: PropTypes.string.isRequired,
    department: PropTypes.string.isRequired,
  }).isRequired,
  errors: PropTypes.objectOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  readOnlyEmail: PropTypes.bool,
  idPrefix: PropTypes.string,
};
