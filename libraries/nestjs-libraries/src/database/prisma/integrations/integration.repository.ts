import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';

@Injectable()
export class IntegrationRepository {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _posts: PrismaRepository<'post'>,
    private _plugs: PrismaRepository<'plugs'>,
    private _exisingPlugData: PrismaRepository<'exisingPlugData'>,
    private _customers: PrismaRepository<'customer'>,
    private _mentions: PrismaRepository<'mentions'>
  ) {}

  getMentions(platform: string, q: string) {
    return this._mentions.model.mentions.findMany({
      where: {
        platform,
        OR: [
          {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
          {
            username: {
              contains: q,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        name: 'asc',
      },
      take: 100,
      select: {
        name: true,
        username: true,
        image: true,
      },
    });
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    if (mentions.length === 0) {
      return [] as any[];
    }
    return this._mentions.model.mentions.createMany({
      data: mentions.map((mention) => ({
        platform,
        name: mention.name,
        username: mention.username,
        image: mention.image,
      })),
      skipDuplicates: true,
    });
  }

  async checkPreviousConnections(org: string, id: string) {
    const findIt = await this._integration.model.integration.findMany({
      where: {
        rootInternalId: id,
      },
      select: {
        organizationId: true,
        id: true,
      },
    });

    if (findIt.some((f) => f.organizationId === org)) {
      return false;
    }

    return findIt.length > 0;
  }

  updateProviderSettings(org: string, id: string, settings: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        additionalSettings: settings,
      },
    });
  }

  async setTimes(org: string, id: string, times: IntegrationTimeDto) {
    return this._integration.model.integration.update({
      select: {
        id: true,
      },
      where: {
        id,
        organizationId: org,
      },
      data: {
        postingTimes: JSON.stringify(times.time),
      },
    });
  }

  getPlug(plugId: string) {
    return this._plugs.model.plugs.findFirst({
      where: {
        id: plugId,
      },
      include: {
        integration: true,
      },
    });
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._plugs.model.plugs.findMany({
      where: {
        integrationId,
        organizationId: orgId,
        activated: true,
      },
      include: {
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
          },
        },
      },
    });
  }

  async updateIntegration(id: string, params: Partial<Integration>) {
    if (
      params.picture &&
      (params.picture.indexOf(process.env.CLOUDFLARE_BUCKET_URL!) === -1 ||
        params.picture.indexOf(process.env.FRONTEND_URL!) === -1)
    ) {
      params.picture = await this.storage.uploadSimple(params.picture);
    }

    const existing = await this._integration.model.integration.findUnique({
      where: {
        organizationId_internalId: {
          organizationId: params.organizationId!,
          internalId: params.internalId,
        },
      },
    });

    if (existing) {
      await this._posts.model.post.updateMany({
        where: {
          integrationId: id,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await this._integration.model.integration.update({
        where: {
          id,
        },
        data: {
          internalId: `deleted_${params.internalId}_${makeId(10)}`,
          deletedAt: new Date(),
        },
      });
    }

    return this._integration.model.integration.update({
      where: {
        ...(existing ? { id: existing.id } : { id }),
      },
      data: {
        ...params,
        disabled: false,
        deletedAt: null,
      },
    });
  }

  disconnectChannel(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        refreshNeeded: true,
      },
    });
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn = 999999999,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const postTimes = timezone
      ? {
          postingTimes: JSON.stringify([
            { time: 560 - timezone },
            { time: 850 - timezone },
            { time: 1140 - timezone },
          ]),
        }
      : {};
    const upsert = await this._integration.model.integration.upsert({
      where: {
        organizationId_internalId: {
          internalId,
          organizationId: org,
        },
      },
      create: {
        type: type as any,
        name,
        providerIdentifier: provider,
        token,
        profile: username,
        ...(picture ? { picture } : {}),
        inBetweenSteps: isBetweenSteps,
        refreshToken,
        ...(expiresIn
          ? { tokenExpiration: new Date(Date.now() + expiresIn * 1000) }
          : {}),
        internalId,
        ...postTimes,
        organizationId: org,
        refreshNeeded: false,
        rootInternalId: internalId,
        ...(customInstanceDetails ? { customInstanceDetails } : {}),
        additionalSettings: additionalSettings
          ? JSON.stringify(additionalSettings)
          : '[]',
      },
      update: {
        ...(additionalSettings
          ? { additionalSettings: JSON.stringify(additionalSettings) }
          : {}),
        ...(customInstanceDetails ? { customInstanceDetails } : {}),
        type: type as any,
        ...(!refresh
          ? {
              inBetweenSteps: isBetweenSteps,
            }
          : {}),
        ...(picture ? { picture } : {}),
        profile: username,
        providerIdentifier: provider,
        token,
        refreshToken,
        ...(expiresIn
          ? { tokenExpiration: new Date(Date.now() + expiresIn * 1000) }
          : {}),
        internalId,
        organizationId: org,
        deletedAt: null,
        refreshNeeded: false,
      },
    });

    if (oneTimeToken) {
      const rootId =
        (
          await this._integration.model.integration.findFirst({
            where: {
              organizationId: org,
              internalId: internalId,
            },
          })
        )?.rootInternalId || internalId;

      await this._integration.model.integration.updateMany({
        where: {
          id: {
            not: upsert.id,
          },
          rootInternalId: rootId,
        },
        data: {
          token,
          refreshToken,
          refreshNeeded: false,
          ...(expiresIn
            ? { tokenExpiration: new Date(Date.now() + expiresIn * 1000) }
            : {}),
        },
      });
    }

    if (type === 'social' && internalId) {
      await this.relinkOrphanedPostsToIntegration(org, internalId, upsert.id);
    }

    return upsert;
  }

  /**
   * After reconnecting the same social account, posts may still point at an older
   * integration row (e.g. soft-deleted channel or mangled internalId). Move them
   * to the active integration so calendar/queue show them again.
   */
  async relinkOrphanedPostsToIntegration(
    org: string,
    internalId: string,
    targetIntegrationId: string
  ) {
    const siblingIntegrations = await this._integration.model.integration.findMany(
      {
        where: {
          organizationId: org,
          OR: [
            { internalId },
            { rootInternalId: internalId },
            { internalId: { startsWith: `deleted_${internalId}_` } },
          ],
        },
        select: { id: true },
      }
    );

    const sourceIds = siblingIntegrations
      .map((row) => row.id)
      .filter((id) => id !== targetIntegrationId);

    if (!sourceIds.length) {
      return;
    }

    await this._posts.model.post.updateMany({
      where: {
        organizationId: org,
        integrationId: { in: sourceIds },
        deletedAt: null,
      },
      data: {
        integrationId: targetIntegrationId,
      },
    });
  }

  needsToBeRefreshed() {
    return this._integration.model.integration.findMany({
      where: {
        tokenExpiration: {
          lte: dayjs().add(1, 'day').toDate(),
        },
        inBetweenSteps: false,
        deletedAt: null,
        refreshNeeded: false,
      },
    });
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
      },
      data: {
        inBetweenSteps: true,
      },
    });
  }
  refreshNeeded(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        refreshNeeded: true,
      },
    });
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integration.model.integration.update({
      where: {
        id,
      },
      data: {
        ...(name ? { name } : {}),
        ...(url ? { picture: url } : {}),
      },
    });
  }

  getIntegrationById(org: string, id: string) {
    return this._integration.model.integration.findFirst({
      where: {
        organizationId: org,
        id,
      },
    });
  }

  async getIntegrationForOrder(
    id: string,
    order: string,
    user: string,
    org: string
  ) {
    const integration = await this._posts.model.post.findFirst({
      where: {
        integrationId: id,
        submittedForOrder: {
          id: order,
          messageGroup: {
            OR: [
              { sellerId: user },
              { buyerId: user },
              { buyerOrganizationId: org },
            ],
          },
        },
      },
      select: {
        integration: {
          select: {
            id: true,
            name: true,
            picture: true,
            inBetweenSteps: true,
            providerIdentifier: true,
          },
        },
      },
    });

    return integration?.integration;
  }

  async updateOnCustomerName(org: string, id: string, name: string) {
    const customer = !name
      ? undefined
      : (await this._customers.model.customer.findFirst({
          where: {
            orgId: org,
            name,
          },
        })) ||
        (await this._customers.model.customer.create({
          data: {
            name,
            orgId: org,
          },
        }));

    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        customer: !customer
          ? { disconnect: true }
          : {
              connect: {
                id: customer.id,
              },
            },
      },
    });
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: !group
        ? {
            customer: {
              disconnect: true,
            },
          }
        : {
            customer: {
              connect: {
                id: group,
              },
            },
          },
    });
  }

  customers(orgId: string) {
    return this._customers.model.customer.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
    });
  }

  getIntegrationsList(org: string) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
      },
      include: {
        customer: true,
      },
    });
  }

  async disableChannel(org: string, id: string) {
    await this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        disabled: true,
      },
    });
  }

  async enableChannel(org: string, id: string) {
    await this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        disabled: false,
      },
    });
  }

  getPostsForChannel(org: string, id: string) {
    return this._posts.model.post.groupBy({
      by: ['group'],
      where: {
        organizationId: org,
        integrationId: id,
        deletedAt: null,
      },
    });
  }

  deleteChannel(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integration.model.integration.updateMany({
      where: {
        organizationId: org,
        internalId: page,
        deletedAt: {
          not: null,
        },
      },
      data: {
        internalId: makeId(10),
      },
    });
  }

  async disableIntegrations(org: string, totalChannels: number) {
    const getChannels = await this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        disabled: false,
        deletedAt: null,
      },
      take: totalChannels,
      select: {
        id: true,
      },
    });

    for (const channel of getChannels) {
      await this._integration.model.integration.update({
        where: {
          id: channel.id,
        },
        data: {
          disabled: true,
        },
      });
    }
  }

  getPlugsByIntegrationId(org: string, id: string) {
    return this._plugs.model.plugs.findMany({
      where: {
        organizationId: org,
        integrationId: id,
      },
    });
  }

  // Look up the Postiz post that was published as the given X (or other
  // platform) tweet ID. Used by processPlugs to read per-post settings
  // (auto-DM message override, target toggles, etc.) when invoking a plug.
  // Returns null if no matching published post exists.
  getPostByReleaseId(integrationId: string, releaseId: string) {
    return this._posts.model.post.findFirst({
      where: {
        integrationId,
        releaseId,
      },
      select: {
        id: true,
        settings: true,
        integrationId: true,
      },
    });
  }

  findActiveXIntegrationsByInternalId(internalId: string) {
    return this._integration.model.integration.findMany({
      where: {
        internalId: String(internalId),
        providerIdentifier: 'x',
        deletedAt: null,
        disabled: false,
      },
    });
  }

  /** Find X channel(s) that published this tweet id (releaseId). */
  findXChannelsByPostReleaseId(releaseId: string) {
    const id = String(releaseId ?? '').trim();
    if (!id) {
      return Promise.resolve([]);
    }
    return this._posts.model.post.findMany({
      where: {
        releaseId: id,
        deletedAt: null,
        state: 'PUBLISHED',
        integration: {
          providerIdentifier: 'x',
          deletedAt: null,
          disabled: false,
        },
      },
      select: {
        integration: {
          select: {
            id: true,
            profile: true,
            organizationId: true,
          },
        },
      },
      take: 5,
    }).then((rows) => rows.map((r) => r.integration).filter(Boolean));
  }

  findActiveXIntegrationsByProfile(profile: string) {
    const normalized = profile.trim().replace(/^@+/i, '').toLowerCase();
    if (!normalized) {
      return Promise.resolve([]);
    }
    return this._integration.model.integration.findMany({
      where: {
        providerIdentifier: 'x',
        deletedAt: null,
        disabled: false,
        profile: {
          equals: normalized,
          mode: 'insensitive',
        },
      },
    });
  }

  /** X channels to register on TweetStream (profile handle required). */
  listXIntegrationsForTweetStreamSync() {
    const trackAll =
      process.env.TWEETSTREAM_TRACK_ALL_X?.trim() === 'true' ||
      process.env.TWEETSTREAM_TRACK_ALL_X?.trim() === '1';

    if (trackAll) {
      return this._integration.model.integration.findMany({
        where: {
          providerIdentifier: 'x',
          deletedAt: null,
          disabled: false,
          profile: { not: null },
        },
        select: { profile: true },
      });
    }

    return this._plugs.model.plugs.findMany({
      where: {
        activated: true,
        plugFunction: {
          in: ['autoDmEngagers', 'autoDmFollowers', 'autoDmPinnedPost'],
        },
        integration: {
          providerIdentifier: 'x',
          deletedAt: null,
          disabled: false,
          profile: { not: null },
        },
      },
      select: {
        integration: { select: { profile: true } },
      },
      distinct: ['integrationId'],
    }).then((rows) =>
      rows.map((r) => ({ profile: r.integration.profile }))
    );
  }

  getActivePlugByFunction(
    organizationId: string,
    integrationId: string,
    plugFunction: string
  ) {
    return this._plugs.model.plugs.findFirst({
      where: {
        organizationId,
        integrationId,
        plugFunction,
        activated: true,
      },
    });
  }

  listActiveProfileAutomationPlugIds(integrationId: string) {
    return this._plugs.model.plugs
      .findMany({
        where: {
          integrationId,
          activated: true,
          plugFunction: {
            in: ['autoDeleteProfile', 'autoDeleteReposts', 'autoDmPinnedPost'],
          },
        },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));
  }

  listActiveEngagementPlugIds(integrationId: string) {
    return this._plugs.model.plugs
      .findMany({
        where: {
          integrationId,
          activated: true,
          plugFunction: {
            in: [
              'autoDmEngagers',
              'autoRepostPost',
              'autoPlugPost',
              'autoThreadReply',
            ],
          },
        },
        select: { id: true, plugFunction: true },
      })
      .then((rows) => rows.map((r) => ({ id: r.id, plugFunction: r.plugFunction })));
  }

  /** Published X posts with a platform tweet id (newest first). */
  listPublishedPostReleaseIds(integrationId: string, take = 100) {
    return this._posts.model.post.findMany({
      where: {
        integrationId,
        deletedAt: null,
        state: 'PUBLISHED',
        releaseId: { not: null, notIn: ['missing', ''] },
      },
      orderBy: [{ updatedAt: 'desc' }, { publishDate: 'desc' }],
      take,
      select: { releaseId: true, settings: true },
    });
  }

  listActiveFollowerDmPlugs() {
    return this._plugs.model.plugs.findMany({
      where: {
        activated: true,
        plugFunction: 'autoDmFollowers',
        integration: {
          providerIdentifier: 'x',
          deletedAt: null,
          disabled: false,
        },
      },
      select: {
        id: true,
        integrationId: true,
        organizationId: true,
      },
    });
  }

  listXIntegrationsWithActiveProfileAutomationPlugs() {
    return this._plugs.model.plugs.findMany({
      where: {
        activated: true,
        plugFunction: {
          in: ['autoDeleteProfile', 'autoDeleteReposts', 'autoDmPinnedPost'],
        },
        integration: {
          providerIdentifier: 'x',
          deletedAt: null,
          disabled: false,
        },
      },
      select: {
        integrationId: true,
        organizationId: true,
      },
      distinct: ['integrationId'],
    });
  }

  listXIntegrationsWithActiveEngagementPlugs() {
    return this._plugs.model.plugs.findMany({
      where: {
        activated: true,
        plugFunction: {
          in: [
            'autoDmEngagers',
            'autoRepostPost',
            'autoPlugPost',
            'autoThreadReply',
          ],
        },
        integration: {
          providerIdentifier: 'x',
          deletedAt: null,
          disabled: false,
        },
      },
      select: {
        integrationId: true,
        organizationId: true,
      },
      distinct: ['integrationId'],
    });
  }

  /** Bump per-post auto-DM counter stored in Post.settings JSON (dashboard queue). */
  async incrementAutoDmSentCountForPost(
    integrationId: string,
    releaseId: string,
    addedCount: number
  ) {
    if (!addedCount) return;
    const post = await this._posts.model.post.findFirst({
      where: { integrationId, releaseId },
      select: { id: true, settings: true },
    });
    if (!post) return;
    let parsed: Record<string, unknown> = {};
    if (post.settings) {
      try {
        parsed = JSON.parse(post.settings) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }
    const prev = Number(parsed.auto_dm_sent_count);
    const safePrev = Number.isFinite(prev) ? Math.max(0, Math.floor(prev)) : 0;
    parsed.auto_dm_sent_count = safePrev + addedCount;
    await this._posts.model.post.update({
      where: { id: post.id },
      data: { settings: JSON.stringify(parsed) },
    });
  }

  createOrUpdatePlug(org: string, integrationId: string, body: PlugDto) {
    return this._plugs.model.plugs.upsert({
      where: {
        organizationId: org,
        plugFunction_integrationId: {
          integrationId,
          plugFunction: body.func,
        },
      },
      create: {
        integrationId,
        organizationId: org,
        plugFunction: body.func,
        data: JSON.stringify(body.fields),
        activated: true,
      },
      update: {
        data: JSON.stringify(body.fields),
        activated: true,
      },
      select: {
        activated: true,
        id: true,
        integrationId: true,
        organizationId: true,
        plugFunction: true,
      },
    });
  }

  deactivatePlugByFunction(
    organizationId: string,
    integrationId: string,
    plugFunction: string
  ) {
    return this._plugs.model.plugs.updateMany({
      where: {
        organizationId,
        integrationId,
        plugFunction,
      },
      data: { activated: false },
    });
  }

  changePlugActivation(orgId: string, plugId: string, status: boolean) {
    return this._plugs.model.plugs.update({
      where: {
        organizationId: orgId,
        id: plugId,
      },
      data: {
        activated: !!status,
      },
    });
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    return this._exisingPlugData.model.exisingPlugData.findMany({
      where: {
        integrationId,
        methodName,
        value: {
          in: id,
        },
      },
    });
  }

  /**
   * Count how many distinct engager-DM recipients were recorded for each tweet
   * (`value` = `<tweetId>:<recipientUserId>`). Matches what autoDmEngagers actually
   * persisted after successful sends — not Post.settings JSON counters.
   */
  async countAutoDmEngagersByTweetIds(
    integrationId: string,
    tweetIds: string[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const uniq = [...new Set((tweetIds || []).filter(Boolean))];
    for (const id of uniq) {
      counts.set(id, 0);
    }
    if (!uniq.length) {
      return counts;
    }
    const rows = await this._exisingPlugData.model.exisingPlugData.findMany({
      where: {
        integrationId,
        methodName: 'autoDmEngagers',
        OR: uniq.map((id) => ({ value: { startsWith: `${id}:` } })),
      },
      select: { value: true },
    });
    for (const r of rows) {
      const colon = r.value.indexOf(':');
      if (colon < 1) continue;
      const tid = r.value.slice(0, colon);
      if (!counts.has(tid)) continue;
      counts.set(tid, (counts.get(tid) || 0) + 1);
    }
    return counts;
  }

  async saveExisingData(
    methodName: string,
    integrationId: string,
    value: string[]
  ) {
    return this._exisingPlugData.model.exisingPlugData.createMany({
      data: value.map((p) => ({
        integrationId,
        methodName,
        value: p,
      })),
      skipDuplicates: true,
    });
  }

  async deleteExisingDataValues(
    methodName: string,
    integrationId: string,
    values: string[]
  ) {
    if (!values.length) {
      return { count: 0 };
    }
    return this._exisingPlugData.model.exisingPlugData.deleteMany({
      where: {
        integrationId,
        methodName,
        value: { in: values },
      },
    });
  }

  async listExisingDataWithPrefix(
    methodName: string,
    integrationId: string,
    prefix: string
  ) {
    return this._exisingPlugData.model.exisingPlugData.findMany({
      where: {
        integrationId,
        methodName,
        value: { startsWith: prefix },
      },
      select: { value: true },
    });
  }

  async getPostingTimes(orgId: string, integrationsId?: string) {
    return this._integration.model.integration.findMany({
      where: {
        ...(integrationsId ? { id: integrationsId } : {}),
        organizationId: orgId,
        disabled: false,
        deletedAt: null,
      },
      select: {
        postingTimes: true,
      },
    });
  }
}
