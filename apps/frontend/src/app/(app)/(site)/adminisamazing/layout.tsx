import { AdminHubShell } from '@gitroom/frontend/components/admin/admin.hub.shell';
import { AdminHubAccessGuard } from '@gitroom/frontend/components/admin/admin.hub.access.guard';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'TweetMax' : 'Gitroom'} Admin`,
  description: 'Platform administrator hub',
};

export default function AdminisamazingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminHubAccessGuard>
      <AdminHubShell>{children}</AdminHubShell>
    </AdminHubAccessGuard>
  );
}
