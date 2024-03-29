const axios = require('axios');

const DAY_IN_MS = 86400000;

function censorApiKey(key) {
  return key.slice(0, 8) + '...' + key.slice(-6);
}
class Key {
  constructor(value, lastFailure) {
    this.value = value;
    this.lastFailure = lastFailure || null;
  }

  fail() {
    // const mainProcess = new Test();
    this.lastFailure = Date.now();
  }

  criticalFail() {
    // mainProcess.removeKey(this);
  }

  timeSinceLastFailure() {
    return Date.now() - this.lastFailure;
  }

  // Has it been a day since the last failure?
  daySinceExpiry() {
    return this.timeSinceLastFailure() > DAY_IN_MS;
  }

  isValid() {
    return this.daySinceExpiry();
  }

  get valid() {
    return this.isValid();
  }

  get keyString() {
    return censorApiKey(this.value);
  }

  async test() {
    try {
      await axios.get(
        `https://www.googleapis.com/youtube/v3/search?type=video&key=${this.value}`
      );
      console.log(`Key ${this.keyString} is valid.`);
    } catch (error) {
      let reason =
        error?.response?.data?.error?.errors?.[0]?.reason || 'Unknown';
      console.log(`Key ${this.keyString} is invalid: ${reason}`);
      return this.fail();
    }
  }
}

module.exports = Key;
