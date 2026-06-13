import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BotIcon,
  FileVideo2,
  Github,
  MonitorPlay,
  Languages,
  Settings,
  Rocket,
  Edit3,
  Film,
  Zap,
  ZapOff,
  CircleHelp,
  Wrench,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { openUrl } from 'lib/utils';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { useTranslation } from 'next-i18next';
// import { UpdateDialog } from './UpdateDialog';
import { AboutDialog } from './AboutDialog';
import { QuitConfirmDialog } from './QuitConfirmDialog';
import packageInfo from '../../package.json';
import { translateAppMessage } from '../lib/i18n';

// Auto update disabled

const Layout = ({ children }) => {
  const {
    t,
    i18n: { language: locale },
  } = useTranslation('common');
  const router = useRouter();
  const { asPath } = router;
  const [cudaCapable, setCudaCapable] = useState(false);
  const [cudaEnabled, setCudaEnabled] = useState(false);
  const [appMode, setAppMode] = useState<'dev' | 'release' | null>(null);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showQuitDialog, setShowQuitDialog] = useState(false);

  useEffect(() => {
    // 监听消息通知
    const cleanupMessage = window?.ipc?.on('message', (res: string) => {
      toast(t('notification'), {
        description: translateAppMessage(t, res),
      });
      console.log(res);
    });

    // 检查 GPU 加速状态
    const checkAddonStatus = async () => {
      try {
        const cudaEnv = await window?.ipc?.invoke('get-cuda-environment');
        const canUseCuda = cudaEnv?.recommendation?.canUseCuda || false;
        setCudaCapable(canUseCuda);

        if (canUseCuda) {
          const settings = await window?.ipc?.invoke('getSettings');
          const addonSummary = await window?.ipc?.invoke('get-addon-summary');
          // 加速已启用：useCuda 开启且（选择了版本或设置了自定义路径）
          const isEnabled =
            settings?.useCuda &&
            (addonSummary?.selectedVersion || addonSummary?.customAddonPath);
          setCudaEnabled(!!isEnabled);
        }
      } catch (error) {
        console.error('Failed to check addon status:', error);
      }
    };

    checkAddonStatus();

    window?.ipc?.invoke('getSystemInfo').then((info) => {
      if (info?.appMode) {
        setAppMode(info.appMode);
      }
    });

    // 监听 GPU 设置变更事件（由设置页面触发）
    const handleGpuSettingsChanged = () => {
      checkAddonStatus();
    };
    window.addEventListener('gpu-settings-changed', handleGpuSettingsChanged);

    const cleanupAboutDialog = window?.ipc?.on('show-about-dialog', () => {
      setShowAboutDialog(true);
    });

    const cleanupQuitDialog = window?.ipc?.on('show-quit-dialog', () => {
      setShowQuitDialog(true);
    });

    // 清理函数
    return () => {
      cleanupMessage?.();
      cleanupAboutDialog?.();
      cleanupQuitDialog?.();
      window.removeEventListener(
        'gpu-settings-changed',
        handleGpuSettingsChanged,
      );
    };
  }, [t]);

  return (
    <div className="grid h-screen w-full pl-[56px]">
      <aside className="inset-y fixed  left-0 z-20 flex h-full flex-col border-r">
        <div className="border-b p-2">
          <Link href={`/${locale}/home`}>
            <Button aria-label="Home" size="icon" variant="outline">
              <FileVideo2 className="size-5" />
            </Button>
          </Link>
        </div>
        <nav className="grid gap-1 p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/home`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('home') ? 'bg-muted' : ''
                    }`}
                    aria-label="Playground"
                  >
                    <MonitorPlay className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('tasks')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/modelsControl`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('modelsControl') ? 'bg-muted' : ''
                    }`}
                    aria-label="Models"
                  >
                    <BotIcon className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('modelManagement')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/translateControl`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('translateControl') ? 'bg-muted' : ''
                    }`}
                    aria-label="Translate"
                  >
                    <Languages className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('translationManagement')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/proofread`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('proofread') ? 'bg-muted' : ''
                    }`}
                    aria-label="Proofread"
                  >
                    <Edit3 className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('subtitleProofread')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/subtitleMerge`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('subtitleMerge') ? 'bg-muted' : ''
                    }`}
                    aria-label="Subtitle Merge"
                  >
                    <Film className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('subtitleMerge')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/ffmpegHelper`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('ffmpegHelper') ? 'bg-muted' : ''
                    }`}
                    aria-label="FFmpeg Helper"
                  >
                    <Wrench className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('ffmpegHelper')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/${locale}/settings`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-lg ${
                      asPath.includes('settings') ? 'bg-muted' : ''
                    }`}
                    aria-label="Settings"
                  >
                    <Settings className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('settings')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>
        <nav className="mt-auto grid gap-1 p-2">
          <ThemeToggle />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild className="w-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-lg"
                  aria-label={t('about.menuLabel')}
                  onClick={() => setShowAboutDialog(true)}
                >
                  <CircleHelp className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {t('about.menuLabel')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild className="w-10">
                <Github
                  onClick={() => openUrl('https://github.com/buxuku/SmartSub')}
                  className="size-5 inline-block cursor-pointer"
                />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Github
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>
      </aside>
      <div className="flex flex-col h-screen">
        <header className="flex-shrink-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
          <h4
            className="text-base font-semibold flex items-center gap-2 cursor-pointer select-none hover:opacity-80 transition-opacity"
            onClick={() => setShowAboutDialog(true)}
            title={t('about.menuLabel')}
          >
            {t('headerTitle')}{' '}
            {appMode === 'dev' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      {t('appModeDev')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t('appModeDevTip')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <span className="text-xs text-gray-500 ml-2">
              v{packageInfo.version}
            </span>
          </h4>
          {/* GPU 加速状态指示器 */}
          {cudaCapable && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`ml-auto h-7 text-xs gap-1.5 ${
                      cudaEnabled
                        ? 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() =>
                      router.push(`/${locale}/settings#gpu-acceleration`)
                    }
                  >
                    {cudaEnabled ? (
                      <Zap className="w-3.5 h-3.5" />
                    ) : (
                      <ZapOff className="w-3.5 h-3.5" />
                    )}
                    {cudaEnabled
                      ? t('gpuAccelerationEnabled')
                      : t('gpuAccelerationDisabled')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {cudaEnabled
                    ? t('gpuAccelerationEnabledTip')
                    : t('gpuAccelerationDisabledTip')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </header>
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        <Toaster />
      </div>

      <AboutDialog
        open={showAboutDialog}
        onOpenChange={setShowAboutDialog}
        appMode={appMode}
      />
      <QuitConfirmDialog
        open={showQuitDialog}
        onOpenChange={setShowQuitDialog}
      />
    </div>
  );
};

export default Layout;
