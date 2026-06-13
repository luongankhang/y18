import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  FileText,
  FolderOpen,
  Save,
  Plus,
  Trash2,
  SpellCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpellCheckedTextarea } from './SpellCheckedTextarea';
import { useSrtEditor } from './hooks/useSrtEditor';
import { MacConfirmDialog } from '@/components/MacConfirmDialog';
import { cn } from 'lib/utils';

type PendingConfirmAction = 'save' | 'addCue' | null;

export function SrtEditorPanel() {
  const { t } = useTranslation('srtEditor');
  const editor = useSrtEditor();
  const [pendingAction, setPendingAction] =
    useState<PendingConfirmAction>(null);

  const confirmDialog = useMemo(() => {
    if (pendingAction === 'save') {
      return {
        title: t('confirmSaveTitle'),
        message: t('confirmSaveMessage'),
        confirmLabel: t('confirmSave'),
      };
    }
    if (pendingAction === 'addCue') {
      return {
        title: t('confirmAddCueTitle'),
        message: t('confirmAddCueMessage'),
        confirmLabel: t('confirmAddCue'),
      };
    }
    return null;
  }, [pendingAction, t]);

  const handleConfirmAction = () => {
    if (pendingAction === 'save') {
      void editor.saveFile();
      return;
    }
    if (pendingAction === 'addCue') {
      editor.addCue();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void editor.openFile()}
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          {t('openFile')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!editor.cues.length}
          onClick={() => setPendingAction('save')}
        >
          <Save className="mr-2 h-4 w-4" />
          {t('save')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!editor.cues.length}
          onClick={() => void editor.saveFileAs()}
        >
          <FileText className="mr-2 h-4 w-4" />
          {t('saveAs')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!editor.cues.length}
          onClick={() => setPendingAction('addCue')}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('addCue')}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={editor.spellCheckEnabled}
              onCheckedChange={editor.setSpellCheckEnabled}
              id="spell-check-toggle"
            />
            <Label htmlFor="spell-check-toggle" className="text-sm">
              {t('spellCheck')}
            </Label>
          </div>
          {editor.spellCheckEnabled && editor.totalSpellIssues > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={editor.goToNextSpellIssue}
            >
              <SpellCheck className="mr-2 h-4 w-4" />
              {t('nextSpellIssue', { count: editor.totalSpellIssues })}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/20 p-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('shiftTime')}</Label>
          <Input
            type="number"
            value={editor.timeShiftMs}
            onChange={(event) => editor.setTimeShiftMs(event.target.value)}
            className="w-32"
            placeholder="0"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!editor.cues.length}
          onClick={editor.shiftAllTimes}
        >
          <Clock className="mr-2 h-4 w-4" />
          {t('applyShift')}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2 text-xs text-muted-foreground">
          {editor.fileName ? (
            <Badge variant="outline">{editor.fileName}</Badge>
          ) : (
            <span>{t('noFileOpen')}</span>
          )}
          {editor.isDirty && <Badge variant="secondary">{t('unsaved')}</Badge>}
          {editor.overlapIssues.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {t('overlapCount', { count: editor.overlapIssues.length })}
            </Badge>
          )}
          {editor.spellCheckEnabled && (
            <Badge
              variant={editor.totalSpellIssues ? 'destructive' : 'secondary'}
            >
              {t('spellIssueCount', { count: editor.totalSpellIssues })}
            </Badge>
          )}
        </div>
      </div>

      {!editor.cues.length ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/10 p-8 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 rounded-2xl border">
          <div className="space-y-2 p-3">
            {editor.cues.map((cue, index) => {
              const isActive = editor.currentIndex === index;
              const spellIssues = editor.spellIssuesByCue[index] || [];
              const hasOverlap = editor.overlapIssues.includes(index);

              return (
                <div
                  key={`${cue.id}-${index}`}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'bg-card',
                    hasOverlap && 'border-amber-500/60',
                  )}
                  onClick={() => editor.setCurrentIndex(index)}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">#{cue.id}</Badge>
                    <Input
                      value={cue.startEndTime}
                      onChange={(event) =>
                        editor.updateCue(index, {
                          startEndTime: event.target.value,
                        })
                      }
                      className="h-8 flex-1 min-w-[260px] font-mono text-xs"
                    />
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          editor.setCurrentIndex(Math.max(0, index - 1));
                        }}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          editor.setCurrentIndex(
                            Math.min(editor.cues.length - 1, index + 1),
                          );
                        }}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          editor.deleteCue(index);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {spellIssues.length > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {t('spellIssueCount', { count: spellIssues.length })}
                      </Badge>
                    )}
                  </div>

                  <SpellCheckedTextarea
                    value={cue.text}
                    enabled={editor.spellCheckEnabled}
                    rows={3}
                    placeholder={t('cuePlaceholder')}
                    onChange={(value) => editor.updateCueText(index, value)}
                    onIssuesChange={(issues) =>
                      editor.updateCueIssues(index, issues)
                    }
                    onFocus={() => editor.setCurrentIndex(index)}
                  />

                  {spellIssues.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {spellIssues.slice(0, 3).map((issue) => (
                        <p key={`${issue.start}-${issue.word}`}>
                          <span className="font-medium text-red-500">
                            {issue.word}
                          </span>
                          {issue.suggestion
                            ? ` → ${issue.suggestion}`
                            : ` (${t('unknownWord')})`}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {confirmDialog && (
        <MacConfirmDialog
          open={pendingAction !== null}
          onOpenChange={(open) => {
            if (!open) setPendingAction(null);
          }}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={t('cancel')}
          onConfirm={handleConfirmAction}
        />
      )}
    </div>
  );
}
