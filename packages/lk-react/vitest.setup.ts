import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import { a11yMatchers } from './src/test-support/a11y.js';

// RTL 16 + React 19 use React.act, which requires this flag.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

expect.extend(a11yMatchers);

afterEach(() => {
  cleanup();
});
