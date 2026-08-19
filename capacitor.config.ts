import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.hellopos.app',
  appName: 'HelloPos',
  webDir: 'public',
  server: {
    url: 'https://app.hellopos.fr',
    cleartext: false
  }
};

export default config;
