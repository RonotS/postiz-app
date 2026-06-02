import { TwitterApi } from 'twitter-api-v2';

/** User OAuth token from Postiz integration (`accessToken:accessSecret`). */
export function buildXMonitorUserClient(accessToken: string): TwitterApi {
  const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
  return new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_SECRET!,
    accessToken: accessTokenSplit,
    accessSecret: accessSecretSplit,
  });
}
