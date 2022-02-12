function LookerDownload(
    username = "",
    password = "",
    host = "",
    headless = true,
    log = {
      debug: console.log,
      info: console.log,
      warn: console.log,
      error: console.error,
    }
  ) {
    if (!(this instanceof LookerDownload)) {
      return new LookerDownload(username, password, headless, log);
    }
  
    this.log = log;
    this.host = host;
    log.info("Starting virtual browser...");
  
    this.browser = await puppeteer.launch({ headless: !headful });
    this.page = await browser.newPage();
  
    log.info("Logging in to Looker...");
    await this.page.goto(`${host}/login`, {
      waitUntil: "networkidle0",
    });
  
    await this.page.type("input[name=email]", user);
    await this.page.type("input[name=password]", password);
    await this.page.click("input[type=submit]");
    try {
      await this.page.waitForNavigation();
    } catch (err) {
      log.warn(
        "Expected navigation did not occur. Assuming okay and moving on",
        err
      );
    }
  }
  
  LookerDownload.prototype.downloadFile = async function (
    report = 0,
    filter = {},
    destination = "report.csv"
  ) {
    const url = `${
      this.host
    }/dashboards/${report}/downloadzip?filters=${encodeURIComponent(
      JSON.stringify(filter)
    )}`;
    let tmpDir = null;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "looker-download"));
      await this.page._client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: tmpDir,
      });
  
      this.log.info("Downloading file...");
      try {
        await this.page.goto(url);
      } catch (e) {
        this.log.debug(`Expected network abort ${e}`);
      }
  
      await this.page.waitForTimeout(5000);
  
      this.log.info(`Unpacking file...`);
      const fileName = glob.sync(`${tmpDir}/*.zip`)[0];
      if (!fileName) {
        this.log.error(
          "Failed to download file, usually due to a bad report configuration or authentication. Try again with headless off."
        );
      }
      const zip = new AdmZip(fileName);
      const csv = zip.readAsText(zip.getEntries()[0].entryName);
      fs.writeFileSync(destination, csv);
      this.log.info(`Download complete, downloaded to: ${destination}`);
    } finally {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    }
  };
  
  module.exports = LookerDownload;
  