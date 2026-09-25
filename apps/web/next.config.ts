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
  async headers() {
    return [
      {
        source: '/report/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default config;
