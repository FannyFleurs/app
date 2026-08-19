import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.hellopos.app',
  appName: 'HelloPos',
  webDir: 'native-shell',
  server: {
    // Schéma/hôte local figés : l'écran de réglages est ainsi toujours
    // atteignable de façon déterministe via capacitor://localhost/.
    iosScheme: 'capacitor',
    hostname: 'localhost',
    allowNavigation: [
      'app.hellopos.fr'
    ]
  }
};

export default config;
