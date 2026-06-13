module.exports = {
  webpack: (config, env) => {
    if (env === 'main') {
      config.externals = [...(config.externals || []), 'node-pty'];
    }
    return config;
  },
};
