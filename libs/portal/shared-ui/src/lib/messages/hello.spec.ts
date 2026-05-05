import { describe, it, expect } from 'vitest';
import { helloMessage } from './hello';

describe('helloMessage', () => {
  it('should contain a welcome greeting', () => {
    expect(helloMessage).toContain('שלום');
  });

  it('should contain information about natural resources', () => {
    expect(helloMessage).toContain('משאבי טבע');
  });

  it('should list examples of queries', () => {
    expect(helloMessage).toContain('דוגמאות לשאילתות');
  });
});
