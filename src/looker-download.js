/*
 * Copyright 2023 Service Unit 469. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import AdmZip from 'adm-zip';
import {
  mkdir, mkdtemp, rm, writeFile,
} from 'fs/promises';
import { sync as glob } from 'glob';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import puppeteer from 'puppeteer';

/**
 * @typedef LookerDownloadConfig The configuration for the looker download function
 * @property {string} host the host to connect to
 * @property {string} username the username to connect with
 * @property {string} password the password to connect with
 * @property {boolean} [headless] if puppeteer should run in headless or headful mode
 * @property {any} [log] a logger to use, by default will use console
 */

/**
 * A client for downloading reports for looker
 */
class LookerDownload {
  /**
   * @type {import('puppeteer').Browser | undefined}
   */
  #browser;

  #config;

  #log;

  /**
   * @type {import('puppeteer').Page | undefined}
   */
  #page;

  /**
   * Construct a new LookerDownload instance
   * @param {LookerDownloadConfig} config the configuration for this instance
   * @class
   */
  constructor(config) {
    this.#log = config.log || console;
    this.#config = config;
  }

  /**
   * @param {string} report
   * @param {string} tmpDir
   * @param {Record<string,string>} filter}
   */
  async #doDownload(report, tmpDir, filter = {}) {
    const url = `${
      this.#config.host
    }/dashboards/${report}/downloadzip?filters=${encodeURIComponent(
      JSON.stringify(filter),
    )}`;
    // eslint-disable-next-line no-underscore-dangle
    await this.#page._client().send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: tmpDir,
    });

    this.#log.info(`Downloading report ${report}...`);
    try {
      await this.#page.goto(url);
    } catch (e) {
      this.#log.debug(`Expected network abort ${e}`);
    }

    await new Promise((r) => {
      setTimeout(r, 5000);
    });

    this.#log.info('Unpacking ZIP archive...');
    const fileName = glob(`${tmpDir}/*.zip`)[0];
    if (!fileName) {
      throw new Error(
        'Failed to download file, usually due to a bad report configuration or authentication. Try again with headless off.',
      );
    }
    return new AdmZip(fileName);
  }

  /**
   * @deprecated
   */
  async startup() {
    await this.login();
  }

  /**
   * Authenticates with Looker, must be called before downloading any reports.
   * @returns {Promise<void>}
   */
  async login() {
    this.#log.info('Starting virtual browser...');

    const {
      debug, host, password, username,
    } = this.#config;

    let headless = 'new';
    if (debug) {
      headless = false;
    }

    this.#browser = await puppeteer.launch({ headless });
    this.#page = await this.#browser.newPage();

    this.#log.info('Logging in to Looker...');
    await this.#page.goto(`${host}/login`, {
      waitUntil: 'networkidle0',
    });

    await this.#page.type('input[name=email]', username);
    await this.#page.type('input[name=password]', password);
    await Promise.all([
      this.#page.waitForNavigation(),
      this.#page.click('input[type=submit]'),
    ]);
  }

  /**
   * Downloads the file generated by the report. Includes extracting and saving the
   * zip'd CSV to the destination file
   *
   * @param {number} report the report ID
   * @param {Record<string,string>} [filter] the filter for the report
   * @param {string} [destination] the destination file to which to save the report
   * @returns {Promise<void>}
   */
  async downloadReport(report, filter = {}, destination = 'report.csv') {
    let tmpDir = null;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'looker-download'));
      const zip = await this.#doDownload(report, tmpDir, filter);
      const csvs = zip
        .getEntries()
        .filter((entry) => entry.entryName.endsWith('.csv'));
      if (csvs.length === 0) {
        throw new Error('No CSV files found in the report');
      }
      const csv = zip.readAsText(csvs[0].entryName);
      await writeFile(destination, csv);
      this.#log.info(`Successfully written to: ${destination}`);
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true });
      }
    }
  }

  /**
   * Downloads the files generated by the report. Includes extracting and saving the
   * zip'd CSVs to the destination folder
   *
   * @param {number} report the report ID
   * @param {Record<string,string>} [filter] the filter for the report
   * @param {string} [folder] the destination folder to which to save the report
   * @returns {Promise<string[]>}
   */
  async downloadReportFiles(report, filter = {}, folder = 'report/') {
    let tmpDir = null;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'looker-download'));
      const zip = await this.#doDownload(report, tmpDir, filter);
      const csvs = zip
        .getEntries()
        .filter((entry) => entry.entryName.endsWith('.csv'));
      if (csvs.length === 0) {
        throw new Error('No CSV files found in the report');
      }

      await mkdir(folder, { recursive: true });
      const files = await Promise.all(
        csvs.map(async (entry) => {
          const csv = zip.readAsText(entry.entryName);
          const parent = dirname(join(folder, entry.entryName));
          await mkdir(parent, { recursive: true });
          const fileName = join(folder, entry.entryName);
          this.#log.info(`Writing ${entry.entryName} to ${fileName}`);
          return writeFile(fileName, csv).then(() => fileName);
        }),
      );
      this.#log.info(
        `Successfully wrote ${files.length} files to: ${resolve(folder)}`,
      );
      return files;
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true });
      }
    }
  }

  /**
   * Shutdowns the LookerDownloader, must be called when all downloads are complete.
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#browser) {
      await this.#browser.close();
    }
  }

  /**
   * @deprecated
   */
  async shutdown() {
    await this.close();
  }
}

export { LookerDownload };
