/**
 * Unit Tests for Semantic Version Comparison Utilities
 */

import {
  isValidVersion,
  compareVersions,
  parseVersion,
  sortVersions,
  getMaxVersion,
  getMinVersion,
} from '../src/utils/semver';
import { InvalidVersionFormatError } from '../src/types/config.types';

describe('Semver Utility', () => {
  describe('isValidVersion', () => {
    it('should validate correct semantic versions', () => {
      expect(isValidVersion('1.0.0')).toBe(true);
      expect(isValidVersion('0.0.1')).toBe(true);
      expect(isValidVersion('2.3.4')).toBe(true);
      expect(isValidVersion('10.20.30')).toBe(true);
    });

    it('should accept prerelease versions', () => {
      expect(isValidVersion('1.0.0-alpha')).toBe(true);
      expect(isValidVersion('1.0.0-beta.1')).toBe(true);
      expect(isValidVersion('1.0.0-rc.1')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(isValidVersion('1')).toBe(false);
      expect(isValidVersion('1.0')).toBe(false);
      expect(isValidVersion('invalid')).toBe(false);
      expect(isValidVersion('1.0.0.0')).toBe(false);
      expect(isValidVersion('')).toBe(false);
    });
  });

  describe('compareVersions', () => {
    it('should compare versions with "equal" operator', () => {
      expect(compareVersions('1.0.0', 'equal', '1.0.0')).toBe(true);
      expect(compareVersions('1.0.0', 'equal', '1.0.1')).toBe(false);
    });

    it('should compare versions with "not_equal" operator', () => {
      expect(compareVersions('1.0.0', 'not_equal', '1.0.1')).toBe(true);
      expect(compareVersions('1.0.0', 'not_equal', '1.0.0')).toBe(false);
    });

    it('should compare versions with "greater_than" operator', () => {
      expect(compareVersions('1.1.0', 'greater_than', '1.0.0')).toBe(true);
      expect(compareVersions('1.0.0', 'greater_than', '1.0.0')).toBe(false);
      expect(compareVersions('1.0.0', 'greater_than', '1.1.0')).toBe(false);
    });

    it('should compare versions with "greater_or_equal" operator', () => {
      expect(compareVersions('1.1.0', 'greater_or_equal', '1.0.0')).toBe(true);
      expect(compareVersions('1.0.0', 'greater_or_equal', '1.0.0')).toBe(true);
      expect(compareVersions('0.9.0', 'greater_or_equal', '1.0.0')).toBe(false);
    });

    it('should compare versions with "less_than" operator', () => {
      expect(compareVersions('0.9.0', 'less_than', '1.0.0')).toBe(true);
      expect(compareVersions('1.0.0', 'less_than', '1.0.0')).toBe(false);
      expect(compareVersions('1.1.0', 'less_than', '1.0.0')).toBe(false);
    });

    it('should compare versions with "less_or_equal" operator', () => {
      expect(compareVersions('0.9.0', 'less_or_equal', '1.0.0')).toBe(true);
      expect(compareVersions('1.0.0', 'less_or_equal', '1.0.0')).toBe(true);
      expect(compareVersions('1.1.0', 'less_or_equal', '1.0.0')).toBe(false);
    });

    it('should throw InvalidVersionFormatError for invalid target version', () => {
      expect(() => compareVersions('invalid', 'equal', '1.0.0')).toThrow(
        InvalidVersionFormatError
      );
    });

    it('should throw InvalidVersionFormatError for invalid constraint version', () => {
      expect(() => compareVersions('1.0.0', 'equal', 'invalid')).toThrow(
        InvalidVersionFormatError
      );
    });

    it('should handle prerelease versions', () => {
      expect(compareVersions('1.0.0-alpha', 'less_than', '1.0.0')).toBe(true);
      expect(compareVersions('1.0.0-beta', 'less_than', '1.0.0-rc')).toBe(true);
    });
  });

  describe('parseVersion', () => {
    it('should parse valid versions', () => {
      const parsed = parseVersion('1.2.3');
      expect(parsed).not.toBeNull();
      expect(parsed?.major).toBe(1);
      expect(parsed?.minor).toBe(2);
      expect(parsed?.patch).toBe(3);
    });

    it('should return null for invalid versions', () => {
      expect(parseVersion('invalid')).toBeNull();
      expect(parseVersion('1.0')).toBeNull();
    });
  });

  describe('sortVersions', () => {
    it('should sort versions in ascending order', () => {
      const versions = ['1.0.0', '1.0.2', '1.0.1', '2.0.0', '0.9.0'];
      const sorted = sortVersions(versions);
      expect(sorted).toEqual(['0.9.0', '1.0.0', '1.0.1', '1.0.2', '2.0.0']);
    });

    it('should handle prerelease versions', () => {
      const versions = ['1.0.0', '1.0.0-alpha', '1.0.0-beta'];
      const sorted = sortVersions(versions);
      expect(sorted[0]).toBe('1.0.0-alpha');
      expect(sorted[1]).toBe('1.0.0-beta');
      expect(sorted[2]).toBe('1.0.0');
    });
  });

  describe('getMaxVersion', () => {
    it('should return the maximum version', () => {
      const versions = ['1.0.0', '1.0.2', '1.0.1', '2.0.0', '0.9.0'];
      expect(getMaxVersion(versions)).toBe('2.0.0');
    });

    it('should return null for empty array', () => {
      expect(getMaxVersion([])).toBeNull();
    });
  });

  describe('getMinVersion', () => {
    it('should return the minimum version', () => {
      const versions = ['1.0.0', '1.0.2', '1.0.1', '2.0.0', '0.9.0'];
      expect(getMinVersion(versions)).toBe('0.9.0');
    });

    it('should return null for empty array', () => {
      expect(getMinVersion([])).toBeNull();
    });
  });
});

