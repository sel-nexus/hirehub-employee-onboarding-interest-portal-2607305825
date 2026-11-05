/** Exercise access forms with actual accounts and storage, not service mocks. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AccessLogin from './AccessLogin';
import Register from './Register';
import { logout } from './accounts';
import { readUsers, SESSION_KEY, USERS_KEY } from '../demo/storage';

beforeEach(() => { localStorage.clear(); logout(); readUsers(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); logout(); localStorage.clear(); });

/** Render a real form and a visible navigation destination. */
function mount(component) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={component} />
        <Route path="/portal" element={<h1>Portal destination</h1>} />
        <Route path="/recruiter" element={<h1>Recruiter destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Fill the four labeled registration contacts. */
async function fillRegistration(user, email = 'casey@example.com') {
  await user.type(screen.getByLabelText('Full name'), 'Casey Quinn');
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Mobile'), '2025550199');
  await user.type(screen.getByLabelText('Password'), 'password123');
}

it.each([
  ['admin', 'admin', 'admin', 'Recruiter destination'],
  ['candidate', 'alex@example.com', 'password123', 'Portal destination'],
])('logs in %s and navigates only after persistence', async (role, username, password, heading) => {
  const user = userEvent.setup();
  mount(<AccessLogin onLogin={() => {}} />);
  expect(screen.getByLabelText('Account role')).toHaveValue('admin');
  await user.selectOptions(screen.getByLabelText('Account role'), role);
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(screen.getByRole('heading', { name: heading })).toBeVisible();
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)).role).toBe(role);
});

it('shows exact hints and rejects wrong role while retaining credentials', async () => {
  const user = userEvent.setup();
  mount(<AccessLogin onLogin={() => {}} />);
  expect(screen.getByText('Admin: admin / admin')).toBeVisible();
  expect(screen.getByText('Recruiter: recruiter@hirehub.demo / admin123')).toBeVisible();
  expect(screen.getByText(/alex@example.com.*jordan@example.com.*taylor@example.com/)).toBeVisible();
  expect(screen.getByText('Candidate password: password123')).toBeVisible();
  await user.type(screen.getByLabelText('Username'), 'alex@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(screen.getByRole('alert')).toHaveTextContent('selected role');
  expect(screen.getByLabelText('Password')).toHaveValue('password123');
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', 'access-error');
  expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toBeNull();
});

it('shows missing credential and session-save errors without navigation', async () => {
  const user = userEvent.setup();
  mount(<AccessLogin onLogin={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a username');
  await user.type(screen.getByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password'), 'admin');
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === SESSION_KEY) throw new Error('Quota');
    original.call(this, key, value);
  });
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save');
  expect(screen.getByLabelText('Password')).toHaveValue('admin');
});

it('registers and rereads the stored account and session', async () => {
  const user = userEvent.setup();
  mount(<Register onLogin={() => {}} />);
  await fillRegistration(user);
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByRole('heading', { name: 'Portal destination' })).toBeVisible();
  const account = JSON.parse(localStorage.getItem(USERS_KEY)).find((item) => item.email === 'casey@example.com');
  expect(account.fullName).toBe('Casey Quinn');
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)).userId).toBe(account.id);
});

it('associates every missing registration field with an alert', async () => {
  const user = userEvent.setup();
  mount(<Register onLogin={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  for (const label of ['Full name', 'Email', 'Mobile', 'Password']) {
    const input = screen.getByLabelText(label);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(input.getAttribute('aria-describedby'))).toHaveAttribute('role', 'alert');
  }
  expect(JSON.parse(localStorage.getItem(USERS_KEY))).toHaveLength(5);
});

it('preserves registration details after duplicate rejection', async () => {
  const user = userEvent.setup();
  mount(<Register onLogin={() => {}} />);
  await fillRegistration(user, 'ALEX@EXAMPLE.COM');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('This email is already registered.')).toBeVisible();
  expect(screen.getByLabelText('Password')).toHaveValue('password123');
  expect(JSON.parse(localStorage.getItem(USERS_KEY))).toHaveLength(5);
});

it('preserves registration input and visibly reports rollback after storage failure', async () => {
  const user = userEvent.setup();
  mount(<Register onLogin={() => {}} />);
  await fillRegistration(user);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === SESSION_KEY) throw new Error('Quota');
    original.call(this, key, value);
  });
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByRole('alert')).toHaveTextContent('rolled back');
  expect(screen.getByLabelText('Full name')).toHaveValue('Casey Quinn');
  expect(screen.getByLabelText('Email')).toHaveValue('casey@example.com');
  expect(screen.getByLabelText('Mobile')).toHaveValue('2025550199');
  expect(screen.getByLabelText('Password')).toHaveValue('password123');
  expect(JSON.parse(localStorage.getItem(USERS_KEY))).toHaveLength(5);
});
