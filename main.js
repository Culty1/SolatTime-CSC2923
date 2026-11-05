
const { app, BrowserWindow, ipcMain, net } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");
}

async function getJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await net.fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Connection timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Available prayer zones throughout Malaysia
ipcMain.handle("zones", () => {
  return getJSON("https://api.waktusolat.app/zones");
});

// Prayer times
ipcMain.handle("prayers", (_event, zone, year, month) => {
  if (!/^[A-Z]{3}\d{2}$/.test(zone)) {
    throw new Error("Invalid location");
  }

  if (!Number.isInteger(year) || year < 2020 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid date");
  }

  return getJSON(
    `https://api.waktusolat.app/v2/solat/${zone}?year=${year}&month=${month}`
  );
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});