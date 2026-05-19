'use client';

import React from 'react';

export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[14px] min-w-0">
      <img
        src="/logo.png"
        alt="TweetMax"
        width={200}
        height={200}
        className="h-[76px] w-auto max-h-[92px] sm:h-[92px] sm:max-h-[104px] max-w-[min(220px,55vw)] shrink-0 object-contain object-left"
        draggable={false}
      />
      <span
        className="text-[26px] sm:text-[30px] font-[700] tracking-tight text-white truncate"
        style={{ fontFamily: 'inherit' }}
      >
        TweetMax
      </span>
    </div>
  );
};
