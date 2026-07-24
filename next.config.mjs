/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Force la transpilation des libs ZXing (ESM) pour le bundler Next.
  transpilePackages: ['@zxing/browser', '@zxing/library'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    serverComponentsExternalPackages: ['pdfkit', 'fontkit', 'bwip-js', 'pureimage'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera=(self) : autorisé sur cette origine (scanner de caisse).
          // microphone / geolocation restent désactivés.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
