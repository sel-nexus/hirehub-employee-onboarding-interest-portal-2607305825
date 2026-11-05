/** Verify stage semantics and friendly next steps for every lifecycle outcome. */
import { afterEach, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StageStepper from './StageStepper';

afterEach(cleanup);

it.each([
  ['applied', 'Received', 'Thanks for applying!'],
  ['review', 'Screening', 'being screened'],
  ['interview', 'Interview Scheduled', 'Check the details'],
  ['offer', 'Final Decision', 'Congratulations!'],
  ['archived', 'Final Decision', 'application is closed'],
])('maps %s to %s with the correct outcome', (status, stage, message) => {
  const { container } = render(<StageStepper status={status} />);
  expect(screen.getByRole('list', { name: 'Application progress' })).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(container.querySelector('[aria-current="step"]').textContent).toContain(stage);
  expect(screen.getByRole('status').textContent).toContain(message);
  expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
});

it('keeps unknown lifecycle data readable instead of inventing progress', () => {
  render(<StageStepper status="invalid" />);
  expect(screen.getByRole('status').textContent).toContain('unavailable');
  expect(screen.queryByRole('list')).toBeNull();
});
