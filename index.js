// Env
require('dotenv').config();

// MainProcess
const MainProcess = require('./classes/MainProcess');

(async () => {
  new MainProcess();
})();
