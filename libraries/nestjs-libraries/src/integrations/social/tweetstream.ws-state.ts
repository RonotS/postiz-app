import { getTweetStreamWsConsumerActiveRedisKey } from '@gitroom/helpers/x/tweetstream.env';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const ACTIVE_TTL_SEC = 120;

export async function markTweetStreamWsConsumerActive(): Promise<void> {
  await ioRedis.set(
    getTweetStreamWsConsumerActiveRedisKey(),
    '1',
    'EX',
    ACTIVE_TTL_SEC
  );
}

export async function clearTweetStreamWsConsumerActive(): Promise<void> {
  await ioRedis.del(getTweetStreamWsConsumerActiveRedisKey());
}

export async function isTweetStreamWsConsumerActive(): Promise<boolean> {
  const v = await ioRedis.get(getTweetStreamWsConsumerActiveRedisKey());
  return v === '1';
}
