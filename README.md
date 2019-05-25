# Scraping Radolan data from DWD uploading to S3

This tool does:

- Download `.tar.gz` from the DWD FTP Server [ftp://ftp-cdc.dwd.de/](ftp://ftp-cdc.dwd.de/).  
- Gunzips, untars to fs
- Gunzips again 😔
- Uploads to an AWS S3 Bucket


Uses data scraped with [flusshygiene-radolan-scraper](https://github.com/technologiestiftung/flusshygiene-radolan-scraper) as input. 

An entry in these files looks like this (date is optional).

```json
[
  {
    "filePath": "pub/CDC/grids_germany/hourly/radolan/historical/bin/2005/RW-200506.tar.gz",
    "date": "2014-07-07T00:00:00.000Z"
  }
]
```

## Prerequisites

Rename `example.env` to `.env` and edit your credentials.

## Usage

```bash
npm ci && npm run build
node dist/cli.js ./path/to/scraped/data/historical-hourly-urls.json
```

Can also be run from a docker container.

## Build Docker

```bash
docker build -t technologiestiftung/flusshygiene-radolan-u2s3 .
```

## Run Docker

If you don't provide a path to an `.json` file for the container it will use the default [./data/historical-hourly-urls.json](data/historical-hourly-urls.json).  


```bash
docker run -it --env-file ./example.env --name radolan-u2s3 technologiestiftung/flusshygiene-radolan-u2s3 ./test/ftp-server/urls.json
```


## Testing

No automated tests (yet?). But you can at least start a ftp server and don't need to hit the DWD server all the time.

```bash
cd test/ftp-server
docker-compose up --build
# in another shell run
node dist/cli.js ./test/ftp-server/urls.json
```