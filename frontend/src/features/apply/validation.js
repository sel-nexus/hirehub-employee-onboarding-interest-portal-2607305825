/** Validate and normalize the fixed candidate-interest fields without coercing types. */
export const DEPARTMENTS = Object.freeze([
  'Engineering',
  'Design',
  'Marketing',
  'Human Resources',
  'Finance',
  'Operations',
  'Sales',
  'Data Science',
]);

export const FIELD_ERRORS = Object.freeze({
  fullName: 'Enter a full name using only alphabets and spaces (maximum 100 characters).',
  email: 'Enter a valid email address.',
  mobile: 'Enter a mobile number containing exactly 10 digits.',
  department: 'Select a department of interest.',
});

/**
 * Trim string fields and turn missing or nonstring values into empty strings.
 * Args:
 *   input: An untrusted candidate field object.
 * Returns:
 *   A new object containing only the four normalized string fields.
 * Notes:
 *   Invalid types never become valid through implicit string coercion.
 * @param {*} input
 * @returns {{fullName: string, email: string, mobile: string, department: string}}
 */
export function normalizeValues(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(
    Object.keys(FIELD_ERRORS).map((field) => [field, typeof source[field] === 'string' ? source[field].trim() : '']),
  );
}

/**
 * Check every normalized field against the public-form rules.
 * Args:
 *   input: Untrusted candidate details.
 * Returns:
 *   Normalized values and an error map, empty only when every field is valid.
 * @param {*} input
 * @returns {{values: object, errors: object}}
 */
export function validateSubmission(input) {
  const values = normalizeValues(input);
  const errors = {};
  if (!values.fullName || values.fullName.length > 100 || !/^[A-Za-z ]+$/.test(values.fullName)) {
    errors.fullName = FIELD_ERRORS.fullName;
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.email)) {
    errors.email = FIELD_ERRORS.email;
  }
  if (!/^\d{10}$/.test(values.mobile)) {
    errors.mobile = FIELD_ERRORS.mobile;
  }
  if (!DEPARTMENTS.includes(values.department)) {
    errors.department = FIELD_ERRORS.department;
  }
  return { values, errors };
}
