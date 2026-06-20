const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

// Better Wayland behavior on modern Linux desktops (GNOME/KDE on Wayland);
// falls back to X11 automatically when Wayland isn't present.
app.commandLine.appendSwitch("ozone-platform-hint", "auto");

// Use a temp file instead of /dev/shm for Chromium's shared memory. Under
// strict snap/flatpak confinement /dev/shm is restricted, which otherwise
// crashes the renderer on launch ("Creating shared memory ... Permission
// denied", SIGTRAP).
app.commandLine.appendSwitch("disable-dev-shm-usage");

// A 2D Morse trainer needs no GPU acceleration, and proprietary GPU drivers
// don't pass cleanly into snap/flatpak sandboxes (the GPU shows up with a
// null driver). Software rendering is smooth for this UI and far more
// compatible across machines, so turn hardware acceleration off everywhere.
app.disableHardwareAcceleration();

// In dev, `npm run dev` sets this to the Vite dev server URL. When packaged
// (Snap/Flatpak/AppImage) it is undefined, so we load the built files instead.
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 940,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: "#14161A",
    title: "WISCO RADIO — CW Trainer",
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer is a plain offline web app — no Node access needed, and
      // keeping it sandboxed is the safe default for a store-published app.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // No application menu — this is a single-window kiosk-style trainer.
  Menu.setApplicationMenu(null);

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Any external link opens in the user's real browser, never a new Electron
  // window (the app itself has none today, but this is the safe policy).
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
