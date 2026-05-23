import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TweetMax | Subscribe — Maximize Your 𝕏 Engagement',
  description:
    'Choose a plan and start automating your X engagement with a 7-day free trial.',
};

export default function SubscribeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
