/** Exercise candidate form behavior and shared field accessibility against real localStorage. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, getConfig, render, screen } from '@testing-library/react';
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
    expect(screen.getAllByRole('option').map((option) => option.textContent.trim())).toEqual(['Select a department', ...DEPARTMENTS]);
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
