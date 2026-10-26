/** Verify signup validation, immediate identity and honest quota recovery. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { DEFAULT_USERS, USERS_KEY, SESSION_KEY } from '../demo/mockData';
import { readSession, readUsers, REGISTER_STORAGE_ERROR } from '../admin/auth';

beforeEach(() => { localStorage.clear(); localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

/** Mount signup in its real navigation context and expose only its owner callback. */
function mount() {
  const onRegister = vi.fn();
  render(<MemoryRouter><Register onRegister={onRegister} /></MemoryRouter>);
  return onRegister;
}

/** Fill all signup fields through accessible labels. */
async function fill(user, overrides = {}) {
  const values = { 'Full Name': 'Sam Candidate', 'Email Address': 'sam@example.com', 'Mobile Number': '0123456789', Password: 'password123', ...overrides };
  for (const [label, value] of Object.entries(values)) if (value) await user.type(screen.getByLabelText(label), value);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

it('renders labelled required fields, password hint, disclaimer and login link', () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Create candidate account' })).toBeVisible();
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  for (const label of ['Full Name', 'Email Address', 'Mobile Number', 'Password']) {
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'false');
  }
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByText(/Use at least 8 characters/)).toBeVisible();
  expect(screen.getByText(/Use exactly 10 digits, without a country code/)).toBeVisible();
  expect(screen.getByLabelText('Mobile Number')).toHaveAccessibleDescription(/Spaces, parentheses and hyphens are removed when saved/);
  expect(screen.getByText(/Browser-only demo/)).toBeVisible();
  expect(screen.getByRole('link', { name: /Already have/ })).toHaveAttribute('href', '/login');
});

it('creates a candidate and notifies success only after an immediate session exists', async () => {
  const user = userEvent.setup(); const onRegister = mount();
  await fill(user, { 'Mobile Number': '(012) 345-6789' });
  expect(readUsers()).toHaveLength(6);
  expect(readUsers().at(-1).mobile).toBe('0123456789');
  expect(readSession()).toMatchObject({ userId: readUsers().at(-1).id, role: 'candidate', displayName: 'Sam Candidate' });
  expect(onRegister).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([
  ['Full Name', '', /name/], ['Full Name', 'Sam2', /name/], ['Email Address', 'bad', /valid email/], ['Email Address', '<sam>@example.com', /valid email/],
  ['Mobile Number', '123', /exactly 10 digits/], ['Password', 'short', /at least 8/],
  ...['12345678901', '123456789012', '1234567890123', '12345678901234', '123456789012345', '+1 (415) 555-2671'].map((mobile) => ['Mobile Number', mobile, /exactly 10 digits.*without a country code/]),
  ['Email Address', 'ALEX@EXAMPLE.COM', /already exists/],
])('rejects invalid %s and retains input without creating an account', async (label, value, error) => {
  const user = userEvent.setup(); const onRegister = mount(); const before = localStorage.getItem(USERS_KEY);
  await fill(user, { [label]: value });
  expect(screen.getByRole('alert')).toHaveTextContent(error);
  expect(screen.getByLabelText(label)).toHaveAttribute('aria-describedby', 'register-error');
  expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
  expect(localStorage.getItem(USERS_KEY)).toBe(before); expect(readSession()).toBeNull();
  expect(onRegister).not.toHaveBeenCalled();
});

it('clears validation errors after a corrected signup', async () => {
  const user = userEvent.setup(); const onRegister = mount();
  await fill(user, { Password: 'short' });
  expect(screen.getByRole('alert')).toHaveTextContent('at least 8');
  await user.clear(screen.getByLabelText('Password'));
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(onRegister).toHaveBeenCalledTimes(1); expect(readSession().role).toBe('candidate');
});

it.each(['account', 'session'])('reports %s quota failure, rolls back and permits retry', async (failure) => {
  const user = userEvent.setup(); const onRegister = mount(); const before = localStorage.getItem(USERS_KEY);
  const set = Storage.prototype.setItem;
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === (failure === 'account' ? USERS_KEY : SESSION_KEY)) throw new Error('quota');
    return set.call(this, key, value);
  });
  await fill(user);
  expect(screen.getByRole('alert')).toHaveTextContent(REGISTER_STORAGE_ERROR);
  expect(screen.getByLabelText('Full Name')).toHaveValue('Sam Candidate');
  expect(localStorage.getItem(USERS_KEY)).toBe(before); expect(readSession()).toBeNull();
  expect(onRegister).not.toHaveBeenCalled();
  write.mockRestore(); await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(onRegister).toHaveBeenCalledTimes(1); expect(readUsers()).toHaveLength(6);
});
