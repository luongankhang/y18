import { app, BrowserWindow, Menu } from 'electron';
import { store } from './store';
import { requestQuit } from './quitGuard';
import { sendTerminalMenuAction } from './ipcTerminalHandlers';

type MenuLanguage = 'zh' | 'en' | 'vi';

const APP_DISPLAY_NAME = 'y18';

const LABELS: Record<MenuLanguage, Record<string, string>> = {
  zh: {
    about: `关于 ${APP_DISPLAY_NAME}`,
    hide: '隐藏 %s',
    hideOthers: '隐藏其他',
    unhide: '全部显示',
    quit: '退出 %s',
    file: '文件',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    view: '视图',
    reload: '重新加载',
    toggleDevTools: '开发者工具',
    resetZoom: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    togglefullscreen: '切换全屏',
    window: '窗口',
    minimize: '最小化',
    close: '关闭窗口',
    help: '帮助',
    terminal: '终端',
    newTerminal: '新建终端',
    toggleTerminal: '切换终端面板',
    killTerminal: '终止终端',
  },
  en: {
    about: `About ${APP_DISPLAY_NAME}`,
    hide: 'Hide %s',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit %s',
    file: 'File',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    toggleDevTools: 'Developer Tools',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    togglefullscreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    close: 'Close Window',
    help: 'Help',
    terminal: 'Terminal',
    newTerminal: 'New Terminal',
    toggleTerminal: 'Toggle Terminal Panel',
    killTerminal: 'Kill Terminal',
  },
  vi: {
    about: `Giới thiệu ${APP_DISPLAY_NAME}`,
    hide: 'Ẩn %s',
    hideOthers: 'Ẩn các cửa sổ khác',
    unhide: 'Hiện tất cả',
    quit: 'Thoát %s',
    file: 'Tệp',
    edit: 'Chỉnh sửa',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    cut: 'Cắt',
    copy: 'Sao chép',
    paste: 'Dán',
    selectAll: 'Chọn tất cả',
    view: 'Xem',
    reload: 'Tải lại',
    toggleDevTools: 'Công cụ nhà phát triển',
    resetZoom: 'Kích thước thực',
    zoomIn: 'Phóng to',
    zoomOut: 'Thu nhỏ',
    togglefullscreen: 'Toàn màn hình',
    window: 'Cửa sổ',
    minimize: 'Thu nhỏ',
    close: 'Đóng cửa sổ',
    help: 'Trợ giúp',
    terminal: 'Terminal',
    newTerminal: 'Terminal mới',
    toggleTerminal: 'Bật/tắt bảng Terminal',
    killTerminal: 'Kết thúc Terminal',
  },
};

let mainWindowRef: BrowserWindow | null = null;

function resolveLanguage(): MenuLanguage {
  const settings = store.get('settings') as { language?: string } | undefined;
  if (
    settings?.language === 'zh' ||
    settings?.language === 'en' ||
    settings?.language === 'vi'
  ) {
    return settings.language;
  }
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('zh')) return 'zh';
  if (locale.startsWith('vi')) return 'vi';
  return 'en';
}

function sendToRenderer(channel: string) {
  const win = mainWindowRef;
  if (!win || win.isDestroyed()) return;
  win.show();
  win.focus();
  win.webContents.send(channel);
}

function showAboutDialog() {
  sendToRenderer('show-about-dialog');
}

function buildTerminalMenuItems(
  language: MenuLanguage,
): Electron.MenuItemConstructorOptions[] {
  const labels = LABELS[language];
  return [
    {
      label: labels.newTerminal,
      accelerator: 'CmdOrCtrl+Shift+`',
      click: () => sendTerminalMenuAction('new'),
    },
    {
      label: labels.toggleTerminal,
      accelerator: 'CmdOrCtrl+`',
      click: () => sendTerminalMenuAction('toggle'),
    },
    { type: 'separator' },
    {
      label: labels.killTerminal,
      click: () => sendTerminalMenuAction('kill'),
    },
  ];
}

export function buildAppMenu(language: MenuLanguage = resolveLanguage()) {
  const l = LABELS[language];
  const appName = APP_DISPLAY_NAME;
  const fmt = (s: string) => s.replace('%s', appName);
  const isMac = process.platform === 'darwin';
  const terminalItems = buildTerminalMenuItems(language);

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { label: l.about, click: showAboutDialog },
        { type: 'separator' },
        { role: 'hide', label: fmt(l.hide) },
        { role: 'hideOthers', label: l.hideOthers },
        { role: 'unhide', label: l.unhide },
        { type: 'separator' },
        { label: fmt(l.quit), click: () => requestQuit() },
      ],
    });
    template.push({
      label: l.file,
      submenu: terminalItems,
    });
  } else {
    template.push({
      label: l.file,
      submenu: [
        ...terminalItems,
        { type: 'separator' },
        { label: fmt(l.quit), click: () => requestQuit() },
      ],
    });
  }

  template.push({
    label: l.edit,
    submenu: [
      { role: 'undo', label: l.undo },
      { role: 'redo', label: l.redo },
      { type: 'separator' },
      { role: 'cut', label: l.cut },
      { role: 'copy', label: l.copy },
      { role: 'paste', label: l.paste },
      { role: 'selectAll', label: l.selectAll },
    ],
  });

  template.push({
    label: l.view,
    submenu: [
      { role: 'reload', label: l.reload },
      { role: 'toggleDevTools', label: l.toggleDevTools },
      { type: 'separator' },
      { role: 'resetZoom', label: l.resetZoom },
      { role: 'zoomIn', label: l.zoomIn },
      { role: 'zoomOut', label: l.zoomOut },
      { type: 'separator' },
      { role: 'togglefullscreen', label: l.togglefullscreen },
    ],
  });

  template.push({
    label: l.terminal,
    submenu: terminalItems,
  });

  if (isMac) {
    template.push({
      label: l.window,
      submenu: [
        { role: 'minimize', label: l.minimize },
        { role: 'close', label: l.close },
      ],
    });
  }

  template.push({
    label: l.help,
    role: 'help',
    submenu: [{ label: l.about, click: showAboutDialog }],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function setupAppMenu(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow;
  buildAppMenu();
}

export function rebuildAppMenu(language?: string) {
  if (language === 'zh' || language === 'en' || language === 'vi') {
    buildAppMenu(language);
    return;
  }
  buildAppMenu(resolveLanguage());
}
