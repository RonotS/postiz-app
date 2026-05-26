'use client';



import useSWR from 'swr';

import Link from 'next/link';

import { useCallback, useEffect, useState } from 'react';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

import { useUser } from '@gitroom/frontend/components/layout/user.context';

import { useToaster } from '@gitroom/react/toaster/toaster';

import { Button } from '@gitroom/react/form/button';

import {

  AdminPage,

  AdminHero,

  AdminSurface,

  AdminAlert,

} from '@gitroom/frontend/components/admin/admin.hub.ui';



type Flags = {

  profileAutomationsPublic: boolean;

  followAutomationsPublic: boolean;

};



function ToggleRow({

  label,

  description,

  checked,

  onChange,

  disabled,

}: {

  label: string;

  description: string;

  checked: boolean;

  onChange: (v: boolean) => void;

  disabled?: boolean;

}) {

  return (

    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-4">

      <div className="min-w-0">

        <p className="text-[15px] font-semibold text-newTextColor">{label}</p>

        <p className="mt-1 text-[13px] text-textItemBlur leading-snug">{description}</p>

      </div>

      <button

        type="button"

        role="switch"

        aria-checked={checked}

        disabled={disabled}

        onClick={() => onChange(!checked)}

        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${

          checked ? 'bg-emerald-600' : 'bg-newBgLineColor'

        } ${disabled ? 'opacity-50' : ''}`}

      >

        <span

          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${

            checked ? 'translate-x-5' : 'translate-x-0'

          }`}

        />

      </button>

    </label>

  );

}



export function AdminHubAutomationPagesPage() {

  const user = useUser();

  const fetch = useFetch();

  const toast = useToaster();

  const isSuper = !!user?.isSuperAdmin;



  const load = async (path: string) => (await fetch(path)).json();



  const { data: flags, error, mutate } = useSWR<Flags>(

    isSuper ? '/user/admin-automation-pages-flags' : null,

    load,

    { revalidateOnFocus: false }

  );



  const [profilePublic, setProfilePublic] = useState(false);

  const [followPublic, setFollowPublic] = useState(false);

  const [saving, setSaving] = useState(false);



  useEffect(() => {

    if (flags) {

      setProfilePublic(flags.profileAutomationsPublic);

      setFollowPublic(flags.followAutomationsPublic);

    }

  }, [flags]);



  const save = useCallback(async () => {

    setSaving(true);

    try {

      const res = await fetch('/user/admin-automation-pages-flags', {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          profileAutomationsPublic: profilePublic,

          followAutomationsPublic: followPublic,

        }),

      });

      if (!res.ok) throw new Error('Save failed');

      const next = await res.json();

      mutate(next, false);

      toast.show('Automation page visibility updated');

    } catch {

      toast.show('Could not save flags');

    } finally {

      setSaving(false);

    }

  }, [fetch, followPublic, mutate, profilePublic, toast]);



  if (!isSuper) {

    return (

      <AdminPage>

        <AdminAlert variant="warning">

          Automation page settings are restricted to platform super administrators.

        </AdminAlert>

      </AdminPage>

    );

  }



  return (

    <AdminPage>

      <AdminHero

        eyebrow="Launch"

        title="Automation pages"

        description={

          <>

            Control who sees Profile and Follow automation in the sidebar. When a switch is{' '}

            <strong className="text-newTextColor">off</strong>, only platform super admins (

            <code className="text-[12px]">User.isSuperAdmin</code>) see the menu and pages.

            Normal users and workspace admins do not. When{' '}

            <strong className="text-newTextColor">on</strong>, everyone sees it regardless of tier.

            Tweet Automations is unchanged and not controlled here.

          </>

        }

      />



      {error ? (

        <AdminAlert variant="error">Failed to load flags.</AdminAlert>

      ) : !flags ? (

        <div className="h-40 animate-pulse rounded-2xl bg-newBgLineColor/40" />

      ) : (

        <>

          <AdminSurface className="flex flex-col gap-4">

            <ToggleRow

              label="Profile automations — visible to all users"

              description="Shows /dashboard/profile-automations in the sidebar for every user. Off = platform super admin only."

              checked={profilePublic}

              onChange={setProfilePublic}

            />

            <ToggleRow

              label="Follow automations — visible to all users"

              description="Sidebar + full follower explorer and welcome DM UI for everyone. Off = super admin only with a coming-soon preview."

              checked={followPublic}

              onChange={setFollowPublic}

            />

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.06]">

              <Button loading={saving} disabled={saving} onClick={save}>

                Save visibility

              </Button>

            </div>

          </AdminSurface>



          <AdminSurface>

            <p className="text-[13px] font-semibold text-newTextColor mb-3">Preview pages</p>

            <div className="flex flex-wrap gap-3">

              <Link

                href="/dashboard/profile-automations"

                className="rounded-full border border-newBorder px-4 py-2 text-[13px] font-medium text-newTextColor hover:bg-boxFocused"

              >

                Open Profile automations →

              </Link>

              <Link

                href="/dashboard/followers"

                className="rounded-full border border-newBorder px-4 py-2 text-[13px] font-medium text-newTextColor hover:bg-boxFocused"

              >

                Open Follow automations →

              </Link>

            </div>

            <p className="mt-3 text-[12px] text-textItemBlur">

              Users may need to refresh or sign in again for sidebar changes. Defaults can be set

              in .env with <code className="text-[11px]">AUTOMATION_PAGES_PROFILE_PUBLIC</code> and{' '}

              <code className="text-[11px]">AUTOMATION_PAGES_FOLLOW_PUBLIC</code>.

            </p>

          </AdminSurface>

        </>

      )}

    </AdminPage>

  );

}

