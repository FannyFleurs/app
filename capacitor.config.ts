import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.hellopos.app',
  appName: 'HelloPos',
  webDir: 'public',
  server: {
    url: 'https://hellopos-git-native-capacitor-poc-swebio1.vercel.app',
    cleartext: false
  }
};

export default config;
