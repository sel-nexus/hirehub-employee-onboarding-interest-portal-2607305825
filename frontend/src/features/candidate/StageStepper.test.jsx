/** Verify stage semantics and friendly next steps for every lifecycle outcome. */
import { afterEach, it, expect } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import StageStepper from './StageStepper';

afterEach(cleanup);

it.each([
  ['applied', 'Application Received', 'Thanks for applying!'],
  ['review', 'Profile Screening', 'being screened'],
  ['interview', 'Interview Scheduled', 'Check the details'],
  ['offer', 'Final Decision', 'Congratulations!'],
  ['archived', 'Final Decision', 'application is closed'],
])('maps %s to %s with the correct outcome', (status, stage, message) => {
  const { container } = render(<StageStepper status={status} />);
  expect(screen.getByRole('list', { name: 'Application progress' })).toBeTruthy();
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(4);
  ['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision'].forEach((label, index) => {
    expect(within(items[index]).getByText(label, { exact: true })).toBeTruthy();
  });
  expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  expect(within(container.querySelector('[aria-current="step"]')).getByText(stage, { exact: true })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain(message);
  expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
});

it('names an extended offer explicitly and never presents an archived application as an offer', () => {
  const view = render(<StageStepper status="offer" />);
  expect(screen.getByText('Offer Extended', { exact: true })).toBeTruthy();
  view.rerender(<StageStepper status="archived" />);
  expect(screen.queryByText('Offer Extended', { exact: true })).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('application is closed');
  expect(screen.getByRole('status').textContent).not.toContain('Congratulations');
});

it('keeps unknown lifecycle data readable instead of inventing progress', () => {
  render(<StageStepper status="invalid" />);
  expect(screen.getByRole('status').textContent).toContain('unavailable');
  expect(screen.queryByRole('list')).toBeNull();
});
