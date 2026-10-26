/** Verify bundled preview content, URL safety and the complete modal lifecycle. */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeDrawer from './ResumeDrawer';
import { SAMPLE_RESUMES } from '../demo/mockData';

const submission = { fullName: 'Alice Smith', portfolioUrl: 'https://example.com/alice', sampleResume: 'UI/UX Case Study' };

/** Open and close through real component transitions to exercise effect cleanup. */
function Harness({ record = submission }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Preview materials
      </button>
      {open && (
        <ResumeDrawer submission={record} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('ResumeDrawer', () => {
  it.each(Object.entries(SAMPLE_RESUMES))('renders all bundled text for %s without network calls', (sampleResume, text) => {
    const fetchSpy = vi.spyOn(window, 'fetch');
    render(<ResumeDrawer submission={{ ...submission, sampleResume }} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Resume and portfolio for Alice Smith' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { level: 3, name: sampleResume })).toBeVisible();
    text.split('\n').forEach((line) => expect(within(dialog).getByText(line, { selector: 'p' })).toBeVisible());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dialog.querySelector('iframe, object, embed, img')).toBeNull();
  });

  it.each(['', 'Unknown Resume', 'toString', '<script>alert(1)</script>'])('handles absent or unknown resume %s without rendering untrusted content', (sampleResume) => {
    render(<ResumeDrawer submission={{ fullName: 'Alice Smith', sampleResume }} onClose={vi.fn()} />);
    expect(screen.getByText(sampleResume ? 'This sample resume is not available in the bundled demo.' : 'No sample resume selected.')).toBeVisible();
    expect(screen.getByText('No portfolio link provided.')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,bad', 'ftp://example.com', '/relative', '//example.com', ' https://example.com ', 'https://', 'https://example.com/' + 'x'.repeat(2048)])('does not create a link for unsafe portfolio %s', (portfolioUrl) => {
    render(<ResumeDrawer submission={{ ...submission, portfolioUrl }} onClose={vi.fn()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Portfolio link is unavailable/)).toBeVisible();
  });

  it.each(['https://example.com/alice', 'http://example.com/alice'])('offers a safe explicit new-tab link for %s', async (portfolioUrl) => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(window, 'fetch');
    const onClose = vi.fn();
    render(<ResumeDrawer submission={{ ...submission, portfolioUrl }} onClose={onClose} />);
    const link = screen.getByRole('link', { name: 'Open portfolio in a new tab' });
    expect(link).toHaveAttribute('href', portfolioUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Prevent jsdom navigation, not the app's click; the native anchor still receives the explicit action.
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('traps both Tab directions, contains background focus, closes on Escape and restores scroll/focus', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Preview materials' });
    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'Close preview' });
    const link = screen.getByRole('link');
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    await user.tab({ shift: true });
    expect(link).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(link).toHaveFocus();
    trigger.focus();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('scroll');
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('cycles the single close control and ignores inside clicks but closes on the overlay', async () => {
    const user = userEvent.setup();
    render(<Harness record={{ fullName: 'Alice Smith' }} />);
    const trigger = screen.getByRole('button', { name: 'Preview materials' });
    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'Close preview' });
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.click(screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores prior focus and removes keyboard/focus listeners on direct unmount', async () => {
    const user = userEvent.setup();
    render(
      <button type="button">
        Background
      </button>,
    );
    const trigger = screen.getByRole('button');
    await user.click(trigger);
    document.body.style.overflow = 'auto';
    const onClose = vi.fn();
    const view = render(<ResumeDrawer submission={submission} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus();
    view.unmount();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('auto');
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
