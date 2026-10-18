import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const parsedPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPort = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 6379;
const redisHost = (process.env.REDIS_HOST || 'localhost').trim();

export const redis = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

  client.on('connect', () => {
    console.log('✅ Redis connected');
  });

  client.on('error', (err) => {
    console.error('❌ Redis error:', err);
  });

  return client;
}

export async function createRedisClient(): Promise<Redis> {
  const client = buildRedisClient();
  try {
    await client.connect();
    return client;
  } catch (error) {
    client.disconnect();
    throw error;
  }
}

export const redis = buildRedisClient();
export default redis;
