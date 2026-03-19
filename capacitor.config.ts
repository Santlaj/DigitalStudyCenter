import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.digitalstudycenter.app',
  appName: 'DigitalStudyCenter',
  webDir: 'www',
  server: {
    cleartext: true,
  }
};

export default config;
