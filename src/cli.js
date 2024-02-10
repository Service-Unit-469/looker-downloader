#!/usr/bin/env node
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

import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { LookerDownload } from './looker-download.js';

const program = new Command();

program
  .name('looker-download')
  .description('CLI for downloading reports from Looker');

program
  .command('download')
  .description('Download a report from Looker')
  .requiredOption('--host <host>', 'the looker host')
  .requiredOption('--username <username>', 'the looker username')
  .requiredOption('--password <password>', 'the looker password')
  .option('--debug', 'open in headful mode')
  .requiredOption('--report <report>', 'the report to download')
  .requiredOption(
    '--filter <filter>',
    'the filter to filter the report contents',
    '{}',
  )
  .requiredOption(
    '--destination <destination>',
    'the destination file to download te report',
  )
  .action(async (options) => {
    const downloader = new LookerDownload(options);
    await downloader.login();
    await downloader.downloadReport(
      options.report,
      options.filter,
      options.destination,
    );
    console.log(
      `Report ${options.report} downloaded successfully to ${options.destination}`,
    );
    await downloader.close();
  });

program
  .command('download-csvs')
  .description('Download a report with multiple CSV files from Looker')
  .requiredOption('--host <host>', 'the looker host')
  .requiredOption('--username <username>', 'the looker username')
  .requiredOption('--password <password>', 'the looker password')
  .option('--debug', 'open in headful mode')
  .requiredOption('--report <report>', 'the report to download')
  .requiredOption(
    '--filter <filter>',
    'the filter to filter the report contents',
    '{}',
  )
  .requiredOption(
    '--folder <folder>',
    'the folder to download te report',
  )
  .action(async (options) => {
    const downloader = new LookerDownload(options);
    await downloader.login();
    await downloader.downloadReportFiles(
      options.report,
      options.filter,
      options.folder,
    );
    console.log(
      `Report ${options.report} downloaded successfully to ${options.folder}`,
    );
    await downloader.close();
  });

program
  .command('download-reports')
  .description('Download multiple reports from Looker')
  .requiredOption('--host <host>', 'the looker host')
  .requiredOption('--username <username>', 'the looker username')
  .requiredOption('--password <password>', 'the looker password')
  .option('--debug', 'enable headful mode')
  .requiredOption(
    '--input <input>',
    'a JSON file containing the reports to download',
  )
  .action(async (options) => {
    const downloader = new LookerDownload(options);
    await downloader.login();

    const reports = JSON.parse(await readFile(options.input));
    for await (const report of reports) {
      await downloader.downloadReport(
        report.report,
        report.filter,
        report.destination,
      );
    }
    console.log('Reports downloaded successfully!');
    await downloader.close();
  });

program.parse();
