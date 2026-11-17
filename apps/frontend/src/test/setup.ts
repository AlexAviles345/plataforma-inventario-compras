import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { mockApiServer } from './server';

beforeAll(() => mockApiServer.listen());

afterEach(() => {
  cleanup();
  mockApiServer.resetHandlers();
  useAuthSessionStore.getState().clearSession();
  sessionStorage.clear();
});

afterAll(() => mockApiServer.close());
