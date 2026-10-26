/** Verify every hiring stage, text semantics and safe unknown fallbacks. */
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getStage, StageStepper, STAGE_LABELS } from './StageStepper';
afterEach(cleanup);

describe('StageStepper', () => {
  it.each([
    ['applied', 0, 'Application Received', 'received your application'],
    ['review', 1, 'Under Review', 'screening your profile'],
    ['interview', 2, 'Interview Scheduled', 'Prepare for your interview'],
    ['offer', 3, 'Offer Extended', 'Congratulations'],
    ['archived', 3, 'Not Selected', 'not selected'],
  ])('maps %s to stage %s with distinct next steps', (status, index, label, explanation) => {
    render(<StageStepper status={status} />);
    expect(getStage(status)).toMatchObject({ index, label, next: expect.stringContaining(explanation) });
    expect(screen.getByRole('status')).toHaveTextContent(`Current status: ${label}`);
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    steps.forEach((step, i) => {
      expect(step).toHaveTextContent(STAGE_LABELS[i]);
      if (i === index) expect(step).toHaveAttribute('aria-current', 'step');
      else expect(step).not.toHaveAttribute('aria-current');
      expect(step).toHaveTextContent(i === index ? 'Current stage' : i < index ? 'Completed' : 'Pending');
    });
    expect(screen.getByText(/Next steps:/).closest('p')).toHaveTextContent(explanation);
    if (status === 'archived') expect(screen.queryByText(/Congratulations/)).not.toBeInTheDocument();
  });
  it.each(['future', '', undefined, 'constructor', '__proto__', 'toString'])('shows no active stage for unknown %j', (status) => {
    render(<StageStepper status={status} />);
    expect(screen.getByRole('list', { name: 'Application progress' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Status unavailable');
    expect(getStage(status).index).toBe(-1);
    for (const step of screen.getAllByRole('listitem')) expect(step).not.toHaveAttribute('aria-current');
    expect(screen.getByText(/Next steps:/).closest('p')).toHaveTextContent('Contact the recruiting team');
  });
  it.each([null, 0, {}, []])('handles nonstring raw status %j without implying a decision', (status) => {
    expect(getStage(status)).toMatchObject({ index: -1, label: 'Status unavailable' });
  });
});
