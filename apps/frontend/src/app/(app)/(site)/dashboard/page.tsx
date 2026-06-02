'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { expandPosts } from '@gitroom/helpers/utils/posts.list.minify';
import { getActiveXIntegrations } from '@gitroom/frontend/components/layout/x-integration.util';
import { XProfileMultiSelect } from '@gitroom/frontend/components/launches/x-profile-picker.component';
import dayjs from 'dayjs';
import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AttachExistingPostModalContent } from '@gitroom/frontend/components/dashboard/attach-existing-post.modal';
import {
  automationEnabledSummary,
  buildXPostSettings,
  composerSettingsFromXPost,
  ComposerSettings,
  DEFAULT_COMPOSER_SETTINGS,
  useComposerSettingsUpdater,
  XAutomationOptionsPanel,
} from '@gitroom/frontend/components/dashboard/dashboard-composer.shared';

const SETTINGS_STORAGE_KEY = 'dashboard-composer-settings';
const DRAFT_STORAGE_KEY = 'dashboard-composer-draft';

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
  dmsSent?: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  integration?: {
    id?: string;
    providerIdentifier?: string;
    name?: string;
  };
  releaseURL?: string;
  releaseId?: string;
};

/** Browser URL for uploaded media paths (full CDN URL, absolute /uploads, or filename). */
function mediaPreviewUrl(path: string, publicOrigin: string): string {
  const p = (path || '').trim();
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const base = (publicOrigin || '').replace(/\/$/, '');
  if (p.startsWith('/uploads/')) return base ? `${base}${p}` : p;
  if (p.startsWith('/')) return base ? `${base}${p}` : p;
  return base ? `${base}/uploads/${p}` : `/uploads/${p}`;
}

/** Strip simple HTML tags so queue cards show plain text (e.g. no literal `<p>`). */
function stripHtmlForPreview(text: string) {
  return (text || '').replace(/<[^>]*>/g, '').trim();
}

/** Label + style for queue card status (scheduled / published / draft).
 *  Tailwind `darkMode: 'class'` — pale (-200) text on light backgrounds is
 *  invisible, so use a darker shade for light mode and override with the
 *  pale shade under `dark:`. */
function postQueueStatus(
  state: string,
  t: ReturnType<typeof useT>
): { label: string; className: string } {
  switch (state) {
    case 'QUEUE':
      return {
        label: t('status_scheduled', 'Scheduled'),
        className:
          'bg-sky-500/20 text-sky-800 border border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-400/25',
      };
    case 'PUBLISHED':
      return {
        label: t('status_published', 'Published'),
        className:
          'bg-emerald-500/20 text-emerald-800 border border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/25',
      };
    case 'DRAFT':
      return {
        label: t('status_draft', 'Draft'),
        className:
          'bg-amber-500/25 text-amber-800 border border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/25',
      };
    default:
      return {
        label: state,
        className:
          'bg-newBgLineColor/50 text-newTableText border border-newBorder',
      };
  }
}

/** In-flight "Tweet now": still QUEUE in API until the worker finishes — show Publishing, not Scheduled. */
function queueCardStatus(
  post: PostItem,
  pendingPublishPostId: string | null,
  pendingPublishFingerprint: string | null,
  t: ReturnType<typeof useT>
): { label: string; className: string } {
  const publishingBadge = {
    label: t('status_publishing', 'Publishing'),
    className:
      'bg-violet-500/20 text-violet-800 border border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-400/30',
  } as const;

  if (post.state !== 'QUEUE') {
    return postQueueStatus(post.state, t);
  }

  const isX =
    post.integration?.providerIdentifier &&
    ['x', 'twitter'].includes(
      post.integration.providerIdentifier.toLowerCase()
    );
  if (!isX) {
    return postQueueStatus(post.state, t);
  }

  if (pendingPublishPostId && pendingPublishPostId === post.id) {
    return publishingBadge;
  }

  if (pendingPublishFingerprint) {
    const postFp = stripHtmlForPreview(post.content || '').toLowerCase();
    if (postFp === pendingPublishFingerprint) {
      const publishUtc = dayjs.utc(post.publishDate);
      const recentEnough = publishUtc.isAfter(dayjs.utc().subtract(6, 'minute'));
      if (recentEnough) {
        return publishingBadge;
      }
    }
  }

  return postQueueStatus(post.state, t);
}

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
      // Poll every 10s so newly-published posts move from Scheduled → Sent
      // without the user having to refresh the page. The backend transitions
      // state QUEUE → PUBLISHED asynchronously after the orchestrator worker
      // actually pushes the tweet, so a one-shot mutate() right after the
      // POST /posts call would only show it as QUEUE.
      refreshInterval: 10_000,
      revalidateOnFocus: true,
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
  const pathname = usePathname();
  const queuePageTitle = useMemo(
    () =>
      pathname?.startsWith('/dashboard/tweet-automations')
        ? t('tweet_automations', 'Tweet Automations')
        : t('queue', 'Queue'),
    [pathname, t]
  );
  const toast = useToaster();
  const { frontEndUrl, mainUrl } = useVariables();
  const mediaOrigin = useMemo(
    () => (frontEndUrl || mainUrl || '').replace(/\/$/, ''),
    [frontEndUrl, mainUrl]
  );
  const [activeTab, setActiveTab] = useState<
    'Compose' | 'Drafts' | 'Scheduled' | 'Sent'
  >('Compose');
  const [publishOverlay, setPublishOverlay] = useState<
    null | 'publishing' | 'published' | 'updated'
  >(null);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  // Toggle for the right-side composer panel. On lg+ screens the user can
  // collapse the panel to give the queue full width; a small re-open button
  // appears on the right edge so they can bring it back.
  const [composerCollapsed, setComposerCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      if (!mq.matches) {
        setComposerCollapsed(true);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [settings, setSettings] = useState<ComposerSettings>(
    DEFAULT_COMPOSER_SETTINGS
  );
  const modal = useModals();
  const [composerText, setComposerText] = useState('');
  const [hydrated, setHydrated] = useState(false);
  // Attached media (images/videos) for the current draft. Each entry has the
  // `id` (Media row id) and server-relative `path` returned by
  // /media/upload-simple. Submitted as `image: [...]` on the first tweet of
  // the post. The backend MediaDto requires BOTH `id` and `path` — sending
  // only `path` produced the "image.0.id should not be null or undefined"
  // validation error.
  const [attachedMedia, setAttachedMedia] = useState<
    Array<{ id: string; path: string; name: string; isUploading?: boolean }>
  >([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Queue spacing: minutes between consecutive queued posts (when "Add to
  // Queue" is used). Falls back to /posts/find-slot when 0 or null.
  const [queueSpacingMinutes, setQueueSpacingMinutes] = useState<number>(0);

  // Hydrate persisted settings + draft from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULT_COMPOSER_SETTINGS, ...parsed, longForm: true });
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
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...settings, longForm: true })
    );
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(DRAFT_STORAGE_KEY, composerText);
  }, [composerText, hydrated]);

  const updateSetting = useComposerSettingsUpdater(setSettings);

  // Home: fetch posts from today back through the prior 10 days (11 calendar days).
  const startDate = useMemo(
    () => newDayjs().subtract(10, 'day').format('YYYY-MM-DD'),
    []
  );
  const endDate = useMemo(() => newDayjs().format('YYYY-MM-DD'), []);

  const fetch = useFetch();
  const {
    data: postsData,
    isLoading: loadingPosts,
    mutate: mutatePosts,
  } = useDashboardPosts(startDate, endDate);
  const { data: nextSlotIso, mutate: mutateNextSlot } = useNextSlot();
  const { data: integrations = [] } = useIntegrations();
  const [submitting, setSubmitting] = useState(false);
  /** Which composer action is in flight — avoids every action button showing "…" at once. */
  const [activeSubmitMode, setActiveSubmitMode] = useState<
    null | 'now' | 'draft' | 'queue'
  >(null);
  /** After "Tweet now", match QUEUE row by id and/or first-tweet text until X confirms. */
  const [pendingPublishPostId, setPendingPublishPostId] = useState<
    string | null
  >(null);
  const [pendingPublishFingerprint, setPendingPublishFingerprint] = useState<
    string | null
  >(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
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

  /** "Publishing now" overlay: show ~3s then dismiss if the job is still running (poll can take longer). */
  useEffect(() => {
    if (publishOverlay !== 'publishing') return;
    const dismissMs = 3000;
    const id = window.setTimeout(() => {
      setPublishOverlay((cur) => (cur === 'publishing' ? null : cur));
    }, dismissMs);
    return () => window.clearTimeout(id);
  }, [publishOverlay]);

  const xIntegrations = useMemo(
    () => getActiveXIntegrations(integrations),
    [integrations]
  );

  const [selectedXProfileIds, setSelectedXProfileIds] = useState<string[]>([]);

  useEffect(() => {
    if (!xIntegrations.length || editingPost) {
      return;
    }
    setSelectedXProfileIds((prev) => {
      const valid = prev.filter((id) =>
        xIntegrations.some((x) => x.id === id)
      );
      if (valid.length) {
        return valid;
      }
      return xIntegrations.map((x) => x.id);
    });
  }, [xIntegrations, editingPost]);

  const allPosts: PostItem[] = postsData?.posts || [];

  const filteredPosts = useMemo(
    () =>
      allPosts.filter(
        (p) =>
          p.state === 'QUEUE' ||
          p.state === 'PUBLISHED' ||
          p.state === 'DRAFT'
      ),
    [allPosts]
  );

  // One queue: today then each of the 10 days before it; newest first within each day.
  const days = useMemo(() => {
    const today = newDayjs().startOf('day');
    const PAST_DAYS = 10;
    const dayOffsets = [
      0,
      ...Array.from({ length: PAST_DAYS }, (_, i) => -(i + 1)),
    ];

    return dayOffsets.map((offset) => {
      const d = today.add(offset, 'day');
      const isoDate = d.format('YYYY-MM-DD');
      const label =
        offset === -1
          ? t('yesterday', 'Yesterday')
          : offset === 0
          ? t('today', 'Today')
          : d.format('dddd');
      const dayPosts = filteredPosts
        .filter((p) =>
          dayjs.utc(p.publishDate).local().isSame(d, 'day')
        )
        .sort(
          (a, b) =>
            dayjs.utc(b.publishDate).valueOf() -
            dayjs.utc(a.publishDate).valueOf()
        );
      return { isoDate, label, monthDay: d.format('MMM DD'), posts: dayPosts };
    });
  }, [filteredPosts, t]);

  const charCount = composerText.length;
  const charLimit = 25000;

  const submitPost = useCallback(
    async (mode: 'queue' | 'now' | 'draft') => {
      if (!composerText.trim()) {
        toast.show(
          t('nothing_to_post', 'Write something before posting'),
          'warning'
        );
        return;
      }
      const targetIntegrationIds = editingPost?.integration?.id
        ? [editingPost.integration.id]
        : selectedXProfileIds.filter((id) =>
            xIntegrations.some((x) => x.id === id)
          );

      if (!targetIntegrationIds.length) {
        toast.show(
          t(
            'connect_x_first',
            'Connect your X account and select at least one profile to publish from the queue'
          ),
          'warning'
        );
        return;
      }
      if (submitting) return;
      setSubmitting(true);
      setActiveSubmitMode(mode);
      if (mode === 'now') {
        const earlyThread = composerText
          .split(/\n\s*\n\s*\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const firstTweet = earlyThread[0] || composerText;
        setPendingPublishFingerprint(
          stripHtmlForPreview(firstTweet).toLowerCase()
        );
        setPendingPublishPostId(null);
        setPublishOverlay('publishing');
      } else {
        setPendingPublishFingerprint(null);
      }
      try {
        const isEditing = !!editingPost;
        // For "now" we always use current time; for drafts/queue we use the
        // user's chosen datetime, falling back to next slot, then +1h.
        let date: string;
        if (mode === 'now') {
          date = newDayjs().utc().format('YYYY-MM-DDTHH:mm:ss');
        } else if (
          !isEditing &&
          mode === 'queue' &&
          queueSpacingMinutes > 0
        ) {
          // Queue spacing must win over the default `scheduledAt` from next
          // slot; otherwise spacing never applied. Baseline: latest QUEUE time
          // if still in the future, else now (UTC vs UTC).
          const nowUtc = dayjs.utc();
          const lastScheduled = allPosts
            .filter((p) => p.state === 'QUEUE')
            .map((p) => dayjs.utc(p.publishDate))
            .sort((a, b) => b.valueOf() - a.valueOf())[0];
          const baseline =
            lastScheduled && lastScheduled.isAfter(nowUtc)
              ? lastScheduled
              : nowUtc;
          date = baseline
            .add(queueSpacingMinutes, 'minute')
            .format('YYYY-MM-DDTHH:mm:ss');
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
        // Attach images only to the FIRST tweet of a thread — that's the X
        // convention. uploaded `path` values come back from /media/upload-simple.
        // The backend DTO (MediaDto) requires BOTH `id` AND `path`, so we
        // forward both.
        const firstTweetImages = attachedMedia
          .filter((m) => !m.isUploading && m.id && m.path)
          .map((m) => ({ id: m.id, path: m.path }));
        const values = (threadParts.length ? threadParts : [composerText]).map(
          (content, idx) => ({
            content,
            delay: idx === 0 ? 0 : settings.threadDelay ? 60 : 0,
            image: idx === 0 ? firstTweetImages : [],
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

        const xPostSettings = buildXPostSettings(settings);

        const payload = {
          type,
          shortLink: false,
          date,
          tags: [] as string[],
          posts: targetIntegrationIds.map((integrationId) => ({
            integration: { id: integrationId },
            group: isEditing ? editingPost!.group || '' : '',
            settings: xPostSettings,
            value: values,
          })),
        };

        const res = await fetch('/posts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          if (mode === 'now') {
            setPublishOverlay(null);
            setPendingPublishPostId(null);
            setPendingPublishFingerprint(null);
          }
          toast.show(
            errText || t('post_failed', 'Could not create the post'),
            'warning'
          );
          return;
        }

        if (mode === 'now') {
          const postedBody = await res.json().catch((): null => null);
          const postedId =
            editingPost?.id ||
            postedBody?.id ||
            postedBody?.postId ||
            postedBody?.posts?.[0]?.id ||
            postedBody?.posts?.[0]?.postId ||
            null;
          if (postedId) setPendingPublishPostId(postedId);
          const targetPreview = stripHtmlForPreview(values[0]?.content || '').toLowerCase();
          const startedAt = Date.now();
          const maxWaitMs = 120000;
          let published = false;

          while (!published && Date.now() - startedAt < maxWaitMs) {
            const params = new URLSearchParams({
              display: 'week',
              startDate: newDayjs(startDate).startOf('day').utc().format(),
              endDate: newDayjs(endDate).endOf('day').utc().format(),
              customer: '',
            });
            const checkRes = await fetch(`/posts?${params.toString()}`);
            if (checkRes.ok) {
              const latest =
                (expandPosts(await checkRes.json()) as { posts: PostItem[] })?.posts || [];
              const matched = latest.find((p) => {
                if (postedId) return p.id === postedId;
                const sameContent =
                  stripHtmlForPreview(p.content || '').toLowerCase() === targetPreview;
                return (
                  sameContent &&
                  p.integration?.providerIdentifier &&
                  ['x', 'twitter'].includes(
                    (p.integration.providerIdentifier || '').toLowerCase()
                  )
                );
              });
              if (matched?.state === 'PUBLISHED') {
                published = true;
                setPendingPublishPostId(null);
                setPendingPublishFingerprint(null);
                setPublishOverlay(isEditing ? 'updated' : 'published');
                window.setTimeout(() => setPublishOverlay(null), 2800);
              }
              await mutatePosts();
            }
            if (!published) {
              await new Promise((r) => setTimeout(r, 2000));
            }
          }

          if (!published) {
            setPublishOverlay(null);
            setPendingPublishPostId(null);
            setPendingPublishFingerprint(null);
            toast.show(
              t(
                'still_publishing_to_x',
                'Still publishing to X. It will show as published once X confirms it.'
              )
            );
          }
        }

        if (isEditing && mode !== 'now') {
          toast.show(t('post_updated', 'Post updated'));
        } else if (mode !== 'now') {
          toast.show(
            mode === 'draft'
              ? t('saved_as_draft', 'Saved as draft')
              : t('added_to_queue', 'Added to queue')
          );
        }
        setComposerText('');
        setEditingPost(null);
        setUserTouchedDate(false);
        setAttachedMedia([]); // clear attached images after successful submit
        await Promise.all([mutatePosts(), mutateNextSlot()]);
      } catch (err: any) {
        if (mode === 'now') {
          setPublishOverlay(null);
          setPendingPublishPostId(null);
          setPendingPublishFingerprint(null);
        }
        toast.show(
          err?.message || t('post_failed', 'Could not create the post'),
          'warning'
        );
      } finally {
        setSubmitting(false);
        setActiveSubmitMode(null);
      }
    },
    [
      composerText,
      settings,
      toast,
      t,
      xIntegrations,
      selectedXProfileIds,
      submitting,
      startDate,
      endDate,
      nextSlotIso,
      scheduledAt,
      editingPost,
      fetch,
      mutatePosts,
      mutateNextSlot,
      attachedMedia,
      allPosts,
      queueSpacingMinutes,
    ]
  );

  // Upload a single File via /media/upload-simple. Returns the server path
  // that goes into the post's `image` array. The optimistic placeholder is
  // tracked via attachedMedia[].isUploading so the UI shows progress. We
  // capture BOTH the persisted media `id` and `path` because the backend
  // MediaDto requires both — submitting with only `path` causes a
  // "image.0.id should not be null or undefined" 400 from /posts.
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      const placeholder = {
        id: '',
        path: '',
        name: file.name || 'image',
        isUploading: true,
      };
      setAttachedMedia((prev) => [...prev, placeholder]);
      try {
        const fd = new FormData();
        fd.append('file', file, file.name || 'paste.png');
        const res = await fetch('/media/upload-simple', {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          throw new Error(await res.text().catch(() => 'upload failed'));
        }
        const data = await res.json();
        const path: string | undefined = data?.path;
        const id: string | undefined = data?.id;
        if (!path) throw new Error('no path in upload response');
        if (!id) throw new Error('no id in upload response');
        setAttachedMedia((prev) =>
          prev.map((m) =>
            m === placeholder ? { id, path, name: placeholder.name } : m
          )
        );
        return path;
      } catch (err: any) {
        toast.show(
          err?.message || t('upload_failed', 'Image upload failed'),
          'warning'
        );
        setAttachedMedia((prev) => prev.filter((m) => m !== placeholder));
        return null;
      }
    },
    [fetch, toast, t]
  );

  // Paste handler: when the user pastes content into the composer, look for
  // image items in the clipboard and upload each one. Text pastes pass
  // through to the textarea unchanged.
  const handleComposerPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length === 0) return; // text paste — let default behavior run
      e.preventDefault();
      // Upload sequentially so we don't slam the server
      for (const file of images) {
        await uploadFile(file);
      }
    },
    [uploadFile]
  );

  // File picker handler: <input type="file"> change event uploads each file.
  const handleFilePicker = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      // reset so the same file can be re-selected later
      e.target.value = '';
      for (const file of files) {
        await uploadFile(file);
      }
    },
    [uploadFile]
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachedMedia((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Insert a string at the current cursor position in the composer textarea.
  // Used by the emoji popover.
  const insertAtCursor = useCallback((text: string) => {
    setComposerText((prev) => {
      const ta = composerTextareaRef.current;
      if (!ta) return prev + text;
      const start = ta.selectionStart ?? prev.length;
      const end = ta.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + text + prev.slice(end);
      // restore caret position after React re-renders
      requestAnimationFrame(() => {
        if (composerTextareaRef.current) {
          composerTextareaRef.current.selectionStart = start + text.length;
          composerTextareaRef.current.selectionEnd = start + text.length;
          composerTextareaRef.current.focus();
        }
      });
      return next;
    });
  }, []);

  const startEdit = useCallback(
    (post: PostItem) => {
      setEditingPost(post);
      setComposerText(post.content);
      setUserTouchedDate(false);
      if (post.integration?.id) {
        setSelectedXProfileIds([post.integration.id]);
      }
      void (async () => {
        try {
          const res = await fetch(`/posts/${encodeURIComponent(post.id)}`);
          if (!res.ok) {
            return;
          }
          const data = await res.json();
          let parsed: unknown = data?.settings;
          if (typeof parsed === 'string') {
            try {
              parsed = JSON.parse(parsed);
            } catch {
              parsed = undefined;
            }
          }
          if (parsed) {
            setSettings((prev) => composerSettingsFromXPost(parsed, prev));
          }
        } catch {
          /* keep current composer settings */
        }
      })();
    },
    [fetch]
  );

  const openAttachExistingPostModal = useCallback(() => {
    const defaultProfileId =
      selectedXProfileIds.length === 1 ? selectedXProfileIds[0] : undefined;

    modal.openModal({
      id: 'attach-existing-post-modal',
      removeLayout: true,
      closeOnClickOutside: true,
      closeOnEscape: true,
      size: 560,
      children: (close) => (
        <AttachExistingPostModalContent
          close={close}
          xIntegrations={xIntegrations as any}
          initialSettings={settings}
          defaultProfileId={defaultProfileId}
          onSuccess={() => {
            void mutatePosts();
            setActiveTab('Sent');
          }}
        />
      ),
    });
  }, [
    modal,
    xIntegrations,
    settings,
    selectedXProfileIds,
    mutatePosts,
  ]);

  const cancelEdit = useCallback(() => {
    setEditingPost(null);
    setComposerText('');
    setUserTouchedDate(false);
  }, []);

  const handleDeletePost = useCallback(
    async (post: PostItem) => {
      const group = post.group?.trim();
      if (!group) {
        toast.show(
          t('cannot_delete_post', 'This post cannot be deleted from here.'),
          'warning'
        );
        return;
      }
      const confirmed = await deleteDialog(
        t('confirm_delete_post', 'Delete this post? This cannot be undone.'),
        t('yes_delete_it', 'Yes, delete it!'),
        t('delete_post', 'Delete post'),
        t('no_cancel', 'No, cancel!')
      );
      if (!confirmed) {
        return;
      }
      setDeletingPostId(post.id);
      try {
        const res = await fetch(`/posts/${encodeURIComponent(group)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          toast.show(
            errText || t('delete_post_failed', 'Could not delete the post'),
            'warning'
          );
          return;
        }
        if (editingPost?.id === post.id) {
          cancelEdit();
        }
        toast.show(t('post_deleted', 'Post deleted'));
        await Promise.all([mutatePosts(), mutateNextSlot()]);
      } catch (err: any) {
        toast.show(
          err?.message || t('delete_post_failed', 'Could not delete the post'),
          'warning'
        );
      } finally {
        setDeletingPostId(null);
      }
    },
    [toast, t, editingPost, cancelEdit, mutatePosts, mutateNextSlot]
  );

  return (
    <div className="flex flex-1 min-h-0 bg-newBgColor text-newTextColor flex-col w-full">
      {/* AI settings banner removed per request — keep this comment so the
          area is easy to re-introduce later if needed. */}

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row w-full">
        {/* Left Section: Queue */}
        <div
          className={clsx(
            'flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-newBorder custom-scrollbar',
            composerCollapsed && 'pb-[76px] lg:pb-0'
          )}
        >
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-newTextColor mb-4">
              {queuePageTitle}
            </h1>

            {!loadingPosts && filteredPosts.length === 0 && (
              <div className="bg-customColor19/10 border border-customColor19/30 rounded-lg px-4 py-2.5 flex items-center gap-2 mb-5">
                <span className="text-customColor19 text-sm">⚠</span>
                <span className="text-newTextColor text-sm">
                  {t(
                    'no_posts_in_queue_range',
                    'No scheduled, published, or draft posts in the last 10 days and today yet.'
                  )}
                </span>
              </div>
            )}

            <p className="text-[13px] text-newTableText max-w-[min(100%,52ch)] leading-snug mb-1">
              {t(
                'queue_unified_subtitle',
                'Posts from today and the last 10 days — each row shows Scheduled, Published, or Draft.'
              )}
            </p>
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
                      <p className="text-newTableText text-xs py-1 px-1">
                        {t('queue_day_no_posts', 'No posts on this day.')}
                      </p>
                    ) : (
                      day.posts.map((post) => {
                        const localTime = dayjs
                          .utc(post.publishDate)
                          .local()
                          .format('hh:mm a');
                        const dmsSent = post.dmsSent ?? 0;
                        const isBeingEdited = editingPost?.id === post.id;
                        const st = queueCardStatus(
                          post,
                          pendingPublishPostId,
                          pendingPublishFingerprint,
                          t
                        );
                        const isXPost =
                          post.integration?.providerIdentifier &&
                          ['x', 'twitter'].includes(
                            post.integration.providerIdentifier.toLowerCase()
                          );
                        const showEngagement =
                          isXPost && post.state === 'PUBLISHED';
                        return (
                          <div
                            key={post.id}
                            className={`bg-newBgColorInner border rounded-xl px-4 py-3.5 shadow-sm transition-all ${
                              isBeingEdited
                                ? 'border-customColor26 ring-1 ring-customColor26/20'
                                : 'border-newBorder hover:border-newSep'
                            }`}
                          >
                            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 sm:grid-cols-[88px_1fr] sm:gap-x-4 sm:gap-y-0">
                              <div className="col-start-1 row-start-1 flex flex-col gap-1.5 w-auto min-w-[72px] sm:w-[88px] sm:min-w-0 flex-shrink-0 pt-0.5">
                                <span
                                  className={`inline-flex w-fit max-w-full rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.className}`}
                                >
                                  {st.label}
                                </span>
                                <span className="text-newTextColor text-sm font-medium tabular-nums">
                                  {localTime}
                                </span>
                              </div>
                              <div className="col-start-2 row-start-1 min-w-0 self-start">
                                <p className="text-newTextColor text-sm whitespace-pre-wrap break-words mb-0 sm:mb-2">
                                  {stripHtmlForPreview(post.content)}
                                </p>
                                <div className="mt-2 hidden flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-newTableText sm:mt-0 sm:flex">
                                  {showEngagement && (
                                    <>
                                      <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5">
                                        ♥ {post.likeCount ?? 0}{' '}
                                        {t('likes', 'Likes')}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5">
                                        🔁 {post.retweetCount ?? 0}{' '}
                                        {t('retweets', 'Retweets')}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5">
                                        💬 {post.replyCount ?? 0}{' '}
                                        {t('replies', 'Replies')}
                                      </span>
                                      <span
                                        className="text-newBorder/80 hidden sm:inline"
                                        aria-hidden
                                      >
                                        ·
                                      </span>
                                    </>
                                  )}
                                  <span
                                    className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5"
                                    title={t(
                                      'queue_auto_dms_hint',
                                      'Recipients TweetMax recorded after a successful auto-DM for this tweet (same as engager plug dedup). X may show fewer threads in your inbox.'
                                    )}
                                  >
                                    ✉ {dmsSent}{' '}
                                    {t('queue_auto_dms_sent', 'Auto-DMs sent')}
                                  </span>
                                  {post.integration?.providerIdentifier && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5 capitalize">
                                      {post.integration.providerIdentifier}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-newBorder/40 pt-2.5 text-[11px] leading-snug text-newTableText sm:hidden">
                                {showEngagement && (
                                  <>
                                    <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5">
                                      ♥ {post.likeCount ?? 0}{' '}
                                      {t('likes', 'Likes')}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5">
                                      🔁 {post.retweetCount ?? 0}{' '}
                                      {t('retweets', 'Retweets')}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5">
                                      💬 {post.replyCount ?? 0}{' '}
                                      {t('replies', 'Replies')}
                                    </span>
                                    <span className="text-newBorder/80" aria-hidden>
                                      ·
                                    </span>
                                  </>
                                )}
                                <span
                                  className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5"
                                  title={t(
                                    'queue_auto_dms_hint',
                                    'Recipients TweetMax recorded after a successful auto-DM for this tweet (same as engager plug dedup). X may show fewer threads in your inbox.'
                                  )}
                                >
                                  ✉ {dmsSent}{' '}
                                  {t('queue_auto_dms_sent', 'Auto-DMs sent')}
                                </span>
                                {post.integration?.providerIdentifier && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-newBgColor/50 px-1.5 py-0.5 capitalize">
                                    {post.integration.providerIdentifier}
                                  </span>
                                )}
                              </div>
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

        {/* Desktop: collapsed composer re-open tab */}
        {composerCollapsed && (
          <button
            type="button"
            onClick={() => setComposerCollapsed(false)}
            title={t('expand_composer', 'Show composer')}
            aria-label={t('expand_composer', 'Show composer')}
            className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-7 h-12 rounded-l-md bg-newBgColorInner border border-r-0 border-newBorder text-newTableText hover:text-newTextColor hover:bg-boxHover transition-colors"
          >
            ⇤
          </button>
        )}

        {/* Mobile: sticky collapsed composer bar */}
        {composerCollapsed && (
          <button
            type="button"
            onClick={() => setComposerCollapsed(false)}
            title={t('expand_composer', 'Show composer')}
            aria-label={t('expand_composer', 'Show composer')}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-newBgColorInner border-t border-newBorder shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
          >
            <span className="text-sm font-semibold text-newTextColor">
              {activeTab === 'Compose'
                ? t('compose', 'Compose')
                : activeTab}
            </span>
            <span className="text-xs text-customColor26 font-medium">
              {t('tap_to_expand', 'Tap to expand')} ↑
            </span>
          </button>
        )}

        {/* Mobile: backdrop when composer sheet is open */}
        {!composerCollapsed && (
          <button
            type="button"
            aria-label={t('collapse_composer', 'Hide composer')}
            className="lg:hidden fixed inset-x-0 top-[80px] bottom-0 z-30 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setComposerCollapsed(true)}
          />
        )}

        {/* Right Section: Composer */}
        <div
          className={clsx(
            'flex-col bg-newBgColorInner border-newBorder overflow-y-auto custom-scrollbar flex',
            composerCollapsed ? 'hidden' : 'flex',
            'fixed inset-x-0 top-[80px] bottom-0 z-40 max-h-[calc(100dvh-80px)] border-t shadow-[0_-12px_40px_rgba(0,0,0,0.4)]',
            'lg:relative lg:inset-auto lg:bottom-auto lg:z-auto lg:max-h-none lg:w-[420px] lg:flex-shrink-0 lg:border-t-0 lg:border-l lg:shadow-none'
          )}
        >
          <div className="p-3 border-b border-newBorder flex justify-between items-center gap-1 shrink-0">
            <span className="lg:hidden text-sm font-semibold text-newTextColor">
              {t('composer', 'Composer')}
            </span>
            <button
              type="button"
              onClick={() => setComposerCollapsed(true)}
              title={t('collapse_composer', 'Hide composer')}
              aria-label={t('collapse_composer', 'Hide composer')}
              className="p-2 hover:bg-boxHover rounded-lg text-newTableText hover:text-newTextColor transition-colors ml-auto"
            >
              <span className="lg:hidden text-xs font-medium">
                {t('collapse', 'Collapse')} ↓
              </span>
              <span className="hidden lg:inline">⇥</span>
            </button>
          </div>

          <div className="border-b border-newBorder px-4 py-2.5 shrink-0">
            <button
              type="button"
              onClick={openAttachExistingPostModal}
              disabled={xIntegrations.length === 0}
              className="w-full py-2 rounded-lg text-sm font-medium border border-customColor26/50 text-customColor26 hover:bg-customColor26/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('automate_existing_post', 'Automate existing post')}…
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

          {/* When the active tab is not 'Compose', render a list of posts in
              the matching state instead of the composer. The composer state
              (text, attachments, settings) is preserved while the user
              browses other tabs. */}
          {activeTab !== 'Compose' ? (
            <div className="p-4 flex flex-col gap-2">
              {(() => {
                const tabState =
                  activeTab === 'Sent'
                    ? 'PUBLISHED'
                    : activeTab === 'Scheduled'
                    ? 'QUEUE'
                    : 'DRAFT';
                const tabPosts = allPosts
                  .filter((p) => p.state === tabState)
                  .sort(
                    (a, b) =>
                      dayjs.utc(b.publishDate).valueOf() -
                      dayjs.utc(a.publishDate).valueOf()
                  );
                if (tabPosts.length === 0) {
                  return (
                    <div className="text-newTableText text-xs py-8 text-center">
                      {activeTab === 'Sent'
                        ? t('no_sent_yet', 'No sent tweets yet')
                        : activeTab === 'Scheduled'
                        ? t('no_scheduled_yet', 'No scheduled tweets yet')
                        : t('no_drafts_yet', 'No drafts yet')}
                    </div>
                  );
                }
                return tabPosts.map((p) => (
                  <div
                    key={p.id}
                    className="bg-newBgColor border border-newBorder rounded-lg p-3 hover:bg-boxHover transition-colors"
                  >
                    <div className="text-newTextColor text-[13px] whitespace-pre-wrap line-clamp-4">
                      {stripHtmlForPreview(p.content)}
                    </div>
                    <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                      <span className="text-newTableText text-[10px]">
                        {dayjs
                          .utc(p.publishDate)
                          .local()
                          .format('MMM D, YYYY · h:mm A')}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {p.group && (
                          <button
                            type="button"
                            onClick={() => handleDeletePost(p)}
                            disabled={deletingPostId === p.id}
                            className="text-red-400/90 text-[10px] hover:underline disabled:opacity-50"
                          >
                            {deletingPostId === p.id
                              ? t('deleting', 'Deleting…')
                              : t('delete', 'Delete')}
                          </button>
                        )}
                        {activeTab === 'Sent' && (p as any).releaseURL && (
                          <a
                            href={(p as any).releaseURL}
                            target="_blank"
                            rel="noreferrer"
                            className="text-customColor26 text-[10px] hover:underline"
                          >
                            {t('view_on_x', 'View on X')} ↗
                          </a>
                        )}
                        {activeTab === 'Scheduled' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('Compose');
                              startEdit(p);
                            }}
                            className="text-customColor26 text-[10px] hover:underline"
                          >
                            {t('edit', 'Edit')}
                          </button>
                        )}
                        {activeTab === 'Drafts' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('Compose');
                              setComposerText(p.content);
                            }}
                            className="text-customColor26 text-[10px] hover:underline"
                          >
                            {t('open', 'Open')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
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

            <h3 className="text-newTextColor font-semibold text-sm">
              {editingPost
                ? t('editing', 'Editing')
                : t('your_content', 'Your content')}
            </h3>

            {xIntegrations.length > 0 && (
              <XProfileMultiSelect
                integrations={xIntegrations as any}
                selectedIds={selectedXProfileIds}
                onChange={setSelectedXProfileIds}
                disabled={!!editingPost}
                compact
              />
            )}

            <div className="bg-newBgColor border border-newBorder rounded-xl p-4 relative focus-within:border-newSep transition-all min-h-[180px] flex flex-col">
              <textarea
                ref={composerTextareaRef}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onPaste={handleComposerPaste}
                className="w-full flex-1 min-h-[150px] bg-transparent border-none outline-none text-newTextColor resize-none placeholder:text-newTableText text-[15px]"
                placeholder={t(
                  'write_here',
                  'Write here.\n\nSkip 3 lines to start a thread.\nPaste an image directly to attach it.'
                )}
              />

              {/* Attached image previews. Rendered BELOW the textarea (not
                  overlapping it) — the wrapper uses flex-col and the
                  textarea is flex-1 so it never grows over the previews. */}
              {attachedMedia.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 flex-shrink-0">
                  {attachedMedia.map((m, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-newBorder bg-newBgColorInner flex-shrink-0"
                    >
                      {m.isUploading ? (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-newTableText">
                          {t('uploading', 'Uploading…')}
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaPreviewUrl(m.path, mediaOrigin)}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.dataset.fallback === '1') return;
                            target.dataset.fallback = '1';
                            target.src = m.path.startsWith('http')
                              ? m.path
                              : m.path.startsWith('/')
                              ? m.path
                              : `/uploads/${m.path}`;
                          }}
                        />
                      )}
                      {!m.isUploading && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-black"
                          title={t('remove', 'Remove')}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-3 text-[11px] text-newTableText flex-shrink-0">
                <div className="flex items-center gap-3 relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="hover:text-newTextColor transition-colors"
                    title={t('attach_image', 'Attach image')}
                  >
                    📎
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    className="hover:text-newTextColor transition-colors"
                    title={t('insert_emoji', 'Insert emoji')}
                  >
                    😀
                  </button>
                  {emojiOpen && (
                    <div className="absolute bottom-6 left-0 z-10 bg-newBgColorInner border border-newBorder rounded-lg p-2 grid grid-cols-8 gap-1 shadow-lg w-[280px]">
                      {[
                        '😀','😂','🤣','😍','😎','🥳','🤔','😢',
                        '👍','👎','❤️','🔥','💯','✨','🎉','🚀',
                        '👏','🙏','💪','🤝','✅','❌','⭐','💡',
                        '☕','🍕','🍔','🎯','📌','📊','📈','💰',
                      ].map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            insertAtCursor(e);
                            setEmojiOpen(false);
                          }}
                          className="text-lg hover:bg-boxHover rounded p-1"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFilePicker}
                    className="hidden"
                  />
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

            {/* Hidden per request — kept so it can be re-enabled later.
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
            */}

            <div className="flex flex-wrap items-stretch gap-2 mt-1">
              {editingPost ? (
                <button
                  onClick={() => submitPost('queue')}
                  disabled={submitting}
                  className="flex-1 bg-btnPrimary hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && activeSubmitMode === 'queue'
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
                    {!submitting || activeSubmitMode !== 'now'
                      ? t('tweet_now', 'Tweet now')
                      : t('publishing_now', 'Publishing now...')}
                  </button>
                  <button
                    type="button"
                    onClick={() => submitPost('draft')}
                    disabled={submitting}
                    className="flex-1 bg-newBgColor hover:bg-boxHover text-newTextColor text-sm font-semibold py-2.5 rounded-lg border border-newBorder transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting && activeSubmitMode === 'draft'
                      ? t('saving_dots', 'Saving…')
                      : t('save_draft', 'Save draft')}
                  </button>
                  <button
                    onClick={() => submitPost('queue')}
                    disabled={submitting}
                    className="flex-[2] bg-btnPrimary hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting && activeSubmitMode === 'queue'
                      ? t('queueing', 'Queueing…')
                      : t('add_to_queue', 'Add to Queue')}
                  </button>
                </>
              )}
            </div>

            {/* Queue spacing — when set > 0, "Add to Queue" ignores the
                schedule picker and places this post N minutes after the latest
                future scheduled slot (or N min from now if the queue is empty).
                0 = use the datetime above / next slot. */}
            {!editingPost && (
              <div className="flex items-center justify-between gap-2 text-newTableText text-[11px] mt-1">
                <span>{t('queue_spacing', 'Queue spacing')}</span>
                <select
                  value={queueSpacingMinutes}
                  onChange={(e) =>
                    setQueueSpacingMinutes(parseInt(e.target.value) || 0)
                  }
                  className="bg-newBgColor border border-newBorder rounded-lg px-2 py-1 text-[11px] text-newTextColor outline-none"
                >
                  <option value={0}>{t('next_slot', 'Next available slot')}</option>
                  <option value={5}>+5 min</option>
                  <option value={10}>+10 min</option>
                  <option value={15}>+15 min</option>
                  <option value={20}>+20 min</option>
                  <option value={30}>+30 min</option>
                  <option value={60}>+1 hour</option>
                </select>
              </div>
            )}

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
                    {automationEnabledSummary(settings)}
                  </span>
                </div>
                <span className="text-newTableText text-sm">
                  {advancedOpen ? '▴' : '▾'}
                </span>
              </button>

              {advancedOpen && (
                <div className="border-t border-newBorder p-4 flex flex-col gap-1">
                  <XAutomationOptionsPanel
                    settings={settings}
                    updateSetting={updateSetting}
                  />

                  {/* Hidden per request — kept so they can be re-enabled later.
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
                  */}
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {publishOverlay && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-4 w-full max-w-xl"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto bg-newBgColorInner border border-newBorder rounded-xl shadow-xl px-6 py-4 w-fit min-w-[280px] text-center">
            <p className="text-lg font-semibold text-newTextColor">
              {publishOverlay === 'publishing'
                ? t('publishing_now', 'Publishing now...')
                : publishOverlay === 'updated'
                ? t('post_updated', 'Post updated')
                : t('post_published', 'Post published')}
            </p>
            {(publishOverlay === 'published' ||
              publishOverlay === 'updated') && (
              <button
                type="button"
                onClick={() => setPublishOverlay(null)}
                className="mt-5 px-4 py-2 text-sm font-medium text-white bg-btnPrimary rounded-lg hover:opacity-90 transition-opacity"
              >
                {t('ok', 'OK')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
