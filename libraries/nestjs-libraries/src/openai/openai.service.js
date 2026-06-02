"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenaiService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const openai_1 = tslib_1.__importDefault(require("openai"));
const lodash_1 = require("lodash");
const zod_1 = require("openai/helpers/zod");
const zod_2 = require("zod");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});
const PicturePrompt = zod_2.z.object({
    prompt: zod_2.z.string(),
});
const VoicePrompt = zod_2.z.object({
    voice: zod_2.z.string(),
});
let OpenaiService = class OpenaiService {
    async generateImage(prompt, isUrl, isVertical = false) {
        const generate = (await openai.images.generate({
            prompt,
            response_format: isUrl ? 'url' : 'b64_json',
            model: 'dall-e-3',
            ...(isVertical ? { size: '1024x1792' } : {}),
        })).data[0];
        return isUrl ? generate.url : generate.b64_json;
    }
    async generatePromptForPicture(prompt) {
        return ((await openai.chat.completions.parse({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
                },
                {
                    role: 'user',
                    content: `prompt: ${prompt}`,
                },
            ],
            response_format: (0, zod_1.zodResponseFormat)(PicturePrompt, 'picturePrompt'),
        })).choices[0].message.parsed?.prompt || '');
    }
    async generateVoiceFromText(prompt) {
        return ((await openai.chat.completions.parse({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
                },
                {
                    role: 'user',
                    content: `prompt: ${prompt}`,
                },
            ],
            response_format: (0, zod_1.zodResponseFormat)(VoicePrompt, 'voice'),
        })).choices[0].message.parsed?.voice || '');
    }
    async generatePosts(content) {
        const posts = (await Promise.all([
            openai.chat.completions.create({
                messages: [
                    {
                        role: 'assistant',
                        content: 'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
                    },
                    {
                        role: 'user',
                        content: content,
                    },
                ],
                n: 5,
                temperature: 1,
                model: 'gpt-4o',
            }),
            openai.chat.completions.create({
                messages: [
                    {
                        role: 'assistant',
                        content: 'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
                    },
                    {
                        role: 'user',
                        content: content,
                    },
                ],
                n: 5,
                temperature: 1,
                model: 'gpt-4o',
            }),
        ])).flatMap((p) => p.choices);
        return (0, lodash_1.shuffle)(posts.map((choice) => {
            const { content } = choice.message;
            const start = content?.indexOf('[');
            const end = content?.lastIndexOf(']');
            try {
                return JSON.parse('[' +
                    content
                        ?.slice(start + 1, end)
                        .replace(/\n/g, ' ')
                        .replace(/ {2,}/g, ' ') +
                    ']');
            }
            catch (e) {
                return [];
            }
        }));
    }
    async extractWebsiteText(content) {
        const websiteContent = await openai.chat.completions.create({
            messages: [
                {
                    role: 'assistant',
                    content: 'You take a full website text, and extract only the article content',
                },
                {
                    role: 'user',
                    content,
                },
            ],
            model: 'gpt-4o',
        });
        const { content: articleContent } = websiteContent.choices[0].message;
        return this.generatePosts(articleContent);
    }
    async separatePosts(content, len) {
        const SeparatePostsPrompt = zod_2.z.object({
            posts: zod_2.z.array(zod_2.z.string()),
        });
        const SeparatePostPrompt = zod_2.z.object({
            post: zod_2.z.string().max(len),
        });
        const posts = (await openai.chat.completions.parse({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${len - 10} and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
                },
                {
                    role: 'user',
                    content: content,
                },
            ],
            response_format: (0, zod_1.zodResponseFormat)(SeparatePostsPrompt, 'separatePosts'),
        })).choices[0].message.parsed?.posts || [];
        return {
            posts: await Promise.all(posts.map(async (post) => {
                if (post.length <= len) {
                    return post;
                }
                let retries = 4;
                while (retries) {
                    try {
                        return ((await openai.chat.completions.parse({
                            model: 'gpt-4o',
                            messages: [
                                {
                                    role: 'system',
                                    content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                                },
                                {
                                    role: 'user',
                                    content: post,
                                },
                            ],
                            response_format: (0, zod_1.zodResponseFormat)(SeparatePostPrompt, 'separatePost'),
                        })).choices[0].message.parsed?.post || '');
                    }
                    catch (e) {
                        retries--;
                    }
                }
                return post;
            })),
        };
    }
    async generateSlidesFromText(text) {
        for (let i = 0; i < 3; i++) {
            try {
                const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
                const parse = (await openai.chat.completions.parse({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: message,
                        },
                        {
                            role: 'user',
                            content: text,
                        },
                    ],
                    response_format: (0, zod_1.zodResponseFormat)(zod_2.z.object({
                        slides: zod_2.z
                            .array(zod_2.z.object({
                            imagePrompt: zod_2.z.string(),
                            voiceText: zod_2.z.string(),
                        }))
                            .describe('an array of slides'),
                    }), 'slides'),
                })).choices[0].message.parsed?.slides || [];
                return parse;
            }
            catch (err) {
                console.log(err);
            }
        }
        return [];
    }
};
exports.OpenaiService = OpenaiService;
exports.OpenaiService = OpenaiService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], OpenaiService);
//# sourceMappingURL=openai.service.js.map