import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@geotrack/config', '@geotrack/core', '@geotrack/db', '@geotrack/ui'],
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return webpackConfig;
  },
};

export default config;
