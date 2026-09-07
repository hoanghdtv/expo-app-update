const cfg = require('./update.config.json');

const BASE_URL = `https://${cfg.githubUser}.github.io/${cfg.repoName}`;

module.exports = {
  expo: {
    name: 'expo-app-update',
    slug: 'expo-app-update',
    version: '1.0.0',
    orientation: 'portrait',
    android: { package: 'com.hoanghdtv.expoappupdate' },
    runtimeVersion: cfg.runtimeVersion,
    updates: {
      url: `${BASE_URL}/${cfg.channel}/${cfg.runtimeVersion}/${cfg.platform}/manifest.json`,
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    extra: {
      updateChannel: cfg.channel,
      baseUrl: BASE_URL,
    },
  },
};
