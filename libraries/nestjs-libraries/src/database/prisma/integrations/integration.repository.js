"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const make_is_1 = require("../../../services/make.is");
const upload_factory_1 = require("../../../upload/upload.factory");
let IntegrationRepository = class IntegrationRepository {
    constructor(_integration, _posts, _plugs, _exisingPlugData, _customers, _mentions) {
        this._integration = _integration;
        this._posts = _posts;
        this._plugs = _plugs;
        this._exisingPlugData = _exisingPlugData;
        this._customers = _customers;
        this._mentions = _mentions;
        this.storage = upload_factory_1.UploadFactory.createStorage();
    }
    getMentions(platform, q) {
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
    insertMentions(platform, mentions) {
        if (mentions.length === 0) {
            return [];
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
    async checkPreviousConnections(org, id) {
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
    updateProviderSettings(org, id, settings) {
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
    async setTimes(org, id, times) {
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
    getPlug(plugId) {
        return this._plugs.model.plugs.findFirst({
            where: {
                id: plugId,
            },
            include: {
                integration: true,
            },
        });
    }
    async getPlugs(orgId, integrationId) {
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
    async updateIntegration(id, params) {
        if (params.picture &&
            (params.picture.indexOf(process.env.CLOUDFLARE_BUCKET_URL) === -1 ||
                params.picture.indexOf(process.env.FRONTEND_URL) === -1)) {
            params.picture = await this.storage.uploadSimple(params.picture);
        }
        const existing = await this._integration.model.integration.findUnique({
            where: {
                organizationId_internalId: {
                    organizationId: params.organizationId,
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
                    internalId: `deleted_${params.internalId}_${(0, make_is_1.makeId)(10)}`,
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
    disconnectChannel(org, id) {
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
    async createOrUpdateIntegration(additionalSettings, oneTimeToken, org, name, picture, type, internalId, provider, token, refreshToken = '', expiresIn = 999999999, username, isBetweenSteps = false, refresh, timezone, customInstanceDetails) {
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
                type: type,
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
                type: type,
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
            const rootId = (await this._integration.model.integration.findFirst({
                where: {
                    organizationId: org,
                    internalId: internalId,
                },
            }))?.rootInternalId || internalId;
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
    async relinkOrphanedPostsToIntegration(org, internalId, targetIntegrationId) {
        const siblingIntegrations = await this._integration.model.integration.findMany({
            where: {
                organizationId: org,
                OR: [
                    { internalId },
                    { rootInternalId: internalId },
                    { internalId: { startsWith: `deleted_${internalId}_` } },
                ],
            },
            select: { id: true },
        });
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
                    lte: (0, dayjs_1.default)().add(1, 'day').toDate(),
                },
                inBetweenSteps: false,
                deletedAt: null,
                refreshNeeded: false,
            },
        });
    }
    async setBetweenRefreshSteps(id) {
        return this._integration.model.integration.update({
            where: {
                id,
            },
            data: {
                inBetweenSteps: true,
            },
        });
    }
    refreshNeeded(org, id) {
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
    updateNameAndUrl(id, name, url) {
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
    getIntegrationById(org, id) {
        return this._integration.model.integration.findFirst({
            where: {
                organizationId: org,
                id,
            },
        });
    }
    async getIntegrationForOrder(id, order, user, org) {
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
    async updateOnCustomerName(org, id, name) {
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
    updateIntegrationGroup(org, id, group) {
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
    customers(orgId) {
        return this._customers.model.customer.findMany({
            where: {
                orgId,
                deletedAt: null,
            },
        });
    }
    getIntegrationsList(org) {
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
    async disableChannel(org, id) {
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
    async enableChannel(org, id) {
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
    getPostsForChannel(org, id) {
        return this._posts.model.post.groupBy({
            by: ['group'],
            where: {
                organizationId: org,
                integrationId: id,
                deletedAt: null,
            },
        });
    }
    deleteChannel(org, id) {
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
    async checkForDeletedOnceAndUpdate(org, page) {
        return this._integration.model.integration.updateMany({
            where: {
                organizationId: org,
                internalId: page,
                deletedAt: {
                    not: null,
                },
            },
            data: {
                internalId: (0, make_is_1.makeId)(10),
            },
        });
    }
    async disableIntegrations(org, totalChannels) {
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
    getPlugsByIntegrationId(org, id) {
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
    getPostByReleaseId(integrationId, releaseId) {
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
    findActiveXIntegrationsByInternalId(internalId) {
        return this._integration.model.integration.findMany({
            where: {
                internalId: String(internalId),
                providerIdentifier: 'x',
                deletedAt: null,
                disabled: false,
            },
        });
    }
    /**
     * Recent published X posts for a channel profile (for TweetStream parent-tweet inference).
     */
    findRecentPublishedXPostsByProfile(profile, hours = 72, limit = 5) {
        const normalized = profile.trim().replace(/^@+/i, '').toLowerCase();
        if (!normalized) {
            return Promise.resolve([]);
        }
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this._posts.model.post.findMany({
            where: {
                deletedAt: null,
                state: 'PUBLISHED',
                publishDate: { gte: since },
                releaseId: { not: null, notIn: ['', 'missing'] },
                integration: {
                    providerIdentifier: 'x',
                    deletedAt: null,
                    disabled: false,
                    profile: {
                        equals: normalized,
                        mode: 'insensitive',
                    },
                },
            },
            orderBy: { publishDate: 'desc' },
            take: limit,
            select: {
                id: true,
                releaseId: true,
                publishDate: true,
                content: true,
            },
        });
    }
    /** Find X channel(s) that published this tweet id (releaseId). */
    findXChannelsByPostReleaseId(releaseId) {
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
    findActiveXIntegrationsByProfile(profile) {
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
    /** Active X channels for Tweetmax stream monitor (profile handle required). */
    listXIntegrationsForMonitor(limit) {
        return this._integration.model.integration.findMany({
            where: {
                providerIdentifier: 'x',
                deletedAt: null,
                disabled: false,
                profile: { not: null },
            },
            select: { id: true, profile: true },
            take: limit,
            orderBy: { createdAt: 'asc' },
        });
    }
    /** X channels to register on TweetStream (profile handle required). */
    listXIntegrationsForTweetStreamSync() {
        const trackAll = process.env.TWEETSTREAM_TRACK_ALL_X?.trim() === 'true' ||
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
        }).then((rows) => rows.map((r) => ({ profile: r.integration.profile })));
    }
    getActivePlugByFunction(organizationId, integrationId, plugFunction) {
        return this._plugs.model.plugs.findFirst({
            where: {
                organizationId,
                integrationId,
                plugFunction,
                activated: true,
            },
        });
    }
    listActiveProfileAutomationPlugIds(integrationId) {
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
    listActiveEngagementPlugIds(integrationId) {
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
    listPublishedPostReleaseIds(integrationId, take = 100) {
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
    async incrementAutoDmSentCountForPost(integrationId, releaseId, addedCount) {
        if (!addedCount)
            return;
        const post = await this._posts.model.post.findFirst({
            where: { integrationId, releaseId },
            select: { id: true, settings: true },
        });
        if (!post)
            return;
        let parsed = {};
        if (post.settings) {
            try {
                parsed = JSON.parse(post.settings);
            }
            catch {
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
    createOrUpdatePlug(org, integrationId, body) {
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
    deactivatePlugByFunction(organizationId, integrationId, plugFunction) {
        return this._plugs.model.plugs.updateMany({
            where: {
                organizationId,
                integrationId,
                plugFunction,
            },
            data: { activated: false },
        });
    }
    changePlugActivation(orgId, plugId, status) {
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
    async loadExisingData(methodName, integrationId, id) {
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
    async countAutoDmEngagersByTweetIds(integrationId, tweetIds) {
        const counts = new Map();
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
            if (colon < 1)
                continue;
            const tid = r.value.slice(0, colon);
            if (!counts.has(tid))
                continue;
            counts.set(tid, (counts.get(tid) || 0) + 1);
        }
        return counts;
    }
    async saveExisingData(methodName, integrationId, value) {
        return this._exisingPlugData.model.exisingPlugData.createMany({
            data: value.map((p) => ({
                integrationId,
                methodName,
                value: p,
            })),
            skipDuplicates: true,
        });
    }
    async deleteExisingDataValues(methodName, integrationId, values) {
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
    async listExisingDataWithPrefix(methodName, integrationId, prefix) {
        return this._exisingPlugData.model.exisingPlugData.findMany({
            where: {
                integrationId,
                methodName,
                value: { startsWith: prefix },
            },
            select: { value: true },
        });
    }
    async getPostingTimes(orgId, integrationsId) {
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
};
exports.IntegrationRepository = IntegrationRepository;
exports.IntegrationRepository = IntegrationRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository,
        prisma_service_1.PrismaRepository,
        prisma_service_1.PrismaRepository,
        prisma_service_1.PrismaRepository,
        prisma_service_1.PrismaRepository,
        prisma_service_1.PrismaRepository])
], IntegrationRepository);
//# sourceMappingURL=integration.repository.js.map