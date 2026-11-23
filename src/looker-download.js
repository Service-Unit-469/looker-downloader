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
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { sync as glob } from 'glob';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import puppeteer from 'puppeteer';
import pRetry from 'p-retry';

/**
 * @typedef LookerDownloadConfig The configuration for the looker download function
 * @property {string} host the host to connect to
 * @property {string} username the username to connect with
 * @property {string} password the password to connect with
 * @property {Function} [authorizationCodeProvider] async callback to obtain a one-time code
 * @property {string} [userDataDir] persistent Puppeteer profile directory
 * @property {boolean} [rememberDevice] mark the Looker browser as trusted during TOTP login
 * @property {boolean} [debug] enable headful browser mode
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

    const fileName = await pRetry(
      () => {
        this.#log.info(`Checking for downloaded file in ${tmpDir}...`);
        const name = glob(`${tmpDir}/*.zip`)[0];
        if (!name) {
          throw new Error(
            'Failed to download file, usually due to a bad report configuration or authentication. Try again with headless off.',
          );
        }
        return name;
      },
      {
        onFailedAttempt: ({ attemptNumber, retriesLeft }) => {
          this.#log.info(
            `[${attemptNumber}/10] Downloaded file not found yet, ${retriesLeft} retries left...`,
          );
        },
        retries: 9,
        factor: 1.5,
        minTimeout: 2000,
      },
    );
    this.#log.info('Unpacking ZIP archive...');
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

    const { host, password, username } = this.#config;
    this.#browser = await puppeteer.launch({
      headless: !this.#config.debug,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(this.#config.userDataDir
        ? { userDataDir: this.#config.userDataDir }
        : {}),
    });
    this.#page = await this.#browser.newPage();

    this.#log.info('Logging in to Looker...');
    await this.#page.goto(`${host}/login`, {
      waitUntil: 'networkidle0',
    });

    const currentUrl = new URL(this.#page.url());
    if (
      currentUrl.origin === new URL(host).origin &&
      !currentUrl.pathname.startsWith('/login')
    ) {
      this.#log.info('Using the existing Looker browser session.');
      return;
    }

    const emailLogin = await this.#page.waitForSelector(
      'input[name=email],a[href="/login/email"]',
    );
    const type = await emailLogin.evaluate((el) => el.tagName.toLowerCase());

    if (type === 'a') {
      this.#log.info('Using email login');
      await Promise.all([
        this.#page.waitForNavigation(),
        await this.#page.click('a[href="/login/email"]', {
          waitUntil: 'networkidle0',
        }),
      ]);
      await this.#page.waitForSelector('input[name=email]');
    }

    await this.#page.type('input[name=email]', username);
    await this.#page.type('input[name=password]', password);
    await Promise.all([
      this.#page.waitForNavigation(),
      this.#page.click('input[type=submit]'),
    ]);

    await this.#handleTotpChallenge();
  }

  async #handleTotpChallenge() {
    const selector = 'input[name="totp"]';

    let challengeInput;
    try {
      challengeInput = await this.#page.waitForSelector(selector, {
        timeout: 3000,
        visible: true,
      });
    } catch {
      return;
    }

    if (this.#config.rememberDevice) {
      const rememberCheckbox = await this.#page.$(
        'input[type="checkbox"][name="remember"]',
      );
      if (
        rememberCheckbox &&
        !(await rememberCheckbox.evaluate((element) => element.checked))
      ) {
        await rememberCheckbox.click();
      }
    }

    let code;
    if (this.#config.authorizationCodeProvider) {
      code = await this.#config.authorizationCodeProvider({
        host: this.#config.host,
        username: this.#config.username,
      });
    } else {
      if (!stdin.isTTY) {
        throw new Error(
          'Looker requested a one-time code, but no interactive terminal is available. Configure authorizationCodeProvider.',
        );
      }

      const prompt = createInterface({ input: stdin, output: stdout });
      try {
        code = await prompt.question('Enter the current one time code: ');
      } finally {
        prompt.close();
      }
    }

    code = String(code || '').trim();
    if (!/^\d+$/.test(code)) {
      throw new Error(
        'The Looker authorization code must contain only digits.',
      );
    }

    await challengeInput.type(code);

    const submitButton = await this.#page.$(
      'button[type="submit"],input[type="submit"]',
    );
    const navigation = this.#page
      .waitForNavigation({ waitUntil: 'networkidle0', timeout: 10_000 })
      .catch(() => null);
    if (submitButton) {
      await submitButton.click();
    } else {
      await challengeInput.press('Enter');
    }
    await navigation;

    let challengeStillVisible;
    try {
      challengeStillVisible = await this.#page.waitForSelector(selector, {
        timeout: 500,
        visible: true,
      });
    } catch {
      challengeStillVisible = null;
    }
    if (challengeStillVisible) {
      throw new Error(
        'One-time-code authorization did not complete. Check the code and Looker challenge field.',
      );
    }
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
