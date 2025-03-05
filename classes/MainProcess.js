// Dependencies
const express = require("express");
const axios = require("axios");

// Misc
const { getKeysFromEnv } = require("../functions/dataFunctions");
const Key = require("./Key");

// Constants
const PORT = process.env.PORT || 1897;
const googleApiKeyRegex = /AIza[0-9A-Za-z-_]{35}/;

class MainProcess {
  #recursionLimit = 13;
  #dfe = {
    code: 500,
    message: "Unknown error.",
  };

  constructor() {
    if (MainProcess.instance) {
      return MainProcess.instance;
    }
    MainProcess.instance = this;

    this.recursionCount = 0;
    this.keys = [];

    this.init();
  }

  registerNewKeys() {
    let envKeys = getKeysFromEnv();

    for (let [key, value] of envKeys) {
      if (!this.keys.find((k) => k.value === key)) {
        this.addValidKey(new Key(value));
      }
    }
  }

  async init() {
    this.registerNewKeys();
    await this.testKeys();

    // Set recursion limit.
    this.#recursionLimit = Math.max(this.keys.length * 2, this.#recursionLimit);

    this.startServer();
    this.listen();

    console.log(
      `MainProcess initialized. ${this.getValidKeys().length}/${
        this.keys.length
      } valid keys.`
    );
  }

  async testKeys() {
    await Promise.all(this.keys.map((key) => key.test()));
  }

  listen() {
    // Health endpoint without authentication
    this.app.get("/health", (req, res) => {
      res.status(200).send("Server Online");
    });

    // Logger
    this.app.use("*", (req, res, next) => {
      let time = new Date().toLocaleTimeString();
      let url = req.originalUrl;
      let method = req.method;
      let ip = req.ip;

      console.log(`(${time}) <${ip}> [${method}] - ${url}`);

      next();
    });

    // Basic authentication
    this.app.use("*", (req, res, next) => {
      const key = req.query.key;

      if (!key) {
        res.status(400).send("No key provided.");
        return;
      }

      // Check if key is valid.
      if (key !== process.env.EXT_API_KEY) {
        res.status(401).send("Invalid key.");
        return;
      }

      // Do we have any valid keys?
      if (this.allKeysExpired()) {
        res.status(403).send("All keys are expired.");
        return;
      }

      // If valid, strip our API key from request.
      delete req.query.key;

      // Continue.
      next();
    });

    this.app.get("/healthcheck", (req, res) => {
      res.send("OK");
    });

    this.app.get("/validKeysCount", (req, res) => {
      res.send(this.getValidKeys().length.toString());
    });

    this.app.get("/invalidKeysCount", (req, res) => {
      res.send(this.getInvalidKeys().length.toString());
    });

    this.app.get("/youtube/v3/*", async (req, res) => {
      try {
        let response = await this.attemptForwardRequest(req);
        return res.send(response);
      } catch (error) {
        let { code } = error;
        console.log(error);
        return res.status(code || 500).send({ code, ...error });
      }
    });
  }

  getRandomValidKey() {
    let validKeys = this.getValidKeys();
    return validKeys[Math.floor(Math.random() * validKeys.length)];
  }

  getRandomInvalidKey() {
    let invalidKeys = this.getInvalidKeys();
    return invalidKeys[Math.floor(Math.random() * invalidKeys.length)];
  }

  attemptForwardRequest(req) {
    return new Promise(async (_resolve, _reject) => {
      const reject = (...args) => {
        this.recursionCount = 0;
        return _reject(...args);
      };

      const resolve = (...args) => {
        this.recursionCount = 0;
        return _resolve(...args);
      };

      if (this.recursionCount > this.#recursionLimit) {
        reject({
          code: 500,
          message: "Recursion limit reached without resolution.",
        });
        return;
      }

      this.recursionCount++;

      // Check if we have any valid keys.
      if (this.allKeysExpired()) {
        reject({ code: 403, message: "All keys are expired." });
        return;
      }

      // Get a random valid key. - invalid for testing
      let key = this.getRandomValidKey();
      req.query.key = key.value;

      // Construct URL.
      const searchParams = new URLSearchParams(req.query).toString();
      const url = `https://www.googleapis.com/youtube/v3/${req.params[0]}?${searchParams}`;

      try {
        // Forward request to YouTube API.
        let response = await axios.get(url);

        // Assuming the request was successful, return the data to the client.
        resolve(response.data);
      } catch (error) {
        // If the error is not quota related, return it to the client.
        if (!JSON.stringify(error?.response?.data?.error).includes("quota")) {
          reject(error?.response?.data?.error || this.#dfe);
          return;
        }

        // Otherwise, attempt the process again with a new key + mark key as failed.
        key.fail();

        // Try again.
        return this.attemptForwardRequest(req).catch(reject);
      }
    });
  }

  allKeysExpired() {
    return this.keys.every((key) => !key.isValid());
  }

  getValidKeys() {
    return this.keys.filter((key) => key.isValid());
  }

  getInvalidKeys() {
    return this.keys.filter((key) => !key.isValid());
  }

  startServer() {
    this.app = express();

    this.app.listen(PORT, () => {
      console.log(`YouTube proxy listening on port: ${PORT}`);
    });
  }

  addValidKey(key) {
    // Ensure key satisfies the regex.
    if (googleApiKeyRegex.test(key?.value)) {
      this.keys.push(key);
    }
  }
}

module.exports = MainProcess;
