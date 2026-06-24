import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs under jsdom with File/FileReader available', () => {
    expect(typeof File).toBe('function');
    expect(typeof FileReader).toBe('function');
    const f = new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' });
    expect(f.name).toBe('x.csv');
  });
});
