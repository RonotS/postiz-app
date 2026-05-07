'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { expandPosts } from '@gitroom/helpers/utils/posts.list.minify';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import useSWR from 'swr';

const SETTINGS_STORAGE_KEY = 'dashboard-composer-settings';
const DRAFT_STORAGE_KEY = 'dashboard-composer-draft';

type ComposerSettings = {
  longForm: boolean;
  autoRetweet: boolean;
  autoPlug: boolean;
  autoPlugLikes: number;
  autoDm: boolean;
  threadDelay: boolean;
  linkedinPublish: boolean;
  generateBlog: boolean;
  paidPartnership: boolean;
  plugProvider: string;
  plugMessage: string;
};

const DEFAULT_SETTINGS: ComposerSettings = {
  longForm: true,
  autoRetweet: false,
  autoPlug: true,
  autoPlugLikes: 3,
  autoDm: false,
  threadDelay: false,
  linkedinPublish: false,
  generateBlog: false,
  paidPartnership: false,
  plugProvider: 'discord',
  plugMessage:
    'join my FREE DISCORD for FREE PICKS:\nhttps://discord.gg/RHpSX4nwGv',
};

type IntegrationItem = {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
};

type PostItem = {
  id: string;
  content: string;
  publishDate: string;
  state: string;
  group?: string;
  integration?: { providerIdentifier?: string; name?: string };
};

const Toggle: FC<{
  enabled: boolean;
  onChange: (v: boolean) => void;
}> = ({ enabled, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`relative w-[36px] h-[20px] rounded-full transition-colors flex-shrink-0 ${
      enabled ? 'bg-btnPrimary' : 'bg-newBgLineColor'
    }`}
    aria-pressed={enabled}
  >
    <span
      className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-white rounded-full transition-transform ${
        enabled ? 'translate-x-[16px]' : 'translate-x-0'
      }`}
    />
  </button>
);

const SettingRow: FC<{
  icon?: string;
  label: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  trailing?: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ icon, label, enabled, onChange, trailing, hint }) => (
  <div className="flex flex-col gap-1 py-2">
    <div className="flex items-center gap-3">
      {icon && (
        <span className="text-newTableText text-sm w-4 text-center">
          {icon}
        </span>
      )}
      <span className="flex-1 text-newTextColor text-sm">{label}</span>
      {trailing}
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
    {hint && <div className="text-newTableText text-xs ml-7">{hint}</div>}
  </div>
);

const useDashboardPosts = (startDate: string, endDate: string) => {
  const fetch = useFetch();
  return useSWR(
    `/dashboard-posts?start=${startDate}&end=${endDate}`,
    async () => {
      const params = new URLSearchParams({
        display: 'week',
        startDate: newDayjs(startDate).startOf('day').utc().format(),
        endDate: newDayjs(endDate).endOf('day').utc().format(),
        customer: '',
      });
      const res = await fetch(`/posts?${params.toString()}`);
      if (!res.ok) return { posts: [] as PostItem[] };
      return expandPosts(await res.json()) as { posts: PostItem[] };
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: true,
    }
  );
};

const useNextSlot = () => {
  const fetch = useFetch();
  return useSWR(
    '/posts/find-slot',
    async () => {
      const res = await fetch('/posts/find-slot');
      if (!res.ok) return null;
      const data = await res.json();
      return data.date as string | null;
    },
    {
      revalidateOnFocus: false,
    }
  );
};

const useIntegrations = () => {
  const fetch = useFetch();
  return useSWR(
    '/integrations/list',
    async () => {
      const res = await fetch('/integrations/list');
      if (!res.ok) return [] as IntegrationItem[];
      const data = await res.json();
      return (data.integrations || []) as IntegrationItem[];
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  );
};

export default function DashboardPage() {
  const t = useT();
  const toast = useToaster();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'Compose' | 'Drafts' | 'Scheduled' | 'Sent'
  >('Compose');
  const [queueTab, setQueueTab] = useState<
    'Scheduled Tweets' | 'Published Tweets' | 'Drafts'
  >('Scheduled Tweets');
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [settings, setSettings] = useState<ComposerSettings>(DEFAULT_SETTINGS);
  const [composerText, setComposerText] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted settings + draft from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
      const draft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (draft) setComposerText(draft);
    } catch {
      /* ignore corrupted storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(DRAFT_STORAGE_KEY, composerText);
  }, [composerText, hydrated]);

  const updateSetting = useCallback(
    <K extends keyof ComposerSettings>(key: K, value: ComposerSettings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
    },
    []
  );

  // Date range: today through next 6 days (7-day window)
  const startDate = useMemo(() => newDayjs().format('YYYY-MM-DD'), []);
  const endDate = useMemo(
    () => newDayjs().add(6, 'day').format('YYYY-MM-DD'),
    []
  );

  const fetch = useFetch();
  const {
    data: postsData,
    isLoading: loadingPosts,
    mutate: mutatePosts,
  } = useDashboardPosts(startDate, endDate);
  const { data: nextSlotIso, mutate: mutateNextSlot } = useNextSlot();
  const { data: integrations = [] } = useIntegrations();
  const [submitting, setSubmitting] = useState(false);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  // datetime-local string in user's local TZ ("YYYY-MM-DDTHH:mm")
  const [scheduledAt, setScheduledAt] = useState<string>('');

  // Default the schedule input to the next free slot when one is found,
  // unless the user has already picked a custom time.
  const [userTouchedDate, setUserTouchedDate] = useState(false);
  useEffect(() => {
    if (userTouchedDate) return;
    if (editingPost) {
      setScheduledAt(
        dayjs.utc(editingPost.publishDate).local().format('YYYY-MM-DDTHH:mm')
      );
      return;
    }
    if (nextSlotIso) {
      setScheduledAt(
        dayjs.utc(nextSlotIso).local().format('YYYY-MM-DDTHH:mm')
      );
    }
  }, [nextSlotIso, editingPost, userTouchedDate]);

  const xIntegration = useMemo(
    () =>
      integrations.find(
        (i) => !i.disabled && (i.identifier === 'x' || i.identifier === 'twitter')
      ),
    [integrations]
  );

  const allPosts: PostItem[] = postsData?.posts || [];

  const filteredPosts = useMemo(() => {
    if (queueTab === 'Scheduled Tweets')
      return allPosts.filter((p) => p.state === 'QUEUE');
    if (queueTab === 'Published Tweets')
      return allPosts.filter((p) => p.state === 'PUBLISHED');
    return allPosts.filter((p) => p.state === 'DRAFT');
  }, [allPosts, queueTab]);

  // Group filtered posts by day for the upcoming 7 days window.
  const days = useMemo(() => {
    const today = newDayjs().startOf('day');
    return Array.from({ length: 7 }).map((_, i) => {
      const d = today.add(i, 'day');
      const isoDate = d.format('YYYY-MM-DD');
      const label =
        i === 0
          ? t('today', 'Today')
          : i === 1
          ? t('tomorrow', 'Tomorrow')
          : d.format('dddd');
      const dayPosts = filteredPosts
        .filter((p) =>
          dayjs.utc(p.publishDate).local().isSame(d, 'day')
        )
        .sort((a, b) =>
          dayjs.utc(a.publishDate).valueOf() -
          dayjs.utc(b.publishDate).valueOf()
        );
      return { isoDate, label, monthDay: d.format('MMM DD'), posts: dayPosts };
    });
  }, [filteredPosts, t]);

  const charCount = composerText.length;
  const charLimit = settings.longForm ? 25000 : 280;

  const submitPost = useCallback(
    async (mode: 'queue' | 'now' | 'draft') => {
      if (!composerText.trim()) {
        toast.show(
          t('nothing_to_post', 'Write something before posting'),
          'warning'
        );
        return;
      }
      if (!xIntegration) {
        toast.show(
          t(
            'connect_x_first',
            'Connect your X account first to publish from the home queue'
          ),
          'warning'
        );
        return;
      }
      if (submitting) return;
      setSubmitting(true);
      try {
        const isEditing = !!editingPost;
        // For "now" we always use current time; for drafts/queue we use the
        // user's chosen datetime, falling back to next slot, then +1h.
        let date: string;
        if (mode === 'now') {
          date = newDayjs().utc().format('YYYY-MM-DDTHH:mm:ss');
        } else if (scheduledAt) {
          date = dayjs(scheduledAt).utc().format('YYYY-MM-DDTHH:mm:ss');
        } else if (nextSlotIso) {
          date = nextSlotIso;
        } else {
          date = newDayjs().add(1, 'hour').utc().format('YYYY-MM-DDTHH:mm:ss');
        }

        // Split textarea into thread tweets when the user inserts 3+ blank lines.
        const threadParts = composerText
          .split(/\n\s*\n\s*\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const values = (threadParts.length ? threadParts : [composerText]).map(
          (content, idx) => ({
            content,
            delay: idx === 0 ? 0 : settings.threadDelay ? 60 : 0,
            image: [],
            // When editing, attach the existing post id so the backend
            // upserts in place instead of creating a new row.
            ...(isEditing && idx === 0 ? { id: editingPost!.id } : {}),
          })
        );

        // type=update keeps the existing state; otherwise pick by mode.
        const type = isEditing
          ? 'update'
          : mode === 'now'
          ? 'now'
          : mode === 'draft'
          ? 'draft'
          : 'schedule';

        const payload = {
          type,
          shortLink: false,
          date,
          tags: [],
          posts: [
            {
              integration: { id: xIntegration.id },
              group: isEditing ? editingPost!.group || '' : '',
              settings: {
                __type: 'x',
                who_can_reply_post: 'everyone',
                made_with_ai: false,
                paid_partnership: settings.paidPartnership,
              },
              value: values,
            },
          ],
        };

        const res = await fetch('/posts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          toast.show(
            errText || t('post_failed', 'Could not create the post'),
            'warning'
          );
          return;
        }

        toast.show(
          isEditing
            ? t('post_updated', 'Post updated')
            : mode === 'now'
            ? t('publishing_now', 'Publishing now')
            : mode === 'draft'
            ? t('saved_as_draft', 'Saved as draft')
            : t('added_to_queue', 'Added to queue')
        );
        setComposerText('');
        setEditingPost(null);
        setUserTouchedDate(false);
        await Promise.all([mutatePosts(), mutateNextSlot()]);
      } catch (err: any) {
        toast.show(
          err?.message || t('post_failed', 'Could not create the post'),
          'warning'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      composerText,
      settings,
      toast,
      t,
      xIntegration,
      submitting,
      nextSlotIso,
      scheduledAt,
      editingPost,
      fetch,
      mutatePosts,
      mutateNextSlot,
    ]
  );

  const startEdit = useCallback((post: PostItem) => {
    setEditingPost(post);
    setComposerText(post.content);
    setUserTouchedDate(false);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingPost(null);
    setComposerText('');
    setUserTouchedDate(false);
  }, []);

  const newDraft = useCallback(() => {
    setComposerText('');
    setEditingPost(null);
    setUserTouchedDate(false);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 bg-newBgColor text-newTextColor flex-col w-full">
      {/* Top alert */}
      <div className="bg-customColor26/10 border-b border-customColor26/20 px-6 py-2 flex items-center gap-3 flex-shrink-0">
        <span className="text-customColor26 text-sm">ⓘ</span>
        <div className="text-newTextColor text-xs">
          <span className="font-semibold">
            {t(
              'ai_settings_not_set',
              'AI settings are not properly configured'
            )}
          </span>
          <span className="text-newTableText ml-2">
            {t(
              'ai_settings_hint',
              'It seems your AI settings are not set. Please,'
            )}{' '}
            <a href="/settings" className="text-customColor26 underline">
              {t('update_them_here', 'update them here')}
            </a>{' '}
            {t('to_improve_ai', 'to improve the AI generation quality')}
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row w-full">
        {/* Left Section: Queue */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-newBorder custom-scrollbar">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-newTextColor mb-4">
              {t('queue', 'Queue')}
            </h1>

            {!loadingPosts && filteredPosts.length === 0 && (
              <div className="bg-customColor19/10 border border-customColor19/30 rounded-lg px-4 py-2.5 flex items-center gap-2 mb-5">
                <span className="text-customColor19 text-sm">⚠</span>
                <span className="text-newTextColor text-sm">
                  {queueTab === 'Scheduled Tweets'
                    ? t(
                        'no_scheduled_tweets',
                        'You have no scheduled tweets in your queue'
                      )
                    : queueTab === 'Published Tweets'
                    ? t('no_published', 'No published tweets in this period')
                    : t('no_drafts', 'You have no drafts')}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex border-b border-newBorder">
                {(['Scheduled Tweets', 'Published Tweets', 'Drafts'] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setQueueTab(tab)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        queueTab === tab
                          ? 'border-customColor26 text-customColor26'
                          : 'border-transparent text-newTableText hover:text-newTextColor'
                      }`}
                    >
                      {tab}
                    </button>
                  )
                )}
              </nav>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/launches')}
                  className="px-3 py-1.5 text-xs text-newTextColor border border-newBorder rounded-lg hover:bg-boxHover transition-colors flex items-center gap-1.5"
                >
                  ↻ {t('re_queue', 'Re-Queue')}
                </button>
                <button
                  onClick={() => router.push('/launches')}
                  className="px-3 py-1.5 text-xs text-newTextColor border border-newBorder rounded-lg hover:bg-boxHover transition-colors flex items-center gap-1.5"
                >
                  ⇌ {t('shuffle', 'Shuffle')}
                </button>
                <button
                  onClick={() => router.push('/launches')}
                  className="px-3 py-1.5 text-xs text-white font-medium bg-btnPrimary rounded-lg hover:opacity-90 transition-colors flex items-center gap-1.5"
                >
                  ✎ {t('edit_queue', 'Edit queue')}
                </button>
              </div>
            </div>
          </header>

          {loadingPosts ? (
            <div className="text-newTableText text-sm py-8 text-center">
              {t('loading', 'Loading...')}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {days.map((day) => (
                <section key={day.isoDate}>
                  <div className="text-newTextColor text-sm font-semibold mb-3">
                    {day.label}{' '}
                    <span className="text-newTableText mx-1">|</span>{' '}
                    {day.monthDay}
                  </div>
                  <div className="flex flex-col gap-2">
                    {day.posts.length === 0 ? (
                      <div className="bg-newBgColorInner border border-newBorder rounded-lg px-4 py-3 flex items-center gap-4 hover:border-newSep transition-all">
                        <div className="text-newTableText text-sm italic">
                          {t(
                            'press_add_to_queue',
                            "Press \"Add to queue\" to place your post here"
                          )}
                        </div>
                      </div>
                    ) : (
                      day.posts.map((post) => {
                        const localTime = dayjs
                          .utc(post.publishDate)
                          .local()
                          .format('hh:mm a');
                        const dmsSent = (post as any).dmsSent ?? 0;
                        const isBeingEdited = editingPost?.id === post.id;
                        return (
                          <div
                            key={post.id}
                            className={`bg-newBgColorInner border rounded-lg px-4 py-3 transition-all ${
                              isBeingEdited
                                ? 'border-customColor26'
                                : 'border-newBorder hover:border-newSep'
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <div className="text-newTextColor text-sm font-medium w-[70px] flex-shrink-0 pt-0.5">
                                {localTime}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-newTextColor text-sm whitespace-pre-wrap break-words mb-2">
                                  {post.content}
                                </p>
                                <div className="flex items-center gap-3 text-newTableText text-xs">
                                  <span className="flex items-center gap-1">
                                    ✉ {dmsSent}{' '}
                                    {t('dms_sent', 'DMs sent')}
                                  </span>
                                  {post.integration?.providerIdentifier && (
                                    <span className="flex items-center gap-1 capitalize">
                                      {post.integration.providerIdentifier}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(post);
                                }}
                                className="flex-shrink-0 px-3 py-1 text-xs text-customColor26 border border-newBorder rounded-md hover:bg-boxHover transition-colors flex items-center gap-1"
                              >
                                ✎ {t('edit', 'Edit')}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Right Section: Composer */}
        <div className="w-full lg:w-[420px] lg:flex-shrink-0 flex flex-col bg-newBgColorInner lg:border-l border-newBorder overflow-y-auto custom-scrollbar">
          <div className="p-3 border-b border-newBorder flex justify-end gap-1">
            <button className="p-2 hover:bg-boxHover rounded-lg text-newTableText">
              ⇥
            </button>
            <button className="p-2 hover:bg-boxHover rounded-lg text-newTableText">
              ⛶
            </button>
          </div>

          <nav className="flex border-b border-newBorder px-4">
            {(['Compose', 'Drafts', 'Scheduled', 'Sent'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab
                    ? 'border-customColor26 text-customColor26'
                    : 'border-transparent text-newTableText hover:text-newTextColor'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="p-4 flex flex-col gap-3">
            {editingPost && (
              <div className="bg-customColor26/10 border border-customColor26/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-customColor26 text-xs flex items-center gap-2">
                  ✎ {t('editing_post', 'Editing scheduled post')}
                </span>
                <button
                  onClick={cancelEdit}
                  className="text-newTableText text-xs hover:text-newTextColor transition-colors"
                >
                  {t('cancel', 'Cancel')}
                </button>
              </div>
            )}

            <div className="flex justify-between items-center">
              <h3 className="text-newTextColor font-semibold text-sm">
                {editingPost
                  ? t('editing', 'Editing')
                  : t('your_content', 'Your content')}
              </h3>
              {!editingPost && (
                <button
                  onClick={newDraft}
                  className="text-customColor26 text-xs font-semibold hover:underline"
                >
                  + {t('new_draft', 'New draft')}
                </button>
              )}
            </div>

            <div className="bg-newBgColor border border-newBorder rounded-xl p-4 relative focus-within:border-newSep transition-all min-h-[180px]">
              <textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                className="w-full h-full min-h-[150px] bg-transparent border-none outline-none text-newTextColor resize-none placeholder:text-newTableText text-[15px]"
                placeholder={t(
                  'write_here',
                  'Write here.\n\nSkip 3 lines to start a thread.'
                )}
              />
              <div className="flex items-center justify-between mt-2 text-[11px] text-newTableText">
                <div className="flex items-center gap-3">
                  <button className="hover:text-newTextColor transition-colors">
                    ↺
                  </button>
                  <button className="hover:text-newTextColor transition-colors">
                    🔗
                  </button>
                  <button className="hover:text-newTextColor transition-colors">
                    T
                  </button>
                  <button className="hover:text-newTextColor transition-colors">
                    📎
                  </button>
                  <button className="hover:text-newTextColor transition-colors">
                    😀
                  </button>
                  <button className="hover:text-newTextColor transition-colors">
                    🎤
                  </button>
                </div>
                <span
                  className={
                    charCount > charLimit
                      ? 'text-customColor19'
                      : ''
                  }
                >
                  {charCount} / {charLimit} {t('saved', 'saved')} ✓
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-newTextColor text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={settings.longForm}
                onChange={(e) => updateSetting('longForm', e.target.checked)}
                className="accent-customColor26"
              />
              {t('long_form_post_enabled', 'Long form post enabled')}
            </label>

            <div className="flex flex-col gap-1">
              <label className="text-newTableText text-[11px] font-medium flex items-center gap-2">
                <span>📅</span>
                {t('schedule_for', 'Schedule for')}
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => {
                  setScheduledAt(e.target.value);
                  setUserTouchedDate(true);
                }}
                className="bg-newBgColor border border-newBorder rounded-lg px-3 py-2 text-sm text-newTextColor outline-none focus:border-newSep w-full"
              />
            </div>

            <div className="flex items-stretch gap-2 mt-1">
              {editingPost ? (
                <button
                  onClick={() => submitPost('queue')}
                  disabled={submitting}
                  className="flex-1 bg-btnPrimary hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? t('saving_dots', 'Saving…')
                    : t('save_changes', 'Save changes')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => submitPost('now')}
                    disabled={submitting}
                    className="flex-1 bg-newBgColor hover:bg-boxHover text-newTextColor text-sm font-semibold py-2.5 rounded-lg border border-newBorder transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? t('posting', 'Posting…')
                      : t('tweet_now', 'Tweet now')}
                  </button>
                  <button
                    onClick={() => submitPost('draft')}
                    disabled={submitting}
                    className="flex-1 bg-newBgColor hover:bg-boxHover text-newTextColor text-sm font-semibold py-2.5 rounded-lg border border-newBorder transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? t('saving_dots', 'Saving…')
                      : t('draft', 'Draft')}
                  </button>
                  <button
                    onClick={() => submitPost('queue')}
                    disabled={submitting}
                    className="flex-[2] bg-btnPrimary hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? t('queueing', 'Queueing…')
                      : t('add_to_queue', 'Add to Queue')}
                  </button>
                </>
              )}
            </div>

            <div className="text-right">
              <button
                onClick={() => router.push('/launches')}
                className="text-customColor26 text-xs hover:underline"
              >
                {t('edit_queue', 'Edit queue')}
              </button>
            </div>

            {/* Advanced Options */}
            <div className="border border-newBorder rounded-xl mt-2">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex flex-col items-start">
                  <span className="text-newTextColor text-sm font-semibold">
                    {t('advanced_options', 'Advanced Options')}
                  </span>
                  <span className="text-newTableText text-[11px]">
                    {t('enabled_label', 'enabled:')}{' '}
                    {[
                      settings.autoPlug && 'auto-plug',
                      settings.autoDm && 'auto-dm',
                      settings.autoRetweet && 'auto-retweet',
                      settings.threadDelay && 'thread-delay',
                      settings.linkedinPublish && 'linkedin',
                      settings.generateBlog && 'blog',
                      settings.paidPartnership && 'paid-partnership',
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </span>
                </div>
                <span className="text-newTableText text-sm">
                  {advancedOpen ? '▴' : '▾'}
                </span>
              </button>

              {advancedOpen && (
                <div className="border-t border-newBorder p-4 flex flex-col gap-1">
                  <div className="bg-customColor26/10 border border-customColor26/20 rounded-lg px-3 py-2 text-customColor26 text-xs flex items-center gap-2 mb-2">
                    <span>ⓘ</span>
                    {t(
                      'affect_only_this_tweet',
                      'These settings will affect this tweet only.'
                    )}
                  </div>

                  <SettingRow
                    icon="↻"
                    label={t('auto_retweet', 'Auto retweet')}
                    enabled={settings.autoRetweet}
                    onChange={(v) => updateSetting('autoRetweet', v)}
                  />

                  <SettingRow
                    icon="🔌"
                    label={t('auto_plug', 'Auto plug')}
                    enabled={settings.autoPlug}
                    onChange={(v) => updateSetting('autoPlug', v)}
                    trailing={
                      <div className="flex items-center gap-1 mr-1">
                        <input
                          type="number"
                          min={1}
                          value={settings.autoPlugLikes}
                          onChange={(e) =>
                            updateSetting(
                              'autoPlugLikes',
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-[44px] bg-newBgColor border border-newBorder rounded px-2 py-0.5 text-xs text-newTextColor text-center outline-none focus:border-newSep"
                        />
                        <span className="text-newTableText text-xs">
                          {t('likes', 'likes')}
                        </span>
                      </div>
                    }
                  />

                  {settings.autoPlug && (
                    <div className="ml-7 mb-2 mt-1 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={settings.plugProvider}
                          onChange={(e) =>
                            updateSetting('plugProvider', e.target.value)
                          }
                          className="bg-newBgColor border border-newBorder rounded-lg px-2 py-1 text-xs text-newTextColor outline-none"
                        >
                          <option value="discord">discord</option>
                          <option value="telegram">telegram</option>
                          <option value="newsletter">newsletter</option>
                          <option value="link">link</option>
                        </select>
                      </div>
                      <textarea
                        value={settings.plugMessage}
                        onChange={(e) =>
                          updateSetting('plugMessage', e.target.value)
                        }
                        className="w-full bg-newBgColor border border-newBorder rounded-lg px-3 py-2 text-xs text-newTextColor outline-none resize-none focus:border-newSep min-h-[70px]"
                      />
                    </div>
                  )}

                  <SettingRow
                    icon="✉"
                    label={t('auto_dm', 'Auto DM')}
                    enabled={settings.autoDm}
                    onChange={(v) => updateSetting('autoDm', v)}
                  />

                  <SettingRow
                    icon="⏱"
                    label={t('thread_delay', 'Thread Delay')}
                    enabled={settings.threadDelay}
                    onChange={(v) => updateSetting('threadDelay', v)}
                  />

                  <SettingRow
                    icon="in"
                    label={t('also_publish_linkedin', 'Also publish to Linkedin')}
                    enabled={settings.linkedinPublish}
                    onChange={(v) => updateSetting('linkedinPublish', v)}
                    hint={
                      <a
                        href="/integrations/social/linkedin"
                        className="text-customColor26 hover:underline"
                      >
                        {t('connect_taplio', 'Connect a Taplio account')}
                      </a>
                    }
                  />

                  <SettingRow
                    icon="📝"
                    label={t('generate_blog_post', 'Generate Blog Post')}
                    enabled={settings.generateBlog}
                    onChange={(v) => updateSetting('generateBlog', v)}
                  />

                  <SettingRow
                    icon="$"
                    label={t('paid_partnership', 'Paid partnership')}
                    enabled={settings.paidPartnership}
                    onChange={(v) => updateSetting('paidPartnership', v)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
