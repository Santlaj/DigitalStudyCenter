import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.digitalstudycenter.app',
  appName: 'DigitalStudyCenter',
  webDir: 'www',
  server: {
    // Point to your deployed backend API URL here.
    // During development you can use your local IP:
    // url: 'http://192.168.x.x:3000',
    // cleartext: true,
    androidScheme: 'https'
  }
};

export default config;
