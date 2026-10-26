/** Verify edit validation, real persistence, and the modal's complete keyboard lifecycle. */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditSubmission from './EditSubmission';
import { readSubmissions, SUBMISSIONS_KEY } from '../apply/submissions';
import { FIELD_ERRORS } from '../apply/validation';

const submission = {
  id: 'alice', fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
  department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z',
};

/** Mount and close the modal through real state transitions for lifecycle assertions. */
function LifecycleHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open editor
      </button>
      {open && (
        <EditSubmission submission={submission} onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([submission]));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('EditSubmission', () => {
  it('prefills accessible fields, keeps email immutable, and saves normalized permitted details', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={submission} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Edit Submission' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('form', { name: 'Edit submission form' })).toHaveAttribute('novalidate');
    expect(screen.getByLabelText('Full Name')).toHaveValue(submission.fullName);
    expect(screen.getByLabelText('Mobile Number')).toHaveValue(submission.mobile);
    expect(screen.getByLabelText('Department of Interest')).toHaveValue(submission.department);
    const email = screen.getByLabelText('Email Address');
    expect(email).toHaveAttribute('readonly');
    await user.type(email, 'changed@example.com');
    expect(email).toHaveValue(submission.email);
    fireEvent.change(email, { target: { name: 'email', value: 'tampered@example.com' } });
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), ' Alice Updated ');
    await user.clear(screen.getByLabelText('Mobile Number'));
    await user.type(screen.getByLabelText('Mobile Number'), '9876543210');
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Data Science');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(readSubmissions()).toEqual([{
      ...submission, fullName: 'Alice Updated', mobile: '9876543210', department: 'Data Science',
    }]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['Full Name', 'fullName', ''],
    ['Full Name', 'fullName', 'Alice1'],
    ['Full Name', 'fullName', 'A'.repeat(101)],
    ['Full Name', 'fullName', '<script>alert(1)</script>'],
    ['Mobile Number', 'mobile', ''],
    ['Mobile Number', 'mobile', '123456789'],
    ['Mobile Number', 'mobile', '12345678901'],
    ['Mobile Number', 'mobile', '123456789a'],
    ['Department of Interest', 'department', ''],
  ])('rejects invalid %s %s %s and preserves storage and input', async (label, field, value) => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={submission} onSaved={onSaved} onCancel={vi.fn()} />);
    const control = screen.getByLabelText(label);
    if (field === 'department') {
      await user.selectOptions(control, value);
    } else {
      await user.clear(control);
      if (value) await user.type(control, value);
    }
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(control).toHaveValue(value);
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription(FIELD_ERRORS[field]);
    expect(screen.getByRole('alert')).toHaveTextContent(FIELD_ERRORS[field]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(readSubmissions()).toEqual([submission]);
    expect(document.querySelector('script')).toBeNull();
  });

  it('reports all editable errors and removes them after a valid retry', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={submission} onSaved={onSaved} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText('Full Name'));
    await user.clear(screen.getByLabelText('Mobile Number'));
    await user.selectOptions(screen.getByLabelText('Department of Interest'), '');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('aria-invalid', 'false');
    await user.type(screen.getByLabelText('Full Name'), 'Valid Name');
    await user.type(screen.getByLabelText('Mobile Number'), '1234567890');
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Finance');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(readSubmissions()[0]).toEqual({
      ...submission, fullName: 'Valid Name', mobile: '1234567890', department: 'Finance',
    });
  });

  it('shows actionable save errors and preserves edits until storage retry succeeds', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={submission} onSaved={onSaved} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Changed Name');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(screen.getByRole('alert')).toHaveTextContent('Retry Save Changes');
    expect(screen.getByLabelText('Full Name')).toHaveValue('Changed Name');
    expect(readSubmissions()).toEqual([submission]);
    expect(onSaved).not.toHaveBeenCalled();
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSubmissions()[0].fullName).toBe('Changed Name');
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('surfaces post-save requery errors without discarding entered edits', async () => {
    const user = userEvent.setup();
    render(
      <EditSubmission
        submission={submission}
        onSaved={() => { throw new Error('Unable to read submissions. Check browser storage permissions and try again.'); }}
        onCancel={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Saved Name');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read submissions.');
    expect(screen.getByLabelText('Full Name')).toHaveValue('Saved Name');
    expect(readSubmissions()[0].fullName).toBe('Saved Name');
  });

  it('cancels without saving any changed details', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSaved = vi.fn();
    render(<EditSubmission submission={submission} onSaved={onSaved} onCancel={onCancel} />);
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Unsaved Name');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();
    expect(readSubmissions()).toEqual([submission]);
  });

  it('focuses name, traps Tab and ShiftTab, contains background focus and closes on Escape', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    render(<LifecycleHarness />);
    const trigger = screen.getByRole('button', { name: 'Open editor' });
    await user.click(trigger);
    const name = screen.getByLabelText('Full Name');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(name).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(name).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Email Address')).toHaveFocus();
    await user.tab({ shift: true });
    expect(name).toHaveFocus();
    trigger.focus();
    expect(name).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('scroll');
    expect(trigger).toHaveFocus();
    expect(readSubmissions()).toEqual([submission]);
    // Reopening proves old effect listeners do not hold onto a detached dialog.
    await user.click(trigger);
    expect(screen.getByLabelText('Full Name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('ignores clicks inside the dialog and closes on backdrop with focus and scroll restored', async () => {
    const user = userEvent.setup();
    render(<LifecycleHarness />);
    const trigger = screen.getByRole('button', { name: 'Open editor' });
    await user.click(trigger);
    await user.click(screen.getByRole('heading', { name: 'Edit Submission' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    expect(readSubmissions()).toEqual([submission]);
  });

  it('restores prior focus and scroll on direct unmount and removes bound listeners', async () => {
    const user = userEvent.setup();
    render(
      <button type="button">
        Open editor
      </button>,
    );
    const trigger = screen.getByRole('button', { name: 'Open editor' });
    await user.click(trigger);
    document.body.style.overflow = 'auto';
    const onCancel = vi.fn();
    const view = render(<EditSubmission submission={submission} onSaved={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByLabelText('Full Name')).toHaveFocus();
    view.unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(trigger).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual([submission]);
  });
});

/** Verify recruiter metadata is editable while immutable identity and current status survive. */
describe('recruiter notes and materials editor', () => {
  const extended = {
    ...submission, userId: 'u-alice', status: 'interview', notes: 'Original private note',
    portfolioUrl: 'https://example.com/original', sampleResume: 'UI/UX Case Study',
    interviewSchedule: 'Tuesday at 10 AM Pacific',
  };

  it('prefills and persists notes, materials and human-readable schedule, preserving all immutable fields', async () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([extended]));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={extended} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Recruiter Notes (private)')).toHaveValue(extended.notes);
    expect(screen.getByLabelText('Portfolio URL (optional)')).toHaveValue(extended.portfolioUrl);
    expect(screen.getByLabelText('Sample Resume (optional)')).toHaveValue(extended.sampleResume);
    expect(screen.getByLabelText('Interview Schedule (optional)')).toHaveValue(extended.interviewSchedule);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'spoof@example.com' } });
    await user.clear(screen.getByLabelText('Recruiter Notes (private)'));
    await user.type(screen.getByLabelText('Recruiter Notes (private)'), 'Private interview evaluation');
    await user.clear(screen.getByLabelText('Portfolio URL (optional)'));
    await user.type(screen.getByLabelText('Portfolio URL (optional)'), 'http://example.com/new');
    await user.selectOptions(screen.getByLabelText('Sample Resume (optional)'), 'Full-Stack Developer Resume (Sample)');
    await user.clear(screen.getByLabelText('Interview Schedule (optional)'));
    await user.type(screen.getByLabelText('Interview Schedule (optional)'), 'Friday at 11 AM Pacific');
    // A quick update after the editor opens must not be overwritten by its cached record.
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...extended, status: 'offer' }]));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(readSubmissions()).toEqual([{
      ...extended, status: 'offer', notes: 'Private interview evaluation', portfolioUrl: 'http://example.com/new',
      sampleResume: 'Full-Stack Developer Resume (Sample)', interviewSchedule: 'Friday at 11 AM Pacific',
    }]);
  });

  it.each([
    ['Portfolio URL (optional)', 'javascript:alert(1)'],
    ['Portfolio URL (optional)', 'data:text/html,bad'],
    ['Portfolio URL (optional)', '/relative'],
    ['Portfolio URL (optional)', 'https://'],
    ['Portfolio URL (optional)', 'https://example.com/' + 'x'.repeat(2048)],
    ['Recruiter Notes (private)', 'x'.repeat(5001)],
    ['Interview Schedule (optional)', 'x'.repeat(501)],
  ])('rejects invalid %s material/metadata while preserving edits and storage', async (label, value) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([extended]));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={extended} onSaved={onSaved} onCancel={vi.fn()} />);
    const control = screen.getByLabelText(label);
    fireEvent.change(control, { target: { value } });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(control).toHaveValue(value);
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toBeVisible();
    expect(control).toHaveAccessibleDescription(new RegExp(screen.getByRole('alert').textContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(onSaved).not.toHaveBeenCalled();
    expect(readSubmissions()).toEqual([extended]);
  });

  it('clears optional metadata explicitly without changing immutable fields', async () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([extended]));
    const user = userEvent.setup();
    render(<EditSubmission submission={extended} onSaved={vi.fn()} onCancel={vi.fn()} />);
    for (const label of ['Recruiter Notes (private)', 'Portfolio URL (optional)', 'Interview Schedule (optional)']) {
      await user.clear(screen.getByLabelText(label));
    }
    await user.selectOptions(screen.getByLabelText('Sample Resume (optional)'), '');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(readSubmissions()).toEqual([{ ...extended, notes: '', portfolioUrl: '', sampleResume: '', interviewSchedule: '' }]);
  });

  it('preserves private note edits after quota failure, then persists them on retry', async () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([extended]));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={extended} onSaved={onSaved} onCancel={vi.fn()} />);
    const notes = screen.getByLabelText('Recruiter Notes (private)');
    await user.clear(notes);
    await user.type(notes, 'Private new evaluation');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(notes).toHaveValue('Private new evaluation');
    expect(onSaved).not.toHaveBeenCalled();
    expect(readSubmissions()).toEqual([extended]);
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(readSubmissions()).toEqual([{ ...extended, notes: 'Private new evaluation' }]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('refuses a stale notes save without resurrecting a deleted application', async () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([extended]));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<EditSubmission submission={extended} onSaved={onSaved} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText('Recruiter Notes (private)'));
    await user.type(screen.getByLabelText('Recruiter Notes (private)'), 'Unsaved note');
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Submission not found.');
    expect(screen.getByLabelText('Recruiter Notes (private)')).toHaveValue('Unsaved note');
    expect(onSaved).not.toHaveBeenCalled();
    expect(readSubmissions()).toEqual([]);
  });
});
