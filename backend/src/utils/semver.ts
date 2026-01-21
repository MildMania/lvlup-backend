/**
 * Semantic Version Comparison Utilities
 * Implements semantic versioning comparison as per semver.org specification
 */

import * as semver from 'semver';
import { VersionOperator } from '../types/config.types';
import { InvalidVersionFormatError } from '../types/config.types';

/**
 * Validates if a string is a valid semantic version
 * @param version Version string to validate
 * @returns true if valid, false otherwise
 */
export function isValidVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

/**
 * Compares two semantic versions using the specified operator
 * @param targetVersion The version to check (e.g., user's app version)
 * @param operator The comparison operator
 * @param constraintVersion The version to compare against (e.g., rule condition)
 * @returns true if the comparison matches
 * @throws InvalidVersionFormatError if either version is invalid
 */
export function compareVersions(
  targetVersion: string,
  operator: VersionOperator,
  constraintVersion: string
): boolean {
  // Validate versions
  if (!isValidVersion(targetVersion)) {
    throw new InvalidVersionFormatError(targetVersion);
  }
  if (!isValidVersion(constraintVersion)) {
    throw new InvalidVersionFormatError(constraintVersion);
  }

  switch (operator) {
    case 'equal':
      return semver.eq(targetVersion, constraintVersion);
    case 'not_equal':
      return semver.neq(targetVersion, constraintVersion);
    case 'greater_than':
      return semver.gt(targetVersion, constraintVersion);
    case 'greater_or_equal':
      return semver.gte(targetVersion, constraintVersion);
    case 'less_than':
      return semver.lt(targetVersion, constraintVersion);
    case 'less_or_equal':
      return semver.lte(targetVersion, constraintVersion);
    default:
      return false;
  }
}

/**
 * Parses a semantic version string into components
 * @param version Version string
 * @returns Parsed version object or null if invalid
 */
export function parseVersion(version: string) {
  return semver.parse(version);
}

/**
 * Sorts versions in ascending order
 * @param versions Array of version strings
 * @returns Sorted array
 */
export function sortVersions(versions: string[]): string[] {
  return versions.sort(semver.compare);
}

/**
 * Gets the highest version from an array
 * @param versions Array of version strings
 * @returns The highest version or null if array is empty
 */
export function getMaxVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;
  return versions.reduce((max, current) => (semver.gt(current, max) ? current : max));
}

/**
 * Gets the lowest version from an array
 * @param versions Array of version strings
 * @returns The lowest version or null if array is empty
 */
export function getMinVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;
  return versions.reduce((min, current) => (semver.lt(current, min) ? current : min));
}

