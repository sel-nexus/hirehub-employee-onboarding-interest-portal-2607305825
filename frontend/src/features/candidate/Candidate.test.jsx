/** Exercise candidate UI privacy, stage information, editor accessibility and synchronization. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom';
import Candidate from './Candidate';
import { DEFAULT_USERS, DEFAULT_SUBMISSIONS, USERS_KEY, SESSION_KEY } from '../demo/mockData';
import { SUBMISSIONS_KEY } from '../apply/submissions';
import { login, readSession } from '../admin/auth';

/** Render candidate within real router context; never mock the storage service. */
function mount() {
  return render(
    <MemoryRouter initialEntries={['/candidate']}>
      <Link to="/candidate?view=latest">Refresh route</Link>
      <Routes>
        <Route path="/candidate" element={<Candidate />} />
      </Routes>
    </MemoryRouter>,
  );
}
/** Re-read the real persisted store. */
function stored(key) { return JSON.parse(localStorage.getItem(key)); }
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
  login('alex@example.com', 'password123', 'candidate');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('Candidate applications', () => {
  it('shows only own application, readable date and interview without recruiter notes or other candidates', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Engineering application' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Interview schedule' })).toHaveTextContent('October 28, 2026');
    const application = screen.getByRole('article');
    expect(application).toHaveTextContent('October 20, 2026');
    expect(application).toHaveTextContent('Frontend Software Engineer (5 YOE)');
    expect(application).not.toHaveTextContent('2026-10-20T');
    expect(screen.queryByText(/Strong background|Jordan Chen|jordan@example.com|password123/)).not.toBeInTheDocument();
  });
  it.each([
    ['applied', 'Application Received', 'received your application'],
    ['review', 'Under Review', 'screening your profile'],
    ['interview', 'Interview Scheduled', 'Prepare for your interview'],
    ['offer', 'Offer Extended', 'Congratulations'],
    ['archived', 'Not Selected', 'not selected'],

  ])('shows %s current status and next steps', (status, label, next) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], status, interviewSchedule: '' }]));
    mount();
    expect(screen.getByRole('status')).toHaveTextContent(`Current status: ${label}`);
    expect(screen.getByText(/Next steps:/).closest('p')).toHaveTextContent(next);
    expect(screen.queryByRole('region', { name: 'Interview schedule' })).not.toBeInTheDocument();
  });
  it('renders all own records independently including an ISO interview and valid submission date', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([
      DEFAULT_SUBMISSIONS[0],
      { ...DEFAULT_SUBMISSIONS[0], id: 'second', department: 'Design', status: 'offer', submittedAt: '2026-10-21T12:00:00.000Z', interviewSchedule: '2026-11-01T12:00:00.000Z' },
      DEFAULT_SUBMISSIONS[1],
    ]));
    mount();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    const second = screen.getAllByRole('article')[1];
    expect(second).toHaveTextContent('October 21, 2026');
    expect(second).toHaveTextContent('November 1, 2026');
    expect(within(second).getByRole('status')).toHaveTextContent('Offer Extended');
    expect(screen.queryByRole('heading', { name: 'Design application', exact: true })).toBeVisible();
    expect(screen.queryByText('Jordan Chen')).not.toBeInTheDocument();
  });
  it.each([
    ['status', 'future'], ['submittedAt', 'bad date'],
  ])('fails closed for invalid stored %s instead of showing a fallback application', (field, value) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], [field]: value }]));
    const before = [USERS_KEY, SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read candidate data');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText(/Welcome,|alex@example.com/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect([USERS_KEY, SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it('gives an empty new account contact editor and an existing apply link without claiming legacy email records', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], userId: undefined }]));
    mount();
    expect(screen.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start an application' })).toHaveAttribute('href', '/apply');
    expect(screen.getByText('Add your mobile number')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it.each(['guest', 'admin', 'corrupt'])('fails closed for %s without candidate details', (mode) => {
    if (mode === 'guest') localStorage.removeItem(SESSION_KEY);
    if (mode === 'admin') login('admin', 'admin');
    if (mode === 'corrupt') localStorage.setItem(SUBMISSIONS_KEY, '{bad');
    mount();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/Welcome,|alex@example.com/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
  });
});

describe('Candidate inline profile editor', () => {
  it('focuses the first field, cancels without saving, and restores trigger focus', async () => {
    const user = userEvent.setup(); mount();
    const before = localStorage.getItem(USERS_KEY);
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('Full Name')).toHaveFocus();
    expect(screen.getByLabelText('Full Name')).toHaveValue('Alex Rivera');
    expect(screen.getByLabelText('Email Address')).toHaveValue('alex@example.com');
    expect(screen.getByLabelText('Mobile Number')).toHaveValue('4155552671');
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Changed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });
  it('associates contact validation errors with fields and preserves stored data', async () => {
    const user = userEvent.setup(); mount();
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    for (const label of ['Full Name', 'Email Address', 'Mobile Number']) await user.clear(screen.getByLabelText(label));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    for (const label of ['Full Name', 'Email Address', 'Mobile Number']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription();
    }
    expect(screen.getByLabelText('Full Name')).toHaveFocus();
    expect(screen.queryByText('Profile saved in this browser.')).not.toBeInTheDocument();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });
  it('saves contacts visibly and keeps IDs, session timestamp, password and notes on fresh reads and remount', async () => {
    const user = userEvent.setup(); mount();
    const timestamp = readSession().loginTimestamp;
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    for (const [label, value] of [['Full Name', 'Alex Updated'], ['Email Address', 'updated@example.com'], ['Mobile Number', '0123456789']]) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByText('Profile saved in this browser.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
    expect(stored(USERS_KEY)[2]).toMatchObject({ id: 'u-201', username: 'updated@example.com', password: 'password123', mobile: '0123456789' });
    expect(stored(SUBMISSIONS_KEY)[0]).toMatchObject({ ...DEFAULT_SUBMISSIONS[0], fullName: 'Alex Updated', email: 'updated@example.com', mobile: '0123456789' });
    expect(stored(SESSION_KEY)).toMatchObject({ userId: 'u-201', displayName: 'Alex Updated', loginTimestamp: timestamp });
    cleanup(); mount();
    expect(screen.getByText('Welcome, Alex Updated.')).toBeVisible();
    expect(screen.getAllByText('updated@example.com')).toHaveLength(2);
  });
  it('shows duplicate email inline without changing own record', async () => {
    const user = userEvent.setup(); mount();
    const before = localStorage.getItem(USERS_KEY);
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Email Address'));
    await user.type(screen.getByLabelText('Email Address'), 'JORDAN@EXAMPLE.COM');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email Address')).toHaveAccessibleDescription(/not used/);
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });
  it('reports quota failure and retains persisted contacts instead of displaying success', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Changed');
    const before = localStorage.getItem(USERS_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save your profile');
    expect(screen.queryByText('Profile saved in this browser.')).not.toBeInTheDocument();
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
    expect(screen.getByText('Welcome, Alex Rivera.')).toBeVisible();
  });
  it('rejects a changed session while editing without updating either candidate', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    login('jordan@example.com', 'password123', 'candidate');
    const before = localStorage.getItem(USERS_KEY);
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByRole('alert')).toHaveTextContent('identity changed');
    expect(screen.getByText('Welcome, Jordan Chen.')).toBeVisible();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });
});

describe('Candidate storage requery', () => {
  it.each(['focus', 'storage', 'route'])('reflects own status changes on %s and drops visibility when identity is lost', async (mode) => {
    const user = userEvent.setup(); mount();
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS.map((record) => record.userId === 'u-201' ? { ...record, status: 'archived' } : record)));
    if (mode === 'route') await user.click(screen.getByRole('link', { name: 'Refresh route' }));
    else act(() => window.dispatchEvent(new Event(mode)));
    expect(screen.getByRole('status')).toHaveTextContent('Not Selected');
    localStorage.removeItem(SESSION_KEY);
    if (mode === 'route') await user.click(screen.getByRole('link', { name: 'Refresh route' }));
    else act(() => window.dispatchEvent(new Event(mode)));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
  });
  it('drops cached identity and draft when stored user disappears on focus', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS.filter((account) => account.id !== 'u-201')));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeVisible();
  });
  it('removes storage/focus subscriptions on unmount', () => {
    const { unmount } = mount(); unmount();
    act(() => window.dispatchEvent(new Event('storage')));
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});
