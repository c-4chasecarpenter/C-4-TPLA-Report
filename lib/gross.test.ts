import { describe, it, expect } from 'vitest';
import { parseMoney, parseCount } from './gross';

describe('parseMoney — real CRM export edge cases', () => {
  it('plain and currency-formatted dollars', () => {
    expect(parseMoney('$7,085.82')).toBeCloseTo(7085.82, 2);
    expect(parseMoney('$0.00')).toBe(0);
    expect(parseMoney(1234.5)).toBe(1234.5);
  });

  it('comma-thousands integers (would break parseInt)', () => {
    expect(parseMoney('1,491')).toBe(1491);
    expect(parseCount('1,491')).toBe(1491);
  });

  it('Excel scientific notation', () => {
    expect(parseMoney('6.22E+03')).toBeCloseTo(6220, 6);
    expect(parseMoney('8.99E+04')).toBeCloseTo(89900, 6);
  });

  it('negatives in every shape: (x), -x, -$x, and $-x', () => {
    expect(parseMoney('(500)')).toBe(-500);
    expect(parseMoney('-535')).toBe(-535);
    expect(parseMoney('-$402.76')).toBeCloseTo(-402.76, 2);
    expect(parseMoney('$-535')).toBe(-535); // minus after the $ (George Chevy)
  });

  it('Excel column overflow "########" is unrecoverable → 0', () => {
    expect(parseMoney('########')).toBe(0);
  });

  it('percent and null-ish cells', () => {
    expect(parseMoney('3.79%')).toBeCloseTo(3.79, 2);
    expect(parseMoney('-')).toBe(0);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney(null)).toBe(0);
  });
});
