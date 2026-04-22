import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'indicator-signal-mini-app',
  brand: {
    displayName: '시그널 피드',
    primaryColor: '#3182f6',
    icon: '',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host',
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
