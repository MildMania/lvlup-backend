module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    verbose: true,
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    testTimeout: 10000, // 10 seconds
    moduleNameMapper: {
        '^uuid$': require.resolve('uuid')
    },
    transformIgnorePatterns: [
        'node_modules/(?!(uuid)/)'
    ]
};