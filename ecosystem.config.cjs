module.exports = {
  apps : [{
    name: 'otakuin-api',
    script: 'src/main.ts',
    interpreter: 'bun',
    env: {
      NODE_ENV: 'production',
      NODE_TLS_REJECT_UNAUTHORIZED: '0'
    }
  }, {
    name: 'otakuin-worker',
    script: 'src/core/worker/index.ts',
    interpreter: 'bun',
    env: {
      NODE_ENV: 'production',
      NODE_TLS_REJECT_UNAUTHORIZED: '0'
    }
  }]
};