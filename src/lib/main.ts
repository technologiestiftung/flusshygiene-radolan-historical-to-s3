import { config } from 'dotenv';
import fs from 'fs';
import mkdirp from 'mkdirp';
import path from 'path';
import pipe from 'pipe-io';
import ftp from 'promise-ftp';
import rimraf from 'rimraf';
import stream from 'stream';
import tar from 'tar-fs';
import util from 'util';
import zlib from 'zlib';

import { IMainOptions } from './interfaces';

config({ path: path.resolve(__dirname, '../../.env') });

const mkdirpAsync = util.promisify(mkdirp);
const readDirAsync = util.promisify(fs.readdir);
const finishedAsync = util.promisify(stream.finished);
const rimrafAsync = util.promisify(rimraf);
const client = new ftp();
const ftpOpts: ftp.Options = {
  host: process.env.FTP_HOST,
  port: parseInt(process.env.FTP_PORT!, 10),
};

export const main: (opts: IMainOptions) => Promise<void> = async (opts) => {
  try {

    // console.log(ftpOpts);
    for (const item of opts.fileList) {
      const itemName = item.filePath.split('/')[item.filePath.split('/').length - 1].split('.')[0];
      const tmpGunzippedFolder = path.resolve(process.cwd(), `./tmp/${itemName}/gunzipped`);
      const tmpGzipFolder = path.resolve(process.cwd(), `./tmp/${itemName}/zipped`);
      await mkdirpAsync(tmpGzipFolder);
      await mkdirpAsync(`${tmpGunzippedFolder}`);
      // open ftp connection
      const resConnect = await client
        .connect(ftpOpts)
        .catch((err: Error) => { throw err; }); // tslint:disable-line: await-promise
      console.log('Response ftp client.connect', resConnect);

      // const fn = item.filePath.split('/')[item.filePath.split('/').length - 1];
      const ftprstream = await client.get(item.filePath); // tslint:disable-line: await-promise
      // const filePath = `${tmpFolder}/${fn}`;
      // const fswstream = fs.createWriteStream(filePath.replace('.gz', ''));
      // download file to fs
      pipe(
        [
          ftprstream,
          zlib.createGunzip(),
          tar.extract(`${tmpGzipFolder}`),
        ], (error: Error) => {
          if (error) {
            console.error(error);
          }
        });
      // ftprstream.pipe(gunzip())
      //   .pipe(
      //     tar.extract(`${tmpFolder}`));
      // fswstream.on('end', () => {
      //   console.log(`write is done for ${tmpFolder}/${fn}`);
      // });
      await finishedAsync(ftprstream);
      const resDisconnect = await client
        .end()
        .catch((err: Error) => { throw err; }); // tslint:disable-line: await-promise
      console.log('Response ftp client.end', resDisconnect);
      const files: string[] = await readDirAsync(tmpGzipFolder, { withFileTypes: false }) as string[];
      console.log(files);
      // process.exit();
      const gunzipTasks = files.map((file: string) => new Promise((resolve, _reject) => {
        try {

          const writestream = fs.createWriteStream(`${tmpGunzippedFolder}/${file}`.replace('.gz', ''));
          writestream.on('close', resolve);
          const readstream = fs.createReadStream(`${tmpGzipFolder}/${file}`);
          readstream.pipe(zlib.createGunzip()).pipe(writestream);
        } catch (error) {
          console.log('in gunzipTasks');
          throw error;
        }
      }));

      await Promise.all(gunzipTasks).catch((err) => {
        throw err;
      });

      const resClean = await rimrafAsync(tmpGzipFolder);
      console.log(resClean);
      // untar & gunzip
      // organize
      // upload to s3
      // remove from fs
    }
  } catch (error) {
    throw error;
  }
};
