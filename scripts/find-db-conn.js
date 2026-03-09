// Script to find the connection string
const fs = require('fs');
const path = require('path');

console.log("Looking for DB password in previous migration scripts...");
// The fastest way is to find how other scripts connect.
