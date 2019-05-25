import AWS from 'aws-sdk';
import { config } from 'dotenv';
import fs from 'fs';
import mkdirp from 'mkdirp';
import path from 'path';
import pipe from 'pipe-io';
import ftp from 'promise-ftp';
// import readline from 'readline';
import rimraf from 'rimraf';
import s3 from 's3-client';
import stream from 'stream';
import tar from 'tar-fs';
import util from 'util';
import zlib from 'zlib';

import { IMainOptions } from './interfaces';
import { radolanFilenameParser } from './radolan-file-name-parser';

config({ path: path.resolve(__dirname, '../../.env') });

const mkdirpAsync = util.promisify(mkdirp);
const readDirAsync = util.promisify(fs.readdir);
const finishedAsync = util.promisify(stream.finished);
const rimrafAsync = util.promisify(rimraf);
const errorLogger = (error: Error, obj?: any) => {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write(`${error.stack}\n`);
  process.stderr.write(`${error}\n`);
  process.stderr.write(`${JSON.stringify(obj)}\n`);
};

const ec2 = new AWS.EC2();

const shutDownEC2 = (instanceId: string|undefined) => {
  try {
    if (instanceId === undefined) {
      throw Error('No instance ID');
    }
    process.stdout.write('Shutting down ec2\n');
    ec2.stopInstances({
      InstanceIds: [instanceId],
    }, (err, _data) => {
      if (err) {
        process.stderr.write(JSON.stringify(err));
        // Trigger some alerting here
      } else {
        process.stdout.write('Done\n');
      }
    },
    );
  } catch (err) {
    process.stderr.write(`Could not shutdown EC2 ${JSON.stringify(err)}\n`);
  }
};

const s3Client = s3.createClient({
  s3Options: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    region: 'eu-central-1',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // endpoint: 's3.yourdomain.com',
    // sslEnabled: false
    // any other options are passed to new AWS.S3()
    // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
  },
});
const ftpClient = new ftp();
const ftpOpts: ftp.Options = {
  host: process.env.FTP_HOST,
  port: parseInt(process.env.FTP_PORT!, 10),
};

let silent = false;

export const main: (opts: IMainOptions) => Promise<void> = async (opts) => {
  silent = opts.silent !== undefined ? opts.silent : false;
  for (const item of opts.fileList) {
    try {

      const itemName = item.filePath.split('/')[item.filePath.split('/').length - 1].split('.')[0];
      const baseItemFolder = path.resolve(process.cwd(), `./tmp/${itemName}`);
      const tmpGunzippedFolder = path.resolve(process.cwd(), `./tmp/${itemName}/gunzipped`);
      const tmpGzipFolder = path.resolve(process.cwd(), `./tmp/${itemName}/zipped`);
      await mkdirpAsync(tmpGzipFolder);
      await mkdirpAsync(`${tmpGunzippedFolder}`);

      const resConnect = await ftpClient
        .connect(ftpOpts)
        .catch((err: Error) => { errorLogger(err); }); // tslint:disable-line: await-promise
      if (silent === false) {
        process.stdout.write(`Response ftp client.connect ${resConnect}`);
      }
      const ftprstream = await ftpClient.get(item.filePath); // tslint:disable-line: await-promise
      pipe(
        [
          ftprstream,
          zlib.createGunzip(),
          tar.extract(`${tmpGzipFolder}`),
        ], (error: Error) => {
          if (error) {
            process.stderr.write(`Error exctracting ${JSON.stringify(error)}`);
          }
        });

      await finishedAsync(ftprstream);
      const resDisconnect = await ftpClient
        .end()
        .catch((err: Error) => { errorLogger(err); }); // tslint:disable-line: await-promise
      if (silent === false) {
        process.stdout.write(`Response ftp client.end ${resDisconnect}\n`);
      }
      const gzipFiles: string[] = await readDirAsync(tmpGzipFolder, { withFileTypes: false }) as string[];
      if (silent === false) {
        process.stdout.write(`${JSON.stringify(gzipFiles)}\n`);
      }
      const gunzipTasks = gzipFiles.map((file: string) => new Promise(async (resolve, _reject) => {
        try {
          await mkdirpAsync(`${tmpGunzippedFolder}`);
          const writestream = fs.createWriteStream(
            `${tmpGunzippedFolder}/${file}`.replace('.gz', ''));
          writestream.on('close', resolve);
          const readstream = fs.createReadStream(`${tmpGzipFolder}/${file}`);
          readstream.pipe(zlib.createGunzip()).pipe(writestream);
        } catch (err) {
          if (silent === false) {
            process.stderr.write(`Error in gunzipTasks for file ${file}\n`);
          }
          errorLogger(err);
        }
      }));
      await Promise.all(gunzipTasks).catch((err) => {
        errorLogger(err);
      });
      await rimrafAsync(tmpGzipFolder);
      // upload to s3
      // remove from fs
      // if(silent === false){
      // process.stdout(tmpGunzippedFolder);
      // }
      const radolanFiles: string[] = await readDirAsync(tmpGunzippedFolder, { withFileTypes: false }) as string[];
      const uploadTasks = radolanFiles.map((file: string) => new Promise(async (resolve, reject) => {
        const fileInfo = radolanFilenameParser(file);
        const key = `${fileInfo.groups.year}/${fileInfo.groups.month}/${fileInfo.groups.day}/${file}`;

        const params = {
          localFile: `${tmpGunzippedFolder}/${file}`,
          // deleteRemoved: true, // default false, whether to remove s3 objects
          // that have no corresponding local file.

          s3Params: {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${key}`,
            // other options supported by putObject, except Body and ContentLength.
            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
          },
        };
        const uploader = s3Client.uploadFile(params);
        uploader.on('error', (err: Error) => {
          process.stderr.write(`unable to upload: ${err.stack}`);
          reject();
        });
        uploader.once('progress', () => {
          if (silent === false) {
            process.stdout.write(`upoading: ${params.localFile}`);
            // process.stdout.clearLine();
            // process.stdout.cursorTo(0);
            // readline.clearLine(process.stdout, 0);
            // readline.cursorTo(process.stdout, 0);
            // process.stdout.write(
            //   `progress:\t${uploader.progressMd5Amount}\t${uploader.progressAmount}\tof\t${uploader.progressTotal}`);
          }
        });
        uploader.on('end', () => {
          if (silent === false) {
            process.stdout.write(`\ndone uploading: ${params.localFile}`);
          }
          fs.unlinkSync(params.localFile);
          resolve();
        });
      }));
      await Promise.all(uploadTasks).catch((err) => {
        // throw err;
        errorLogger(err);
      });
      await rimrafAsync(tmpGunzippedFolder);
      await rimrafAsync(baseItemFolder);
    } catch (error) {
      errorLogger(error, `Error with item ${item}`);
    }
  }
  shutDownEC2(process.env.AWS_EC2_INSTANCE_ID);
};
