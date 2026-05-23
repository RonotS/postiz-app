import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TweetMax | Dashboard — Maximize Your 𝕏 Engagement',
  description:
    'Schedule posts, automate DMs, and grow engagement on 𝕏 from one dashboard.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
