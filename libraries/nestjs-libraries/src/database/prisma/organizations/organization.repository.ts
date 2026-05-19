import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaRepository, PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Prisma, Role, ShortLinkPreference, State, SubscriptionTier } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isStripeBillingEnabled } from '@gitroom/helpers/stripe/stripe.billing.env';

/** Same logic as PostsRepository.dmsSentFromSettings — X plug DMs stored on post JSON. */
function postDmsSentFromSettings(settings: string | null | undefined): number {
  if (!settings) return 0;
  try {
    const o = JSON.parse(settings) as { auto_dm_sent_count?: unknown };
    const n = Number(o.auto_dm_sent_count);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

const ADMIN_PLUG_TITLES: Record<string, string> = {
  autoDmEngagers: 'Auto-DM people who engage (likes, reposts, replies)',
  'x-autoDmEngagers': 'Auto-DM people who engage (likes, reposts, replies)',
  autoDmFollowers: 'Auto-DM new followers',
  autoPlugPost: 'Auto-comment when engagement reaches a threshold',
  autoRepostPost: 'Auto-repost when likes reach a threshold',
  autoThreadReply: 'Auto-reply in thread when likes reach a threshold',
};

const ADMIN_PLUG_FIELD_LABELS: Record<string, string> = {
  message: 'Message text',
  likesAmount: 'Minimum likes before this runs',
  post: 'Comment / reply text',
  targetLikes: 'Include people who liked the post',
  targetRetweets: 'Include people who reposted',
  targetReplies: 'Include people who replied',
  thread: 'Thread reply text',
};

function humanizePlugKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function adminPlugFieldRows(data: string | null): {
  key: string;
  label: string;
  value: string;
  kind: 'bool' | 'number' | 'text';
}[] {
  if (!data?.trim()) return [];
  try {
    const arr = JSON.parse(data) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (row): row is { name: string; value?: unknown } =>
          !!row &&
          typeof row === 'object' &&
          typeof (row as { name?: unknown }).name === 'string'
      )
      .map((row) => {
        const key = String(row.name);
        const raw =
          row.value === undefined || row.value === null ? '' : String(row.value);
        const lower = raw.toLowerCase();
        const kind: 'bool' | 'number' | 'text' =
          lower === 'true' || lower === 'false'
            ? 'bool'
            : /^\d+$/.test(raw)
            ? 'number'
            : 'text';
        return {
          key,
          label: ADMIN_PLUG_FIELD_LABELS[key] ?? humanizePlugKey(key),
          value: raw,
          kind,
        };
      });
  } catch {
    return [
      {
        key: 'configuration',
        label: 'Stored configuration (could not parse)',
        value: data.length > 600 ? `${data.slice(0, 600)}…` : data,
        kind: 'text' as const,
      },
    ];
  }
}

@Injectable()
export class OrganizationRepository {
  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _user: PrismaRepository<'user'>,
    private _post: PrismaRepository<'post'>,
    private _integration: PrismaRepository<'integration'>,
    private _media: PrismaRepository<'media'>,
    private _prisma: PrismaService
  ) {}

  createMaxUser(id: string, name: string, saasName: string, email: string) {
    return this._organization.model.organization.create({
      select: {
        id: true,
        apiKey: true,
      },
      data: {
        name: name ? `${name}###${id}` : `Unnamed User###${id}`,
        apiKey: AuthService.fixedEncryption(makeId(20)),
        isTrailing: false,
        subscription: {
          create: {
            totalChannels: 1000000,
            subscriptionTier: 'ULTIMATE',
            isLifetime: true,
            period: 'YEARLY',
          },
        },
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated: true,
                email: email
                  ? email.split('@').join(`+${saasName}@`)
                  : `${saasName}+` + makeId(10) + '@postiz.com',
                name: name ? `${name}###${id}` : `Unnamed User###${id}`,
                providerName: 'LOCAL',
                password: AuthService.hashPassword(makeId(500)),
                timezone: 0,
              },
            },
          },
        },
      },
    });
  }

  getOrgByApiKey(api: string) {
    return this._organization.model.organization.findFirst({
      where: {
        apiKey: api,
      },
      include: {
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
          },
        },
      },
    });
  }

  getCount() {
    return this._organization.model.organization.count();
  }

  async getAdminHubSummary() {
    const [totalUsers, totalOrganizations, superAdminCount, byProvider] =
      await Promise.all([
        this._user.model.user.count(),
        this._organization.model.organization.count(),
        this._user.model.user.count({ where: { isSuperAdmin: true } }),
        this._user.model.user.groupBy({
          by: ['providerName'],
          _count: { _all: true },
        }),
      ]);

    return {
      totalUsers,
      totalOrganizations,
      superAdminCount,
      usersByProvider: byProvider.map((row) => ({
        provider: row.providerName,
        count: row._count._all,
      })),
    };
  }

  async getAdminPlatformAnalytics() {
    const now = new Date();
    const from7d = dayjs(now).subtract(7, 'day').toDate();
    const from30d = dayjs(now).subtract(30, 'day').toDate();
    const p = this._prisma;

    const [
      messagesTotal,
      messages7d,
      messages30d,
      messageGroupsTotal,
      postsTotal,
      postsByState,
      postsCreatedLast7Days,
      postsPublished,
      integrationsConnected,
      mediaAssets,
      newUsersLast30Days,
      newOrganizationsLast30Days,
      commentsTotal,
      comments30d,
      notificationsTotal,
      notifications30d,
      errorsTotal,
      errors7d,
      errors30d,
      webhooksTotal,
      autoPostRulesTotal,
      autoPostActive,
      plugsTotal,
      ordersTotal,
      ordersByStatus,
      topOrgsAgg,
      topCommenters,
    ] = await Promise.all([
      p.messages.count({ where: { deletedAt: null } }),
      p.messages.count({
        where: { deletedAt: null, createdAt: { gte: from7d } },
      }),
      p.messages.count({
        where: { deletedAt: null, createdAt: { gte: from30d } },
      }),
      p.messagesGroup.count(),
      p.post.count({ where: { deletedAt: null } }),
      p.post.groupBy({
        by: ['state'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      p.post.count({
        where: { deletedAt: null, createdAt: { gte: from7d } },
      }),
      p.post.count({
        where: { deletedAt: null, state: State.PUBLISHED },
      }),
      p.integration.count({
        where: { deletedAt: null, disabled: false },
      }),
      p.media.count({ where: { deletedAt: null } }),
      p.user.count({ where: { createdAt: { gte: from30d } } }),
      p.organization.count({ where: { createdAt: { gte: from30d } } }),
      p.comments.count({ where: { deletedAt: null } }),
      p.comments.count({
        where: { deletedAt: null, createdAt: { gte: from30d } },
      }),
      p.notifications.count({ where: { deletedAt: null } }),
      p.notifications.count({
        where: { deletedAt: null, createdAt: { gte: from30d } },
      }),
      p.errors.count(),
      p.errors.count({ where: { createdAt: { gte: from7d } } }),
      p.errors.count({ where: { createdAt: { gte: from30d } } }),
      p.webhooks.count({ where: { deletedAt: null } }),
      p.autoPost.count({ where: { deletedAt: null } }),
      p.autoPost.count({
        where: { deletedAt: null, active: true },
      }),
      p.plugs.count({ where: { activated: true } }),
      p.orders.count(),
      p.orders.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      p.post.groupBy({
        by: ['organizationId'],
        where: { deletedAt: null },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 12,
      }),
      p.comments.groupBy({
        by: ['userId'],
        where: { deletedAt: null },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 15,
      }),
    ]);

    let mastraMsgCount = 0;
    let mastraThreadsCount = 0;
    try {
      const m = await p.$queryRaw<{ c: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS c FROM mastra_messages`
      );
      mastraMsgCount = Number(m[0]?.c ?? 0);
    } catch {
      mastraMsgCount = 0;
    }
    try {
      const t = await p.$queryRaw<{ c: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS c FROM mastra_threads`
      );
      mastraThreadsCount = Number(t[0]?.c ?? 0);
    } catch {
      mastraThreadsCount = 0;
    }

    /** X / plug auto-DMs: sum of `auto_dm_sent_count` on Post.settings (not the Messages table). */
    let postAutoDmsTotal = 0;
    try {
      const dmAgg = await p.$queryRaw<{ c: bigint }[]>(
        Prisma.sql`
          SELECT COALESCE(SUM(
            GREATEST(0, FLOOR(COALESCE(
              NULLIF(trim(both ' ' from ("settings"::jsonb->>'auto_dm_sent_count')), '')::double precision,
              0
            )))
          ), 0)::bigint AS c
          FROM "Post"
          WHERE "deletedAt" IS NULL
            AND "settings" IS NOT NULL
            AND length(trim("settings")) > 2
        `
      );
      postAutoDmsTotal = Number(dmAgg[0]?.c ?? 0);
    } catch {
      postAutoDmsTotal = 0;
    }

    const orgIds = topOrgsAgg.map((row) => row.organizationId);
    const orgRows =
      orgIds.length > 0
        ? await p.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : [];
    const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));
    const topOrganizationsByPosts = topOrgsAgg.map((row) => ({
      organizationId: row.organizationId,
      name: orgNameById.get(row.organizationId) || 'Unknown',
      postCount: row._count.id,
    }));

    const commentUserIds = topCommenters.map((c) => c.userId);
    const commentUsers =
      commentUserIds.length > 0
        ? await p.user.findMany({
            where: { id: { in: commentUserIds } },
            select: { id: true, email: true, name: true },
          })
        : [];
    const userById = new Map(commentUsers.map((u) => [u.id, u]));
    const topUsersByComments = topCommenters.map((row) => {
      const u = userById.get(row.userId);
      return {
        userId: row.userId,
        email: u?.email ?? 'unknown',
        name: u?.name ?? null,
        commentCount: row._count.id,
      };
    });

    const topUsersByPostsRaw = await p.$queryRaw<
      { id: string; email: string; name: string | null; postCount: bigint }[]
    >(Prisma.sql`
      SELECT u.id, u.email, u.name, COUNT(DISTINCT p.id) AS "postCount"
      FROM "User" u
      INNER JOIN "UserOrganization" uo ON uo."userId" = u.id AND uo.disabled = false
      INNER JOIN "Post" p ON p."organizationId" = uo."organizationId" AND p."deletedAt" IS NULL
      GROUP BY u.id, u.email, u.name
      ORDER BY "postCount" DESC
      LIMIT 25
    `);
    const topUsersByPosts = topUsersByPostsRaw.map((row) => ({
      userId: row.id,
      email: row.email,
      name: row.name,
      postCount: Number(row.postCount),
    }));

    return {
      generatedAt: now.toISOString(),
      postAutoDms: {
        total: postAutoDmsTotal,
      },
      messages: {
        total: messagesTotal,
        last7Days: messages7d,
        last30Days: messages30d,
        conversationGroups: messageGroupsTotal,
      },
      posts: {
        total: postsTotal,
        published: postsPublished,
        last7Days: postsCreatedLast7Days,
        byState: postsByState.map((row) => ({
          state: row.state,
          count: row._count._all,
        })),
      },
      engagement: {
        commentsTotal,
        commentsLast30Days: comments30d,
        notificationsTotal,
        notificationsLast30Days: notifications30d,
      },
      health: {
        errorsTotal,
        errorsLast7Days: errors7d,
        errorsLast30Days: errors30d,
      },
      platform: {
        integrationsConnected,
        webhooksTotal,
        mediaAssets,
        autoPostRulesTotal,
        autoPostRulesActive: autoPostActive,
        plugsActive: plugsTotal,
        aiAgentMessagesTotal: mastraMsgCount,
        aiAgentThreadsTotal: mastraThreadsCount,
      },
      growth: {
        newUsersLast30Days: newUsersLast30Days,
        newOrganizationsLast30Days: newOrganizationsLast30Days,
      },
      marketplace: {
        ordersTotal,
        ordersByStatus: ordersByStatus.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
      },
      leaders: {
        topOrganizationsByPosts,
        topUsersByComments,
        topUsersByPosts,
      },
    };
  }

  private adminPostNotificationWhere(
    scope: 'post' | 'all'
  ): Prisma.NotificationsWhereInput {
    const base: Prisma.NotificationsWhereInput = { deletedAt: null };
    if (scope === 'all') {
      return base;
    }
    return {
      ...base,
      OR: [
        { content: { contains: 'published', mode: 'insensitive' } },
        { content: { contains: 'posting', mode: 'insensitive' } },
        { content: { contains: 'couldn', mode: 'insensitive' } },
        { content: { contains: 'reconnect', mode: 'insensitive' } },
        { content: { contains: 'Your post', mode: 'insensitive' } },
        { content: { contains: 'post has been', mode: 'insensitive' } },
        { content: { contains: 'Error posting', mode: 'insensitive' } },
        { content: { contains: 'comments on', mode: 'insensitive' } },
        { content: { contains: 'try again', mode: 'insensitive' } },
        { link: { not: null } },
      ],
    };
  }

  async listAdminPostNotifications(
    page: number,
    limit: number,
    scope: 'post' | 'all'
  ) {
    const p = this._prisma;
    const take = Math.min(100, Math.max(1, limit));
    const skip = Math.max(0, page) * take;
    const where = this.adminPostNotificationWhere(scope);

    const [rows, total] = await Promise.all([
      p.notifications.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          organizationId: true,
          content: true,
          link: true,
          createdAt: true,
          updatedAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),
      p.notifications.count({ where }),
    ]);

    const orgIds = [...new Set(rows.map((r) => r.organizationId))];
    const orgContacts = new Map<
      string,
      {
        userId: string;
        email: string;
        name: string | null;
        role: string;
        sendSuccessEmails: boolean;
        sendFailureEmails: boolean;
      }[]
    >();

    for (const oid of orgIds) {
      const members = await p.userOrganization.findMany({
        where: { organizationId: oid, disabled: false },
        take: 12,
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          userId: true,
          user: {
            select: {
              email: true,
              name: true,
              sendSuccessEmails: true,
              sendFailureEmails: true,
            },
          },
        },
      });
      orgContacts.set(
        oid,
        members.map((m) => ({
          userId: m.userId,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          sendSuccessEmails: m.user.sendSuccessEmails,
          sendFailureEmails: m.user.sendFailureEmails,
        }))
      );
    }

    return {
      page: Math.max(0, page),
      limit: take,
      total,
      scope,
      items: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        content: row.content,
        link: row.link,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        organizationContacts: orgContacts.get(row.organizationId) ?? [],
      })),
    };
  }

  async listAdminPostErrors(page: number, limit: number) {
    const p = this._prisma;
    const take = Math.min(100, Math.max(1, limit));
    const skip = Math.max(0, page) * take;

    const [rows, total] = await Promise.all([
      p.errors.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true } },
          post: {
            select: {
              id: true,
              content: true,
              title: true,
              description: true,
              state: true,
              publishDate: true,
              releaseURL: true,
              error: true,
              createdAt: true,
              updatedAt: true,
              organizationId: true,
              integrationId: true,
              integration: {
                select: {
                  id: true,
                  name: true,
                  providerIdentifier: true,
                  disabled: true,
                  refreshNeeded: true,
                },
              },
            },
          },
        },
      }),
      p.errors.count(),
    ]);

    const items = rows.map((row) => {
      let bodyParsed: unknown = null;
      try {
        bodyParsed = JSON.parse(row.body || '{}');
      } catch {
        bodyParsed = row.body;
      }
      return {
        id: row.id,
        message: row.message,
        platform: row.platform,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        postId: row.postId,
        bodyRaw: row.body,
        bodyParsed,
        post: {
          id: row.post.id,
          state: row.post.state,
          content: row.post.content,
          title: row.post.title,
          description: row.post.description,
          publishDate: row.post.publishDate.toISOString(),
          releaseURL: row.post.releaseURL,
          storedError: row.post.error,
          createdAt: row.post.createdAt.toISOString(),
          updatedAt: row.post.updatedAt.toISOString(),
          organizationId: row.post.organizationId,
          integration: row.post.integration,
        },
      };
    });

    return {
      page: Math.max(0, page),
      limit: take,
      total,
      items,
    };
  }

  async listAdminPosts(page: number, limit: number, search?: string) {
    const p = this._prisma;
    const take = Math.min(100, Math.max(1, limit));
    const skip = Math.max(0, page) * take;
    const q = search?.trim();

    const where: Prisma.PostWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { id: { contains: q } },
              { content: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              {
                organization: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      p.post.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          state: true,
          content: true,
          title: true,
          publishDate: true,
          releaseURL: true,
          error: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
          integrationId: true,
          parentPostId: true,
          intervalInDays: true,
          organization: { select: { id: true, name: true } },
          integration: {
            select: {
              id: true,
              name: true,
              providerIdentifier: true,
              disabled: true,
            },
          },
        },
      }),
      p.post.count({ where }),
    ]);

    return {
      page: Math.max(0, page),
      limit: take,
      total,
      search: q ?? null,
      items: rows.map((row) => ({
        ...row,
        publishDate: row.publishDate.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getAdminPostDetail(postId: string) {
    const p = this._prisma;
    const post = await p.post.findFirst({
      where: { id: postId, deletedAt: null },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            description: true,
          },
        },
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            type: true,
            disabled: true,
            refreshNeeded: true,
            deletedAt: true,
          },
        },
        lastMessage: {
          select: {
            id: true,
            from: true,
            content: true,
            createdAt: true,
            groupId: true,
          },
        },
        parentPost: {
          select: {
            id: true,
            state: true,
            content: true,
            publishDate: true,
          },
        },
        tags: {
          select: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });

    if (!post) {
      return null;
    }

    const orgId = post.organizationId;
    const intId = post.integrationId;

    const orgUsers = await p.userOrganization.findMany({
      where: { organizationId: orgId, disabled: false },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isSuperAdmin: true,
            sendSuccessEmails: true,
            sendFailureEmails: true,
            lastOnline: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const [childrenCount, errorsForPost, autoPostRules, activePlugsForIntegration] =
      await Promise.all([
      p.post.count({
        where: { parentPostId: postId, deletedAt: null },
      }),
      p.errors.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          message: true,
          platform: true,
          body: true,
          createdAt: true,
        },
      }),
      p.autoPost.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: {
          id: true,
          title: true,
          active: true,
          url: true,
          onSlot: true,
          syncLast: true,
          generateContent: true,
          integrations: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      p.plugs.findMany({
        where: { integrationId: intId, activated: true },
        select: {
          id: true,
          plugFunction: true,
          activated: true,
          data: true,
        },
      }),
    ]);

    let settingsParsed: unknown = null;
    try {
      settingsParsed = post.settings ? JSON.parse(post.settings) : null;
    } catch {
      settingsParsed = null;
    }

    const truncate = (s: string, n: number) =>
      s.length <= n ? s : `${s.slice(0, n)}…`;

    const plugDataPreview = (data: string | null) => {
      if (!data) return null;
      return truncate(data, 500);
    };

    const xAutoDmPlugRow = activePlugsForIntegration.find(
      (pl) =>
        pl.plugFunction === 'autoDmEngagers' ||
        pl.plugFunction === 'x-autoDmEngagers'
    );
    const settingsObj =
      settingsParsed && typeof settingsParsed === 'object'
        ? (settingsParsed as Record<string, unknown>)
        : null;
    const settingsKeys = settingsObj ? Object.keys(settingsObj) : [];

    return {
      post: {
        id: post.id,
        state: post.state,
        content: post.content,
        title: post.title,
        description: post.description,
        publishDate: post.publishDate.toISOString(),
        releaseURL: post.releaseURL,
        releaseId: post.releaseId,
        error: post.error,
        delay: post.delay,
        group: post.group,
        image: post.image,
        settingsRaw: post.settings,
        settingsParsed,
        settingsTopLevelKeys: settingsKeys,
        dmsSent: postDmsSentFromSettings(post.settings),
        autoDmEnabledInComposer:
          settingsObj?.auto_dm_enabled === true ||
          settingsObj?.auto_dm_enabled === 'true',
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        parentPostId: post.parentPostId,
        intervalInDays: post.intervalInDays,
        childrenCount,
        tags: post.tags.map((t) => t.tag),
        lastMessage: post.lastMessage
          ? {
              ...post.lastMessage,
              createdAt: post.lastMessage.createdAt.toISOString(),
            }
          : null,
        parentPost: post.parentPost
          ? {
              id: post.parentPost.id,
              state: post.parentPost.state,
              contentPreview: truncate(post.parentPost.content, 280),
              publishDate: post.parentPost.publishDate.toISOString(),
            }
          : null,
      },
      organization: post.organization,
      integration: {
        id: post.integration.id,
        name: post.integration.name,
        providerIdentifier: post.integration.providerIdentifier,
        type: post.integration.type,
        disabled: post.integration.disabled,
        refreshNeeded: post.integration.refreshNeeded,
        deletedAt: post.integration.deletedAt?.toISOString() ?? null,
      },
      teamMembers: orgUsers.map((uo) => ({
        userId: uo.userId,
        isPlatformSuperAdmin: uo.user.isSuperAdmin,
        email: uo.user.email,
        name: uo.user.name,
        sendSuccessEmails: uo.user.sendSuccessEmails,
        sendFailureEmails: uo.user.sendFailureEmails,
        lastOnline: uo.user.lastOnline.toISOString(),
      })),
      automation: {
        autoPostRules: autoPostRules.map((r) => ({
          ...r,
          integrationsPreview: truncate(r.integrations, 200),
        })),
        activePlugsOnChannel: activePlugsForIntegration.map((pl) => ({
          id: pl.id,
          plugFunction: pl.plugFunction,
          title:
            ADMIN_PLUG_TITLES[pl.plugFunction] ??
            humanizePlugKey(pl.plugFunction),
          activated: pl.activated,
          fields: adminPlugFieldRows(pl.data),
          dataPreview: plugDataPreview(pl.data),
        })),
        xAutoDmEngagersPlugActive: !!xAutoDmPlugRow,
        xAutoDmEngagersPlugDataPreview: xAutoDmPlugRow
          ? plugDataPreview(xAutoDmPlugRow.data)
          : null,
      },
      errors: errorsForPost.map((e) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(e.body || '{}');
        } catch {
          parsed = e.body;
        }
        return {
          id: e.id,
          message: e.message,
          platform: e.platform,
          createdAt: e.createdAt.toISOString(),
          bodyParsed: parsed,
        };
      }),
    };
  }

  getUserOrg(id: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: {
        id,
      },
      select: {
        user: true,
        organization: {
          include: {
            users: {
              select: {
                id: true,
                disabled: true,
                role: true,
                userId: true,
              },
            },
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
      },
    });
  }

  getImpersonateUser(name: string) {
    return this._userOrg.model.userOrganization.findMany({
      where: {
        OR: [
          {
            organizationId: {
              contains: name,
            },
          },
          {
            user: {
              OR: [
                {
                  name: {
                    contains: name,
                  },
                },
                {
                  email: {
                    contains: name,
                  },
                },
                {
                  id: {
                    contains: name,
                  },
                },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        organization: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  updateApiKey(orgId: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        apiKey: AuthService.fixedEncryption(makeId(20)),
      },
    });
  }

  async getOrgsByUserId(userId: string) {
    return this._organization.model.organization.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      include: {
        users: {
          where: {
            userId,
          },
          select: {
            disabled: true,
            role: true,
          },
        },
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getOrgById(id: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id,
      },
    });
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'USER' | 'ADMIN'
  ) {
    const checkIfInviteExists = await this._user.model.user.findFirst({
      where: {
        inviteId: id,
      },
    });

    if (checkIfInviteExists) {
      return false;
    }

    const checkForSubscription =
      await this._organization.model.organization.findFirst({
        where: {
          id: orgId,
        },
        select: {
          subscription: true,
        },
      });

    if (
      isStripeBillingEnabled() &&
      checkForSubscription?.subscription?.subscriptionTier ===
        SubscriptionTier.STANDARD
    ) {
      return false;
    }

    const create = await this._userOrg.model.userOrganization.create({
      data: {
        role,
        userId,
        organizationId: orgId,
      },
    });

    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        inviteId: id,
      },
    });

    return create;
  }

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & { providerId?: string },
    hasEmail: boolean,
    ip: string,
    userAgent: string
  ) {
    return this._organization.model.organization.create({
      data: {
        name: body.company,
        apiKey: AuthService.fixedEncryption(makeId(20)),
        allowTrial: true,
        isTrailing: true,
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated: body.provider !== 'LOCAL' || !hasEmail,
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : '',
                providerName: body.provider,
                providerId: body.providerId || '',
                timezone: 0,
                ip,
                agent: userAgent,
              },
            },
          },
        },
      },
      select: {
        id: true,
        users: {
          select: {
            user: true,
          },
        },
      },
    });
  }

  getOrgByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    try {
      await this._organization.model.organization.update({
        where: {
          id: organizationId,
          ...(type === 'start'
            ? {
                streakSince: null,
              }
            : {}),
        },
        data: {
          ...(type === 'end' ? { streakSince: null } : {}),
          ...(type === 'start' ? { streakSince: new Date() } : {}),
        },
      });
    } catch (err) {}
  }

  async getTeam(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            role: true,
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
                sendStreakEmails: true,
              },
            },
          },
        },
      },
    });
  }

  getAllUsersOrgs(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteTeamMember(orgId: string, userId: string) {
    return this._userOrg.model.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._userOrg.model.userOrganization.updateMany({
      where: {
        organizationId: orgId,
        role: {
          not: Role.SUPERADMIN,
        },
      },
      data: {
        disabled: disable,
      },
    });
  }

  getShortlinkPreference(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        shortlink: true,
      },
    });
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        shortlink,
      },
    });
  }
}
