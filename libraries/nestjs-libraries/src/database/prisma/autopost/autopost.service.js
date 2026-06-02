"use strict";
var AutopostService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutopostService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const autopost_repository_1 = require("./autopost.repository");
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const langgraph_1 = require("@langchain/langgraph");
const striptags_1 = tslib_1.__importDefault(require("striptags"));
const openai_1 = require("@langchain/openai");
const jsdom_1 = require("jsdom");
const zod_1 = require("zod");
const prompts_1 = require("@langchain/core/prompts");
const posts_service_1 = require("../posts/posts.service");
const rss_parser_1 = tslib_1.__importDefault(require("rss-parser"));
const integration_service_1 = require("../integrations/integration.service");
const make_is_1 = require("../../../services/make.is");
const nestjs_temporal_core_1 = require("nestjs-temporal-core");
const common_2 = require("@temporalio/common");
const temporal_search_attribute_1 = require("../../../temporal/temporal.search.attribute");
const parser = new rss_parser_1.default();
const model = new openai_1.ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
    model: 'gpt-4o',
    temperature: 0.7,
});
const dalle = new openai_1.DallEAPIWrapper({
    apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
    model: 'gpt-image-1',
});
const generateContent = zod_1.z.object({
    socialMediaPostContent: zod_1.z
        .string()
        .describe('Content for social media posts max 120 chars'),
});
const dallePrompt = zod_1.z.object({
    generatedTextToBeSentToDallE: zod_1.z
        .string()
        .describe('Generated prompt from description to be sent to DallE'),
});
let AutopostService = AutopostService_1 = class AutopostService {
    constructor(_autopostsRepository, _temporalService, _integrationService, _postsService) {
        this._autopostsRepository = _autopostsRepository;
        this._temporalService = _temporalService;
        this._integrationService = _integrationService;
        this._postsService = _postsService;
    }
    async stopAll(org) {
        const getAll = (await this.getAutoposts(org)).filter((f) => f.active);
        for (const autopost of getAll) {
            await this.changeActive(org, autopost.id, false);
        }
    }
    getAutoposts(orgId) {
        return this._autopostsRepository.getAutoposts(orgId);
    }
    async createAutopost(orgId, body, id) {
        const data = await this._autopostsRepository.createAutopost(orgId, body, id);
        await this.processCron(body.active, orgId, data.id);
        return data;
    }
    async changeActive(orgId, id, active) {
        const data = await this._autopostsRepository.changeActive(orgId, id, active);
        await this.processCron(active, orgId, id);
        return data;
    }
    async processCron(active, orgId, id) {
        if (active) {
            try {
                return this._temporalService.client
                    .getRawClient()
                    ?.workflow.start('autoPostWorkflow', {
                    workflowId: `autopost-${id}`,
                    taskQueue: 'main',
                    args: [{ id, immediately: true }],
                    typedSearchAttributes: new common_2.TypedSearchAttributes([
                        {
                            key: temporal_search_attribute_1.organizationId,
                            value: orgId,
                        },
                    ]),
                });
            }
            catch (err) { }
        }
        try {
            return await this._temporalService.terminateWorkflow(`autopost-${id}`);
        }
        catch (err) {
            return false;
        }
    }
    async deleteAutopost(orgId, id) {
        const data = await this._autopostsRepository.deleteAutopost(orgId, id);
        await this.processCron(false, orgId, id);
        return data;
    }
    async loadXML(url) {
        try {
            const { items } = await parser.parseURL(url);
            const findLast = items.reduce((all, current) => {
                if ((0, dayjs_1.default)(current.pubDate).isAfter(all.pubDate)) {
                    return current;
                }
                return all;
            }, { pubDate: (0, dayjs_1.default)().subtract(100, 'years') });
            return {
                success: true,
                date: findLast.pubDate,
                url: findLast.link,
                description: (0, striptags_1.default)(findLast?.['content:encoded'] ||
                    findLast?.content ||
                    findLast?.description ||
                    '')
                    .replace(/\n/g, ' ')
                    .trim(),
            };
        }
        catch (err) {
            /** sent **/
        }
        return { success: false };
    }
    async loadUrl(url) {
        try {
            const loadDom = new jsdom_1.JSDOM(await (await fetch(url)).text());
            loadDom.window.document
                .querySelectorAll('script')
                .forEach((s) => s.remove());
            loadDom.window.document
                .querySelectorAll('style')
                .forEach((s) => s.remove());
            // remove all html, script and styles
            return (0, striptags_1.default)(loadDom.window.document.body.innerHTML);
        }
        catch (err) {
            return '';
        }
    }
    async generateDescription(state) {
        if (!state.body.generateContent) {
            return {
                ...state,
                description: state.body.content,
            };
        }
        const description = state.load.description || (await this.loadUrl(state.load.url));
        if (!description) {
            return {
                ...state,
                description: '',
            };
        }
        const structuredOutput = model.withStructuredOutput(generateContent);
        const { socialMediaPostContent } = await prompts_1.ChatPromptTemplate.fromTemplate(`
        You are an assistant that gets raw 'description' of a content and generate a social media post content.
        Rules:
        - Maximum 100 chars
        - Try to make it a short as possible to fit any social media
        - Add line breaks between sentences (\\n) 
        - Don't add hashtags
        - Add emojis when needed
        
        'description':
        {content}
      `)
            .pipe(structuredOutput)
            .invoke({
            content: description,
        });
        return {
            ...state,
            description: socialMediaPostContent,
        };
    }
    async generatePicture(state) {
        const structuredOutput = model.withStructuredOutput(dallePrompt);
        const { generatedTextToBeSentToDallE } = await prompts_1.ChatPromptTemplate.fromTemplate(`
        You are an assistant that gets description and generate a prompt that will be sent to DallE to generate pictures.
        
        content:
        {content}
      `)
            .pipe(structuredOutput)
            .invoke({
            content: state.load.description || state.description,
        });
        const image = await dalle.invoke(generatedTextToBeSentToDallE);
        return { ...state, image };
    }
    async schedulePost(state) {
        const nextTime = await this._postsService.findFreeDateTime(state.integrations[0].organizationId);
        await this._postsService.createPost(state.integrations[0].organizationId, {
            date: nextTime + 'Z',
            order: (0, make_is_1.makeId)(10),
            shortLink: false,
            type: 'draft',
            tags: [],
            posts: state.integrations.map((i) => ({
                settings: {
                    __type: i.providerIdentifier,
                    title: '',
                    tags: [],
                    subreddit: [],
                },
                group: (0, make_is_1.makeId)(10),
                integration: { id: i.id },
                value: [
                    {
                        id: (0, make_is_1.makeId)(10),
                        delay: 0,
                        content: state.description.replace(/\n/g, '\n\n') +
                            '\n\n' +
                            state.load.url,
                        image: !state.image
                            ? []
                            : [
                                {
                                    id: (0, make_is_1.makeId)(10),
                                    name: (0, make_is_1.makeId)(10),
                                    path: state.image,
                                    organizationId: state.integrations[0].organizationId,
                                },
                            ],
                    },
                ],
            })),
        });
    }
    async updateUrl(state) {
        await this._autopostsRepository.updateUrl(state.id, state.load.url);
    }
    async startAutopost(id) {
        const getPost = await this._autopostsRepository.getAutopost(id);
        if (!getPost || !getPost.active) {
            return;
        }
        const load = await this.loadXML(getPost.url);
        if (!load.success || load.url === getPost.lastUrl) {
            return;
        }
        const integrations = await this._integrationService.getIntegrationsList(getPost.organizationId);
        const parseIntegrations = JSON.parse(getPost.integrations || '[]') || [];
        const neededIntegrations = integrations.filter((i) => parseIntegrations.some((ii) => ii.id === i.id));
        const integrationsToSend = parseIntegrations.length === 0 ? integrations : neededIntegrations;
        if (integrationsToSend.length === 0) {
            return;
        }
        const state = AutopostService_1.state();
        const workflow = state
            .addNode('generate-description', this.generateDescription.bind(this))
            .addNode('generate-picture', this.generatePicture.bind(this))
            .addNode('schedule-post', this.schedulePost.bind(this))
            .addNode('update-url', this.updateUrl.bind(this))
            .addEdge(langgraph_1.START, 'generate-description')
            .addConditionalEdges('generate-description', (state) => {
            if (!state.description) {
                return 'schedule-post';
            }
            if (state.body.addPicture) {
                return 'generate-picture';
            }
            return 'schedule-post';
        })
            .addEdge('generate-picture', 'schedule-post')
            .addEdge('schedule-post', 'update-url')
            .addEdge('update-url', langgraph_1.END);
        const app = workflow.compile();
        await app.invoke({
            messages: [],
            id,
            body: getPost,
            load,
            integrations: integrationsToSend,
        });
    }
};
exports.AutopostService = AutopostService;
AutopostService.state = () => new langgraph_1.StateGraph({
    channels: {
        messages: {
            reducer: (currentState, updateValue) => currentState.concat(updateValue),
            default: () => [],
        },
        body: null,
        description: null,
        load: null,
        image: null,
        integrations: null,
        id: null,
    },
});
exports.AutopostService = AutopostService = AutopostService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [autopost_repository_1.AutopostRepository,
        nestjs_temporal_core_1.TemporalService,
        integration_service_1.IntegrationService,
        posts_service_1.PostsService])
], AutopostService);
//# sourceMappingURL=autopost.service.js.map