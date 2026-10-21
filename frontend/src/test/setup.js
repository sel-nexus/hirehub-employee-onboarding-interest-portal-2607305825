/** Install DOM matchers and isolate component tests after each case. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** Remove mounted test trees to prevent state leaking between cases. */
afterEach(() => {
  cleanup();
});
