'use client';

import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  AdminPage,
  AdminHero,
  AdminSurface,
  AdminAlert,
  AdminBadgeYesNo,
  adminTable,
  adminTableWrap,
  adminTh,
  adminTr,
  adminTd,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

type OrgMembership = {
  role: string;
  organizationId: string;
  organizationName: string;
};

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  providerName: string;
  activated: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  organizations: OrgMembership[];
};

export function AdminHubUsersPage() {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;

  const load = async (path: string) => (await fetch(path)).json();

  const { data: rows, error } = useSWR<AdminUserRow[]>(
    isSuper ? '/user/admin-users' : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  if (!isSuper) {
    return (
      <AdminPage>
        <AdminAlert variant="warning">
          User directory is restricted to platform super administrators.
        </AdminAlert>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Directory"
        title="User management"
        description={
          <>
            Recent accounts (newest first, up to 200).{' '}
            <span className="text-newTextColor/90">
              <strong className="font-semibold">Platform super</strong> is{' '}
              <code className="text-[12px]">User.isSuperAdmin</code>.{' '}
              <strong className="font-semibold">Workspace roles</strong> are per organization—see
              the right-hand column.
            </span>
          </>
        }
      />

      {error ? (
        <AdminAlert variant="error">
          Failed to load users. Confirm you are still a platform super admin and the API is
          reachable.
        </AdminAlert>
      ) : !rows ? (
        <div className="flex flex-col gap-3 animate-pulse">
          <div className="h-12 rounded-xl bg-newBgLineColor/60" />
          <div className="h-64 rounded-2xl bg-newBgLineColor/50" />
        </div>
      ) : (
        <AdminSurface padding={false} className="overflow-hidden">
          <div className={adminTableWrap}>
            <table className={adminTable}>
              <thead>
                <tr>
                  <th className={adminTh}>Email</th>
                  <th className={adminTh}>Name</th>
                  <th className={adminTh}>Provider</th>
                  <th className={adminTh}>Active</th>
                  <th className={adminTh}>Platform super</th>
                  <th className={`${adminTh} min-w-[200px]`}>Workspace roles</th>
                  <th className={adminTh}>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={adminTr}>
                    <td className={`${adminTd} break-all max-w-[260px] font-medium`}>{r.email}</td>
                    <td className={adminTd}>{r.name || '—'}</td>
                    <td className={`${adminTd} whitespace-nowrap`}>
                      <span className="rounded-md bg-newBgLineColor/50 px-2 py-0.5 text-[12px]">
                        {r.providerName}
                      </span>
                    </td>
                    <td className={adminTd}>
                      <AdminBadgeYesNo value={r.activated} />
                    </td>
                    <td className={adminTd}>
                      <AdminBadgeYesNo value={r.isSuperAdmin} />
                    </td>
                    <td className={`${adminTd} align-top text-[12px]`}>
                      {r.organizations?.length ? (
                        <ul className="space-y-2 max-w-[340px]">
                          {r.organizations.map((o) => (
                            <li
                              key={o.organizationId}
                              className="leading-snug rounded-lg bg-black/20 px-2.5 py-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                            >
                              <span className="font-semibold text-violet-200/95">{o.role}</span>
                              <span className="text-textItemBlur"> · </span>
                              <span className="text-textItemBlur break-words">{o.organizationName}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-textItemBlur">—</span>
                      )}
                    </td>
                    <td className={`${adminTd} whitespace-nowrap text-textItemBlur tabular-nums text-[12px]`}>
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSurface>
      )}
    </AdminPage>
  );
}
