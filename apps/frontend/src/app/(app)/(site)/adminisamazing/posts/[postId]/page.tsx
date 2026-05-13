import { AdminHubPostDetailPage } from '@gitroom/frontend/components/admin/admin.hub.post.detail.page';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <AdminHubPostDetailPage postId={postId} />;
}
