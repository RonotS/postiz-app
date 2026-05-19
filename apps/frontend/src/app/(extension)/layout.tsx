export const dynamic = 'force-dynamic';
import '../global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import '@copilotkit/react-ui/styles.css';
import LayoutContext from '@gitroom/frontend/components/layout/layout.context';
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { themeFaviconHref } from '@gitroom/frontend/components/layout/theme-favicon.shared';
import { ThemeFavicon } from '@gitroom/frontend/components/layout/theme-favicon';
import { Plus_Jakarta_Sans } from 'next/font/google';
import clsx from 'clsx';
import { VariableContextComponent } from '@gitroom/react/helpers/variable.context';
import UtmSaver from '@gitroom/helpers/utils/utm.saver';
import { isStripeBillingEnabled } from '@gitroom/helpers/stripe/stripe.billing.env';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const mode = cookieStore.get('mode')?.value || 'dark';
  const billingOn = isStripeBillingEnabled();
  return (
    <html>
      <head>
        <link
          data-theme-favicon
          rel="icon"
          href={themeFaviconHref(mode)}
          type="image/png"
          sizes="32x32"
        />
        <link
          data-theme-favicon
          rel="icon"
          href={themeFaviconHref(mode)}
          type="image/png"
          sizes="96x96"
        />
        <link
          data-theme-favicon
          rel="icon"
          href={themeFaviconHref(mode)}
          type="image/png"
          sizes="192x192"
        />
        <link
          id="theme-apple-touch"
          rel="apple-touch-icon"
          href={themeFaviconHref(mode)}
          sizes="180x180"
        />
      </head>
      <body
        className={clsx(jakartaSans.className, 'dark text-primary !bg-primary')}
      >
        <ThemeFavicon />
        <VariableContextComponent
          language="en"
          storageProvider={
            process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'
          }
          stripeClient=""
          environment={process.env.NODE_ENV!}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}
          plontoKey={process.env.NEXT_PUBLIC_POLOTNO!}
          billingEnabled={billingOn}
          discordUrl={process.env.NEXT_PUBLIC_DISCORD_SUPPORT!}
          frontEndUrl={process.env.FRONTEND_URL!}
          isGeneral={!!process.env.IS_GENERAL}
          genericOauth={!!process.env.POSTIZ_GENERIC_OAUTH}
          oauthLogoUrl={process.env.NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL!}
          oauthDisplayName={process.env.NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME!}
          uploadDirectory={process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY!}
          cloudflareUrl={process.env.CLOUDFLARE_BUCKET_URL || ''}
          mainUrl={process.env.MAIN_URL || ''}
          mcpUrl={process.env.MCP_URL}
          dub={false}
          facebookPixel={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL!}
          telegramBotName={process.env.TELEGRAM_BOT_NAME!}
          neynarClientId={process.env.NEYNAR_CLIENT_ID!}
          isSecured={!process.env.NOT_SECURED}
          disableImageCompression={!!process.env.DISABLE_IMAGE_COMPRESSION}
          disableXAnalytics={!!process.env.DISABLE_X_ANALYTICS}
          sentryDsn={process.env.NEXT_PUBLIC_SENTRY_DSN!}
          extensionId={process.env.EXTENSION_ID || ''}
          transloadit={
            process.env.TRANSLOADIT_AUTH && process.env.TRANSLOADIT_TEMPLATE
              ? [
                  process.env.TRANSLOADIT_AUTH!,
                  process.env.TRANSLOADIT_TEMPLATE!,
                ]
              : []
          }
        >
          <LayoutContext>
            <UtmSaver />
            {children}
          </LayoutContext>
        </VariableContextComponent>
      </body>
    </html>
  );
}
