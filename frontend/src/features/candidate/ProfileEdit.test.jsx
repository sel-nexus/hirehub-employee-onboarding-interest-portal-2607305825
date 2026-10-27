/** Exercise profile editing, accessible modal behavior and failed writes against real browser storage. */
import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedMockData, SUBMISSIONS_KEY, USERS_KEY } from '../data/mockData';
import { login, logout, getSession } from '../admin/auth';
import { readCandidateApplications } from './candidateService';
import ProfileEdit from './ProfileEdit';

beforeEach(() => { localStorage.clear(); seedMockData(); login('alex@example.com', 'password123', 'candidate'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ''; });

/** Keep callbacks real and demonstrate focus restoration on a connected trigger. */
function Harness() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  return (
    <div>
      <button onClick={() => setOpen(true)}>
        Edit profile
      </button>
      <button>
        Background action
      </button>
      {saved && (
        <p role="status">
          Saved {saved.fullName}
        </p>
      )}
      {open && (
        <ProfileEdit application={readCandidateApplications()[0]} onCancel={() => setOpen(false)} onSaved={(record) => { setSaved(record); setOpen(false); }} />
      )}
    </div>
  );
}

async function openDialog(user) {
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Edit profile' }));
  return screen.getByRole('dialog', { name: 'Edit Contact Details' });
}

describe('ProfileEdit', () => {
  it('prefills only contact fields, labels errors, locks scrolling and traps both tab directions', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    const dialog = await openDialog(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const fields = within(dialog);
    expect(fields.getByLabelText('Full Name')).toHaveValue('Alex Rivera');
    expect(fields.getByLabelText('Email Address')).toHaveValue('alex@example.com');
    expect(fields.getByLabelText('Mobile Number')).toHaveValue('4155552671');
    expect(fields.getAllByRole('textbox')).toHaveLength(3);
    expect(fields.queryByText('Strong background in React and frontend architecture.')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(fields.getByLabelText('Full Name')).toHaveFocus();
    await user.tab({ shift: true });
    expect(fields.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(fields.getByLabelText('Full Name')).toHaveFocus();
    act(() => screen.getByRole('button', { name: 'Background action' }).focus());
    expect(fields.getByLabelText('Full Name')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('scroll');
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
  });
  it.each(['Cancel', 'Escape', 'overlay'])('cancels via %s without writing and restores focus', async (method) => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    const before = { ...localStorage };
    await user.clear(within(dialog).getByLabelText('Full Name'));
    await user.type(within(dialog).getByLabelText('Full Name'), 'Unsaved Name');
    await user.click(within(dialog).getByRole('heading'));
    expect(dialog).toBeInTheDocument();
    if (method === 'Cancel') await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    if (method === 'Escape') await user.keyboard('{Escape}');
    if (method === 'overlay') await user.click(dialog.parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
  it('shows associated validation for all contacts and does not save', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    const before = { ...localStorage };
    for (const label of ['Full Name', 'Email Address', 'Mobile Number']) await user.clear(within(dialog).getByLabelText(label));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(within(dialog).getAllByRole('alert')).toHaveLength(3);
    for (const input of within(dialog).getAllByRole('textbox')) {
      expect(input).toHaveAttribute('aria-required', 'true');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription(/Enter/);
    }
    expect({ ...localStorage }).toEqual(before);
  });
  it('saves normalized contacts and the login account, closes and restores focus', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
    for (const [label, value] of [['Full Name', ' Alex Updated '], ['Email Address', 'Updated@Example.com'], ['Mobile Number', '0123456789']]) {
      await user.clear(within(dialog).getByLabelText(label));
      await user.type(within(dialog).getByLabelText(label), value);
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved Alex Updated');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toEqual([
      { ...records[0], fullName: 'Alex Updated', email: 'updated@example.com', mobile: '0123456789' }, ...records.slice(1),
    ]);
    expect(JSON.parse(localStorage.getItem(USERS_KEY)).find((account) => account.id === 'u-201')).toMatchObject({ username: 'updated@example.com', displayName: 'Alex Updated' });
    expect(getSession()?.displayName).toBe('Alex Updated');
  });
  it('keeps dialog/values open on quota failure, reports error and permits a real retry', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.clear(within(dialog).getByLabelText('Full Name'));
    await user.type(within(dialog).getByLabelText('Full Name'), 'Alex Updated');
    const before = { ...localStorage };
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Unable to save your profile');
    expect(within(dialog).getByLabelText('Full Name')).toHaveValue('Alex Updated');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
    write.mockRestore();
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readCandidateApplications()[0].fullName).toBe('Alex Updated');
  });
  it('shows email conflicts on the email input while retaining values', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.clear(within(dialog).getByLabelText('Email Address'));
    await user.type(within(dialog).getByLabelText('Email Address'), 'recruiter@hirehub.demo');
    const before = { ...localStorage };
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(within(dialog).getByLabelText('Email Address')).toHaveAccessibleDescription('This email belongs to another account or application.');
    expect({ ...localStorage }).toEqual(before);
  });
  it('rechecks candidate session at save even when dialog was opened while authorized', async () => {
    const user = userEvent.setup();
    const application = readCandidateApplications()[0];
    render(<ProfileEdit application={application} onCancel={() => {}} onSaved={() => { throw new Error('Must not save'); }} />);
    logout();
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in as a candidate');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });
  it('retains dialog and explains a post-save callback failure', async () => {
    const user = userEvent.setup();
    render(<ProfileEdit application={readCandidateApplications()[0]} onCancel={() => {}} onSaved={() => { throw new Error('Requery unavailable'); }} />);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Requery unavailable');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(readCandidateApplications()[0].fullName).toBe('Alex Rivera');
  });
});
