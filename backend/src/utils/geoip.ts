/**
 * GeoIP Country Detection Utilities
 * Uses geoip-lite library to detect country from IP address
 */

import geoip from 'geoip-lite';

/**
 * GeoIP lookup result
 */
export interface GeoIPResult {
  country: string | null;
  timezone: string | null;
  eu: boolean | null;
}

/**
 * Looks up country and timezone information from an IP address
 * @param ipAddress IP address to lookup
 * @returns GeoIP result with country code and timezone
 */
export function lookupCountry(ipAddress: string): GeoIPResult {
  const geo = geoip.lookup(ipAddress);

  if (!geo) {
    return {
      country: null,
      timezone: null,
      eu: null,
    };
  }

  return {
    country: geo.country || null,
    timezone: geo.timezone || null,
    eu: geo.eu || null,
  };
}

/**
 * Gets the country code from an IP address
 * @param ipAddress IP address to lookup
 * @returns ISO 3166-1 alpha-2 country code or null
 */
export function getCountryFromIP(ipAddress: string): string | null {
  const result = lookupCountry(ipAddress);
  return result.country;
}

/**
 * Checks if an IP address is from the EU
 * @param ipAddress IP address to check
 * @returns true if from EU, false otherwise, null if unknown
 */
export function isEUCountry(ipAddress: string): boolean | null {
  const result = lookupCountry(ipAddress);
  return result.eu;
}

/**
 * Gets timezone from an IP address
 * @param ipAddress IP address to lookup
 * @returns IANA timezone string or null
 */
export function getTimezoneFromIP(ipAddress: string): string | null {
  const result = lookupCountry(ipAddress);
  return result.timezone;
}

/**
 * Validates if a country code is valid ISO 3166-1 alpha-2 format
 * @param countryCode Country code to validate
 * @returns true if valid format, false otherwise
 */
export function isValidCountryCode(countryCode: string): boolean {
  // ISO 3166-1 alpha-2 codes are exactly 2 uppercase letters
  return /^[A-Z]{2}$/.test(countryCode);
}

