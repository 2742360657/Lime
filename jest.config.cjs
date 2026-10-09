module.exports = {
  projects: [
    {
      displayName: 'domain',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/domain/**/*.test.js'],
      roots: ['<rootDir>/src', '<rootDir>/tests'],
      transform: { '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'], babelrc: false, configFile: false }] },
      transformIgnorePatterns: ['/node_modules/(?!@powersync/common/)'],
      moduleNameMapper: { '^@powersync/react-native$': '@powersync/common' },
    },
    {
      displayName: 'expo',
      preset: 'jest-expo',
      roots: ['<rootDir>/src', '<rootDir>/tests'],
      testMatch: ['<rootDir>/tests/expo/**/*.test.ts'],
    },
  ],
};
