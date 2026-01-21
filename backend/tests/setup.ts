/**
 * Jest Setup File
 * Runs before tests to set up the testing environment
 */

// Suppress console output during tests unless debugging
if (process.env.DEBUG !== 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}

