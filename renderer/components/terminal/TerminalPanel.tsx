/**
 * VS Code 风格底部终端面板
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { useTranslation } from 'next-i18next';
import { Plus, X, TerminalSquare, Trash2, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalView from './TerminalView';
import { v4 as uuidv4 } from 'uuid';

export interface TerminalTab {
  id: string;
  title: string;
}

export interface TerminalPanelHandle {
  createTab: () => void;
  killActive: () => void;
}

export interface TerminalPanelProps {
  visible: boolean;
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7;

const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(
  function TerminalPanel({ visible, height, onHeightChange, onClose }, ref) {
    const { t } = useTranslation('common');
    const [tabs, setTabs] = useState<TerminalTab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const createTab = useCallback(() => {
      const id = uuidv4();
      setTabs((prev) => [...prev, { id, title: t('terminal.defaultTitle') }]);
      setActiveId(id);
    }, [t]);

    const closeTab = useCallback(
      (id: string, hidePanelWhenEmpty = false) => {
        setTabs((prev) => {
          const next = prev.filter((tab) => tab.id !== id);
          if (activeId === id) {
            setActiveId(next[next.length - 1]?.id ?? null);
          }
          if (hidePanelWhenEmpty && next.length === 0) {
            queueMicrotask(() => onClose());
          }
          return next;
        });
      },
      [activeId, onClose],
    );

    const killActive = useCallback(() => {
      if (!activeId) return;
      window.ipc.invoke('terminal:kill', { id: activeId }).catch(() => {});
    }, [activeId]);

    const handlePanelClose = useCallback(() => {
      tabs.forEach((tab) => {
        window.ipc.invoke('terminal:kill', { id: tab.id }).catch(() => {});
      });
      setTabs([]);
      setActiveId(null);
      onClose();
    }, [tabs, onClose]);

    useImperativeHandle(ref, () => ({ createTab, killActive }), [
      createTab,
      killActive,
    ]);

    useEffect(() => {
      if (visible && tabs.length === 0) {
        createTab();
      }
    }, [visible, tabs.length, createTab]);

    const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = height;

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startY - moveEvent.clientY;
        const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
        onHeightChange(
          Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeight + delta)),
        );
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
    };

    return (
      <div
        className={`flex-shrink-0 border-t bg-[#1e1e1e] text-[#cccccc] flex flex-col overflow-hidden ${
          visible ? '' : 'hidden'
        }`}
        style={{ height: visible ? height : 0 }}
      >
        <div
          className="h-1 cursor-row-resize flex items-center justify-center bg-border/40 hover:bg-border"
          onPointerDown={handleResizeStart}
        >
          <GripHorizontal className="w-4 h-3 opacity-50" />
        </div>

        <div className="flex items-center justify-between px-2 h-9 bg-[#252526] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
            <span className="text-xs uppercase tracking-wide text-[#cccccc]/80 px-2 flex items-center gap-1">
              <TerminalSquare className="w-3.5 h-3.5" />
              {t('terminal.panelTitle')}
            </span>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`group flex items-center gap-1 max-w-[180px] px-2 py-1 text-xs rounded-t border border-transparent ${
                  activeId === tab.id
                    ? 'bg-[#1e1e1e] text-white border-[#3c3c3c] border-b-[#1e1e1e]'
                    : 'text-[#cccccc]/80 hover:bg-[#2a2d2e]'
                }`}
              >
                <span className="truncate">{tab.title}</span>
                <X
                  className="w-3 h-3 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id, true);
                  }}
                />
              </button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#cccccc]/80 hover:text-white hover:bg-[#2a2d2e]"
              onClick={createTab}
              title={t('terminal.new')}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#cccccc]/80 hover:text-white hover:bg-[#2a2d2e]"
              onClick={killActive}
              title={t('terminal.kill')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#cccccc]/80 hover:text-white hover:bg-[#2a2d2e]"
              onClick={handlePanelClose}
              title={t('terminal.closePanel')}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          {tabs.map((tab) => (
            <TerminalView
              key={tab.id}
              terminalId={tab.id}
              active={visible && tab.id === activeId}
              onTitleChange={(id, title) => {
                setTabs((prev) =>
                  prev.map((item) =>
                    item.id === id ? { ...item, title } : item,
                  ),
                );
              }}
            />
          ))}
        </div>
      </div>
    );
  },
);

export default TerminalPanel;
