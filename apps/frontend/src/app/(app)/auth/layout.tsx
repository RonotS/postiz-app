export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-[#0E0E0E] flex flex-1 p-[8px] gap-[8px] min-h-screen w-screen text-white items-start">
      {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
      <ReturnUrlComponent />
      <div className="flex flex-col pt-[16px] pb-[24px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white bg-[#1A1919]">
        <div className="w-full max-w-[440px] mx-auto gap-[16px] h-full flex flex-col text-white">
          <LogoTextComponent />
          <div className="flex">{children}</div>
        </div>
      </div>
      <div className="text-[36px] flex-1 pt-[12px] hidden lg:flex flex-col items-center justify-start min-h-0">
        <div className="text-center leading-tight">
          Over <span className="text-[42px] text-[#FC69FF]">20,000+</span>{' '}
          Entrepreneurs use
          <br />
          TweetMax To Grow Their Social Presence
        </div>
        <div className="w-full max-w-[850px] px-[16px] mt-[12px] pt-[20px] flex items-start justify-center animate-authHeroFloat motion-reduce:animate-none">
          <div className="relative w-full">
            <div
              className="pointer-events-none absolute left-[8%] right-[8%] top-[12%] bottom-[4%] rounded-[24px] bg-[#612BD3]/15 blur-[48px] motion-reduce:hidden"
              aria-hidden
            />
            <img
              src="/hero-image3.png"
              alt="TweetMax"
              width={850}
              height={720}
              className="relative z-[1] w-full h-auto max-h-[min(72vh,720px)] object-contain animate-authHeroEnter motion-reduce:animate-none motion-reduce:opacity-100"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
