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
Downloading radolan files from DWD FTP, gunzip, untar, gunzip again, organize and upload to AWS S3
-----------------------------------------------------------------------
Usage
  $ u2s3 <input.json>
  Examples
  $ u2s3 ./path/to/input.json
-----------------------------------------------------------------------
Needs .json input as first argument. An array of entries in the form of
[
  {
    "filePath": "pub/CDC/grids_germany/hourly/radolan/historical/bin/2005/RW-200512.tar.gz",
    "date": "2014-07-07T00:00:00.000Z"
  }
]
date key is optional
`, {
    flags: {
      silent: {
        alias: 's',
        type: 'boolean',
      },
    },
  });

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined) {
  console.log(cli.input, cli.flags);
}

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
  silent: cli.flags.silent !== undefined ? true : false,
};
main(opts).catch((err: Error) => { throw err; });
