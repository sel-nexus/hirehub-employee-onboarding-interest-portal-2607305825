/** Verify accessible signup validation and account/session persistence with real local auth. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { getSession, REGISTRATION_ERRORS, REGISTER_STORAGE_ERROR } from '../admin/auth';
import { seedMockData, USERS_KEY, DEFAULT_USERS } from '../data/mockData';

beforeEach(() => {
  localStorage.clear();
  seedMockData();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Mount signup in its actual navigation context. */
function renderRegister(onRegister = vi.fn()) {
  return render(
    <MemoryRouter>
      <Register onRegister={onRegister} />
    </MemoryRouter>,
  );
}

/** Fill signup fields through their accessible labels. */
async function fillRegistration(user, fields = {}) {
  const values = { 'Full Name': 'New Candidate', 'Email Address': 'new@example.com', Password: 'password123', 'Confirm Password': 'password123', ...fields };
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(screen.getByLabelText(label, { exact: true }), value);
  }
  await user.click(screen.getByRole('button', { name: 'Create Account' }));
}

describe('Register', () => {
  it('renders a labelled signup form, local-only password warning and incoming login link', () => {
    renderRegister();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: 'Create Candidate Account' })).toBeVisible();
    expect(screen.getByText(/Do not use a real password/)).toBeVisible();
    expect(screen.getByLabelText('Full Name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
    for (const label of ['Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    }
    for (const label of ['Full Name', 'Email Address', 'Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-invalid', 'false');
    }
    expect(screen.getByRole('link', { name: 'Already have an account? Login' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('creates a persistent candidate account and session before notifying success', async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    renderRegister(onRegister);
    await fillRegistration(user);
    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(getSession()).toMatchObject({ role: 'candidate', displayName: 'New Candidate' });
    const accounts = JSON.parse(localStorage.getItem(USERS_KEY));
    expect(accounts).toHaveLength(DEFAULT_USERS.length + 1);
    expect(accounts.at(-1)).toMatchObject({ id: getSession().userId, username: 'new@example.com', role: 'candidate' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('reports every missing field with linked inline errors and no session', async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    renderRegister(onRegister);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    for (const [label, key] of [['Full Name', 'displayName'], ['Email Address', 'username'], ['Password', 'password'], ['Confirm Password', 'confirmPassword']]) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-describedby', `register-${key}-error`);
      expect(screen.getByText(REGISTRATION_ERRORS[key])).toBeVisible();
    }
    expect(getSession()).toBeNull();
    expect(onRegister).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
  });
  it.each([
    ['Full Name', 'A', 'displayName'], ['Email Address', 'bad', 'username'], ['Password', 'short', 'password'], ['Confirm Password', 'wrong', 'confirmPassword'],
  ])('reports invalid %s with field association and no saved account', async (label, value, key) => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    renderRegister(onRegister);
    await fillRegistration(user, { [label]: value });
    expect(screen.getByText(REGISTRATION_ERRORS[key])).toBeVisible();
    expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-describedby', `register-${key}-error`);
    expect(getSession()).toBeNull();
    expect(onRegister).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toHaveLength(DEFAULT_USERS.length);
  });
  it('shows duplicate email without overwriting existing accounts or invoking success', async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    renderRegister(onRegister);
    await fillRegistration(user, { 'Email Address': 'ALEX@example.com' });
    expect(screen.getByRole('alert')).toHaveTextContent(REGISTRATION_ERRORS.duplicate);
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('aria-invalid', 'true');
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
    expect(getSession()).toBeNull();
    expect(onRegister).not.toHaveBeenCalled();
  });
  it('clears field errors on correction and establishes candidate session', async () => {
    const user = userEvent.setup();
    renderRegister();
    await fillRegistration(user, { 'Email Address': 'bad' });
    expect(screen.getByRole('alert')).toHaveTextContent(REGISTRATION_ERRORS.username);
    await user.clear(screen.getByLabelText('Email Address'));
    await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Email Address')).not.toHaveAttribute('aria-describedby');
    expect(getSession()?.role).toBe('candidate');
  });
  it('preserves typed fields and reports storage failure, then permits a real retry', async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderRegister(onRegister);
    await fillRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent(REGISTER_STORAGE_ERROR);
    expect(screen.getByLabelText('Full Name')).toHaveValue('New Candidate');
    expect(screen.getByLabelText('Email Address')).toHaveValue('new@example.com');
    expect(onRegister).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(getSession()?.role).toBe('candidate');
  });
  it('shows blocked localStorage getter failure with no successful callback', async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    renderRegister(onRegister);
    await fillRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent(REGISTER_STORAGE_ERROR);
    expect(onRegister).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });
});
