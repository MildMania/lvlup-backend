/**
 * Unit Tests for Config Validation
 * Phase 4: User Story 2 - Advanced Config Validation
 */

import {
  validateKeyFormat,
  validateDataType,
  validateValueType,
  validateValueSize,
  validateNumberRange,
  validateStringPattern,
  validateEnvironment,
} from '../../src/middleware/validateConfig';

describe('Config Validation Middleware', () => {
  describe('validateKeyFormat (T046)', () => {
    it('should accept valid keys', () => {
      expect(validateKeyFormat('daily_reward_coins')).toEqual({ valid: true });
      expect(validateKeyFormat('config_123')).toEqual({ valid: true });
      expect(validateKeyFormat('_private_config')).toEqual({ valid: true });
      expect(validateKeyFormat('MAX_VALUE')).toEqual({ valid: true });
    });

    it('should reject invalid characters', () => {
      const result = validateKeyFormat('daily-reward');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('alphanumeric');
    });

    it('should reject keys over 64 characters', () => {
      const longKey = 'a'.repeat(65);
      const result = validateKeyFormat(longKey);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('max 64');
    });

    it('should reject empty key', () => {
      const result = validateKeyFormat('');
      expect(result.valid).toBe(false);
    });

    it('should reject special characters', () => {
      expect(validateKeyFormat('config@key').valid).toBe(false);
      expect(validateKeyFormat('config key').valid).toBe(false);
      expect(validateKeyFormat('config.key').valid).toBe(false);
      expect(validateKeyFormat('config-key').valid).toBe(false);
    });
  });

  describe('validateDataType (T048)', () => {
    it('should accept valid data types', () => {
      expect(validateDataType('string')).toEqual({ valid: true });
      expect(validateDataType('number')).toEqual({ valid: true });
      expect(validateDataType('boolean')).toEqual({ valid: true });
      expect(validateDataType('json')).toEqual({ valid: true });
    });

    it('should reject invalid data types', () => {
      const result = validateDataType('integer');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should reject empty dataType', () => {
      const result = validateDataType('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateValueType (T048)', () => {
    it('should validate string values for string type', () => {
      expect(validateValueType('hello', 'string')).toEqual({ valid: true });
    });

    it('should reject non-string for string type', () => {
      const result = validateValueType(123, 'string');
      expect(result.valid).toBe(false);
    });

    it('should validate number values for number type', () => {
      expect(validateValueType(42, 'number')).toEqual({ valid: true });
      expect(validateValueType(3.14, 'number')).toEqual({ valid: true });
    });

    it('should reject non-number for number type', () => {
      expect(validateValueType('not a number', 'number').valid).toBe(false);
      expect(validateValueType(NaN, 'number').valid).toBe(false);
    });

    it('should validate boolean values for boolean type', () => {
      expect(validateValueType(true, 'boolean')).toEqual({ valid: true });
      expect(validateValueType(false, 'boolean')).toEqual({ valid: true });
    });

    it('should reject non-boolean for boolean type', () => {
      expect(validateValueType(1, 'boolean').valid).toBe(false);
      expect(validateValueType('true', 'boolean').valid).toBe(false);
    });

    it('should validate JSON values for json type', () => {
      expect(validateValueType({ key: 'value' }, 'json')).toEqual({ valid: true });
      expect(validateValueType([1, 2, 3], 'json')).toEqual({ valid: true });
    });

    it('should reject non-JSON for json type', () => {
      expect(validateValueType('string', 'json').valid).toBe(false);
      expect(validateValueType(123, 'json').valid).toBe(false);
    });

    it('should reject null or undefined values', () => {
      expect(validateValueType(null, 'string').valid).toBe(false);
      expect(validateValueType(undefined, 'number').valid).toBe(false);
    });
  });

  describe('validateValueSize (T050)', () => {
    it('should accept values under 100KB', () => {
      const smallValue = 'x'.repeat(1000);
      expect(validateValueSize(smallValue)).toEqual({ valid: true });
    });

    it('should accept values at exactly 100KB', () => {
      const exactSize = 'x'.repeat(100 * 1024);
      expect(validateValueSize(exactSize)).toEqual({ valid: true });
    });

    it('should reject values over 100KB', () => {
      const largeValue = 'x'.repeat(101 * 1024);
      const result = validateValueSize(largeValue);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should handle complex objects', () => {
      const largeObject = {
        data: 'x'.repeat(101 * 1024),
      };
      expect(validateValueSize(largeObject).valid).toBe(false);
    });
  });

  describe('validateNumberRange (T054)', () => {
    it('should accept values within range', () => {
      expect(validateNumberRange(50, 0, 100)).toEqual({ valid: true });
      expect(validateNumberRange(0, 0, 100)).toEqual({ valid: true });
      expect(validateNumberRange(100, 0, 100)).toEqual({ valid: true });
    });

    it('should reject values below minimum', () => {
      const result = validateNumberRange(-1, 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least');
    });

    it('should reject values above maximum', () => {
      const result = validateNumberRange(101, 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most');
    });

    it('should handle negative ranges', () => {
      expect(validateNumberRange(-50, -100, 0)).toEqual({ valid: true });
      expect(validateNumberRange(-101, -100, 0).valid).toBe(false);
    });

    it('should work with min only', () => {
      expect(validateNumberRange(100, 50)).toEqual({ valid: true });
      expect(validateNumberRange(40, 50).valid).toBe(false);
    });

    it('should work with max only', () => {
      expect(validateNumberRange(50, undefined, 100)).toEqual({ valid: true });
      expect(validateNumberRange(150, undefined, 100).valid).toBe(false);
    });
  });

  describe('validateStringPattern (T055)', () => {
    it('should accept strings matching pattern', () => {
      expect(validateStringPattern('abc123', '^[a-z0-9]+$')).toEqual({ valid: true });
      expect(validateStringPattern('user@example.com', '^[\\w.-]+@[\\w.-]+\\.\\w+$')).toEqual({
        valid: true,
      });
    });

    it('should reject strings not matching pattern', () => {
      const result = validateStringPattern('ABC', '^[a-z]+$');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should handle complex regex patterns', () => {
      const emailPattern = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
      expect(validateStringPattern('test@example.com', emailPattern)).toEqual({ valid: true });
      expect(validateStringPattern('invalid.email', emailPattern).valid).toBe(false);
    });

    it('should reject invalid regex patterns', () => {
      const result = validateStringPattern('test', '[invalid(');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex');
    });
  });

  describe('validateEnvironment', () => {
    it('should accept valid environments', () => {
      expect(validateEnvironment('development')).toEqual({ valid: true });
      expect(validateEnvironment('staging')).toEqual({ valid: true });
      expect(validateEnvironment('production')).toEqual({ valid: true });
    });

    it('should reject invalid environments', () => {
      const result = validateEnvironment('testing');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should reject empty environment', () => {
      const result = validateEnvironment('');
      expect(result.valid).toBe(false);
    });
  });

  describe('Combination Validation', () => {
    it('should validate complete config payload', () => {
      const validConfig = {
        gameId: 'game_123',
        key: 'daily_reward_coins',
        value: 100,
        dataType: 'number',
        environment: 'production',
      };

      expect(validateKeyFormat(validConfig.key)).toEqual({ valid: true });
      expect(validateDataType(validConfig.dataType)).toEqual({ valid: true });
      expect(validateValueType(validConfig.value, validConfig.dataType)).toEqual({
        valid: true,
      });
      expect(validateValueSize(validConfig.value)).toEqual({ valid: true });
      expect(validateEnvironment(validConfig.environment)).toEqual({ valid: true });
    });

    it('should reject config with multiple validation errors', () => {
      const invalidKey = validateKeyFormat('invalid-key-with-dashes');
      const invalidType = validateDataType('custom_type');

      expect(invalidKey.valid).toBe(false);
      expect(invalidType.valid).toBe(false);
    });
  });

  describe('JSON Validation (T049)', () => {
    it('should accept valid JSON objects', () => {
      expect(validateValueType({ key: 'value' }, 'json')).toEqual({ valid: true });
      expect(validateValueType({ nested: { data: 123 } }, 'json')).toEqual({ valid: true });
    });

    it('should accept valid JSON arrays', () => {
      expect(validateValueType([1, 2, 3], 'json')).toEqual({ valid: true });
      expect(validateValueType(['a', 'b', 'c'], 'json')).toEqual({ valid: true });
    });

    it('should reject invalid JSON values', () => {
      expect(validateValueType('not json', 'json').valid).toBe(false);
      expect(validateValueType(123, 'json').valid).toBe(false);
    });

    it('should validate size of JSON values', () => {
      const largeJson = {
        data: 'x'.repeat(101 * 1024),
      };
      expect(validateValueSize(largeJson).valid).toBe(false);
    });
  });
});

