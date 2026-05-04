'use client';

import { MediaBox } from '@gitroom/frontend/components/media/media.component';

export const MediaLayoutComponent = () => {
  return (
    <div className="bg-newBgColorInner p-[10px] md:p-[20px] flex flex-1 flex-col gap-[15px] transition-all min-w-0 overflow-hidden">
      <MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
    </div>
  );
};
