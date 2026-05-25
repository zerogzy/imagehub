module.exports = {
  apps: [
    {
      name: 'imagehub-api',
      cwd: '/opt/imagehub',
      script: 'node',
      args: 'apps/api/dist/src/main.js',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'imagehub-web',
      cwd: '/opt/imagehub/apps/web/.next/standalone',
      script: 'node',
      args: 'apps/web/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'imagehub-worker-ai',
      cwd: '/opt/imagehub/apps/worker-ai',
      script: '/opt/imagehub/apps/worker-ai/.venv/bin/python',
      args: 'main.py',
      env: {
        API_URL: 'http://127.0.0.1:3001/api/v1',
        STORAGE_ROOT: '/opt/imagehub/storage',
        ADMIN_TOKEN: '',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
