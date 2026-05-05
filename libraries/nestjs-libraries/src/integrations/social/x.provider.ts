import { TweetV2, TwitterApi } from 'twitter-api-v2';
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
    runEveryMilliseconds: 3600000, // 1 hour for testing
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
    fields: { likesAmount: string }
  ) {
    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = new TwitterApi({
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
    const client = new TwitterApi({
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
    runEveryMilliseconds: 3600000, // 1 hour for testing
    totalRuns: 3,
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
    const client = new TwitterApi({
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
    identifier: 'x-autoDmEngagers',
    title: 'Direct Message',
    disabled: !!process.env.DISABLE_X_ANALYTICS,
    description:
      'When a post reaches a certain number of likes, send a Direct Message to those who liked it. Note: Users must follow you or have open DMs, and X API rate limits apply.',
    runEveryMilliseconds: 3600000, // 1 hour for testing
    totalRuns: 3,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes to trigger the DMs',
        validation: /^\d+$/,
      },
      {
        name: 'message',
        type: 'richtext',
        placeholder: 'Message to send',
        description: 'The Direct Message content to send',
        validation: /^[\s\S]{3,}$/g,
      },
    ],
  })
  async autoDmEngagers(
    integration: Integration,
    id: string,
    fields: { likesAmount: string; message: string }
  ) {
    const [accessTokenSplit, accessSecretSplit] = integration.token.split(':');
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });

    try {
      const likesResponse = await client.v2.tweetLikedBy(id, { max_results: 100 });
      if ((likesResponse?.meta?.result_count || 0) >= +fields.likesAmount) {
        const users = likesResponse?.data;
        if (!users) return false;

        let dmSent = false;
        for (const user of users) {
          try {
            await timer(2000); // 2 second delay to avoid aggressive rate limits
            await client.v2.sendDmToParticipant(user.id, {
              text: stripHtmlValidation('normal', fields.message, true),
            });
            dmSent = true;
          } catch (dmErr: any) {
            console.error(`X AUTO DM ERROR for user ${user.id}:`, dmErr?.data || dmErr);
          }
        }
        return dmSent;
      }
    } catch (err) {
      console.error('X AUTO DM FATAL ERROR:', err);
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
      const client = new TwitterApi({
        appKey: process.env.X_API_KEY!,
        appSecret: process.env.X_API_SECRET!,
      });
      const { url, oauth_token, oauth_token_secret } =
        await client.generateAuthLink(
          (process.env.X_URL || process.env.FRONTEND_URL) +
          `/integrations/social/x`,
          {
            // Omit authAccessType so the minted token inherits the App's full
            // permission set (Read + Write + Direct Messages). Passing 'write'
            // caps the token at write-only and excludes DM scope, regardless
            // of what the App is configured for in the X Developer Portal.
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

    const startingClient = new TwitterApi({
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

  private async getClient(accessToken: string) {
    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    return new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });
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
        await timer(2000);
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
    let client: TwitterApi | undefined;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        client = await this.getClient(accessToken);

        // upload media for the first post
        let uploadAll: Record<string, string[]> = {};
        try {
          uploadAll = await this.uploadMedia(client, [firstPost]);
        } catch (mediaErr: any) {
          console.error('X MEDIA UPLOAD ERROR:', JSON.stringify(mediaErr?.data || mediaErr, null, 2));
          throw mediaErr;
        }

        const media_ids = (uploadAll[firstPost.id] || []).filter((f: string) => f);

        // Anti-bot Jitter: Wait randomly between 8 to 25 seconds to break rigid bot-filter patterns
        const jitterMs = Math.floor(Math.random() * 17000) + 8000;
        console.log(`X POST Jitter: waiting ${jitterMs / 1000}s to mimic human behavior...`);
        await timer(jitterMs);

        // @ts-ignore
        const { data }: { data: { id: string } } = await this.runInConcurrent(
          async () =>
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
            })
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
        const isUnauthorized =
          errMsg.includes('Unauthorized') ||
          errMsg.includes('401') ||
          errMsg.includes('32') ||
          rawString.includes('Unauthorized') ||
          rawString.includes('401') ||
          rawString.includes('32') ||
          rawString.includes('Could not authenticate you');

        // Retry on transient Unauthorized errors (common on X Free tier)
        if (isUnauthorized && attempt < maxRetries) {
          const waitTime = (10 + attempt * 10) * 1000;
          console.warn(
            `X POST: Transient error on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Error: ${errMsg}. Raw Data: ${rawString}. ` +
            `Retrying in ${waitTime / 1000}s...`
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
    let client: TwitterApi | undefined;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        client = await this.getClient(accessToken);

        // upload media for the comment
        const uploadAll = await this.uploadMedia(client, [commentPost]);

        const media_ids = (uploadAll[commentPost.id] || []).filter((f: string) => f);

        const replyToId = lastCommentId || postId;

        // Anti-bot Jitter: Wait randomly between 8 to 25 seconds
        const jitterMs = Math.floor(Math.random() * 17000) + 8000;
        console.log(`X COMMENT Jitter: waiting ${jitterMs / 1000}s to mimic human behavior...`);
        await timer(jitterMs);

        // @ts-ignore
        const { data }: { data: { id: string } } = await this.runInConcurrent(
          async () =>
            // @ts-ignore
            client.v2.tweet({
              text: commentPost.message,
              ...(media_ids.length ? { media: { media_ids } } : {}),
              reply: { in_reply_to_tweet_id: replyToId },
              made_with_ai: !!commentPost?.settings?.made_with_ai,
              paid_partnership: !!commentPost?.settings?.paid_partnership,
            })
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
        const isUnauthorized =
          errMsg.includes('Unauthorized') ||
          errMsg.includes('401') ||
          errMsg.includes('32') ||
          rawString.includes('Unauthorized') ||
          rawString.includes('401') ||
          rawString.includes('32') ||
          rawString.includes('Could not authenticate you');

        // Retry on transient errors
        if (isUnauthorized && attempt < maxRetries) {
          const waitTime = (10 + attempt * 10) * 1000;
          console.warn(
            `X COMMENT: Transient error on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Retrying in ${waitTime / 1000}s...`
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
    const client = new TwitterApi({
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
    const client = new TwitterApi({
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

  override async mention(token: string, d: { query: string }) {
    const [accessTokenSplit, accessSecretSplit] = token.split(':');
    const client = new TwitterApi({
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
