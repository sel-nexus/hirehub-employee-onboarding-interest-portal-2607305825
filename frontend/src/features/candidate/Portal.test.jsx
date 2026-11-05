/** Exercise portal interactions with actual account and submission persistence. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { authenticate } from '../access/accounts';
import { initializeDemo, readDemoSubmissions, saveDemoSubmissions, DEMO_SUBMISSIONS_KEY } from '../demo/storage';
import { RESUME_PRESETS, CANDIDATE_EVENT } from './candidate';
import Portal from './Portal';

beforeEach(() => {
  localStorage.clear();
  initializeDemo();
  authenticate('alex@example.com', 'password123', 'candidate');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Mount the portal under the inherited router contract. */
function mount() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Portal />
    </MemoryRouter>,
  );
}

it('renders only own applications, schedule and safe user-initiated material links', () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Candidate Portal' })).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getByText('2026-04-15 at 14:00 (America/New_York)')).toBeTruthy();
  expect(screen.queryByText(/Strong profile/)).toBeNull();
  expect(screen.queryByRole('article', { name: 'Design application' })).toBeNull();
  expect(screen.getAllByText('Open portfolio (new tab)')[0].getAttribute('rel')).toBe('noopener noreferrer');
});

it('shows empty CTA and saves a material-bearing application', async () => {
  saveDemoSubmissions([]);
  mount();
  const user = userEvent.setup();
  expect(screen.getByRole('link', { name: 'Start an application' }).getAttribute('href')).toBe('#new-application');
  await user.selectOptions(screen.getByLabelText('Department'), 'Design');
  await user.selectOptions(screen.getByLabelText('Mock resume'), RESUME_PRESETS[1]);
  await user.type(screen.getByLabelText('Portfolio URL'), 'https://example.com/case');
  await user.click(screen.getByRole('button', { name: 'Submit application' }));
  expect(screen.getByText('Application submitted.')).toBeTruthy();
  expect(screen.getByRole('article', { name: 'Design application' })).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))[0]).toMatchObject({ userId: 'user-alex', status: 'applied', interview: null });
  expect(screen.getByLabelText('Portfolio URL').value).toBe('');
});

it('submits portfolio-only materials and displays the persisted application after remount', async () => {
  const view = mount();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Department'), 'Design');
  await user.type(screen.getByLabelText('Portfolio URL'), 'https://example.com/work');
  expect(screen.getByLabelText('Mock resume').value).toBe('');
  await user.click(screen.getByRole('button', { name: 'Submit application' }));
  expect(screen.getByText('Application submitted.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByLabelText('Department').value).toBe('');
  expect(screen.getByLabelText('Portfolio URL').value).toBe('');
  const stored = JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).at(-1);
  expect(stored).toMatchObject({ department: 'Design', userId: 'user-alex', status: 'applied', interview: null,
    portfolioUrl: 'https://example.com/work', sampleResume: 'Portfolio supplied; no mock resume selected',
    resumeText: 'No mock resume selected. Review the supplied portfolio link.' });
  expect(readDemoSubmissions().success).toBe(true);
  view.unmount();
  mount();
  const application = within(screen.getByRole('article', { name: 'Design application' }));
  await user.click(application.getByText('Application details and materials'));
  expect(application.getByText(stored.sampleResume)).toBeTruthy();
  expect(application.getByText(stored.resumeText)).toBeTruthy();
  const link = application.getByRole('link', { name: 'Open portfolio (new tab)' });
  expect(link.getAttribute('href')).toBe('https://example.com/work');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
});

it('validates contacts, preserves input and then updates session-backed name', async () => {
  mount();
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Full name'));
  await user.type(screen.getByLabelText('Full name'), '123');
  await user.click(screen.getByRole('button', { name: 'Save contact details' }));
  expect(screen.getByLabelText('Full name').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByLabelText('Full name').value).toBe('123');
  await user.clear(screen.getByLabelText('Full name'));
  await user.type(screen.getByLabelText('Full name'), 'Alex Quinn');
  await user.click(screen.getByRole('button', { name: 'Save contact details' }));
  expect(screen.getByText('Contact details saved.')).toBeTruthy();
  expect(screen.getByText('Welcome, Alex Quinn.')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('hirehub_session')).displayName).toBe('Alex Quinn');
});

it('rejects unsafe URLs and duplicate departments without clearing material choices', async () => {
  mount();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Department'), 'Engineering');
  await user.selectOptions(screen.getByLabelText('Mock resume'), RESUME_PRESETS[0]);
  await user.type(screen.getByLabelText('Portfolio URL'), 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'Submit application' }));
  expect(screen.getByLabelText('Portfolio URL').getAttribute('aria-invalid')).toBe('true');
  await user.clear(screen.getByLabelText('Portfolio URL'));
  await user.click(screen.getByRole('button', { name: 'Submit application' }));
  expect(screen.getByText('You already have an application for this department.')).toBeTruthy();
  expect(screen.getByLabelText('Mock resume').value).toBe(RESUME_PRESETS[0]);
});

it.each(['preset', 'portfolio-only'])('shows persistence failures and preserves %s application input', async (material) => {
  mount();
  const user = userEvent.setup();
  const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
  await user.selectOptions(screen.getByLabelText('Department'), 'Design');
  if (material === 'preset') await user.selectOptions(screen.getByLabelText('Mock resume'), RESUME_PRESETS[0]);
  else await user.type(screen.getByLabelText('Portfolio URL'), 'https://example.com/work');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await user.click(screen.getByRole('button', { name: 'Submit application' }));
  expect(screen.getByRole('alert').textContent).toContain('Unable to save');
  expect(screen.getByRole('alert').textContent).not.toContain('requires a mock resume');
  expect(screen.queryByText('Application submitted.')).toBeNull();
  expect(screen.getByLabelText('Department').value).toBe('Design');
  expect(screen.getByLabelText('Mock resume').value).toBe(material === 'preset' ? RESUME_PRESETS[0] : '');
  expect(screen.getByLabelText('Portfolio URL').value).toBe(material === 'portfolio-only' ? 'https://example.com/work' : '');
  expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
});

it.each(['storage', CANDIDATE_EVENT, 'focus'])('refreshes changed lifecycle data on %s without render loops', (event) => {
  mount();
  const records = readDemoSubmissions().data;
  const index = records.findIndex((record) => record.userId === 'user-alex' && record.department === 'Engineering');
  records[index] = { ...records[index], status: 'offer' };
  saveDemoSubmissions(records);
  act(() => window.dispatchEvent(new Event(event)));
  const application = within(screen.getByRole('article', { name: 'Engineering application' }));
  expect(application.getByText('Offer Extended', { exact: true })).toBeTruthy();
  ['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision'].forEach((label) => {
    expect(application.getByText(label, { exact: true })).toBeTruthy();
  });
  expect(within(application.getByRole('listitem', { current: 'step' })).getByText('Final Decision', { exact: true })).toBeTruthy();
});

it('shows Alex an explicit extended offer on a later portal visit', () => {
  const view = mount();
  view.unmount();
  const records = readDemoSubmissions().data.map((record) => (
    record.userId === 'user-alex' && record.department === 'Engineering' ? { ...record, status: 'offer' } : record
  ));
  expect(saveDemoSubmissions(records).success).toBe(true);
  mount();
  const application = within(screen.getByRole('article', { name: 'Engineering application' }));
  expect(application.getByText('Offer Extended', { exact: true })).toBeTruthy();
  expect(within(application.getByRole('listitem', { current: 'step' })).getByText('Final Decision', { exact: true })).toBeTruthy();
});

it('renders Jordan in screening with a distinct closed outcome and no offer', () => {
  authenticate('jordan@example.com', 'password123', 'candidate');
  mount();
  const application = within(screen.getByRole('article', { name: 'Design application' }));
  expect(within(application.getByRole('listitem', { current: 'step' })).getByText('Profile Screening', { exact: true })).toBeTruthy();
  expect(screen.queryByText('Offer Extended', { exact: true })).toBeNull();
  expect(screen.getByText(/This application is closed/)).toBeTruthy();
  expect(screen.queryByRole('article', { name: 'Engineering application' })).toBeNull();
});

it('renders Taylor with the required extended offer', () => {
  authenticate('taylor@example.com', 'password123', 'candidate');
  mount();
  const application = within(screen.getByRole('article', { name: 'Marketing application' }));
  expect(application.getByText('Offer Extended', { exact: true })).toBeTruthy();
  expect(within(application.getByRole('listitem', { current: 'step' })).getByText('Final Decision', { exact: true })).toBeTruthy();
});

it('provides readable unauthorized state and retry after login', async () => {
  authenticate('admin', 'admin', 'admin');
  mount();
  expect(screen.getByRole('alert').textContent).toContain('cannot access');
  expect(screen.queryByRole('form')).toBeNull();
  authenticate('alex@example.com', 'password123', 'candidate');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getAllByRole('article')).toHaveLength(3);
});
