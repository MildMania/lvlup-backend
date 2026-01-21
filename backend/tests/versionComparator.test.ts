/**
 * Unit Tests for Version Comparator Service
 */

import {
  validateVersion,
  compare,
  satisfiesCondition,
  getVersionInfo,
  formatVersion,
} from '../src/services/versionComparator';

// Mock logger
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Version Comparator Service', () => {
  describe('validateVersion', () => {
    it('should validate correct versions', () => {
      expect(validateVersion('1.0.0')).toBe(true);
      expect(validateVersion('2.3.4')).toBe(true);
      expect(validateVersion('0.0.1')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(validateVersion('invalid')).toBe(false);
      expect(validateVersion('1.0')).toBe(false);
      expect(validateVersion('')).toBe(false);
    });
  });

  describe('compare', () => {
    it('should compare versions with equal operator', () => {
      expect(compare('1.0.0', 'equal', '1.0.0')).toBe(true);
      expect(compare('1.0.0', 'equal', '1.0.1')).toBe(false);
    });

    it('should compare versions with greater_or_equal operator', () => {
      expect(compare('3.5.0', 'greater_or_equal', '3.5.0')).toBe(true);
      expect(compare('3.6.0', 'greater_or_equal', '3.5.0')).toBe(true);
      expect(compare('3.4.0', 'greater_or_equal', '3.5.0')).toBe(false);
    });

    it('should handle invalid versions gracefully', () => {
      const result = compare('invalid', 'equal', '1.0.0');
      expect(result).toBe(false);
    });
  });

  describe('satisfiesCondition', () => {
    it('should check if version satisfies condition', () => {
      expect(satisfiesCondition('3.5.0', 'greater_or_equal', '3.5.0')).toBe(true);
      expect(satisfiesCondition('3.4.0', 'greater_or_equal', '3.5.0')).toBe(false);
    });

    it('should work with all operators', () => {
      expect(satisfiesCondition('1.0.0', 'equal', '1.0.0')).toBe(true);
      expect(satisfiesCondition('1.0.0', 'not_equal', '1.0.1')).toBe(true);
      expect(satisfiesCondition('2.0.0', 'greater_than', '1.0.0')).toBe(true);
      expect(satisfiesCondition('1.0.0', 'less_than', '2.0.0')).toBe(true);
    });
  });

  describe('getVersionInfo', () => {
    it('should parse valid version', () => {
      const info = getVersionInfo('1.2.3');
      expect(info).not.toBeNull();
      expect(info?.major).toBe(1);
      expect(info?.minor).toBe(2);
      expect(info?.patch).toBe(3);
    });

    it('should return null for invalid version', () => {
      const info = getVersionInfo('invalid');
      expect(info).toBeNull();
    });

    it('should handle prerelease versions', () => {
      const info = getVersionInfo('1.0.0-alpha');
      expect(info).not.toBeNull();
      expect(info?.prerelease).toContain('alpha');
    });
  });

  describe('formatVersion', () => {
    it('should format simple version', () => {
      expect(formatVersion('1.2.3')).toBe('1.2.3');
    });

    it('should format prerelease version', () => {
      const formatted = formatVersion('1.0.0-alpha');
      expect(formatted).toContain('1.0.0');
      expect(formatted).toContain('alpha');
    });

    it('should return original string for invalid version', () => {
      const invalid = 'invalid-version';
      expect(formatVersion(invalid)).toBe(invalid);
    });
  });
});

