import { TwitterApi } from 'twitter-api-v2';
import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

@AuthProvider({ provider: 'X' })
export class OauthProvider extends AuthProviderAbstract {
  private getConfig() {
    const { X_API_KEY, X_API_SECRET, FRONTEND_URL } = process.env;

    if (!X_API_KEY || !X_API_SECRET || !FRONTEND_URL) {
      throw new Error('X_API_KEY, X_API_SECRET, and FRONTEND_URL must be set');
    }

    return {
      appKey: X_API_KEY,
      appSecret: X_API_SECRET,
      frontendUrl: FRONTEND_URL,
    };
  }

  async generateLink(): Promise<string> {
    const { appKey, appSecret, frontendUrl } = this.getConfig();
    const client = new TwitterApi({
      appKey,
      appSecret,
    });

    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(
      `${frontendUrl}/auth/login?provider=X`,
      {
        authAccessType: 'write',
        linkMode: 'authenticate',
        forceLogin: false,
      }
    );

    await ioRedis.set(`x-login:${oauth_token}`, oauth_token_secret, 'EX', 600);

    return url;
  }

  async getToken(code: string, _redirectUri?: string, state?: string) {
    const { appKey, appSecret } = this.getConfig();
    if (!state) {
      throw new Error('Missing X login state');
    }

    const oauthTokenSecret = await ioRedis.get(`x-login:${state}`);
    if (!oauthTokenSecret) {
      throw new Error('X login session expired, please try again');
    }

    const startingClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken: state,
      accessSecret: oauthTokenSecret,
    });

    const { accessToken, accessSecret } = await startingClient.login(code);
    return `${accessToken}:${accessSecret}`;
  }

  async getUser(accessToken: string): Promise<{ email: string; id: string }> {
    const { appKey, appSecret } = this.getConfig();
    const [token, tokenSecret] = accessToken.split(':');
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: token,
      accessSecret: tokenSecret,
    });

    const data: any = await client.v1.verifyCredentials({
      include_email: true,
      skip_status: true,
    });

    const id = String(data.id_str || data.id || '');
    const email = String(data.email || `${data.screen_name || id}@x.local`);

    return { email, id };
  }
}
