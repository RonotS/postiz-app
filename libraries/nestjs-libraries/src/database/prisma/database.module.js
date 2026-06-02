"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const organization_repository_1 = require("./organizations/organization.repository");
const organization_service_1 = require("./organizations/organization.service");
const users_service_1 = require("./users/users.service");
const users_repository_1 = require("./users/users.repository");
const subscription_service_1 = require("./subscriptions/subscription.service");
const subscription_repository_1 = require("./subscriptions/subscription.repository");
const billing_plan_pricing_service_1 = require("./subscriptions/billing-plan-pricing.service");
const notification_service_1 = require("./notifications/notification.service");
const integration_service_1 = require("./integrations/integration.service");
const integration_repository_1 = require("./integrations/integration.repository");
const posts_service_1 = require("./posts/posts.service");
const posts_repository_1 = require("./posts/posts.repository");
const integration_manager_1 = require("../../integrations/integration.manager");
const media_service_1 = require("./media/media.service");
const media_repository_1 = require("./media/media.repository");
const notifications_repository_1 = require("./notifications/notifications.repository");
const email_service_1 = require("../../services/email.service");
const stripe_service_1 = require("../../services/stripe.service");
const extract_content_service_1 = require("../../openai/extract.content.service");
const openai_service_1 = require("../../openai/openai.service");
const agencies_service_1 = require("./agencies/agencies.service");
const agencies_repository_1 = require("./agencies/agencies.repository");
const track_service_1 = require("../../track/track.service");
const short_link_service_1 = require("../../short-linking/short.link.service");
const webhooks_repository_1 = require("./webhooks/webhooks.repository");
const webhooks_service_1 = require("./webhooks/webhooks.service");
const signature_repository_1 = require("./signatures/signature.repository");
const signature_service_1 = require("./signatures/signature.service");
const autopost_repository_1 = require("./autopost/autopost.repository");
const autopost_service_1 = require("./autopost/autopost.service");
const sets_service_1 = require("./sets/sets.service");
const sets_repository_1 = require("./sets/sets.repository");
const third_party_repository_1 = require("./third-party/third-party.repository");
const third_party_service_1 = require("./third-party/third-party.service");
const video_manager_1 = require("../../videos/video.manager");
const fal_service_1 = require("../../openai/fal.service");
const refresh_integration_service_1 = require("../../integrations/refresh.integration.service");
const oauth_repository_1 = require("./oauth/oauth.repository");
const oauth_service_1 = require("./oauth/oauth.service");
const announcements_repository_1 = require("./announcements/announcements.repository");
const announcements_service_1 = require("./announcements/announcements.service");
const x_account_activity_service_1 = require("../../integrations/social/x.account-activity.service");
const x_account_activity_handler_1 = require("../../integrations/social/x.account-activity.handler");
const tweetstream_service_1 = require("../../integrations/social/tweetstream.service");
const x_activity_stream_service_1 = require("../../integrations/social/x-activity-stream.service");
const x_custom_ingest_service_1 = require("../../integrations/social/x.custom-ingest.service");
const x_custom_ingest_consumer_1 = require("../../integrations/social/x.custom-ingest.consumer");
const xquik_engagement_poller_service_1 = require("../../integrations/social/xquik.engagement.poller.service");
const automation_pages_flags_service_1 = require("../../platform/automation-pages-flags.service");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = tslib_1.__decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [],
        controllers: [],
        providers: [
            prisma_service_1.PrismaService,
            prisma_service_1.PrismaRepository,
            prisma_service_1.PrismaTransaction,
            users_service_1.UsersService,
            users_repository_1.UsersRepository,
            organization_service_1.OrganizationService,
            organization_repository_1.OrganizationRepository,
            subscription_service_1.SubscriptionService,
            subscription_repository_1.SubscriptionRepository,
            billing_plan_pricing_service_1.BillingPlanPricingService,
            notification_service_1.NotificationService,
            notifications_repository_1.NotificationsRepository,
            webhooks_repository_1.WebhooksRepository,
            webhooks_service_1.WebhooksService,
            integration_service_1.IntegrationService,
            integration_repository_1.IntegrationRepository,
            posts_service_1.PostsService,
            posts_repository_1.PostsRepository,
            stripe_service_1.StripeService,
            signature_repository_1.SignatureRepository,
            autopost_repository_1.AutopostRepository,
            autopost_service_1.AutopostService,
            signature_service_1.SignatureService,
            media_service_1.MediaService,
            media_repository_1.MediaRepository,
            agencies_service_1.AgenciesService,
            agencies_repository_1.AgenciesRepository,
            integration_manager_1.IntegrationManager,
            refresh_integration_service_1.RefreshIntegrationService,
            extract_content_service_1.ExtractContentService,
            openai_service_1.OpenaiService,
            fal_service_1.FalService,
            email_service_1.EmailService,
            track_service_1.TrackService,
            short_link_service_1.ShortLinkService,
            sets_service_1.SetsService,
            sets_repository_1.SetsRepository,
            third_party_repository_1.ThirdPartyRepository,
            third_party_service_1.ThirdPartyService,
            oauth_repository_1.OAuthRepository,
            oauth_service_1.OAuthService,
            video_manager_1.VideoManager,
            announcements_repository_1.AnnouncementsRepository,
            announcements_service_1.AnnouncementsService,
            x_account_activity_service_1.XAccountActivityService,
            x_account_activity_handler_1.XAccountActivityHandler,
            tweetstream_service_1.TweetStreamService,
            x_activity_stream_service_1.XActivityStreamService,
            x_custom_ingest_service_1.XCustomIngestService,
            x_custom_ingest_consumer_1.XCustomIngestConsumer,
            xquik_engagement_poller_service_1.XquikEngagementPollerService,
            automation_pages_flags_service_1.AutomationPagesFlagsService,
        ],
        get exports() {
            return this.providers;
        },
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map