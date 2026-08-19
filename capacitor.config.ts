import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.hellopos.app',
  appName: 'HelloPos',
  webDir: 'native-shell',
  server: {
    allowNavigation: [
      'app.hellopos.fr'
    ]
  }
};

export default config;
