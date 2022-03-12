[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Service-Unit-469_looker-download&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Service-Unit-469_looker-download) [![CI Build](https://github.com/Service-Unit-469/looker-download/actions/workflows/build.yml/badge.svg)](https://github.com/Service-Unit-469/looker-download/actions/workflows/build.yml)

# Looker Downloader

A library for downloading reports from Looker using puppeteer.

## Use

First install the library:

    npm i  @service-unit-469/looker-downloader

Then you can import and use the library:

    const LookerDownload = require('@service-unit-469/looker-downloader');

    const downloader = new LookerDownload('https://test.looker.com', 'username','password');
    await downloader.startup();
    await downloader.downloadReport(123,{},'./report.csv');
    downloader.shutdown();

