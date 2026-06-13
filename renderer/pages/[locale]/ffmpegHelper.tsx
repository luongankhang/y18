/**
 * FFmpeg Helper page
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { getStaticPaths, makeStaticProperties } from '../../lib/get-static';
import { FfmpegHelperPanel } from '@/components/ffmpegHelper';
import { toast } from 'sonner';

export default function FfmpegHelperPage() {
  const { t } = useTranslation('ffmpegHelper');

  const handleComplete = (message: string) => {
    toast.success(t('operationSuccess'), {
      description: message,
    });
  };

  const handleError = (error: string) => {
    toast.error(t('operationError'), {
      description: error,
    });
  };

  return (
    <div className="h-full p-4 overflow-hidden">
      <FfmpegHelperPanel onComplete={handleComplete} onError={handleError} />
    </div>
  );
}

export const getStaticProps = makeStaticProperties(['common', 'ffmpegHelper']);
export { getStaticPaths };
