import { describe, expect, it } from 'vitest';
import { APP_NAME, greet } from './index.js';

describe('core', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('LeapFrog');
  });

  it('greets with a default', () => {
    expect(greet()).toBe('LeapFrog ready.');
  });
});
