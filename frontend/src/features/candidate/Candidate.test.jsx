/** Verify owned candidate UI, progress, schedules, storage sync and profile editing. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Candidate from './Candidate';
import { seedMockData, SUBMISSIONS_KEY } from '../data/mockData';
import { login, registerCandidate, logout } from '../admin/auth';

beforeEach(() => { localStorage.clear(); seedMockData(); login('alex@example.com', 'password123', 'candidate'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function renderCandidate() {
  return render(
    <MemoryRouter initialEntries={['/candidate']}>
      <Routes>
        <Route path="/candidate" element={<Candidate />} />
        <Route path="/login" element={<h1>Login gate</h1>} />
        <Route path="/admin" element={<h1>Recruiter gate</h1>} />
        <Route path="/apply" element={<h1>Application form</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
function setStage(status) {
  const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
  records[0].status = status;
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
}

describe('Candidate', () => {
  it('shows only owned contacts/materials and mock interview schedule without recruiter notes/passwords', () => {
    renderCandidate();
    expect(screen.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    expect(screen.getByText('Welcome, Alex Rivera.')).toBeVisible();
    expect(screen.getByText('alex@example.com')).toBeVisible();
    expect(screen.getByText('Frontend Software Engineer (5 YOE)')).toBeVisible();
    expect(screen.getByText(/Video interview.*HireHub demo meeting room/)).toBeVisible();
    expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-11-02T15:00:00.000Z');
    const portfolio = screen.getByRole('link', { name: /View portfolio/ });
    expect(portfolio).toHaveAttribute('href', 'https://alexrivera.dev');
    expect(portfolio).toHaveAttribute('target', '_blank');
    expect(portfolio).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('jordan@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Strong background in React and frontend architecture.')).not.toBeInTheDocument();
    expect(screen.queryByText('password123')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it.each([
    ['received', 0, 'Application Received'], ['applied', 0, 'Application Received'], ['review', 1, 'Under Review'],
    ['interview', 2, 'Interview Scheduled'], ['offer', 3, 'Offer Extended'], ['archived', 3, 'Not Selected'],
  ])('renders %s with exactly four milestones and descriptive active icon/final label', (status, index, label) => {
    setStage(status);
    renderCandidate();
    const list = screen.getByRole('list', { name: 'Hiring progress' });
    const steps = within(list).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[index]).toHaveAttribute('aria-current', 'step');
    expect(steps.filter((step) => step.getAttribute('aria-current'))).toHaveLength(1);
    expect(within(steps[index]).getByRole('img', { name: 'Current stage' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.getByText(status === 'archived' ? /This application is closed/ : status === 'offer' ? /Congratulations!/ : status === 'interview' ? /Prepare for your interview/ : status === 'review' ? /screening your profile/ : /We have your application/)).toBeVisible();
  });
  it('shows absent materials and schedule for another candidate without revealing Alex', () => {
    login('jordan@example.com', 'password123', 'candidate');
    const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
    records[1].sampleResume = '';
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
    renderCandidate();
    expect(screen.getByText('jordan@example.com')).toBeVisible();
    expect(screen.getByText('No sample selected')).toBeVisible();
    expect(screen.getByText('No interview schedule has been shared yet.')).toBeVisible();
    expect(screen.queryByRole('link', { name: /View portfolio/ })).not.toBeInTheDocument();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
  });
  it.each(['focus', 'storage'])('reflects current recruiter stage on %s and removes lost ownership', (event) => {
    renderCandidate();
    setStage('offer');
    act(() => window.dispatchEvent(new Event(event)));
    expect(screen.getByRole('status')).toHaveTextContent('Offer Extended');
    const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
    records[0].userId = 'u-202';
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
    act(() => window.dispatchEvent(new Event(event)));
    expect(screen.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
  });
  it('registration has a useful empty state with an actual application link', async () => {
    const user = userEvent.setup();
    registerCandidate({ displayName: 'New Candidate', username: 'new@example.com', password: 'password123', confirmPassword: 'password123' });
    renderCandidate();
    expect(screen.getByText('Welcome, New Candidate.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Start an application' }));
    expect(screen.getByRole('heading', { name: 'Application form' })).toBeVisible();
  });
  it('shows corruption error without clearing records; retry recovers after valid data returns', async () => {
    const user = userEvent.setup();
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    localStorage.setItem(SUBMISSIONS_KEY, '{bad');
    renderCandidate();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read your applications');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('{bad');
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
    localStorage.setItem(SUBMISSIONS_KEY, before);
    await user.click(screen.getByRole('button', { name: 'Retry applications' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeVisible();
  });
  it('saves profile, refreshes welcome/contact and restores edit-trigger focus', async () => {
    const user = userEvent.setup();
    renderCandidate();
    const trigger = screen.getByRole('button', { name: 'Edit contact details' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Full Name'));
    await user.type(within(dialog).getByLabelText('Full Name'), 'Alex Updated');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Welcome, Alex Updated.')).toBeVisible();
    expect(screen.getByText('Alex Updated', { exact: true })).toBeVisible();
    expect(screen.getByText('Contact details saved to your local profile.')).toHaveAttribute('role', 'status');
    expect(trigger).toHaveFocus();
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))[0].fullName).toBe('Alex Updated');
    await user.click(trigger);
    expect(screen.queryByText('Contact details saved to your local profile.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('closes a stale edit if ownership changes during storage sync', async () => {
    const user = userEvent.setup();
    renderCandidate();
    await user.click(screen.getByRole('button', { name: 'Edit contact details' }));
    const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
    records[0].userId = 'u-202';
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
    act(() => window.dispatchEvent(new Event('storage')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
    expect(document.body.style.overflow).toBe('');
  });
  it.each(['none', 'admin'])('rejects %s sessions through the appropriate route', (role) => {
    if (role === 'none') logout();
    else login('admin', 'admin');
    renderCandidate();
    expect(screen.getByRole('heading', { name: role === 'none' ? 'Login gate' : 'Recruiter gate' })).toBeVisible();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
  });
  it('redirects after session revocation on focus and cleans up listeners on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderCandidate();
    const listeners = add.mock.calls.filter(([type]) => ['storage', 'focus'].includes(type));
    logout();
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.getByRole('heading', { name: 'Login gate' })).toBeVisible();
    unmount();
    for (const [type, handler] of listeners) expect(remove).toHaveBeenCalledWith(type, handler);
  });
});
