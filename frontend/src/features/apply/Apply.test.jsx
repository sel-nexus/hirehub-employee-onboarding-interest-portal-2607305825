/** Exercise candidate form behavior and shared field accessibility against real localStorage. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, getConfig, render, screen, fireEvent } from '@testing-library/react';
import { seedDemoData, SAMPLE_RESUMES, DEFAULT_SUBMISSIONS, USERS_KEY } from '../demo/mockData';
import { login, registerCandidate } from '../admin/auth';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Apply, { SUCCESS_MESSAGE } from './Apply';
import { SubmissionFields } from '../../components/SubmissionFields';
import { DEPARTMENTS, FIELD_ERRORS } from './validation';
import { createSubmission, DUPLICATE_EMAIL_ERROR, readSubmissions, SUBMISSIONS_KEY } from './submissions';

const defaultAsyncWrapper = getConfig().asyncWrapper;

/** Flush user-event completion under Vitest timers without advancing the success deadline. */
function setupTimerUser() {
  vi.useFakeTimers();
  configure({
    asyncWrapper: async (callback) => {
      let result;
      await act(async () => {
        result = await callback();
        await vi.advanceTimersByTimeAsync(0);
      });
      return result;
    },
  });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
}

const valid = { fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789', department: 'Engineering' };
const labels = { fullName: 'Full Name', email: 'Email Address', mobile: 'Mobile Number', department: 'Department of Interest' };

/** Mount the focused page using the same single-router contract as the app. */
function renderApply() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Apply />
    </MemoryRouter>,
  );
}

/** Fill each field through native user interactions. */
async function fillForm(user, values = valid) {
  for (const field of ['fullName', 'email', 'mobile']) {
    if (values[field]) await user.type(screen.getByLabelText(labels[field]), values[field]);
  }
  if (values.department) await user.selectOptions(screen.getByLabelText(labels.department), values.department);
}

/** Assert that all controlled fields are visibly empty. */
function expectCleared() {
  for (const label of Object.values(labels)) expect(screen.getByLabelText(label)).toHaveValue('');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
  vi.useRealTimers();
  configure({ asyncWrapper: defaultAsyncWrapper });
  vi.restoreAllMocks();
});

/** Test validation, persisted success, and recoverable storage failures. */
describe('Apply', () => {
  it('renders exact copy, accessible required fields, custom validation, and fixed choices', () => {
    renderApply();
    expect(screen.getByRole('heading', { level: 1, name: 'Join Our Team' })).toBeVisible();
    expect(screen.getByText('Express your interest in working with us.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Application' })).toBeVisible();
    expect(screen.getByRole('link', { name: '← Back to Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('form', { name: 'Application form' })).toHaveAttribute('novalidate');
    for (const label of Object.values(labels)) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'false');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
    expect(Array.from(screen.getByLabelText('Department of Interest').options).map((option) => option.textContent.trim())).toEqual(['Select a department', ...DEPARTMENTS]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows all empty-field errors below associated controls without saving', async () => {
    const user = userEvent.setup();
    renderApply();
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    for (const [field, message] of Object.entries(FIELD_ERRORS)) {
      const control = screen.getByLabelText(labels[field]);
      const error = screen.getByText(message);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAttribute('aria-describedby', error.id);
      expect(control.nextElementSibling).toBe(error);
    }
    expect(readSubmissions()).toEqual([]);
  });

  it.each([
    ['fullName', 'Alice1'], ['fullName', 'A'.repeat(101)], ['fullName', '<script>alert(1)</script>'],
    ['email', 'invalid'], ['mobile', '123456789'], ['mobile', '12345678901'], ['mobile', '123456789a'], ['department', ''],
  ])('rejects invalid %s %s while preserving entered details', async (field, value) => {
    const user = userEvent.setup();
    renderApply();
    await fillForm(user, { ...valid, [field]: value });
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent(FIELD_ERRORS[field]);
    expect(screen.getByLabelText(labels[field])).toHaveValue(value);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual([]);
    expect(document.querySelector('script')).toBeNull();
  });

  it('persists a complete normalized record, clears fields, and removes old validation errors', async () => {
    const user = userEvent.setup();
    renderApply();
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    await fillForm(user, { ...valid, fullName: ' Alice Smith ', email: ' Alice@Example.com ' });
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    expectCleared();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
    expect(records).toEqual([{
      ...valid, email: 'Alice@Example.com', id: expect.any(String), submittedAt: expect.any(String),
    }]);
    expect(readSubmissions()).toEqual(records);
  });

  it('dismisses success exactly after 4000ms using safe fake-timer user events', async () => {
    const user = setupTimerUser();
    renderApply();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByRole('status')).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expectCleared();
    expect(readSubmissions()).toHaveLength(1);
  });

  it('restarts the exact 4000ms success deadline after a second distinct valid save', async () => {
    const user = setupTimerUser();
    renderApply();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    const firstRecords = readSubmissions();
    expect(firstRecords).toEqual([{
      ...valid, id: expect.any(String), submittedAt: expect.any(String),
    }]);
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    act(() => vi.advanceTimersByTime(2000));

    const secondValues = { ...valid, email: 'second@example.com' };
    await fillForm(user, secondValues);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    const records = readSubmissions();
    expect(records).toEqual([
      firstRecords[0],
      { ...secondValues, id: expect.any(String), submittedAt: expect.any(String) },
    ]);
    expectCleared();
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status')).toBeVisible();
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    expect(screen.getByRole('status')).toBeVisible();
    expect(readSubmissions()).toEqual(records);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual(records);
  });

  it('cancels pending success dismissal when the page unmounts', async () => {
    const user = setupTimerUser();
    const view = renderApply();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(4000));
    expect(readSubmissions()).toHaveLength(1);
  });

  it('rejects trimmed case-variant duplicates below email and preserves the original dataset', async () => {
    const user = setupTimerUser();
    renderApply();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    const original = readSubmissions();
    await fillForm(user, { ...valid, email: ' ALICE@EXAMPLE.COM ' });
    const enteredEmail = screen.getByLabelText('Email Address').value;
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent(DUPLICATE_EMAIL_ERROR);
    expect(screen.getByLabelText('Email Address')).toHaveValue(enteredEmail);
    expect(screen.getByLabelText('Email Address')).toHaveAccessibleDescription(DUPLICATE_EMAIL_ERROR);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    expect(readSubmissions()).toEqual(original);
  });

  it('cancels a pending success when a subsequent form attempt is invalid', async () => {
    const user = setupTimerUser();
    renderApply();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    expect(vi.getTimerCount()).toBe(0);
    expect(readSubmissions()).toHaveLength(1);
  });

  it('repairs corrupt storage on mount', () => {
    localStorage.setItem(SUBMISSIONS_KEY, '{broken');
    renderApply();
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toEqual([]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('alerts on mount/read failure, preserves input after failed submit, and allows retry', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const user = userEvent.setup();
    renderApply();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read submissions.');
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read submissions.');
    for (const [field, value] of Object.entries(valid)) expect(screen.getByLabelText(labels[field])).toHaveValue(value);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    spy.mockRestore();
    expect(readSubmissions()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSubmissions()).toHaveLength(1);
  });

  it('alerts on quota failure without clearing input or changing persisted records', async () => {
    const original = createSubmission({ ...valid, email: 'existing@example.com' });
    const user = userEvent.setup();
    renderApply();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    for (const [field, value] of Object.entries(valid)) expect(screen.getByLabelText(labels[field])).toHaveValue(value);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual([original]);
    spy.mockRestore();
  });

  it('reports corruption-reset write failure on mount without pretending storage was repaired', () => {
    localStorage.setItem(SUBMISSIONS_KEY, '{}');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderApply();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('{}');
  });
});

/** Verify the reusable component's controlled and later-editing contracts. */
describe('SubmissionFields', () => {
  it('supports read-only email, custom IDs, controlled updates, and associated errors', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(
      <SubmissionFields
        values={valid}
        errors={{ email: 'Email cannot change.' }}
        readOnlyEmail
        idPrefix="edit"
        onChange={onChange}
      />,
    );
    const email = screen.getByLabelText('Email Address');
    expect(email).toHaveAttribute('readonly');
    expect(email).not.toBeDisabled();
    expect(email).toHaveAttribute('id', 'edit-email');
    expect(email).toHaveAccessibleDescription('Email cannot change.');
    await user.type(email, 'new');
    expect(email).toHaveValue(valid.email);
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Design');
    expect(onChange).toHaveBeenCalled();
    view.rerender(
      <SubmissionFields values={{ ...valid, department: 'Design' }} onChange={onChange} idPrefix="edit" />,
    );
    expect(screen.getByLabelText('Department of Interest')).toHaveValue('Design');
    expect(email).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows paste into the controlled public inputs without stripping content', async () => {
    const user = userEvent.setup();
    renderApply();
    const name = screen.getByLabelText('Full Name');
    await user.click(name);
    await user.paste('Alice Smith');
    expect(name).toHaveValue('Alice Smith');
    const mobile = screen.getByLabelText('Mobile Number');
    await user.click(mobile);
    await user.paste('0123456789');
    expect(mobile).toHaveValue('0123456789');
  });
});

/** Verify optional materials and candidate ownership without mocking the local data services. */
describe('application materials and candidate linkage', () => {
  it.each(Object.keys(SAMPLE_RESUMES))('saves the bundled %s resume and safe portfolio for a public applicant', async (sampleResume) => {
    const user = userEvent.setup();
    renderApply();
    const selector = screen.getByLabelText('Sample Resume (optional)');
    expect(Array.from(selector.options).map((option) => option.value)).toEqual(['', ...Object.keys(SAMPLE_RESUMES)]);
    await fillForm(user);
    await user.type(screen.getByLabelText('Portfolio URL (optional)'), 'https://example.com/work');
    await user.selectOptions(selector, sampleResume);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    expectCleared();
    expect(selector).toHaveValue('');
    expect(screen.getByLabelText('Portfolio URL (optional)')).toHaveValue('');
    expect(readSubmissions()).toEqual([{
      ...valid, portfolioUrl: 'https://example.com/work', sampleResume, id: expect.any(String), submittedAt: expect.any(String),
    }]);
  });

  it.each(['javascript:alert(1)', 'data:text/html,bad', '/relative', 'ftp://example.com', 'https://', 'https://example.com/' + 'x'.repeat(2048)])('rejects unsafe or oversized portfolio %s without a false success', async (value) => {
    const user = userEvent.setup();
    renderApply();
    await fillForm(user);
    const portfolio = screen.getByLabelText('Portfolio URL (optional)');
    fireEvent.change(portfolio, { target: { value } });
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(portfolio).toHaveValue(value);
    expect(portfolio).toHaveAttribute('aria-invalid', 'true');
    expect(portfolio).toHaveAccessibleDescription(screen.getByRole('alert').textContent);
    expect(readSubmissions()).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects a synthetic unknown resume choice even when contact details are valid', async () => {
    const user = userEvent.setup();
    renderApply();
    await fillForm(user);
    const select = screen.getByLabelText('Sample Resume (optional)');
    const option = document.createElement('option');
    option.value = 'Unknown resume';
    select.append(option);
    fireEvent.change(select, { target: { value: 'Unknown resume' } });
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Select a bundled sample resume.');
    expect(readSubmissions()).toEqual([]);
  });

  it('links a newly registered candidate first application and prevents synthetic email/userId spoofing', async () => {
    seedDemoData();
    expect(registerCandidate({ ...valid, password: 'password123' }).success).toBe(true);
    const account = JSON.parse(localStorage.getItem(USERS_KEY)).find((user) => user.username === valid.email);
    const user = userEvent.setup();
    renderApply();
    const email = screen.getByLabelText('Email Address');
    expect(email).toHaveValue(valid.email);
    expect(email).toHaveAttribute('readonly');
    await user.type(email, 'spoof@example.com');
    fireEvent.change(email, { target: { value: 'spoof@example.com' } });
    fireEvent.change(email, { target: { name: 'userId', value: 'u-202' } });
    await fillForm(user);
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Product');
    await user.type(screen.getByLabelText('Portfolio URL (optional)'), 'http://example.com/alice');
    await user.selectOptions(screen.getByLabelText('Sample Resume (optional)'), 'UI/UX Case Study');
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    expect(readSubmissions()).toEqual([
      ...DEFAULT_SUBMISSIONS,
      { ...valid, department: 'Product', userId: account.id, status: 'applied', portfolioUrl: 'http://example.com/alice', sampleResume: 'UI/UX Case Study', id: expect.any(String), submittedAt: expect.any(String) },
    ]);
    expect(email).toHaveValue(valid.email);
    expect(screen.getByLabelText('Full Name')).toHaveValue('');
  });

  it('allows a seeded candidate to persist multiple applications under the same account and email', async () => {
    seedDemoData();
    expect(login('alex@example.com', 'password123', 'candidate').success).toBe(true);
    const user = userEvent.setup();
    const view = renderApply();
    for (const department of ['Product', 'Design']) {
      await user.type(screen.getByLabelText('Full Name'), 'Alex Rivera');
      await user.type(screen.getByLabelText('Mobile Number'), '4155552671');
      await user.selectOptions(screen.getByLabelText('Department of Interest'), department);
      await user.click(screen.getByRole('button', { name: 'Submit Application' }));
      expect(screen.getByRole('status')).toHaveTextContent(SUCCESS_MESSAGE);
    }
    const records = readSubmissions();
    expect(records).toHaveLength(10);
    expect(records.slice(0, 8)).toEqual(DEFAULT_SUBMISSIONS);
    expect(records.slice(8)).toEqual(['Product', 'Design'].map((department) => ({
      fullName: 'Alex Rivera', email: 'alex@example.com', mobile: '4155552671', department,
      userId: 'u-201', status: 'applied', id: expect.any(String), submittedAt: expect.any(String),
    })));
    view.unmount();
    renderApply();
    expect(readSubmissions()).toEqual(records);
  });

  it('still rejects an existing unlinked email for a candidate rather than claiming or replacing it', async () => {
    seedDemoData();
    const existing = createSubmission(valid);
    expect(registerCandidate({ ...valid, password: 'password123' }).success).toBe(true);
    const user = userEvent.setup();
    renderApply();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent(DUPLICATE_EMAIL_ERROR);
    expect(readSubmissions()).toEqual([...DEFAULT_SUBMISSIONS, existing]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['logout', 'different candidate', 'changed account email'])('rejects submit when candidate identity becomes %s after mount', async (change) => {
    seedDemoData();
    login('alex@example.com', 'password123', 'candidate');
    const user = userEvent.setup();
    renderApply();
    await user.type(screen.getByLabelText('Full Name'), 'Alex Rivera');
    await user.type(screen.getByLabelText('Mobile Number'), '4155552671');
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Product');
    if (change === 'logout') localStorage.removeItem('hirehub_session');
    else if (change === 'different candidate') login('jordan@example.com', 'password123', 'candidate');
    else {
      const accounts = JSON.parse(localStorage.getItem(USERS_KEY));
      accounts.find((account) => account.id === 'u-201').username = 'newalex@example.com';
      localStorage.setItem(USERS_KEY, JSON.stringify(accounts));
    }
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent(change === 'changed account email' ? 'Use the email of your signed-in candidate account.' : 'Your candidate session changed.');
    expect(screen.getByLabelText('Full Name')).toHaveValue('Alex Rivera');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('preserves noncandidate admin public apply behavior without linking the admin identity', async () => {
    seedDemoData();
    login('admin', 'admin');
    const user = userEvent.setup();
    renderApply();
    expect(screen.getByLabelText('Email Address')).not.toHaveAttribute('readonly');
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(readSubmissions().at(-1)).toEqual({ ...valid, id: expect.any(String), submittedAt: expect.any(String) });
  });

  it('retains materials on failed writes and reports success only after retry persists them', async () => {
    const user = userEvent.setup();
    renderApply();
    await fillForm(user);
    await user.type(screen.getByLabelText('Portfolio URL (optional)'), 'https://example.com/work');
    await user.selectOptions(screen.getByLabelText('Sample Resume (optional)'), 'UI/UX Case Study');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(screen.getByLabelText('Portfolio URL (optional)')).toHaveValue('https://example.com/work');
    expect(screen.getByLabelText('Sample Resume (optional)')).toHaveValue('UI/UX Case Study');
    expect(readSubmissions()).toEqual([]);
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(readSubmissions()[0]).toMatchObject({ portfolioUrl: 'https://example.com/work', sampleResume: 'UI/UX Case Study' });
  });

  it('keeps material controls opt-in for shared-field callers and associates their errors', () => {
    const view = render(<SubmissionFields values={valid} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Portfolio URL (optional)')).not.toBeInTheDocument();
    view.rerender(<SubmissionFields values={{ ...valid, portfolioUrl: 'bad', sampleResume: '' }} onChange={vi.fn()} includeMaterials errors={{ portfolioUrl: 'Unsafe URL' }} idPrefix="materials" />);
    expect(screen.getByLabelText('Portfolio URL (optional)')).toHaveAccessibleDescription('Unsafe URL');
    expect(screen.getByLabelText('Portfolio URL (optional)')).toHaveAttribute('id', 'materials-portfolioUrl');
    expect(screen.getByLabelText('Sample Resume (optional)')).toHaveAccessibleDescription('Bundled mock resume text only; no upload or remote PDF request.');
  });
});
