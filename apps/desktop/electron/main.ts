import { app, BrowserWindow, dialog, shell, Menu } from 'electron';
import path from 'path';
import { getLocalDb } from './db';
import { registerIpcHandlers } from './ipc';
import { clearSessionFor } from './session';
import { recordAudit } from './audit';

let mainWindow: BrowserWindow | null = null;

// Une seule instance : deux processus écrivant dans le même SQLite corromprait les données.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1100,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1120',
    title: 'Gestion POS — Pièces Cycles & Motos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (process.env.VITE_DEV_SERVER_URL) mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  // La session vit côté process principal : un rechargement de page la libère.
  mainWindow.webContents.on('destroyed', () => {
    if (mainWindow) clearSessionFor(mainWindow.webContents.id);
  });

  // Aucune navigation hors de l'application ; les liens externes vont au navigateur système.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL;
    if (allowed && url.startsWith(allowed)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Application',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Recharger (forcé)' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { role: 'resetZoom', label: 'Taille normale' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

process.on('uncaughtException', (error) => {
  console.error('[EXCEPTION PROCESS PRINCIPAL]:', error);
  try {
    recordAudit({
      actor: null,
      action: 'sync.failed',
      module: 'settings',
      severity: 'critical',
      summary: `Exception non gérée dans le process principal : ${error.message}`,
      metadata: { stack: error.stack }
    });
  } catch {}
  dialog.showErrorBox('Erreur interne', error.stack || error.message);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[PROMESSE REJETÉE]:', reason);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  try {
    // La base doit être ouverte et migrée AVANT tout enregistrement de canal IPC.
    getLocalDb();
    registerIpcHandlers();
  } catch (err: any) {
    console.error('Initialisation impossible:', err);
    dialog.showErrorBox(
      'Initialisation impossible',
      `La base de données locale n'a pas pu être préparée.\n\n${err.stack || err.message}`
    );
    app.quit();
    return;
  }

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
