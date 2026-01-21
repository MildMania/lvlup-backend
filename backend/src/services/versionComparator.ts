/**
 * Version Comparator Service
 * High-level service for version comparison operations
 */

import { compareVersions, isValidVersion, parseVersion } from '../utils/semver';
import { VersionOperator } from '../types/config.types';
import logger from '../utils/logger';

/**
 * Validates if a version string is valid
 * @param version Version to validate
 * @returns true if valid, false otherwise
 */
export function validateVersion(version: string): boolean {
  const valid = isValidVersion(version);
  if (!valid) {
    logger.debug(`Invalid version format: ${version}`);
  }
  return valid;
}

/**
 * Compares two versions with caching for repeated comparisons
 * @param targetVersion The version to check
 * @param operator The comparison operator
 * @param constraintVersion The constraint version
 * @returns true if comparison matches
 */
export function compare(
  targetVersion: string,
  operator: VersionOperator,
  constraintVersion: string
): boolean {
  try {
    const result = compareVersions(targetVersion, operator, constraintVersion);
    logger.debug(`Version comparison: ${targetVersion} ${operator} ${constraintVersion} = ${result}`);
    return result;
  } catch (error) {
    logger.error('Version comparison error:', {
      targetVersion,
      operator,
      constraintVersion,
      error,
    });
    return false;
  }
}

/**
 * Checks if a version satisfies a version range condition
 * @param targetVersion The version to check
 * @param operator The range operator
 * @param minVersion The minimum version (for >= operator)
 * @returns true if version satisfies condition
 */
export function satisfiesCondition(
  targetVersion: string,
  operator: VersionOperator,
  minVersion: string
): boolean {
  return compare(targetVersion, operator, minVersion);
}

/**
 * Gets version information for logging/debugging
 * @param version Version string
 * @returns Parsed version object or null if invalid
 */
export function getVersionInfo(version: string) {
  try {
    return parseVersion(version);
  } catch (error) {
    logger.error(`Failed to parse version: ${version}`, error);
    return null;
  }
}

/**
 * Formats version for display
 * @param version Version string
 * @returns Formatted version or original if invalid
 */
export function formatVersion(version: string): string {
  const parsed = getVersionInfo(version);
  if (!parsed) {
    return version;
  }
  const prerelease = parsed.prerelease && parsed.prerelease.length ? `-${parsed.prerelease.join('.')}` : '';
  // Note: semver library doesn't expose metadata property, so we omit it
  return `${parsed.major}.${parsed.minor}.${parsed.patch}${prerelease}`;
}

