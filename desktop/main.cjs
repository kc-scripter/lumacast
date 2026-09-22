const { app, BrowserWindow, desktopCapturer, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEV_URL = "http://localhost:5173";
const PICKER_CHOOSE = "lunira:capture-picker:choose";
const PICKER_CANCEL = "lunira:capture-picker:cancel";
const PICKER_SOURCES = "lunira:capture-picker:sources";

let mainWindow = null;
let pickerWindow = null;
let appUrl = null;

function readConfigUrl() {
  const cli = process.argv.find((value) => value.startsWith("--app-url="));
  if (cli) return cli.slice("--app-url=".length).trim();

  const fromEnv = process.env.LUNIRA_WEB_URL?.trim();
  if (fromEnv) return fromEnv;

  const configPath = path.join(__dirname, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (typeof parsed.webUrl === "string" && parsed.webUrl.trim()) return parsed.webUrl.trim();
    } catch (error) {
      console.error("Invalid desktop config.json", error);
    }
  }

  if (!app.isPackaged) return DEV_URL;
  return "";
}

function normalizeAppUrl(raw) {
  if (!raw) throw new Error("LUNIRA_WEB_URL não foi configurada para o aplicativo.");
  const value = new URL(raw);
  const localhost = value.hostname === "localhost" || value.hostname === "127.0.0.1";
  if (value.protocol !== "https:" && !(value.protocol === "http:" && localhost)) {
    throw new Error("O aplicativo exige HTTPS em produção. HTTP só é permitido em localhost.");
  }
  value.hash = "";
  return value;
}

function sameAppOrigin(candidate) {
  if (!candidate || !appUrl) return false;
  try {
    return new URL(candidate).origin === appUrl.origin;
  } catch {
    return false;
  }
}

function startupUrl() {
  const roomArg = process.argv.find((value) => value.startsWith("--room="));
  const roomId = roomArg?.slice("--room=".length).trim().toUpperCase();
  if (!roomId || !/^[A-Z2-9]{8}$/.test(roomId)) return appUrl.href;
  return new URL(`/watch/${roomId}`, appUrl).href;
}

function serializableSources(sources) {
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null,
    appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null
  }));
}

function chooseCaptureSource(sources) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(null);
      return;
    }

    if (pickerWindow && !pickerWindow.isDestroyed()) {
      pickerWindow.focus();
      resolve(null);
      return;
    }

    const picker = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      show: false,
      width: 940,
      height: 700,
      minWidth: 720,
      minHeight: 520,
      backgroundColor: "#090a0f",
      title: "Escolher tela — Lunira Screen",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "picker-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    pickerWindow = picker;
    let settled = false;

    const finish = (sourceId) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener(PICKER_CHOOSE, onChoose);
      ipcMain.removeListener(PICKER_CANCEL, onCancel);
      if (pickerWindow === picker) pickerWindow = null;
      if (!picker.isDestroyed()) picker.close();
      resolve(sourceId ? sources.find((source) => source.id === sourceId) || null : null);
    };

    const onChoose = (event, sourceId) => {
      if (event.sender !== picker.webContents || typeof sourceId !== "string") return;
      finish(sourceId);
    };

    const onCancel = (event) => {
      if (event.sender !== picker.webContents) return;
      finish(null);
    };

    ipcMain.on(PICKER_CHOOSE, onChoose);
    ipcMain.on(PICKER_CANCEL, onCancel);

    picker.on("closed", () => finish(null));
    picker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    picker.webContents.on("will-navigate", (event) => event.preventDefault());
    picker.webContents.once("did-finish-load", () => {
      if (!picker.isDestroyed()) picker.webContents.send(PICKER_SOURCES, serializableSources(sources));
    });

    picker.loadFile(path.join(__dirname, "picker.html")).then(() => {
      if (!picker.isDestroyed()) picker.show();
    }).catch((error) => {
      console.error("Capture picker failed to load", error);
      finish(null);
    });
  });
}

function configureSession(win) {
  const ses = win.webContents.session;

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (!sameAppOrigin(requestingOrigin)) return false;
    return permission === "media" || permission === "clipboard-sanitized-write" || permission === "fullscreen";
  });

  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || details?.securityOrigin || appUrl.href;
    const allowed = sameAppOrigin(origin) &&
      (permission === "media" || permission === "clipboard-sanitized-write" || permission === "fullscreen");
    callback(allowed);
  });

  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!sameAppOrigin(request.securityOrigin) || !request.videoRequested) {
      callback(null);
      return;
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true
      });

      const selected = await chooseCaptureSource(sources);
      if (!selected) {
        callback(null);
        return;
      }

      const streams = { video: selected };
      if (process.platform === "win32" && request.audioRequested) streams.audio = "loopback";
      callback(streams);
    } catch (error) {
      console.error("Display capture failed", error);
      callback(null);
    }
  });
}

function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameAppOrigin(url)) {
      void win.loadURL(url);
    } else if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (sameAppOrigin(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1380,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#090a0f",
    title: "Lunira Screen",
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:lunira-screen",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow = win;
  configureSession(win);
  guardNavigation(win);

  const baseAgent = win.webContents.getUserAgent();
  win.webContents.setUserAgent(`${baseAgent} LuniraScreenDesktop/${app.getVersion()}`);

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  void win.loadURL(startupUrl());

  if (process.argv.includes("--devtools")) win.webContents.openDevTools({ mode: "detach" });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    const roomArg = argv.find((value) => value.startsWith("--room="));
    const roomId = roomArg?.slice("--room=".length).trim().toUpperCase();
    if (roomId && /^[A-Z2-9]{8}$/.test(roomId)) {
      void mainWindow.loadURL(new URL(`/watch/${roomId}`, appUrl).href);
    }
  });

  app.whenReady().then(() => {
    try {
      appUrl = normalizeAppUrl(readConfigUrl());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      const { dialog } = require("electron");
      dialog.showErrorBox(
        "Lunira Screen",
        `${message}\n\nPara gerar o instalador, defina LUNIRA_WEB_URL com a URL HTTPS da versão web.`
      );
      app.quit();
      return;
    }

    app.setAppUserModelId("com.lunirascreen.desktop");
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
