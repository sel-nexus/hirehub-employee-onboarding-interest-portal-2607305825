/** Exercise dialog persistence, failure feedback, safe previews and keyboard contracts. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { authenticate, logout } from '../access/accounts';
import { readDemoSubmissions, DEMO_SUBMISSIONS_KEY } from '../demo/storage';
import RecordDialog from './RecordDialog';

let record;
beforeEach(() => {
  localStorage.clear();
  authenticate('admin', 'admin', 'admin');
  record = readDemoSubmissions().data[0];
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ''; });
/** Mount a real close/remount lifecycle with an actual trigger. */
function Harness({ mode = 'edit', value = record }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open record</button>
      {open && (
        <RecordDialog record={value} mode={mode} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
      )}
    </>
  );
}
/** Read the persisted row independently after a mutation. */
const stored = () => JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))[0];

it('traps Tab in both directions, closes Escape, restores trigger and previous scroll state', async () => {
  const user = userEvent.setup();
  document.body.style.overflow = 'auto';
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Open record' });
  await user.click(trigger);
  const first = screen.getByLabelText('Full name');
  const last = screen.getByRole('button', { name: 'Save changes' });
  expect(first).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  await user.tab({ shift: true });
  expect(last).toHaveFocus();
  await user.tab();
  expect(first).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe('auto');
});

it.each([
  ['Tab', false, 'first'],
  ['Shift+Tab', true, 'last'],
])('recovers background trigger focus with %s without dismissing', async (_, shift, edge) => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Open record' });
  await user.click(trigger);
  const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
  trigger.focus();
  expect(trigger).toHaveFocus();

  await user.tab({ shift });

  const target = edge === 'first'
    ? screen.getByLabelText('Full name')
    : screen.getByRole('button', { name: 'Save changes' });
  expect(target).toHaveFocus();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(document.body.style.overflow).toBe('hidden');
  expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
});

it('allows ordinary interior Tab and non-Tab keys without dismissal or persistence', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open record' }));
  const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
  expect(screen.getByLabelText('Full name')).toHaveFocus();
  await user.tab();
  expect(screen.getByLabelText('Mobile')).toHaveFocus();
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.tab();
  expect(screen.getByLabelText('Department')).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByLabelText('Mobile')).toHaveFocus();
  await user.keyboard('{ArrowLeft}');
  expect(screen.getByLabelText('Mobile')).toHaveFocus();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
});

it('cleans up the keyboard listener and scroll lock when the original trigger is detached', async () => {
  const user = userEvent.setup();
  const trigger = document.createElement('button');
  trigger.textContent = 'Detached trigger';
  document.body.append(trigger);
  document.body.style.overflow = 'auto';
  trigger.focus();
  const view = render(
    <RecordDialog record={record} mode="edit" onClose={() => view.unmount()} onSaved={() => view.unmount()} />,
  );
  try {
    expect(screen.getByLabelText('Full name')).toHaveFocus();
    const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
    trigger.remove();
    expect(trigger.isConnected).toBe(false);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto');
    expect(trigger).not.toHaveFocus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
  } finally {
    trigger.remove();
    view.unmount();
  }
});

it('ignores clicks inside the dialog and closes on its backdrop without saving', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByText('Open record'));
  await user.click(screen.getByRole('heading'));
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('dialog').parentElement);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(stored()).toEqual(record);
});

it('validates fields, keeps entries on failed quota save, then saves only editable contacts', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByText('Open record'));
  await user.clear(screen.getByLabelText('Full name'));
  await user.click(screen.getByText('Save changes'));
  expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription(/Enter a name/);
  await user.type(screen.getByLabelText('Full name'), 'Alex Smith');
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await user.click(screen.getByText('Save changes'));
  expect(screen.getByText(/Unable to save demo/)).toBeVisible();
  expect(screen.getByLabelText('Full name')).toHaveValue('Alex Smith');
  expect(stored()).toEqual(record);
  quota.mockRestore();
  await user.click(screen.getByText('Save changes'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(stored()).toEqual({ ...record, fullName: 'Alex Smith' });
});

it('reports department collision without closing or changing storage', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByText('Open record'));
  await user.selectOptions(screen.getByLabelText('Department'), 'Product');
  await user.click(screen.getByText('Save changes'));
  expect(screen.getByText(/already has a record/)).toBeVisible();
  expect(screen.getByLabelText('Department')).toHaveAttribute('aria-invalid', 'true');
  expect(stored()).toEqual(record);
});

it('saves notes and supports clearing notes', async () => {
  const user = userEvent.setup();
  render(<Harness mode="notes" />);
  await user.click(screen.getByText('Open record'));
  await user.clear(screen.getByLabelText('Internal notes'));
  await user.type(screen.getByLabelText('Internal notes'), 'Private follow up');
  await user.click(screen.getByText('Save changes'));
  expect(stored().notes).toBe('Private follow up');
  cleanup();
  render(<Harness mode="notes" value={stored()} />);
  await user.click(screen.getByText('Open record'));
  await user.clear(screen.getByLabelText('Internal notes'));
  await user.click(screen.getByText('Save changes'));
  expect(stored().notes).toBe('');
});

it.each(['revoked', 'missing'])('shows failed save for %s records and preserves the dialog', async (reason) => {
  const user = userEvent.setup();
  render(<Harness mode="notes" />);
  await user.click(screen.getByText('Open record'));
  if (reason === 'revoked') logout();
  else localStorage.setItem(DEMO_SUBMISSIONS_KEY, '[]');
  await user.click(screen.getByText('Save changes'));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(/log in|no longer exists/);
});

it('cancel preserves deletion, quota error stays visible, and confirmation deletes only the target', async () => {
  const user = userEvent.setup();
  render(<Harness mode="delete" />);
  await user.click(screen.getByText('Open record'));
  expect(screen.getByText('Cancel')).toHaveFocus();
  await user.click(screen.getByText('Cancel'));
  expect(stored()).toEqual(record);
  await user.click(screen.getByText('Open record'));
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await user.click(screen.getByText('Confirm delete'));
  expect(screen.getByRole('alert')).toHaveTextContent(/Unable to save/);
  quota.mockRestore();
  await user.click(screen.getByText('Confirm delete'));
  expect(JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))).toHaveLength(7);
  expect(stored().id).toBe('submission-2');
});

it('previews inline escaped resume and safe portfolio without external fetch', async () => {
  const user = userEvent.setup();
  const fetch = vi.spyOn(window, 'fetch');
  render(<Harness mode="materials" value={{ ...record, resumeText: '<script>unsafe()</script>' }} />);
  await user.click(screen.getByText('Open record'));
  expect(screen.getByText('<script>unsafe()</script>')).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link')).toHaveAttribute('href', record.portfolioUrl);
  expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByText('Close materials'));
  expect(screen.getByText('Open record')).toHaveFocus();
});

it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com', '/relative', 'ftp://example.com'])('blocks unsafe material URL %s', async (portfolioUrl) => {
  const user = userEvent.setup();
  render(<Harness mode="materials" value={{ ...record, portfolioUrl }} />);
  await user.click(screen.getByText('Open record'));
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Unsafe portfolio link blocked.')).toBeVisible();
});

it('explains absent legacy materials and supports a single-control focus trap', async () => {
  const user = userEvent.setup();
  render(<Harness mode="materials" value={{ ...record, resumeText: undefined, sampleResume: undefined,
    coverLetterText: undefined, portfolioUrl: '' }} />);
  await user.click(screen.getByText('Open record'));
  expect(screen.getByText('No resume was supplied with this public interest record.')).toBeVisible();
  const close = screen.getByText('Close materials');
  await user.tab();
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(close).toHaveFocus();
});
