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
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { rm, mkdir } from 'fs/promises';
import assert from 'assert';
import { LookerDownload } from '../src/looker-download.js';

dotenv.config();

/* eslint-env mocha */
describe('Looker Download Tests', () => {
  beforeEach(async () => {
    if (existsSync('./dist')) {
      await rm('./dist', { recursive: true });
    }
    await mkdir('./dist', { recursive: true });
  });

  it('can download successfully', async () => {
    const downloader = new LookerDownload({
      host: process.env.LOOKER_HOST,
      username: process.env.LOOKER_USERNAME,
      password: process.env.LOOKER_PASSWORD,
    });
    try {
      await downloader.login();
      await downloader.downloadReport(
        process.env.LOOKER_REPORT,
        {
          Year: 'Current Year',
        },
        './dist/report.csv',
      );
    } finally {
      await downloader.shutdown();
    }

    assert.ok(existsSync('./dist/report.csv'));
  }).timeout(60000);

  it('wont download invalid report', async () => {
    const downloader = new LookerDownload({
      host: process.env.LOOKER_HOST,
      username: process.env.LOOKER_USERNAME,
      password: process.env.LOOKER_PASSWORD,
    });
    try {
      await downloader.login();
      await assert.rejects(
        downloader.downloadReport(
          9999999999,
          {
            NOT_A: 'Filter',
          },
          './dist/report.csv',
        ),
      );
    } finally {
      await downloader.shutdown();
    }

    assert.ok(!existsSync('./dist/report.csv'));
  }).timeout(60000);
});
