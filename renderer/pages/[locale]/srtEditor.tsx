import React from 'react';
import { useTranslation } from 'next-i18next';
import { getStaticPaths, makeStaticProperties } from '../../lib/get-static';
import { SrtEditorPanel } from '@/components/srtEditor';

export default function SrtEditorPage() {
  const { t } = useTranslation('srtEditor');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="min-h-0 flex-1">
        <SrtEditorPanel />
      </div>
    </div>
  );
}

export const getStaticProps = makeStaticProperties(['common', 'srtEditor']);
export { getStaticPaths };
