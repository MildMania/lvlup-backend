module.exports = {
  apps: [
    {
      name: 'lvlup-worker',
      cwd: '.',
      script: 'dist/index.js',
      env_file: '.worker.env',
      autorestart: true,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: 'production',
        RUN_API: 'false',
        RUN_JOBS: 'true',
      },
    },
  ],
};
