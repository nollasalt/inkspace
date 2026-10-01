import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
await require('./bootstrap.cjs').ready;
await import('../out/main.js');
