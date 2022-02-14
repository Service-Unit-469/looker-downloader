require("dotenv").config();
const LookerDownloader = require("../src/index");
const fs = require("fs");
const { expect } = require("chai");

jest.setTimeout(120 * 1000);

describe("happy path", () => {
  beforeEach(() => {
    fs.rmdirSync("./dist", { recursive: true });
    fs.mkdirSync("./dist", { recursive: true });
  });
  test("can download successfully", async () => {
    if (!process.env.LOOKER_HOST) {
      it.skip();
    }

    const downloader = new LookerDownloader(
      process.env.LOOKER_HOST,
      process.env.LOOKER_USERNAME,
      process.env.LOOKER_PASSWORD
    );
    try {
      await downloader.startup();
      await downloader.downloadReport(
        process.env.LOOKER_REPORT,
        {
          Year: "Current Year",
        },
        "./dist/report.csv"
      );
    } finally {
      await downloader.shutdown();
    }

    expect(fs.existsSync("./dist/report.csv")).to.be.true;
  });
});
