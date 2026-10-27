/** Verify local preview safety, internal-note persistence and the complete modal lifecycle. */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewSubmission from './ReviewSubmission';
import { DEFAULT_SUBMISSIONS, DEFAULT_USERS, USERS_KEY } from '../data/mockData';
import { readSubmissions, SUBMISSIONS_KEY, SAMPLE_RESUMES } from '../apply/submissions';
import { AUTH_KEY, login } from './auth';
import { NOTES_MAX_LENGTH } from './recruiterService';

const alex = DEFAULT_SUBMISSIONS[0];

/** Mount a real dialog lifecycle so close and focus cleanup are observable. */
function Harness({ submission = alex }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Review candidate
      </button>
      {open && (
        <ReviewSubmission submission={submission} onSaved={() => {}} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  expect(login('admin', 'admin').success).toBe(true);
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('ReviewSubmission', () => {
  it.each(SAMPLE_RESUMES)('previews full local text for %s without fetching or embedding documents', async (sampleResume) => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(window, 'fetch');
    render(<ReviewSubmission submission={{ ...alex, sampleResume }} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Review Submission' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(sampleResume, { exact: true })).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview Resume' }));
    const preview = screen.getByRole('article', { name: 'Local resume preview' });
    expect(within(preview).getAllByRole('paragraph')).toHaveLength(5);
    expect(preview).toHaveTextContent(sampleResume === 'UI/UX Case Study' ? 'usability testing' : 'Experience:');
    expect(screen.getByRole('button', { name: 'Hide Resume Preview' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('iframe, embed, object')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Hide Resume Preview' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it.each(['', 'Unknown resume', 'constructor', '__proto__'])('shows unsupported/absent resume %s without a fake preview action', (sampleResume) => {
    render(<ReviewSubmission submission={{ ...alex, sampleResume }} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('No supported sample resume selected.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Preview Resume' })).not.toBeInTheDocument();
  });

  it.each(['https://example.com/work', 'http://example.com'])('exposes safe user-initiated portfolio %s in a protected tab', (portfolioUrl) => {
    render(<ReviewSubmission submission={{ ...alex, portfolioUrl }} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const link = screen.getByRole('link', { name: 'View portfolio (opens in a new tab)' });
    expect(link).toHaveAttribute('href', portfolioUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    'javascript:alert(1)', 'data:text/html,<script>x</script>', '//example.com', 'ftp://example.com',
    'not a url', 'https://user:password@example.com', 'https://example.com/' + 'x'.repeat(2048),
  ])('never turns unsafe portfolio %s into a clickable link', (portfolioUrl) => {
    render(<ReviewSubmission submission={{ ...alex, portfolioUrl }} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Portfolio unavailable/)).toBeVisible();
    expect(document.querySelector('script, iframe')).toBeNull();
  });

  it('shows the absent materials state for a legacy submission', () => {
    render(<ReviewSubmission submission={{ id: 'legacy', fullName: 'Legacy Person', email: 'legacy@example.com', department: 'Design' }}
      onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('No portfolio provided.')).toBeVisible();
    expect(screen.getByLabelText('Internal Recruiter Notes')).toHaveValue('');
  });

  it('saves notes against latest stage/contact/schedule and preserves all other candidates', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ReviewSubmission submission={alex} onSaved={onSaved} onCancel={vi.fn()} />);
    const notes = screen.getByLabelText('Internal Recruiter Notes');
    expect(notes).toHaveValue(alex.notes);
    expect(notes).toHaveAttribute('maxlength', String(NOTES_MAX_LENGTH));
    await user.clear(notes);
    await user.type(notes, 'Private review for Alex');
    const latest = { ...alex, status: 'offer', mobile: '9876543210',
      interviewSchedule: { ...alex.interviewSchedule, location: 'New room' } };
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([latest, ...DEFAULT_SUBMISSIONS.slice(1)]));
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(screen.getByRole('status')).toHaveTextContent('Internal notes saved locally.');
    expect(onSaved).toHaveBeenCalledOnce();
    expect(readSubmissions()).toEqual([{ ...latest, notes: 'Private review for Alex' }, ...DEFAULT_SUBMISSIONS.slice(1)]);
  });

  it('can restore original notes after a save and leaves newer external notes untouched when the draft is unchanged', async () => {
    const user = userEvent.setup();
    render(<ReviewSubmission submission={alex} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const notes = screen.getByLabelText('Internal Recruiter Notes');
    await user.clear(notes);
    await user.type(notes, 'First saved note');
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(readSubmissions()[0].notes).toBe('First saved note');
    await user.clear(notes);
    await user.type(notes, alex.notes);
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(readSubmissions()[0].notes).toBe(alex.notes);
    const latest = { ...alex, notes: 'Newer external notes', status: 'offer' };
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([latest, ...DEFAULT_SUBMISSIONS.slice(1)]));
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(readSubmissions()).toEqual([latest, ...DEFAULT_SUBMISSIONS.slice(1)]);
    expect(screen.getByRole('status')).toHaveTextContent('Internal notes saved locally.');
  });

  it('rejects oversized synthetic notes with visible associated feedback and no persistence', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ReviewSubmission submission={alex} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Internal Recruiter Notes'), { target: { value: 'x'.repeat(NOTES_MAX_LENGTH + 1) } });
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 4000 characters');
    expect(screen.getByLabelText('Internal Recruiter Notes')).toHaveAttribute('aria-invalid', 'true');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('retains notes after write failure, shows no success, and recovers with retry', async () => {
    const user = userEvent.setup();
    render(<ReviewSubmission submission={alex} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText('Internal Recruiter Notes'));
    await user.type(screen.getByLabelText('Internal Recruiter Notes'), 'Retry note');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Internal Recruiter Notes')).toHaveValue('Retry note');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(readSubmissions()[0].notes).toBe('Retry note');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces post-save refresh failure without falsely showing success', async () => {
    const user = userEvent.setup();
    render(<ReviewSubmission submission={alex} onSaved={() => { throw new Error('Refresh unavailable'); }} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText('Internal Recruiter Notes'));
    await user.type(screen.getByLabelText('Internal Recruiter Notes'), 'Saved but not refreshed');
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(readSubmissions()[0].notes).toBe('Saved but not refreshed');
  });

  it.each(['removed', 'logout'])('preserves entered notes and blocks save after %s', async (state) => {
    const user = userEvent.setup();
    render(<ReviewSubmission submission={alex} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText('Internal Recruiter Notes'));
    await user.type(screen.getByLabelText('Internal Recruiter Notes'), 'Unsaved note');
    if (state === 'removed') localStorage.setItem(SUBMISSIONS_KEY, '[]');
    else localStorage.removeItem(AUTH_KEY);
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(state === 'removed' ? 'Submission not found' : 'Administrator access');
    expect(screen.getByLabelText('Internal Recruiter Notes')).toHaveValue('Unsaved note');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('traps both Tab directions, visits links/textarea, contains background focus, and restores on Escape', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Review candidate' });
    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save Notes' });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Preview Resume' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Internal Recruiter Notes')).toHaveFocus();
    trigger.focus();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('scroll');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(trigger).toHaveFocus();
  });

  it('does not close on content clicks; backdrop closes without saving and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Review candidate' });
    await user.click(trigger);
    await user.clear(screen.getByLabelText('Internal Recruiter Notes'));
    await user.type(screen.getByLabelText('Internal Recruiter Notes'), 'Unsaved');
    await user.click(screen.getByRole('heading', { name: 'Review Submission' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
  });

  it('restores focus and scroll on unmount and removes old listeners', async () => {
    const user = userEvent.setup();
    render(<button type="button">Trigger</button>);
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.click(trigger);
    document.body.style.overflow = 'auto';
    const onCancel = vi.fn();
    const view = render(<ReviewSubmission submission={alex} onSaved={vi.fn()} onCancel={onCancel} />);
    view.unmount();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('auto');
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
