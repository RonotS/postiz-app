import { TweetV2, TwitterApi } from 'twitter-api-v2';
// https-proxy-agent v5.0.1 uses `export =` (CommonJS) — must require it, not
// destructure-import. Using `import { HttpsProxyAgent }` resolves to undefined
// at runtime in some bundles, which is why proxy was working only intermittently.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpsProxyAgent = require('https-proxy-agent');
import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { lookup } from 'mime-types';
import sharp from 'sharp';
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Plug } from '@gitroom/helpers/decorators/plug.decorator';
import { Integration } from '@prisma/client';
import { timer } from '@gitroom/helpers/utils/timer';
import { PostPlug } from '@gitroom/helpers/decorators/post.plug';
import dayjs from 'dayjs';
import { uniqBy } from 'lodash';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  'X can have maximum 4 pictures, or maximum one video, it can also be without attachments'
)
export class XProvider extends SocialAbstract implements SocialProvider {
  identifier = 'x';
  name = 'X';
  isBetweenSteps = false;
  scopes = [] as string[];
  override maxConcurrentJob = 1; // X has strict rate limits (300 posts per 3 hours)
  toolTip =
    'You will be logged in into your current account, if you would like a different account, change it first on X';

  editor = 'normal' as const;
  dto = XDto;

  maxLength(isTwitterPremium: boolean) {
    return isTwitterPremium ? 4000 : 200;
  }

  override handleErrors(body: string):
    | {
      type: 'refresh-token' | 'bad-body';
      value: string;
    }
    | undefined {
    if (body.includes('Unauthorized') || body.includes('"code":401') || body.includes('"code":32')) {
      return {
        type: 'bad-body',
        value:
          'X API returned Unauthorized. This may be a transient rate-limit issue on the Free tier. If this persists, try reconnecting your X account or check your X API plan limits.',
      };
    }

    if (body.includes('Unsupported Authentication')) {
      return {
        type: 'refresh-token',
        value: 'X authentication has expired, please reconnect your account',
      };
    }

    if (body.includes('usage-capped')) {
      return {
        type: 'bad-body',
        value: 'Posting failed - capped reached. Please try again later',
      };
    }
    if (body.includes('duplicate-rules')) {
      return {
        type: 'bad-body',
        value:
          'You have already posted this post, please wait before posting again',
      };
    }
    if (body.includes('The Tweet contains an invalid URL.')) {
      return {
        type: 'bad-body',
        value: 'The Tweet contains a URL that is not allowed on X',
      };
    }
    if (
      body.includes(
        'This user is not allowed to post a video longer than 2 minutes'
      )
    ) {
      return {
        type: 'bad-body',
        value:
          'The video you are trying to post is longer than 2 minutes, which is not allowed for this account',
      };
    }
    if (body.includes('CreditsDepleted')) {
      return {
        type: 'bad-body',
        value: 'X API credits depleted. Please check your X Developer Portal quota.',
      };
    }

    if (body.includes('exceeded the limit of 1500 Tweets')) {
      return {
        type: 'bad-body',
        value:
          'You have exceeded the monthly limit of 1,500 Tweets for the Free tier. Please upgrade your X API plan or check your usage.',
      };
    }

    if (body.includes('not permitted to access this endpoint')) {
      return {
        type: 'bad-body',
        value:
          'X API permissions issue: Please ensure your App has "Read and Write" permissions enabled in the X Developer Portal under "User authentication settings".',
      };
    }

    if (
      body.includes('subset of X API V2 endpoints') ||
      body.includes('different access level')
    ) {
      return {
        type: 'bad-body',
        value:
          'This X endpoint is not available on your current API access. Auto-DM uses POST /2/dm_conversations/with/:participant_id/messages and requires DM permission on your X App plus a plan/credits that cover "DM Interaction: Create". Check your X Developer Portal app permissions ("Read and write and Direct Messages") and your billing plan.',
      };
    }

    try {
      const parsed = JSON.parse(body);
      const errors = parsed?.data?.errors || parsed?.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return {
          type: 'bad-body',
          value: errors[0].message || 'Unknown X API Error',
        };
      }
      if (parsed?.data?.detail) {
        return {
          type: 'bad-body',
          value: parsed.data.detail,
        };
      }
    } catch (e) {
      /**/
    }

    return undefined;
  }

  @Plug({
    identifier: 'x-autoRepostPost',
    title: 'Auto Repost Posts',
    disabled: !!process.env.DISABLE_X_ANALYTICS,
    description:
      'When a post reached a certain number of likes, repost it to increase engagement (1 week old posts)',
    // 5 hours between plug runs. Lower values cause the X worker (which has
    // maxConcurrentJob=1) to be permanently busy with plug calls, queueing
    // up new post workflows behind the plug backlog. Don't lower this in
    // production; if you need faster plug testing, do it on local only.
    runEveryMilliseconds: 18000000, // 5 hours
    totalRuns: 3,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes to trigger the repost',
        validation: /^\d+$/,
      },
    ],
  })
  async autoRepostPost(
    integration: Integration,
    id: string,
    fields: { likesAmount: string },
    postSettings?: any
  ) {
    // Per-post opt-out — composer can disable auto-retweet for a specific tweet
    // even when the plug itself is active.
    if (postSettings?.auto_retweet_enabled === false) {
      return true; // returning true marks this run as "complete" so the plug doesn't keep retrying
    }

    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    try {
      const likes = await client.v2.tweetLikedBy(id);
      if ((likes?.meta?.result_count || 0) >= +fields.likesAmount) {
        await timer(2000);
        await client.v2.retweet(integration.internalId, id);
        return true;
      }
    } catch (err) {
      console.error('X AUTO REPOST ERROR:', err);
    }

    return false;
  }

  @PostPlug({
    identifier: 'x-repost-post-users',
    title: 'Add Re-posters',
    description: 'Add accounts to repost your post',
    pickIntegration: ['x'],
    fields: [],
  })
  async repostPostUsers(
    integration: Integration,
    originalIntegration: Integration,
    postId: string,
    information: any
  ) {
    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    const {
      data: { id },
    } = await client.v2.me();

    try {
      await client.v2.retweet(id, postId);
    } catch (err) {
      /** nothing **/
    }
  }

  @Plug({
    identifier: 'x-autoPlugPost',
    title: 'Auto Reply (Plug)',
    disabled: !!process.env.DISABLE_X_ANALYTICS,
    description:
      'When a post reaches a certain number of likes, automatically reply to the original post with your promotional message.',
    // runEveryMilliseconds: 18000000, // 5 hours
    runEveryMilliseconds: 120000,
    totalRuns: 10,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes to trigger the repost',
        validation: /^\d+$/,
      },
      {
        name: 'post',
        type: 'richtext',
        placeholder: 'Post to plug',
        description: 'Message content to plug',
        validation: /^[\s\S]{3,}$/g,
      },
    ],
  })
  async autoPlugPost(
    integration: Integration,
    id: string,
    fields: { likesAmount: string; post: string }
  ) {
    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    try {
      const likes = await client.v2.tweetLikedBy(id);
      if ((likes?.meta?.result_count || 0) >= +fields.likesAmount) {
        await timer(2000);

        await client.v2.tweet({
          text: stripHtmlValidation('normal', fields.post, true),
          reply: { in_reply_to_tweet_id: id },
        });
        return true;
      }
    } catch (err) {
      console.error('X AUTO PLUG ERROR:', err);
    }

    return false;
  }

  @Plug({
    identifier: 'x-autoThreadReply',
    title: 'Auto plug',
    disabled: !!process.env.DISABLE_X_ANALYTICS,
    description:
      'When a post reaches a certain number of likes, automatically reply with a full thread (multiple chained tweets). Separate each tweet in the thread with three blank lines — same convention as the composer. The first reply is to the original tweet, each subsequent tweet replies to the previous one.',
    runEveryMilliseconds: 120000,
    totalRuns: 10,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes required to trigger the thread reply',
        validation: /^\d+$/,
      },
      {
        name: 'thread',
        type: 'richtext',
        placeholder:
          'Thread content (separate each tweet with three blank lines)',
        description:
          'The thread to reply with. Use three blank lines between tweets to split them; tweets are posted in order, each as a reply to the previous.',
        validation: /^[\s\S]{3,}$/g,
      },
    ],
  })
  async autoThreadReply(
    integration: Integration,
    id: string,
    fields: { likesAmount: string; thread: string },
    postSettings?: any,
    plugContext?: {
      loadDmdUserIds: (keys: string[]) => Promise<Set<string>>;
      saveDmdUserIds: (keys: string[]) => Promise<void>;
    }
  ) {
    // Per-post opt-out — composer can disable the thread reply for a specific
    // tweet even when the plug itself is active. Return true so the workflow
    // doesn't keep retrying this run on a disabled tweet.
    if (postSettings?.auto_thread_reply_enabled === false) {
      return true;
    }

    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    // Resolve likes threshold: per-post override > plug-level default.
    const threshold = Number(
      postSettings?.auto_thread_reply_likes ?? fields.likesAmount ?? 0
    );

    // Resolve the thread text: per-post override > plug-level default.
    const rawThreadInput =
      typeof postSettings?.auto_thread_reply_text === 'string' &&
        postSettings.auto_thread_reply_text.trim() !== ''
        ? postSettings.auto_thread_reply_text
        : fields.thread || '';

    try {
      const likes = await client.v2.tweetLikedBy(id);
      if ((likes?.meta?.result_count || 0) < threshold) {
        return false;
      }

      // Idempotency marker — if a previous run already posted the thread,
      // skip without re-posting. Stored via the generic engagement plug
      // context (key is namespaced by methodName + postId already).
      const doneMarker = 'thread_posted_v1';
      if (plugContext?.loadDmdUserIds) {
        const existing = await plugContext.loadDmdUserIds([doneMarker]);
        if (existing.has(doneMarker)) {
          return true;
        }
      }

      const rawText = stripHtmlValidation('normal', rawThreadInput, true);
      const parts = rawText
        .split(/\n\s*\n\s*\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (parts.length === 0) {
        return true;
      }

      // Post each part as a reply chained to the previous one — true X thread.
      let parentTweetId = id;
      for (const part of parts) {
        await timer(2000); // small delay so X doesn't 429
        const created = await client.v2.tweet({
          text: part,
          reply: { in_reply_to_tweet_id: parentTweetId },
        });
        parentTweetId = created?.data?.id || parentTweetId;
      }

      if (plugContext?.saveDmdUserIds) {
        try {
          await plugContext.saveDmdUserIds([doneMarker]);
        } catch (err) {
          console.warn(
            'X AUTO THREAD REPLY: failed to persist done marker (may re-post on retry):',
            err
          );
        }
      }

      return true;
    } catch (err) {
      console.error('X AUTO THREAD REPLY ERROR:', err);
    }

    return false;
  }

  // Fetch user IDs of accounts that LIKED a tweet.
  // Returns up to 100 user IDs (X V2 API page size).
  private async fetchLikers(client: TwitterApi, tweetId: string): Promise<string[]> {
    try {
      const res = await client.v2.tweetLikedBy(tweetId, { max_results: 100 });
      return (res?.data || []).map((u) => u.id);
    } catch (err) {
      console.error('X AUTO DM: failed to fetch likers:', err);
      return [];
    }
  }

  // Fetch user IDs of accounts that RETWEETED a tweet.
  // Same V2 endpoint shape as likers.
  private async fetchRetweeters(client: TwitterApi, tweetId: string): Promise<string[]> {
    try {
      const res = await client.v2.tweetRetweetedBy(tweetId, { max_results: 100 });
      return (res?.data || []).map((u) => u.id);
    } catch (err) {
      console.error('X AUTO DM: failed to fetch retweeters:', err);
      return [];
    }
  }

  // Fetch user IDs of accounts that REPLIED to a tweet.
  // X V2 has no direct "repliers" endpoint, so this uses recent search
  // with conversation_id:<tweetId> to find replies, then extracts authors.
  // Limited to ~100 most recent replies (one search page).
  private async fetchRepliers(client: TwitterApi, tweetId: string): Promise<string[]> {
    try {
      const res = await client.v2.search(`conversation_id:${tweetId}`, {
        max_results: 100,
        'tweet.fields': ['author_id', 'in_reply_to_user_id'],
      });
      // The paginator's `data` is an iterator wrapper; the underlying tweets
      // live on `res.tweets` (synchronous accessor for already-loaded page).
      const tweets = (res as any)?.tweets || (res as any)?.data?.data || [];
      const ids = new Set<string>();
      for (const t of tweets) {
        // Skip the original tweet itself (which has matching conversation_id).
        if (t?.id === tweetId) continue;
        if (t?.author_id) ids.add(t.author_id);
      }
      return Array.from(ids);
    } catch (err) {
      console.error('X AUTO DM: failed to fetch repliers:', err);
      return [];
    }
  }

  @Plug({
    identifier: 'x-autoDmEngagers',
    title: 'Direct Message Engagers',
    disabled: !!process.env.DISABLE_X_ANALYTICS,
    description:
      'Send a Direct Message to anyone who engages with a post — every liker / retweeter / replier (based on the targets you enable) gets a DM the next time the plug runs. There is no minimum engagement count: a single engagement is enough. Each post in the composer chooses its own targets and can override the message below. Recipients must follow you or have open DMs, and X API rate limits apply.',
    // runEveryMilliseconds: 18000000, // 5 hours
    runEveryMilliseconds: 120000,
    totalRuns: 3,
    fields: [
      {
        name: 'message',
        type: 'richtext',
        placeholder: 'Default DM message',
        description:
          'Used when a post does not specify its own DM message. Per-tweet message overrides this.',
        validation: /^[\s\S]{3,}$/g,
      },
    ],
  })
  async autoDmEngagers(
    integration: Integration,
    id: string,
    fields: {
      // `likesAmount` is kept optional for backward-compat with old DB rows;
      // we no longer enforce any minimum engagement count.
      likesAmount?: string;
      message: string;
      targetLikes?: boolean | string;
      targetRetweets?: boolean | string;
      targetReplies?: boolean | string;
    },
    postSettings?: any,
    plugContext?: {
      loadDmdUserIds: (userIds: string[]) => Promise<Set<string>>;
      saveDmdUserIds: (userIds: string[]) => Promise<void>;
    }
  ) {
    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    // Decide which target types to DM. Plug-level checkboxes set the default;
    // post-level settings (auto_dm_targets) override if present.
    const truthy = (v: any) => v === true || v === 'true' || v === 1 || v === '1';
    const postTargets = postSettings?.auto_dm_targets || {};
    const targetLikes = postTargets.likes !== undefined
      ? truthy(postTargets.likes)
      : truthy(fields.targetLikes);
    const targetRetweets = postTargets.retweets !== undefined
      ? truthy(postTargets.retweets)
      : truthy(fields.targetRetweets);
    const targetReplies = postTargets.replies !== undefined
      ? truthy(postTargets.replies)
      : truthy(fields.targetReplies);

    // Per-post settings can disable auto-DM for a specific tweet entirely.
    if (postSettings?.auto_dm_enabled === false) {
      return false;
    }

    // Backwards-compat: if no targets are explicitly enabled at either level,
    // default to "likes" (the original behavior of this plug).
    const noTargetsExplicit = !targetLikes && !targetRetweets && !targetReplies;
    const effectiveTargetLikes = noTargetsExplicit ? true : targetLikes;
    const effectiveTargetRetweets = noTargetsExplicit ? false : targetRetweets;
    const effectiveTargetReplies = noTargetsExplicit ? false : targetReplies;

    // Resolve the DM message: per-post override > plug-level default.
    const rawMessage =
      (typeof postSettings?.auto_dm_message === 'string' &&
        postSettings.auto_dm_message.trim() !== ''
        ? postSettings.auto_dm_message
        : fields.message) || '';
    const dmText = stripHtmlValidation('normal', rawMessage, true);
    if (!dmText || dmText.trim() === '') {
      console.warn('X AUTO DM: no message configured; skipping');
      return false;
    }

    try {
      // Collect user IDs from each enabled target. Deduplicate so a user who
      // both liked and retweeted only gets DM'd once. No minimum engagement
      // count — even a single engager is enough to trigger a DM.
      const userIdSet = new Set<string>();

      if (effectiveTargetLikes) {
        const ids = await this.fetchLikers(client, id);
        ids.forEach((uid) => userIdSet.add(uid));
      }
      if (effectiveTargetRetweets) {
        const ids = await this.fetchRetweeters(client, id);
        ids.forEach((uid) => userIdSet.add(uid));
      }
      if (effectiveTargetReplies) {
        const ids = await this.fetchRepliers(client, id);
        ids.forEach((uid) => userIdSet.add(uid));
      }

      const allUserIds = Array.from(userIdSet);
      if (allUserIds.length === 0) {
        return false;
      }

      // Cross-run deduplication: skip users who were already DM'd in a
      // previous run of this plug for this same post. Without this, a user
      // who liked Run 1 and retweeted between Run 1 and Run 2 would receive
      // a duplicate DM.
      let alreadyDmd: Set<string> = new Set();
      if (plugContext?.loadDmdUserIds) {
        try {
          alreadyDmd = await plugContext.loadDmdUserIds(allUserIds);
        } catch (err) {
          console.warn(
            'X AUTO DM: failed to load already-DMd users (will proceed without cross-run dedup):',
            err
          );
        }
      }
      const userIds = allUserIds.filter((uid) => !alreadyDmd.has(uid));
      if (userIds.length === 0) {
        // Everyone who currently engages was already DM'd in a prior run.
        // Return false so the workflow keeps the remaining scheduled runs;
        // a later run may catch users who engage *after* this one.
        return false;
      }

      const successfullyDmd: string[] = [];
      for (const userId of userIds) {
        try {
          await timer(2000); // 2s delay to avoid aggressive rate limits
          await client.v2.sendDmToParticipant(userId, { text: dmText });
          successfullyDmd.push(userId);
        } catch (dmErr: any) {
          console.error(
            `X AUTO DM ERROR for user ${userId}:`,
            dmErr?.data || dmErr
          );
        }
      }

      // Persist the IDs we successfully DM'd so future runs of this plug
      // for this post skip them. Failures here are non-fatal — worst case
      // is a duplicate DM next run.
      if (successfullyDmd.length > 0 && plugContext?.saveDmdUserIds) {
        try {
          await plugContext.saveDmdUserIds(successfullyDmd);
        } catch (err) {
          console.warn(
            'X AUTO DM: failed to persist DMd user IDs (next run may duplicate):',
            err
          );
        }
      }

      // IMPORTANT: always return false (never `true`) so the post workflow
      // does NOT cancel the remaining scheduled runs. We want every one of
      // the `totalRuns` ticks to execute so engagers who arrive AFTER an
      // earlier successful run can still be DM'd. Cross-run dedup above
      // guarantees no one ever gets a duplicate DM.
      return false;
    } catch (err) {
      console.error('X AUTO DM FATAL ERROR:', err);
    }

    return false;
  }

  /** Paginated GET /2/users/:id/followers — newest followers tend to appear first. */
  private async fetchFollowerUserIds(
    client: TwitterApi,
    userId: string,
    options: { maxPages: number; pageSize: number }
  ): Promise<string[]> {
    const ids: string[] = [];
    const pageSize = Math.min(Math.max(options.pageSize, 10), 1000);
    let pagination_token: string | undefined;
    for (let p = 0; p < options.maxPages; p++) {
      const res: any = await client.v2.followers(userId, {
        max_results: pageSize,
        ...(pagination_token ? { pagination_token } : {}),
      });
      const users = res?.data || [];
      for (const u of users) {
        if (u?.id) ids.push(String(u.id));
      }
      pagination_token = res?.meta?.next_token;
      if (!pagination_token) break;
    }
    return ids;
  }

  @Plug({
    identifier: 'x-autoDmFollowers',
    title: 'Auto DM New Followers',
    disabled: !!process.env.DISABLE_X_ANALYTICS,
    description:
      'Runs on its own schedule (no posting required): polls your X followers and sends a welcome DM to new ones. The first run only records your current followers (no DMs) so existing fans are not messaged. Requires DM API access on your X app. Large accounts only scan recent follower pages per run.',
    // Metadata for Plugs UI; the live poller interval is `pollIntervalMs` on
    // `xFollowerDmPollerWorkflow` (default 2m, override with X_FOLLOWER_DM_POLL_INTERVAL_MS).
    runEveryMilliseconds: 120000,
    totalRuns: 3,
    fields: [
      {
        name: 'message',
        type: 'richtext',
        placeholder: 'Welcome DM for new followers',
        description:
          'Default message when a post does not set its own new-follower DM text.',
        validation: /^[\s\S]{3,}$/g,
      },
    ],
  })
  async autoDmFollowers(
    integration: Integration,
    _tweetReleaseId: string,
    fields: { message: string },
    postSettings?: {
      auto_dm_followers_enabled?: boolean;
      auto_dm_followers_message?: string;
    },
    plugContext?: {
      loadDmdUserIds: (userIds: string[]) => Promise<Set<string>>;
      saveDmdUserIds: (userIds: string[]) => Promise<void>;
      hasFollowerBaselineMarker: () => Promise<boolean>;
      setFollowerBaselineMarker: () => Promise<void>;
      loadFollowerSnapshotContains: (
        userIds: string[]
      ) => Promise<Set<string>>;
      saveFollowerSnapshotIds: (userIds: string[]) => Promise<void>;
    }
  ) {
    if (postSettings?.auto_dm_followers_enabled === false) {
      return true;
    }

    const rawMessage =
      (typeof postSettings?.auto_dm_followers_message === 'string' &&
        postSettings.auto_dm_followers_message.trim() !== ''
        ? postSettings.auto_dm_followers_message
        : fields.message) || '';
    const dmText = stripHtmlValidation('normal', rawMessage, true);
    if (!dmText || dmText.trim() === '') {
      console.warn('X AUTO DM FOLLOWERS: no message configured; skipping');
      return false;
    }

    const ownerId = integration.internalId;
    if (!ownerId) {
      console.warn('X AUTO DM FOLLOWERS: missing integration.internalId');
      return false;
    }

    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    if (
      !plugContext?.loadDmdUserIds ||
      !plugContext?.saveDmdUserIds ||
      !plugContext?.hasFollowerBaselineMarker ||
      !plugContext?.setFollowerBaselineMarker ||
      !plugContext?.loadFollowerSnapshotContains ||
      !plugContext?.saveFollowerSnapshotIds
    ) {
      console.warn('X AUTO DM FOLLOWERS: missing plug context');
      return false;
    }

    try {
      const baselineDone = await plugContext.hasFollowerBaselineMarker();

      if (!baselineDone) {
        const snapshotIds = await this.fetchFollowerUserIds(client, ownerId, {
          maxPages: 3,
          pageSize: 1000,
        });
        if (snapshotIds.length > 0) {
          await plugContext.saveFollowerSnapshotIds(snapshotIds);
        }
        await plugContext.setFollowerBaselineMarker();
        return false;
      }

      const recentIds = await this.fetchFollowerUserIds(client, ownerId, {
        maxPages: 1,
        pageSize: 500,
      });
      if (recentIds.length === 0) {
        return false;
      }

      const alreadyDmd = await plugContext.loadDmdUserIds(recentIds);
      const inSnapshot = await plugContext.loadFollowerSnapshotContains(
        recentIds
      );

      const toWelcome = recentIds.filter(
        (uid) => uid !== ownerId && !alreadyDmd.has(uid) && !inSnapshot.has(uid)
      );
      if (toWelcome.length === 0) {
        return false;
      }

      let dmSent = false;
      const successfullyDmd: string[] = [];
      const snapshotAdds: string[] = [];

      for (const userId of toWelcome) {
        try {
          await timer(2000);
          await client.v2.sendDmToParticipant(userId, { text: dmText });
          successfullyDmd.push(userId);
          snapshotAdds.push(userId);
          dmSent = true;
        } catch (dmErr: any) {
          console.error(
            `X AUTO DM FOLLOWERS ERROR for user ${userId}:`,
            dmErr?.data || dmErr
          );
        }
      }

      if (successfullyDmd.length > 0) {
        await plugContext.saveDmdUserIds(successfullyDmd);
        await plugContext.saveFollowerSnapshotIds(snapshotAdds);
      }

      return dmSent;
    } catch (err) {
      console.error('X AUTO DM FOLLOWERS FATAL ERROR:', err);
    }

    return false;
  }

  async refreshToken(): Promise<AuthTokenDetails> {
    return {
      id: '',
      name: '',
      accessToken: '',
      refreshToken: '',
      expiresIn: 0,
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    try {
      const client = this.buildTwitterApi({
        appKey: process.env.X_API_KEY!,
        appSecret: process.env.X_API_SECRET!,
      });
      // IMPORTANT: do NOT pass authAccessType here.
      //
      // Twitter's OAuth 1.0a `x_auth_access_type` parameter (which the
      // twitter-api-v2 library forwards from `authAccessType`) only accepts
      // 'read' | 'write'. There is no 'dm' value, and passing 'write'
      // CAPS the minted token at write-only — explicitly excluding Direct
      // Message scope, even when the X App itself is configured with
      // "Read and write and Direct messages" permission.
      //
      // The correct behavior is to OMIT this parameter entirely so the token
      // inherits the App's full configured permission set. This is required
      // for auto-DM to work; otherwise X returns 403
      // "oauth1-permissions" on every DM call.
      //
      // linkMode: 'authenticate' uses X's /oauth/authenticate endpoint, which
      // auto-redirects when the user already has an X session in the same
      // browser. We deliberately do NOT pass `forceLogin: true` — that would
      // force the user to re-enter X credentials even when they're already
      // logged in, which is the opposite of what /auth users expect.
      //
      // Trade-off: if you change your X App's permission set after a user has
      // already authorized (e.g., add Direct Messages later), existing tokens
      // won't auto-pick up the new scope. Users with stale tokens have to
      // explicitly disconnect + reconnect to mint a fresh token. This is
      // acceptable because the alternative — forcing every user through a
      // login form on every connect — is much worse UX.
      const { url, oauth_token, oauth_token_secret } =
        await client.generateAuthLink(
          (process.env.X_URL || process.env.FRONTEND_URL) +
          `/integrations/social/x`,
          {
            linkMode: 'authenticate',
          }
        );
      return {
        url,
        codeVerifier: oauth_token + ':' + oauth_token_secret,
        state: oauth_token,
      };
    } catch (err) {
      console.error('X AUTH ERROR:', err);
      throw err;
    }
  }

  async authenticate(params: { code: string; codeVerifier: string }) {
    const { code, codeVerifier } = params;
    const [oauth_token, oauth_token_secret] = codeVerifier.split(':');

    const startingClient = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    const { accessToken, client, accessSecret } = await startingClient.login(
      code
    );

    const {
      data: { username, verified, profile_image_url, name, id },
    } = await client.v2.me({
      'user.fields': [
        'username',
        'verified',
        'verified_type',
        'profile_image_url',
        'name',
      ],
    });

    return {
      id: String(id),
      accessToken: accessToken + ':' + accessSecret,
      name,
      refreshToken: '',
      expiresIn: 999999999,
      picture: profile_image_url || '',
      username,
      additionalSettings: [
        {
          title: 'Verified',
          description: 'Is this a verified user? (Premium)',
          type: 'checkbox' as const,
          value: verified,
        },
      ],
    };
  }

  // Pick a random proxy from the X_PROXIES env var if configured. Format:
  //   X_PROXIES="http://user:pass@host1:port1,http://user:pass@host2:port2,..."
  // When set, all X API calls (post, comment, OAuth, plugs that go through
  // buildTwitterApi) route through a randomly-selected residential proxy so
  // X sees a non-datacenter source IP.
  //
  // STRICT MODE: when X_PROXIES is set, the proxy is *required*. If
  // construction fails for the randomly-picked URL, this method tries every
  // remaining configured proxy and only returns undefined as a last resort
  // (which then triggers a hard error in buildTwitterApi). This prevents the
  // silent fallback to a direct (datacenter-IP) connection that would defeat
  // the whole point of configuring a proxy.
  //
  // Trade-off: this can violate X's Developer Agreement if the proxy is
  // detected as anonymizing. Use only with full understanding of the risk.
  // If X_PROXIES is unset or empty, behavior is unchanged (direct connection).
  private getProxyAgent(): any | undefined {
    const proxiesEnv = process.env.X_PROXIES?.trim();
    if (!proxiesEnv) return undefined;
    const proxies = proxiesEnv
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (proxies.length === 0) return undefined;

    // Shuffle so we still get random selection but fall back through all of
    // them if one fails to construct.
    const shuffled = [...proxies].sort(() => Math.random() - 0.5);
    for (const proxyUrl of shuffled) {
      try {
        return new HttpsProxyAgent(proxyUrl);
      } catch (err) {
        console.error(
          'X PROXY: failed to construct proxy agent for',
          proxyUrl,
          err
        );
        // try the next proxy
      }
    }
    // All proxies failed to construct — return undefined; buildTwitterApi
    // will treat this as a hard error since X_PROXIES was set.
    return undefined;
  }

  // Centralized TwitterApi factory — applies proxy agent if configured so that
  // every code path (post, comment, OAuth, plugs) routes through the same egress.
  //
  // When X_PROXIES is set but no usable proxy could be constructed, this
  // throws explicitly rather than silently falling back to a direct (datacenter
  // IP) connection. The thrown error propagates up the post() retry loop and
  // shows up in logs / Temporal failure messages, so the cause is visible
  // instead of producing a "post failed but proxy log missing" mystery.
  private buildTwitterApi(creds: {
    appKey: string;
    appSecret: string;
    accessToken?: string;
    accessSecret?: string;
  }): TwitterApi {
    const proxiesConfigured = !!process.env.X_PROXIES?.trim();
    const httpAgent = this.getProxyAgent();

    if (proxiesConfigured && !httpAgent) {
      // X_PROXIES is set, but every entry failed to construct. Refuse to fall
      // through to a direct connection — the operator clearly wants traffic
      // routed through a proxy, and silently bypassing it would emit calls
      // from Railway's datacenter IP (likely flagged by X), producing
      // confusing "post fails on Railway but works on local" symptoms.
      console.error(
        'X PROXY: X_PROXIES is set but no proxy could be constructed. ' +
        'Refusing to send X API call via direct connection. ' +
        'Check that X_PROXIES contains valid http(s)://user:pass@host:port URLs.'
      );
      throw new Error(
        'X_PROXIES is configured but no usable proxy is available — refusing to bypass to direct connection.'
      );
    }

    if (httpAgent) {
      console.log('X PROXY: routing call through residential proxy');
    } else {
      // Explicit log when proxy is NOT configured so operators can confirm
      // direct-connection mode is intentional.
      console.log('X PROXY: not configured — using direct connection');
    }

    // The twitter-api-v2 second arg is Partial<IClientSettings>; httpAgent is
    // typed as `Agent` but HttpsProxyAgent satisfies the runtime contract.
    return new TwitterApi(
      creds as any,
      httpAgent ? ({ httpAgent } as any) : undefined
    );
  }

  private async getClient(accessToken: string) {
    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    return this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });
  }

  // Race a promise against a timeout. If the timeout wins, throw an error
  // tagged so the post() retry loop can recognize it as transient.
  // Without this, X API calls can hang for the full 10-minute Temporal activity
  // timeout when the connection stalls between Railway and X.
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms (likely network stall)`));
      }, ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  /**
   * Optional delay before each tweet/comment attempt. Defaults to a tiny 0–400ms
   * stagger so posting feels immediate; set X_POST_JITTER_MS_MIN / X_POST_JITTER_MS_MAX
   * (e.g. 8000 and 25000) if you need stronger anti-burst behavior for your API tier.
   */
  private getPostAttemptJitterMs(): number {
    const parseMs = (v: string | undefined, fallback: number) => {
      const n = parseInt(String(v ?? '').trim(), 10);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const min = parseMs(process.env.X_POST_JITTER_MS_MIN, 0);
    const max = parseMs(process.env.X_POST_JITTER_MS_MAX, 50);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  private async uploadMedia(
    client: TwitterApi,
    postDetails: PostDetails<any>[]
  ) {
    return (
      await Promise.all(
        postDetails.flatMap((p) =>
          p?.media?.flatMap(async (m) => {
            return {
              id: await this.runInConcurrent(
                async () =>
                  client.v2.uploadMedia(
                    m.path.indexOf('mp4') > -1
                      ? Buffer.from(await readOrFetch(m.path))
                      : await sharp(await readOrFetch(m.path), {
                        animated: lookup(m.path) === 'image/gif',
                      })
                        .resize({
                          width: 1000,
                        })
                        .gif()
                        .toBuffer(),
                    {
                      media_type: (lookup(m.path) || '') as any,
                    }
                  ),
                true
              ),
              postId: p.id,
            };
          })
        )
      )
    ).reduce((acc, val) => {
      if (!val?.id) {
        return acc;
      }

      acc[val.postId] = acc[val.postId] || [];
      acc[val.postId].push(val.id);

      return acc;
    }, {} as Record<string, string[]>);
  }

  private normalizeTweetText(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private async findRecentlyPostedTweet(
    client: TwitterApi,
    userId: string,
    text: string,
    startedAt: number
  ) {
    const normalizedText = this.normalizeTweetText(text);

    for (const attempt of [0, 1, 2]) {
      if (attempt > 0) {
        await timer(500);
      }

      try {
        const timeline = await client.v2.userTimeline(userId, {
          'tweet.fields': ['id', 'text', 'created_at'],
          exclude: ['replies', 'retweets'],
          max_results: 10,
        });

        const recentTweet = timeline.data.data?.find((tweet) => {
          if (!tweet?.text || !tweet?.created_at) {
            return false;
          }

          return (
            this.normalizeTweetText(tweet.text) === normalizedText &&
            new Date(tweet.created_at).getTime() >= startedAt - 60000
          );
        });

        if (recentTweet) {
          return recentTweet;
        }
      } catch (err) {
        console.error('X POST VERIFICATION ERROR:', err);
      }
    }

    return undefined;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<{
      active_thread_finisher: boolean;
      thread_finisher: string;
      community?: string;
      who_can_reply_post:
      | 'everyone'
      | 'following'
      | 'mentionedUsers'
      | 'subscribers'
      | 'verified';
      made_with_ai?: boolean;
      paid_partnership?: boolean;
    }>[]
  ): Promise<PostResponse[]> {
    const startedAt = Date.now();
    const [firstPost] = postDetails;
    const maxRetries = 3;

    // Create the client ONCE for this post. Reusing it across retries keeps the
    // Node.js HTTP agent connection pool warm: if attempt 1 fails because of
    // an HTTPS cold-start (fresh TCP handshake, TLS edge case on a datacenter
    // egress), attempt 2 reuses the now-warmed connection and typically succeeds.
    // Creating a fresh client per retry would re-introduce the cold-start each time.
    const client = await this.getClient(accessToken);

    // Upload media once up front (only matters when media exists). This also
    // serves as a connection-pool warmup before the tweet call.
    let uploadAll: Record<string, string[]> = {};
    if (firstPost?.media?.length) {
      try {
        uploadAll = await this.uploadMedia(client, [firstPost]);
      } catch (mediaErr: any) {
        console.error('X MEDIA UPLOAD ERROR:', JSON.stringify(mediaErr?.data || mediaErr, null, 2));
        throw mediaErr;
      }
    }

    const media_ids = (uploadAll[firstPost.id] || []).filter((f: string) => f);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const jitterMs = this.getPostAttemptJitterMs();
        if (jitterMs > 0) {
          console.log(
            `X POST jitter (attempt ${attempt + 1}/${maxRetries + 1}): ${jitterMs}ms`
          );
        }
        await timer(jitterMs);

        // @ts-ignore
        const { data }: { data: { id: string } } = await this.runInConcurrent(
          async () =>
            // 30-second hard timeout per attempt: aborts hung connections so
            // the retry loop can run instead of blocking until Temporal's
            // 10-minute activity timeout.
            this.withTimeout(
              // @ts-ignore
              client.v2.tweet({
                ...(!firstPost?.settings?.who_can_reply_post ||
                  firstPost?.settings?.who_can_reply_post === 'everyone'
                  ? {}
                  : {
                    reply_settings: firstPost?.settings?.who_can_reply_post,
                  }),
                ...(firstPost?.settings?.community
                  ? {
                    share_with_followers: true,
                    community_id:
                      firstPost?.settings?.community?.split('/').pop() || '',
                  }
                  : {}),
                text: firstPost.message,
                ...(media_ids.length ? { media: { media_ids } } : {}),
                made_with_ai: !!firstPost?.settings?.made_with_ai,
                paid_partnership: !!firstPost?.settings?.paid_partnership,
              }),
              30000,
              'X tweet'
            )
        );

        return [
          {
            postId: data.id,
            id: firstPost.id,
            releaseURL: `https://twitter.com/i/web/status/${data.id}`,
            status: 'posted',
          },
        ];
      } catch (err: any) {
        const errMsg = err?.message || err?.cause?.message || '';
        const rawData = err?.data || {};
        const rawString = JSON.stringify(rawData);
        const errCode = err?.code || err?.cause?.code || '';
        const errStatus = err?.status || err?.cause?.status || rawData?.status || '';

        // Always log the raw error on every attempt so we can see what X actually
        // returned, regardless of how it gets classified below. Without this, a
        // failure path that doesn't match the keyword checks below disappears
        // silently from logs.
        console.warn(
          `X POST: attempt ${attempt + 1}/${maxRetries + 1} failed. ` +
          `errMsg="${errMsg}" errCode="${errCode}" errStatus="${errStatus}" ` +
          `rawData=${rawString}`
        );

        // Broaden the retry condition: anything that smells like 401/403/auth
        // failure, network hiccup, or unspecified about:blank from X is treated
        // as transient. Datacenter-to-X connections occasionally produce these
        // even on valid tokens; retrying with a fresh client (after jitter) is
        // the most reliable mitigation.
        const isTransient =
          errMsg.includes('Unauthorized') ||
          errMsg.includes('401') ||
          errMsg.includes('403') ||
          errMsg.includes('32') ||
          errMsg.includes('about:blank') ||
          errMsg.includes('socket hang up') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('timed out') ||
          errMsg.includes('network stall') ||
          rawString.includes('Unauthorized') ||
          rawString.includes('about:blank') ||
          rawString.includes('Could not authenticate you') ||
          errStatus === 401 ||
          errStatus === 403 ||
          errStatus === 429;

        if (isTransient && attempt < maxRetries) {
          const waitTime = (15 + attempt * 15) * 1000;
          console.warn(
            `X POST: Transient error on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Retrying in ${waitTime / 1000}s (reusing same client to keep connection pool warm)...`
          );
          await timer(waitTime);
          continue;
        }

        // On final attempt, check if the tweet was actually posted
        if (client && firstPost) {
          const recentTweet = await this.findRecentlyPostedTweet(
            client,
            id,
            firstPost.message || '',
            startedAt
          );

          if (recentTweet) {
            return [
              {
                postId: recentTweet.id,
                id: firstPost.id,
                releaseURL: `https://twitter.com/i/web/status/${recentTweet.id}`,
                status: 'posted',
              },
            ];
          }
        }

        console.error('X POST FINAL ERROR:', JSON.stringify(err?.data || err, null, 2));
        throw err;
      }
    }

    // Should never reach here, but just in case
    throw new Error('X POST: Max retries exceeded');
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<{
      active_thread_finisher: boolean;
      thread_finisher: string;
      made_with_ai?: boolean;
      paid_partnership?: boolean;
    }>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const startedAt = Date.now();
    const [commentPost] = postDetails;
    const maxRetries = 3;

    // Create the client ONCE for this comment. Reusing it across retries keeps
    // the HTTP connection pool warm so attempt-2 doesn't repeat the cold-start
    // failure attempt-1 may have hit.
    const client = await this.getClient(accessToken);

    // Upload media once up front (only matters when media exists).
    let uploadAll: Record<string, string[]> = {};
    if (commentPost?.media?.length) {
      uploadAll = await this.uploadMedia(client, [commentPost]);
    }

    const media_ids = (uploadAll[commentPost.id] || []).filter((f: string) => f);

    const replyToId = lastCommentId || postId;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const jitterMs = this.getPostAttemptJitterMs();
        if (jitterMs > 0) {
          console.log(
            `X COMMENT jitter (attempt ${attempt + 1}/${maxRetries + 1}): ${jitterMs}ms`
          );
        }
        await timer(jitterMs);

        // @ts-ignore
        const { data }: { data: { id: string } } = await this.runInConcurrent(
          async () =>
            this.withTimeout(
              // @ts-ignore
              client.v2.tweet({
                text: commentPost.message,
                ...(media_ids.length ? { media: { media_ids } } : {}),
                reply: { in_reply_to_tweet_id: replyToId },
                made_with_ai: !!commentPost?.settings?.made_with_ai,
                paid_partnership: !!commentPost?.settings?.paid_partnership,
              }),
              30000,
              'X comment tweet'
            )
        );

        return [
          {
            postId: data.id,
            id: commentPost.id,
            releaseURL: `https://twitter.com/i/web/status/${data.id}`,
            status: 'posted',
          },
        ];
      } catch (err: any) {
        const errMsg = err?.message || err?.cause?.message || '';
        const rawData = err?.data || {};
        const rawString = JSON.stringify(rawData);
        const errCode = err?.code || err?.cause?.code || '';
        const errStatus = err?.status || err?.cause?.status || rawData?.status || '';

        console.warn(
          `X COMMENT: attempt ${attempt + 1}/${maxRetries + 1} failed. ` +
          `errMsg="${errMsg}" errCode="${errCode}" errStatus="${errStatus}" ` +
          `rawData=${rawString}`
        );

        const isTransient =
          errMsg.includes('Unauthorized') ||
          errMsg.includes('401') ||
          errMsg.includes('403') ||
          errMsg.includes('32') ||
          errMsg.includes('about:blank') ||
          errMsg.includes('socket hang up') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('timed out') ||
          errMsg.includes('network stall') ||
          rawString.includes('Unauthorized') ||
          rawString.includes('about:blank') ||
          rawString.includes('Could not authenticate you') ||
          errStatus === 401 ||
          errStatus === 403 ||
          errStatus === 429;

        if (isTransient && attempt < maxRetries) {
          const waitTime = (15 + attempt * 15) * 1000;
          console.warn(
            `X COMMENT: Transient error on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Retrying in ${waitTime / 1000}s (reusing same client to keep connection pool warm)...`
          );
          await timer(waitTime);
          continue;
        }

        if (client && commentPost) {
          const recentTweet = await this.findRecentlyPostedTweet(
            client,
            id,
            commentPost.message || '',
            startedAt
          );

          if (recentTweet) {
            return [
              {
                postId: recentTweet.id,
                id: commentPost.id,
                releaseURL: `https://twitter.com/i/web/status/${recentTweet.id}`,
                status: 'posted',
              },
            ];
          }
        }

        console.error('X COMMENT ERROR:', JSON.stringify(err?.data || err, null, 2));
        throw err;
      }
    }

    // Unreachable in practice (the loop above either returns or throws), but
    // satisfies TypeScript's all-paths-return check.
    throw new Error('X COMMENT: Max retries exceeded');
  }

  private loadAllTweets = async (
    client: TwitterApi,
    id: string,
    until: string,
    since: string,
    token = ''
  ): Promise<TweetV2[]> => {
    const tweets = await client.v2.userTimeline(id, {
      'tweet.fields': ['id'],
      'user.fields': [],
      'poll.fields': [],
      'place.fields': [],
      'media.fields': [],
      exclude: ['replies', 'retweets'],
      start_time: since,
      end_time: until,
      max_results: 100,
      ...(token ? { pagination_token: token } : {}),
    });

    return [
      ...tweets.data.data,
      ...(tweets.data.data.length === 100
        ? await this.loadAllTweets(
          client,
          id,
          until,
          since,
          tweets.meta.next_token
        )
        : []),
    ];
  };

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    if (process.env.DISABLE_X_ANALYTICS) {
      return [];
    }

    const until = dayjs().endOf('day');
    const since = dayjs().subtract(date > 100 ? 100 : date, 'day');

    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    try {
      const tweets = uniqBy(
        await this.loadAllTweets(
          client,
          id,
          until.format('YYYY-MM-DDTHH:mm:ssZ'),
          since.format('YYYY-MM-DDTHH:mm:ssZ')
        ),
        (p) => p.id
      );

      if (tweets.length === 0) {
        return [];
      }

      const data = await client.v2.tweets(
        tweets.map((p) => p.id),
        {
          'tweet.fields': ['public_metrics'],
        }
      );

      const metrics = data.data.reduce(
        (all, current) => {
          all.impression_count =
            (all.impression_count || 0) +
            +current.public_metrics.impression_count;
          all.bookmark_count =
            (all.bookmark_count || 0) + +current.public_metrics.bookmark_count;
          all.like_count =
            (all.like_count || 0) + +current.public_metrics.like_count;
          all.quote_count =
            (all.quote_count || 0) + +current.public_metrics.quote_count;
          all.reply_count =
            (all.reply_count || 0) + +current.public_metrics.reply_count;
          all.retweet_count =
            (all.retweet_count || 0) + +current.public_metrics.retweet_count;

          return all;
        },
        {
          impression_count: 0,
          bookmark_count: 0,
          like_count: 0,
          quote_count: 0,
          reply_count: 0,
          retweet_count: 0,
        }
      );

      return Object.entries(metrics).map(([key, value]) => ({
        label: key.replace('_count', '').replace('_', ' ').toUpperCase(),
        percentageChange: 5,
        data: [
          {
            total: String(0),
            date: since.format('YYYY-MM-DD'),
          },
          {
            total: String(value),
            date: until.format('YYYY-MM-DD'),
          },
        ],
      }));
    } catch (err) {
      console.log(err);
    }
    return [];
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    if (process.env.DISABLE_X_ANALYTICS) {
      return [];
    }

    const today = dayjs().format('YYYY-MM-DD');

    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    try {
      // Fetch the specific tweet with public metrics
      const tweet = await client.v2.singleTweet(postId, {
        'tweet.fields': ['public_metrics', 'created_at'],
      });

      if (!tweet?.data?.public_metrics) {
        return [];
      }

      const metrics = tweet.data.public_metrics;

      const result: AnalyticsData[] = [];

      if (metrics.impression_count !== undefined) {
        result.push({
          label: 'Impressions',
          percentageChange: 0,
          data: [{ total: String(metrics.impression_count), date: today }],
        });
      }

      if (metrics.like_count !== undefined) {
        result.push({
          label: 'Likes',
          percentageChange: 0,
          data: [{ total: String(metrics.like_count), date: today }],
        });
      }

      if (metrics.retweet_count !== undefined) {
        result.push({
          label: 'Retweets',
          percentageChange: 0,
          data: [{ total: String(metrics.retweet_count), date: today }],
        });
      }

      if (metrics.reply_count !== undefined) {
        result.push({
          label: 'Replies',
          percentageChange: 0,
          data: [{ total: String(metrics.reply_count), date: today }],
        });
      }

      if (metrics.quote_count !== undefined) {
        result.push({
          label: 'Quotes',
          percentageChange: 0,
          data: [{ total: String(metrics.quote_count), date: today }],
        });
      }

      if (metrics.bookmark_count !== undefined) {
        result.push({
          label: 'Bookmarks',
          percentageChange: 0,
          data: [{ total: String(metrics.bookmark_count), date: today }],
        });
      }

      return result;
    } catch (err) {
      console.log('Error fetching X post analytics:', err);
    }

    return [];
  }

  /**
   * Batch-fetch public_metrics for tweet IDs (dashboard queue). Up to 100 ids
   * per X API request. OAuth user context; each connected account has its own limits.
   */
  async batchTweetPublicMetrics(
    accessToken: string,
    tweetIds: string[]
  ): Promise<
    Map<string, { likeCount: number; retweetCount: number; replyCount: number }>
  > {
    const out = new Map<
      string,
      { likeCount: number; retweetCount: number; replyCount: number }
    >();
    if (process.env.DISABLE_X_ANALYTICS) {
      return out;
    }
    const uniq = [...new Set((tweetIds || []).filter(Boolean))];
    if (!uniq.length) {
      return out;
    }
    const client = await this.getClient(accessToken);
    const CHUNK = 100;
    try {
      for (let i = 0; i < uniq.length; i += CHUNK) {
        const slice = uniq.slice(i, i + CHUNK);
        const res = await client.v2.tweets(slice, {
          'tweet.fields': ['public_metrics'],
        });
        for (const tw of res.data || []) {
          const pm = (tw as TweetV2).public_metrics;
          if (!pm) continue;
          out.set(tw.id, {
            likeCount: Math.max(0, Number(pm.like_count) || 0),
            retweetCount: Math.max(0, Number(pm.retweet_count) || 0),
            replyCount: Math.max(0, Number(pm.reply_count) || 0),
          });
        }
      }
    } catch (err) {
      console.warn('batchTweetPublicMetrics:', err);
    }
    return out;
  }

  override async mention(token: string, d: { query: string }) {
    const [accessTokenSplit, accessSecretSplit] = token.split(':');
    const client = this.buildTwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    try {
      const data = await client.v2.userByUsername(d.query, {
        'user.fields': ['username', 'name', 'profile_image_url'],
      });

      if (!data?.data?.username) {
        return [];
      }

      return [
        {
          id: data.data.username,
          image: data.data.profile_image_url,
          label: data.data.name,
        },
      ];
    } catch (err) {
      console.log(err);
    }
    return [];
  }

  mentionFormat(idOrHandle: string, name: string) {
    return `@${idOrHandle}`;
  }
}
