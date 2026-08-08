const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const isDev = process.env.NODE_ENV === "development";
const APP_URL = isDev
  ? `http://localhost:${process.env.PORT || "80"}`
  : "https://agendaplay.net";
const appOrigin = new URL(APP_URL);

function isAllowedInternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== appOrigin.protocol) return false;
    if (url.hostname !== appOrigin.hostname) return false;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    const expectedPort = appOrigin.port || (appOrigin.protocol === "https:" ? "443" : "80");
    return port === expectedPort && !url.username && !url.password;
  } catch {
    return false;
  }
}

function openExternalIfSafe(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:") {
      shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed or non-web navigation targets.
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "AgendaPlay — Barbearia",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  win.loadURL(APP_URL);

  win.once("ready-to-show", () => {
    win.show();
    if (isDev) win.webContents.openDevTools();
  });

  // Abre links externos no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedInternalUrl(url)) openExternalIfSafe(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (e, url) => {
    if (!isAllowedInternalUrl(url)) {
      e.preventDefault();
      openExternalIfSafe(url);
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
