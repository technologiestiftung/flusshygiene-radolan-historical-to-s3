#!/usr/bin/env node

import { config } from 'dotenv';
import fs from 'fs';
import meow from 'meow';
import path from 'path';
import { IMainOptions, IObject, ITarFileEntry } from './lib/interfaces';
import { main } from './lib/main';

config({ path: path.resolve(__dirname, '../.env') });

// console.log(process.env);
const cli = meow(`
  Usage:
`, {});

console.log(cli.input, cli.flags);

if (cli.input[0] === undefined) {
  cli.showHelp();
}
let parsed: IObject[];
const data: ITarFileEntry[] = [];
try {
  fs.statSync(cli.input[0]);
  const fileContent = fs.readFileSync(path.resolve(process.cwd(), cli.input[0]),
  'utf8');
  parsed = JSON.parse(fileContent);
  if (Array.isArray(parsed) === false) {
    throw Error('JSON Data is not an array');
  }
  for (const ele of parsed) {
    if (ele.hasOwnProperty('filePath') === true && typeof ele.filePath === 'string') {
      const item = {
        date: ele.date !== undefined ? ele.date : undefined,
        filePath: ele.filePath,
      };
      data.push(item);
    }
  }
} catch (error) {
  console.log(error.message);
  process.exit(1);
}

const opts: IMainOptions = {
  fileList: data,
};
main(opts).catch((err: Error) => { throw err; });
