"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostsService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const posts_repository_1 = require("./posts.repository");
const create_post_dto_1 = require("../../../dtos/posts/create.post.dto");
const parse_tweet_url_1 = require("../../../helpers/x/parse-tweet-url");
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const integration_manager_1 = require("../../../integrations/integration.manager");
const lodash_1 = require("lodash");
const integration_service_1 = require("../integrations/integration.service");
const make_is_1 = require("../../../services/make.is");
const utc_1 = tslib_1.__importDefault(require("dayjs/plugin/utc"));
const media_service_1 = require("../media/media.service");
const short_link_service_1 = require("../../../short-linking/short.link.service");
const posts_list_minify_1 = require("../../../../../helpers/src/utils/posts.list.minify");
const axios_1 = tslib_1.__importDefault(require("axios"));
const sharp_1 = tslib_1.__importDefault(require("sharp"));
const upload_factory_1 = require("../../../upload/upload.factory");
const stream_1 = require("stream");
const openai_service_1 = require("../../../openai/openai.service");
dayjs_1.default.extend(utc_1.default);
const Sentry = tslib_1.__importStar(require("@sentry/nestjs"));
const nestjs_temporal_core_1 = require("nestjs-temporal-core");
const common_2 = require("@temporalio/common");
const temporal_search_attribute_1 = require("../../../temporal/temporal.search.attribute");
const timer_1 = require("../../../../../helpers/src/utils/timer");
const redis_service_1 = require("../../../redis/redis.service");
const social_abstract_1 = require("../../../integrations/social.abstract");
const refresh_integration_service_1 = require("../../../integrations/refresh.integration.service");
let PostsService = class PostsService {
    constructor(_postRepository, _integrationManager, _integrationService, _mediaService, _shortLinkService, _openaiService, _temporalService, _refreshIntegrationService) {
        this._postRepository = _postRepository;
        this._integrationManager = _integrationManager;
        this._integrationService = _integrationService;
        this._mediaService = _mediaService;
        this._shortLinkService = _shortLinkService;
        this._openaiService = _openaiService;
        this._temporalService = _temporalService;
        this._refreshIntegrationService = _refreshIntegrationService;
        this.storage = upload_factory_1.UploadFactory.createStorage();
    }
    searchForMissingThreeHoursPosts() {
        return this._postRepository.searchForMissingThreeHoursPosts();
    }
    updatePost(id, postId, releaseURL) {
        return this._postRepository.updatePost(id, postId, releaseURL);
    }
    async getMissingContent(orgId, postId, forceRefresh = false) {
        const post = await this._postRepository.getPostById(postId, orgId);
        if (!post || post.releaseId !== 'missing') {
            return [];
        }
        const integrationProvider = this._integrationManager.getSocialIntegration(post.integration.providerIdentifier);
        if (!integrationProvider.missing) {
            return [];
        }
        const getIntegration = post.integration;
        if ((0, dayjs_1.default)(getIntegration?.tokenExpiration).isBefore((0, dayjs_1.default)()) ||
            forceRefresh) {
            const data = await this._refreshIntegrationService.refresh(getIntegration);
            if (!data) {
                return [];
            }
            const { accessToken } = data;
            if (accessToken) {
                getIntegration.token = accessToken;
                if (integrationProvider.refreshWait) {
                    await (0, timer_1.timer)(10000);
                }
            }
            else {
                await this._integrationService.disconnectChannel(orgId, getIntegration);
                return [];
            }
        }
        try {
            return await integrationProvider.missing(getIntegration.internalId, getIntegration.token);
        }
        catch (e) {
            console.log(e);
            if (e instanceof social_abstract_1.RefreshToken) {
                return this.getMissingContent(orgId, postId, true);
            }
        }
        return [];
    }
    async updateReleaseId(orgId, postId, releaseId) {
        return this._postRepository.updateReleaseId(postId, orgId, releaseId);
    }
    async checkPostAnalytics(orgId, postId, date, forceRefresh = false) {
        const post = await this._postRepository.getPostById(postId, orgId);
        if (!post || !post.releaseId) {
            return [];
        }
        if (post.releaseId === 'missing') {
            return { missing: true };
        }
        const integrationProvider = this._integrationManager.getSocialIntegration(post.integration.providerIdentifier);
        if (!integrationProvider.postAnalytics) {
            return [];
        }
        const getIntegration = post.integration;
        if ((0, dayjs_1.default)(getIntegration?.tokenExpiration).isBefore((0, dayjs_1.default)()) ||
            forceRefresh) {
            const data = await this._refreshIntegrationService.refresh(getIntegration);
            if (!data) {
                return [];
            }
            const { accessToken } = data;
            if (accessToken) {
                getIntegration.token = accessToken;
                if (integrationProvider.refreshWait) {
                    await (0, timer_1.timer)(10000);
                }
            }
            else {
                await this._integrationService.disconnectChannel(orgId, getIntegration);
                return [];
            }
        }
        // const getIntegrationData = await ioRedis.get(
        //   `integration:${orgId}:${post.id}:${date}`
        // );
        // if (getIntegrationData) {
        //   return JSON.parse(getIntegrationData);
        // }
        try {
            const loadAnalytics = await integrationProvider.postAnalytics(getIntegration.internalId, getIntegration.token, post.releaseId, date);
            await redis_service_1.ioRedis.set(`integration:${orgId}:${post.id}:${date}`, JSON.stringify(loadAnalytics), 'EX', !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
                ? 1
                : 3600);
            return loadAnalytics;
        }
        catch (e) {
            console.log(e);
            if (e instanceof social_abstract_1.RefreshToken) {
                return this.checkPostAnalytics(orgId, postId, date, true);
            }
        }
        return [];
    }
    async getStatistics(orgId, id) {
        const getPost = await this.getPostsRecursively(id, true, orgId, true);
        const content = getPost.map((p) => p.content);
        const shortLinksTracking = await this._shortLinkService.getStatistics(content);
        return {
            clicks: shortLinksTracking,
        };
    }
    async mapTypeToPost(body, organization, replaceDraft = false) {
        if (!body?.posts?.every((p) => p?.integration?.id)) {
            throw new common_1.BadRequestException('All posts must have an integration id');
        }
        const mappedValues = {
            ...body,
            type: replaceDraft ? 'schedule' : body.type,
            posts: await Promise.all(body.posts.map(async (post) => {
                const integration = await this._integrationService.getIntegrationById(organization, post.integration.id);
                if (!integration) {
                    throw new common_1.BadRequestException(`Integration with id ${post.integration.id} not found`);
                }
                return {
                    type: replaceDraft ? 'schedule' : body.type,
                    ...post,
                    settings: {
                        ...(post.settings || {}),
                        __type: integration.providerIdentifier,
                    },
                };
            })),
        };
        const validationPipe = new common_1.ValidationPipe({
            skipMissingProperties: false,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        });
        return await validationPipe.transform(mappedValues, {
            type: 'body',
            metatype: create_post_dto_1.CreatePostDto,
        });
    }
    async getPostsRecursively(id, includeIntegration = false, orgId, isFirst) {
        const post = await this._postRepository.getPost(id, includeIntegration, orgId, isFirst);
        if (!post) {
            return [];
        }
        return [
            post,
            ...(post?.childrenPost?.length
                ? await this.getPostsRecursively(post?.childrenPost?.[0]?.id, false, orgId, false)
                : []),
        ];
    }
    async getPosts(orgId, query) {
        return this._postRepository.getPosts(orgId, query);
    }
    async getPostsMinified(orgId, query) {
        const posts = await this._postRepository.getPosts(orgId, query);
        await this.attachEngagerDmCountsToPosts(orgId, posts);
        await this.attachXPublicMetricsToPosts(orgId, posts);
        return (0, posts_list_minify_1.minifyPosts)({
            posts,
        });
    }
    /**
     * Replace `dmsSent` with counts from ExisingPlugData (autoDmEngagers rows:
     * `<tweetId>:<userId>`). Aligns the dashboard with recipients Postiz actually
     * recorded after successful sends — not Post.settings JSON, which could drift.
     */
    async attachEngagerDmCountsToPosts(orgId, posts) {
        const eligible = posts.filter((p) => p.releaseId &&
            p.releaseId !== 'missing' &&
            p.integration?.providerIdentifier &&
            ['x', 'twitter'].includes(String(p.integration.providerIdentifier).toLowerCase()));
        if (eligible.length === 0) {
            return;
        }
        const byIntegration = new Map();
        for (const p of eligible) {
            const id = p.integration.id;
            if (!byIntegration.has(id)) {
                byIntegration.set(id, []);
            }
            byIntegration.get(id).push(p);
        }
        for (const [integrationId, group] of byIntegration) {
            try {
                const integration = await this._integrationService.getIntegrationById(orgId, integrationId);
                if (!integration || integration.disabled || integration.deletedAt) {
                    continue;
                }
                const tweetIds = [
                    ...new Set(group.map((p) => p.releaseId).filter(Boolean)),
                ];
                const counts = await this._integrationService.countAutoDmEngagersByTweetIds(integrationId, tweetIds);
                for (const p of group) {
                    p.dmsSent = counts.get(p.releaseId) ?? 0;
                }
            }
            catch (err) {
                console.warn('attachEngagerDmCountsToPosts:', integrationId, err);
            }
        }
    }
    /**
     * For published X posts with a tweet id, attach like/repost/reply counts from
     * X public_metrics (live at list time). Skipped when DISABLE_X_ANALYTICS is set.
     */
    async attachXPublicMetricsToPosts(orgId, posts) {
        if (process.env.DISABLE_X_ANALYTICS) {
            return;
        }
        const xProvider = this._integrationManager.getSocialIntegration('x');
        if (typeof xProvider?.batchTweetPublicMetrics !== 'function') {
            return;
        }
        const eligible = posts.filter((p) => p.state === 'PUBLISHED' &&
            p.releaseId &&
            p.releaseId !== 'missing' &&
            p.integration?.providerIdentifier &&
            ['x', 'twitter'].includes(String(p.integration.providerIdentifier).toLowerCase()));
        if (eligible.length === 0) {
            return;
        }
        const byIntegration = new Map();
        for (const p of eligible) {
            const id = p.integration.id;
            if (!byIntegration.has(id)) {
                byIntegration.set(id, []);
            }
            byIntegration.get(id).push(p);
        }
        for (const [integrationId, group] of byIntegration) {
            try {
                const integration = await this._integrationService.getIntegrationById(orgId, integrationId);
                if (!integration?.token ||
                    integration.disabled ||
                    integration.deletedAt) {
                    continue;
                }
                const tweetIds = [
                    ...new Set(group.map((p) => p.releaseId).filter(Boolean)),
                ];
                const metricsMap = await xProvider.batchTweetPublicMetrics(integration.token, tweetIds);
                for (const p of group) {
                    const m = metricsMap.get(p.releaseId);
                    if (m) {
                        p.likeCount = m.likeCount;
                        p.retweetCount = m.retweetCount;
                        p.replyCount = m.replyCount;
                    }
                }
            }
            catch (err) {
                console.warn('attachXPublicMetricsToPosts:', integrationId, err);
            }
        }
    }
    async getPostsList(orgId, query) {
        return (0, posts_list_minify_1.minifyPostsList)(await this._postRepository.getPostsList(orgId, query));
    }
    async updateMedia(id, imagesList, convertToJPEG = false) {
        try {
            let imageUpdateNeeded = false;
            const getImageList = await Promise.all((await Promise.all((imagesList || []).map(async (p) => {
                if (!p.path && p.id) {
                    imageUpdateNeeded = true;
                    return this._mediaService.getMediaById(p.id);
                }
                return p;
            })))
                .map((m) => {
                return {
                    ...m,
                    url: m.path.indexOf('http') === -1
                        ? process.env.FRONTEND_URL +
                            '/' +
                            (process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY || '') +
                            m.path
                        : m.path,
                    type: 'image',
                    path: m.path.indexOf('http') === -1
                        ? (process.env.UPLOAD_DIRECTORY || '') + m.path
                        : m.path,
                };
            })
                .map(async (m) => {
                if (!convertToJPEG) {
                    return m;
                }
                if (m.path.indexOf('.png') > -1) {
                    imageUpdateNeeded = true;
                    const response = await axios_1.default.get(m.url, {
                        responseType: 'arraybuffer',
                    });
                    const imageBuffer = Buffer.from(response.data);
                    // Use sharp to get the metadata of the image
                    const buffer = await (0, sharp_1.default)(imageBuffer)
                        .jpeg({ quality: 100 })
                        .toBuffer();
                    const { path, originalname } = await this.storage.uploadFile({
                        buffer,
                        mimetype: 'image/jpeg',
                        size: buffer.length,
                        path: '',
                        fieldname: '',
                        destination: '',
                        stream: new stream_1.Readable(),
                        filename: '',
                        originalname: '',
                        encoding: '',
                    });
                    return {
                        ...m,
                        name: originalname,
                        url: path.indexOf('http') === -1
                            ? process.env.FRONTEND_URL +
                                '/' +
                                process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                                path
                            : path,
                        type: 'image',
                        path: path.indexOf('http') === -1
                            ? process.env.UPLOAD_DIRECTORY + path
                            : path,
                    };
                }
                return m;
            }));
            if (imageUpdateNeeded) {
                await this._postRepository.updateImages(id, JSON.stringify(getImageList));
            }
            return getImageList;
        }
        catch (err) {
            return imagesList;
        }
    }
    async getPostGroupDebugExport(orgId, group) {
        const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
        const errors = await this._postRepository.getErrorsByPostIds(loadAll.map((p) => p.id));
        const posts = this.arrangePostsByGroup(loadAll, undefined);
        const rootPost = posts[0];
        return {
            type: 'draft',
            shortLink: false,
            date: rootPost.publishDate.toISOString(),
            tags: rootPost.tags?.map((t) => ({
                value: t.tag.id,
                label: t.tag.name,
            })) || [],
            posts: [
                {
                    integration: { id: 'REPLACE_WITH_LOCAL_INTEGRATION_ID' },
                    group: rootPost.group,
                    settings: JSON.parse(rootPost.settings || '{}'),
                    value: posts.map((post) => ({
                        content: post.content,
                        image: JSON.parse(post.image || '[]'),
                        delay: post.delay || 0,
                    })),
                },
            ],
            _debug: {
                providerIdentifier: rootPost.integration?.providerIdentifier,
                providerName: rootPost.integration?.name,
                state: rootPost.state,
                error: rootPost.error,
                errors: errors.map((e) => ({
                    message: e.message,
                    platform: e.platform,
                    body: e.body,
                    createdAt: e.createdAt,
                })),
                originalGroup: group,
                originalPublishDate: rootPost.publishDate,
                exportedAt: new Date().toISOString(),
            },
        };
    }
    async getPostsByGroup(orgId, group) {
        const convertToJPEG = false;
        const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
        const posts = this.arrangePostsByGroup(loadAll, undefined);
        return {
            group: posts?.[0]?.group,
            posts: await Promise.all((posts || []).map(async (post) => ({
                ...post,
                image: await this.updateMedia(post.id, JSON.parse(post.image || '[]'), convertToJPEG),
            }))),
            integrationPicture: posts[0]?.integration?.picture,
            integration: posts[0].integrationId,
            settings: JSON.parse(posts[0].settings || '{}'),
        };
    }
    arrangePostsByGroup(all, parent) {
        const findAll = all
            .filter((p) => !parent ? !p.parentPostId : p.parentPostId === parent)
            .map(({ integration, ...all }) => ({
            ...all,
            ...(!parent ? { integration } : {}),
        }));
        return [
            ...findAll,
            ...(findAll.length
                ? findAll.flatMap((p) => this.arrangePostsByGroup(all, p.id))
                : []),
        ];
    }
    async getPost(orgId, id, convertToJPEG = false) {
        const posts = await this.getPostsRecursively(id, true, orgId, true);
        const list = {
            group: posts?.[0]?.group,
            posts: await Promise.all((posts || []).map(async (post) => ({
                ...post,
                image: await this.updateMedia(post.id, JSON.parse(post.image || '[]'), convertToJPEG),
            }))),
            integrationPicture: posts[0]?.integration?.picture,
            integration: posts[0].integrationId,
            settings: JSON.parse(posts[0].settings || '{}'),
        };
        return list;
    }
    async getOldPosts(orgId, date) {
        return this._postRepository.getOldPosts(orgId, date);
    }
    async updateTags(orgId, post) {
        const plainText = JSON.stringify(post);
        const extract = Array.from(plainText.match(/\(post:[a-zA-Z0-9-_]+\)/g) || []);
        if (!extract.length) {
            return post;
        }
        const ids = (extract || []).map((e) => e.replace('(post:', '').replace(')', ''));
        const urls = await this._postRepository.getPostUrls(orgId, ids);
        const newPlainText = ids.reduce((acc, value) => {
            const findUrl = urls?.find?.((u) => u.id === value)?.releaseURL || '';
            return acc.replace(new RegExp(`\\(post:${value}\\)`, 'g'), findUrl.split(',')[0]);
        }, plainText);
        return this.updateTags(orgId, JSON.parse(newPlainText));
    }
    async checkInternalPlug(integration, orgId, id, settings) {
        const plugs = Object.entries(settings).filter(([key]) => {
            return key.indexOf('plug-') > -1;
        });
        if (plugs.length === 0) {
            return [];
        }
        const parsePlugs = plugs.reduce((all, [key, value]) => {
            const [_, name, identifier] = key.split('--');
            all[name] = all[name] || { name };
            all[name][identifier] = value;
            return all;
        }, {});
        const list = Object.values(parsePlugs);
        return (list || []).flatMap((trigger) => {
            return (trigger?.integrations || []).flatMap((int) => ({
                type: 'internal-plug',
                post: id,
                originalIntegration: integration.id,
                integration: int.id,
                plugName: trigger.name,
                orgId: orgId,
                delay: +trigger.delay,
                information: trigger,
            }));
        });
    }
    async checkPlugs(orgId, providerName, integrationId) {
        const loadAllPlugs = this._integrationManager.getAllPlugs();
        const getPlugs = await this._integrationService.getPlugs(orgId, integrationId);
        const currentPlug = loadAllPlugs.find((p) => p.identifier === providerName);
        const xEngagementPollPlugFns = new Set([
            'autoDmEngagers',
            'autoRepostPost',
            'autoPlugPost',
            'autoThreadReply',
        ]);
        const xProfilePollPlugFns = new Set([
            'autoDeleteProfile',
            'autoDeleteReposts',
            'autoDmPinnedPost',
        ]);
        return getPlugs
            .filter((plug) => plug.plugFunction !== 'autoDmFollowers')
            .filter((plug) => !plug.plugFunction || !xProfilePollPlugFns.has(plug.plugFunction))
            .filter((plug) => providerName !== 'x' ||
            !plug.plugFunction ||
            !xEngagementPollPlugFns.has(plug.plugFunction))
            .filter((plug) => {
            return currentPlug?.plugs?.some((p) => p.methodName === plug.plugFunction);
        })
            .map((plug) => {
            const runPlug = currentPlug?.plugs?.find((p) => p.methodName === plug.plugFunction);
            return {
                type: 'global',
                plugId: plug.id,
                delay: runPlug.runEveryMilliseconds,
                totalRuns: runPlug.totalRuns,
            };
        });
    }
    async deletePost(orgId, group) {
        const post = await this._postRepository.deletePost(orgId, group);
        if (post?.id) {
            try {
                const workflows = this._temporalService.client
                    .getRawClient()
                    ?.workflow.list({
                    query: `postId="${post.id}" AND ExecutionStatus="Running"`,
                });
                for await (const executionInfo of workflows) {
                    try {
                        const workflow = await this._temporalService.client.getWorkflowHandle(executionInfo.workflowId);
                        if (workflow &&
                            (await workflow.describe()).status.name !== 'TERMINATED') {
                            await workflow.terminate();
                        }
                    }
                    catch (err) { }
                }
            }
            catch (err) { }
        }
        return { error: true };
    }
    async countPostsFromDay(orgId, date) {
        return this._postRepository.countPostsFromDay(orgId, date);
    }
    getPostByForWebhookId(id) {
        return this._postRepository.getPostByForWebhookId(id);
    }
    async startWorkflow(taskQueue, postId, orgId, state, 
    /** Skip waiting until publishDate (used for type "now" / immediate publish). */
    postNow = false) {
        // Terminate any existing running workflows for the same postId so
        // workflowIdConflictPolicy: 'TERMINATE_EXISTING' below has a clean slate.
        // We log (rather than silently swallow) so a misconfigured Temporal
        // search-attribute or RPC error becomes visible — the "post stuck on
        // Publishing" failure mode used to be silent because the entire flow
        // (terminate + start) was wrapped in empty `catch {}` blocks.
        try {
            const workflows = this._temporalService.client
                .getRawClient()
                ?.workflow.list({
                query: `postId="${postId}" AND ExecutionStatus="Running"`,
            });
            if (workflows) {
                for await (const executionInfo of workflows) {
                    try {
                        const workflow = await this._temporalService.client.getWorkflowHandle(executionInfo.workflowId);
                        if (workflow &&
                            (await workflow.describe()).status.name !== 'TERMINATED') {
                            await workflow.terminate();
                        }
                    }
                    catch (err) {
                        console.warn(`[startWorkflow] failed to terminate existing workflow ${executionInfo.workflowId} for postId=${postId}:`, err?.message || err);
                    }
                }
            }
        }
        catch (err) {
            console.warn(`[startWorkflow] could not list existing workflows for postId=${postId} (continuing to start):`, err?.message || err);
        }
        if (state === 'DRAFT') {
            return;
        }
        try {
            console.log(`[startWorkflow] dispatching postWorkflowV102 postId=${postId} orgId=${orgId} taskQueue=${taskQueue} postNow=${postNow}`);
            const handle = await this._temporalService.client
                .getRawClient()
                ?.workflow.start('postWorkflowV102', {
                workflowId: `post_${postId}`,
                taskQueue: 'main',
                workflowIdConflictPolicy: 'TERMINATE_EXISTING',
                args: [
                    {
                        taskQueue: taskQueue,
                        postId: postId,
                        organizationId: orgId,
                        postNow,
                    },
                ],
                typedSearchAttributes: new common_2.TypedSearchAttributes([
                    {
                        key: temporal_search_attribute_1.postId,
                        value: postId,
                    },
                    {
                        key: temporal_search_attribute_1.organizationId,
                        value: orgId,
                    },
                ]),
            });
            console.log(`[startWorkflow] postWorkflowV102 dispatched workflowId=${handle?.workflowId || `post_${postId}`} runId=${handle?.firstExecutionRunId || 'unknown'}`);
        }
        catch (err) {
            // Surface the real reason instead of failing silently. Common causes:
            //   • Temporal client not connected (orchestrator service down)
            //   • Required search attributes (postId, organizationId) not
            //     registered on the Temporal namespace
            //   • Workflow type 'postWorkflowV102' not deployed to the worker
            console.error(`[startWorkflow] FAILED to dispatch postWorkflowV102 for postId=${postId} orgId=${orgId} taskQueue=${taskQueue} postNow=${postNow}:`, err);
        }
    }
    async createPost(orgId, body) {
        const postList = [];
        for (const post of body.posts) {
            const messages = (post.value || []).map((p) => p.content);
            const updateContent = !body.shortLink
                ? messages
                : await this._shortLinkService.convertTextToShortLinks(orgId, messages);
            post.value = (post.value || []).map((p, i) => ({
                ...p,
                content: updateContent[i],
            }));
            const { posts } = await this._postRepository.createOrUpdatePost(body.type, orgId, body.type === 'now' ? (0, dayjs_1.default)().format('YYYY-MM-DDTHH:mm:00') : body.date, post, body.tags, body.inter);
            if (!posts?.length) {
                return [];
            }
            await this._integrationService
                .ensureXHomepageAutomaticPlugs(orgId, post.integration.id, post.settings)
                .catch((err) => console.error('ensureXHomepageAutomaticPlugs:', err));
            if (body.type !== 'update') {
                this.startWorkflow(post.settings.__type.split('-')[0].toLowerCase(), posts[0].id, orgId, posts[0].state, body.type === 'now').catch((err) => { });
            }
            Sentry.metrics.count('post_created', 1);
            postList.push({
                postId: posts[0].id,
                integration: post.integration.id,
            });
        }
        return postList;
    }
    /**
     * Attach auto-DM / auto plug / auto retweet workers to a tweet already on X.
     * Creates or updates a PUBLISHED Post row and syncs homepage X plugs.
     */
    async attachPublishedTweetAutomations(orgId, body) {
        const tweetId = (0, parse_tweet_url_1.parseXTweetIdFromUrl)(body.tweetUrl);
        if (!tweetId) {
            throw new common_1.BadRequestException('Invalid X post URL. Paste a link like https://x.com/you/status/123…');
        }
        const settings = body.settings || {};
        if (settings.__type !== 'x') {
            throw new common_1.BadRequestException('X post settings are required');
        }
        const s = settings;
        const hasAutomation = s.auto_dm_enabled === true ||
            s.auto_retweet_enabled === true ||
            s.auto_thread_reply_enabled === true;
        if (!hasAutomation) {
            throw new common_1.BadRequestException('Enable at least one automation (Auto DM, Auto retweet, or Auto plug) in Advanced Options');
        }
        if (s.auto_thread_reply_enabled === true &&
            (typeof s.auto_thread_reply_text !== 'string' ||
                s.auto_thread_reply_text.trim().length < 3)) {
            throw new common_1.BadRequestException('Auto plug thread text must be at least 3 characters when enabled');
        }
        const integration = await this._integrationService.getIntegrationById(orgId, body.integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.BadRequestException('Select a connected X account');
        }
        if (integration.disabled || integration.refreshNeeded) {
            throw new common_1.BadRequestException('This X account needs to be reconnected before attaching automations');
        }
        let token = integration.token;
        if ((0, dayjs_1.default)(integration.tokenExpiration).isBefore((0, dayjs_1.default)())) {
            const refreshed = await this._refreshIntegrationService.refresh(integration);
            if (!refreshed || !refreshed.accessToken) {
                throw new common_1.BadRequestException('Could not refresh X token. Reconnect the account and try again.');
            }
            token = refreshed.accessToken;
        }
        const xProvider = this._integrationManager.getSocialIntegration('x');
        let tweetMeta;
        try {
            tweetMeta = await xProvider.lookupPublishedTweet(token, tweetId, integration.internalId);
        }
        catch (err) {
            const msg = typeof err?.message === 'string'
                ? err.message
                : 'Could not load this tweet from X';
            throw new common_1.BadRequestException(msg);
        }
        const existing = await this._postRepository.findByIntegrationReleaseId(orgId, body.integrationId, tweetId);
        // Use "now" so the engagement poller prioritizes this row (it scans newest
        // by updatedAt). Old tweets attached for automations would otherwise sit
        // behind newer published posts and never get DM ticks.
        const publishDate = (0, dayjs_1.default)().toDate();
        const content = tweetMeta.text ||
            `[External X post](${(0, parse_tweet_url_1.xTweetPermalink)(tweetId)})`;
        const post = await this._postRepository.upsertPublishedTweetForAutomations({
            orgId,
            integrationId: body.integrationId,
            releaseId: tweetId,
            releaseURL: (0, parse_tweet_url_1.xTweetPermalink)(tweetId),
            content,
            publishDate,
            settingsJson: JSON.stringify(settings),
            existingPostId: existing?.id,
        });
        await this._integrationService.ensureXHomepageAutomaticPlugs(orgId, body.integrationId, settings);
        if (hasAutomation) {
            this._integrationService
                .runEngagementPlugsForReleaseId(orgId, body.integrationId, tweetId, s)
                .catch((err) => console.error('attachPublishedTweet: immediate engagement run:', err));
        }
        return {
            id: post.id,
            releaseId: tweetId,
            releaseURL: (0, parse_tweet_url_1.xTweetPermalink)(tweetId),
            updated: !!existing?.id,
        };
    }
    async separatePosts(content, len) {
        return this._openaiService.separatePosts(content, len);
    }
    async changeState(id, state, err, body) {
        return this._postRepository.changeState(id, state, err, body);
    }
    async changePostStatus(orgId, id, status) {
        const getPostById = await this._postRepository.getPostById(id, orgId);
        if (!getPostById) {
            throw new common_1.BadRequestException('Post not found');
        }
        const state = status === 'draft' ? 'DRAFT' : 'QUEUE';
        await this._postRepository.changeState(id, state);
        try {
            await this.startWorkflow(getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(), getPostById.id, orgId, state);
        }
        catch (err) { }
        return { id, state };
    }
    async changeDate(orgId, id, date, action = 'schedule') {
        const getPostById = await this._postRepository.getPostById(id, orgId);
        // schedule: Set status to QUEUE and change date (reschedule the post)
        // update: Just change the date without changing the status
        const newDate = await this._postRepository.changeDate(orgId, id, date, getPostById.state === 'DRAFT', action);
        if (action === 'schedule') {
            try {
                await this.startWorkflow(getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(), getPostById.id, orgId, getPostById.state === 'DRAFT' ? 'DRAFT' : 'QUEUE');
            }
            catch (err) { }
        }
        return newDate;
    }
    async generatePostsDraft(orgId, body) {
        const getAllIntegrations = (await this._integrationService.getIntegrationsList(orgId)).filter((f) => !f.disabled && f.providerIdentifier !== 'reddit');
        // const posts = chunk(body.posts, getAllIntegrations.length);
        const allDates = (0, dayjs_1.default)()
            .isoWeek(body.week)
            .year(body.year)
            .startOf('isoWeek');
        const dates = [...new Array(7)].map((_, i) => {
            return allDates.add(i, 'day').format('YYYY-MM-DD');
        });
        const findTime = () => {
            const totalMinutes = Math.floor(Math.random() * 144) * 10;
            // Convert total minutes to hours and minutes
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            // Format hours and minutes to always be two digits
            const formattedHours = hours.toString().padStart(2, '0');
            const formattedMinutes = minutes.toString().padStart(2, '0');
            const randomDate = (0, lodash_1.shuffle)(dates)[0] + 'T' + `${formattedHours}:${formattedMinutes}:00`;
            if ((0, dayjs_1.default)(randomDate).isBefore((0, dayjs_1.default)())) {
                return findTime();
            }
            return randomDate;
        };
        for (const integration of getAllIntegrations) {
            for (const toPost of body.posts) {
                const group = (0, make_is_1.makeId)(10);
                const randomDate = findTime();
                await this.createPost(orgId, {
                    type: 'draft',
                    date: randomDate,
                    order: '',
                    shortLink: false,
                    tags: [],
                    posts: [
                        {
                            group,
                            integration: {
                                id: integration.id,
                            },
                            settings: {
                                __type: integration.providerIdentifier,
                                title: '',
                                tags: [],
                                subreddit: [],
                            },
                            value: [
                                ...toPost.list.map((l) => ({
                                    id: '',
                                    content: l.post,
                                    delay: 0,
                                    image: [],
                                })),
                                {
                                    id: '',
                                    delay: 0,
                                    content: `Check out the full story here:\n${body.postId || body.url}`,
                                    image: [],
                                },
                            ],
                        },
                    ],
                });
            }
        }
    }
    findAllExistingCategories() {
        return this._postRepository.findAllExistingCategories();
    }
    findAllExistingTopicsOfCategory(category) {
        return this._postRepository.findAllExistingTopicsOfCategory(category);
    }
    findPopularPosts(category, topic) {
        return this._postRepository.findPopularPosts(category, topic);
    }
    async findFreeDateTime(orgId, integrationId) {
        const findTimes = await this._integrationService.findFreeDateTime(orgId, integrationId);
        return this.findFreeDateTimeRecursive(orgId, findTimes, dayjs_1.default.utc().startOf('day'));
    }
    async createPopularPosts(post) {
        return this._postRepository.createPopularPosts(post);
    }
    async findFreeDateTimeRecursive(orgId, times, date) {
        const list = await this._postRepository.getPostsCountsByDates(orgId, times, date);
        if (!list.length) {
            return this.findFreeDateTimeRecursive(orgId, times, date.add(1, 'day'));
        }
        const num = list.reduce((prev, curr) => {
            if (prev === null || prev > curr) {
                return curr;
            }
            return prev;
        }, null);
        return date.clone().add(num, 'minutes').format('YYYY-MM-DDTHH:mm:00');
    }
    getComments(postId) {
        return this._postRepository.getComments(postId);
    }
    getTags(orgId) {
        return this._postRepository.getTags(orgId);
    }
    createTag(orgId, body) {
        return this._postRepository.createTag(orgId, body);
    }
    editTag(id, orgId, body) {
        return this._postRepository.editTag(id, orgId, body);
    }
    deleteTag(id, orgId) {
        return this._postRepository.deleteTag(id, orgId);
    }
    createComment(orgId, userId, postId, comment) {
        return this._postRepository.createComment(orgId, userId, postId, comment);
    }
};
exports.PostsService = PostsService;
exports.PostsService = PostsService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [posts_repository_1.PostsRepository,
        integration_manager_1.IntegrationManager,
        integration_service_1.IntegrationService,
        media_service_1.MediaService,
        short_link_service_1.ShortLinkService,
        openai_service_1.OpenaiService,
        nestjs_temporal_core_1.TemporalService,
        refresh_integration_service_1.RefreshIntegrationService])
], PostsService);
//# sourceMappingURL=posts.service.js.map