function getKeysFromEnv() {
  let envObject = process.env;

  return Object.entries(envObject).filter(([key]) => {
    return key.startsWith('YT_');
  });
}

module.exports = {
  getKeysFromEnv,
};
