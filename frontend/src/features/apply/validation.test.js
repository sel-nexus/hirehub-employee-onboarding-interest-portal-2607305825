/** Exercise normalization and every public field rule with untrusted inputs and boundaries. */
import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, FIELD_ERRORS, normalizeValues, validateSubmission } from './validation';

const valid = { fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789', department: 'Engineering' };

/** Verify normalization independently from validation. */
describe('normalizeValues', () => {
  it('trims strings, preserves email case and mobile leading zeros, and ignores extra properties', () => {
    expect(normalizeValues({
      fullName: ' Alice Smith ', email: ' Alice@Example.com ', mobile: ' 0123456789 ', department: ' Engineering ', extra: 'ignored',
    })).toEqual({ ...valid, email: 'Alice@Example.com' });
  });

  it.each([undefined, null, false, 17, 'text', [], () => 'object'])('returns empty strings for invalid container %s', (input) => {
    expect(normalizeValues(input)).toEqual({ fullName: '', email: '', mobile: '', department: '' });
  });

  it.each([undefined, null, 1234567890, true, [], {}, { toString: () => 'Alice Smith' }])(
    'never coerces invalid field type %s into a string',
    (input) => {
      const result = normalizeValues({ fullName: input, email: input, mobile: input, department: input });
      expect(result).toEqual({ fullName: '', email: '', mobile: '', department: '' });
    },
  );
});

/** Check happy paths and every field's negative cases. */
describe('validateSubmission', () => {
  it('accepts a valid record and returns normalized fields', () => {
    expect(validateSubmission(valid)).toEqual({ values: valid, errors: {} });
  });

  it('reports all four required fields for missing input', () => {
    expect(validateSubmission().errors).toEqual(FIELD_ERRORS);
    expect(validateSubmission({}).errors).toEqual(FIELD_ERRORS);
  });

  for (const field of Object.keys(valid)) {
    it.each([undefined, null, 1234567890, false, [], {}, ' ', '\t\n'])
      (`rejects missing/nonstring/blank ${field}: %s`, (value) => {
        expect(validateSubmission({ ...valid, [field]: value }).errors).toEqual({ [field]: FIELD_ERRORS[field] });
      });
  }

  it.each(['A', 'A'.repeat(100), 'Alice  Smith'])('accepts name boundary %s', (fullName) => {
    expect(validateSubmission({ ...valid, fullName }).errors).toEqual({});
  });

  it.each(['A'.repeat(101), 'Alice1', "O'Neil", 'Anne-Marie', 'Émile', 'Alice\nSmith', '<script>alert(1)</script>'])
    ('rejects invalid name %s', (fullName) => {
      expect(validateSubmission({ ...valid, fullName }).errors).toEqual({ fullName: FIELD_ERRORS.fullName });
    });

  it.each(['a@b.c', 'alice+careers@example.co.uk', 'ALICE@EXAMPLE.COM'])('accepts regex-valid email %s', (email) => {
    expect(validateSubmission({ ...valid, email }).errors).toEqual({});
  });

  it.each(['alice', 'alice@', '@example.com', 'a@b', 'a@@b.com', 'a b@example.com', 'a@b .com', '<script>@b.com', 'a@<b>.com'])
    ('rejects invalid email %s', (email) => {
      expect(validateSubmission({ ...valid, email }).errors).toEqual({ email: FIELD_ERRORS.email });
    });

  it.each(['0000000000', '9999999999'])('accepts exactly ten digits including zeros: %s', (mobile) => {
    expect(validateSubmission({ ...valid, mobile }).errors).toEqual({});
  });

  it.each(['123456789', '12345678901', '+123456789', '123 456789', '123-456789', '123456789a', '１２３４５６７８９０', '<img src=x>'])
    ('rejects invalid mobile %s', (mobile) => {
      expect(validateSubmission({ ...valid, mobile }).errors).toEqual({ mobile: FIELD_ERRORS.mobile });
    });

  it('exposes all eight legacy departments plus Product', () => {
    expect(DEPARTMENTS).toEqual([
      'Engineering', 'Design', 'Product', 'Marketing', 'Human Resources', 'Finance', 'Operations', 'Sales', 'Data Science',
    ]);
    expect(Object.isFrozen(DEPARTMENTS)).toBe(true);
  });

  it.each(DEPARTMENTS)('accepts fixed department %s', (department) => {
    expect(validateSubmission({ ...valid, department }).errors).toEqual({});
  });

  it.each(['engineering', 'Legal', '<img src=x onerror=alert(1)>'])('rejects unknown department %s', (department) => {
    expect(validateSubmission({ ...valid, department }).errors).toEqual({ department: FIELD_ERRORS.department });
  });
});
