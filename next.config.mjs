/** @type {import('next').NextConfig} */
const nextConfig = {
  // Identifiant de build visible dans l'app : permet de vérifier d'un coup
  // d'œil que l'appareil exécute bien la dernière version déployée.
  env: {
    NEXT_PUBLIC_BUILD_ID:
      (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)
      || new Date().toISOString().slice(0, 16).replace('T', ' '),
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // Force la transpilation des libs ZXing (ESM) pour le bundler Next.
  transpilePackages: ['@zxing/browser', '@zxing/library'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    serverComponentsExternalPackages: ['pdfkit', 'fontkit', 'bwip-js', 'star-prnt-encoder', 'pureimage', 'exceljs'],
    // Les polices (rendu image du nom de boutique / des étiquettes via
    // pureimage) sont lues via process.cwd() à l'exécution : Next ne les trace
    // pas seul. On force leur inclusion dans les fonctions API (Next 14.2 :
    // sous experimental).
    outputFileTracingIncludes: {
      // Polices du rendu étiquettes : lues depuis process.cwd() à l'exécution,
      // Next ne les trace pas seul.
      '/api/**/*': ['./assets/fonts/**'],
      // Binaire CPUtil (48 Mo) : UNIQUEMENT dans les deux routes qui
      // l'exécutent. Sous '/api/**/*' il était recopié dans chaque fonction
      // du projet — des centaines de mégaoctets pour rien, et le risque de
      // dépasser la taille maximale d'une fonction.
      '/api/cloudprnt/print-labels/route': ['./bin/cputil/**/*'],
      '/api/cloudprnt/print-labels/test/route': ['./bin/cputil/**/*'],
      '/api/cloudprnt/cputil-status/route': ['./bin/cputil/**/*'],
    },
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
