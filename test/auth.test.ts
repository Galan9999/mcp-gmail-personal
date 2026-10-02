import { describe, expect, it } from 'vitest';
import { SCOPES } from '../src/auth.js';

// El scope total permite borrar permanentemente. Este servidor no lo pide y no debe pedirlo nunca.
describe('scopes de OAuth', () => {
  it('son exactamente modify, send y settings.basic', () => {
    expect(SCOPES).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.settings.basic',
    ]);
  });

  it('nunca incluyen el scope total de Gmail', () => {
    expect(SCOPES).not.toContain('https://mail.google.com/');
  });
});
