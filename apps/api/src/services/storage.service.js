import { Client } from 'minio';
import { env } from '../config/env.js';

// Minio SDK expects endPoint as hostname only, not a full URL
function clientFor(endpoint) {
  const url = new URL(endpoint);
  return new Client({
    endPoint: url.hostname,
    port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
    useSSL: url.protocol === 'https:',
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    // Fixed region avoids a live getBucketRegion round-trip, which the
    // presign client (pointed at a browser-facing host) can't make from
    // inside the API container.
    region: 'us-east-1',
  });
}

const minioClient = clientFor(env.S3_ENDPOINT);
// Presigned URLs are followed by the browser, so they must use a
// browser-reachable endpoint, not the internal Docker network hostname.
const presignClient = clientFor(env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT);

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(env.S3_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(env.S3_BUCKET);
  }
}

export async function uploadBuffer(key, buffer, contentType) {
  await minioClient.putObject(env.S3_BUCKET, key, buffer, buffer.length, {
    'Content-Type': contentType,
  });
}

export async function getSignedUrl(key, expirySeconds = 3600) {
  return presignClient.presignedGetObject(env.S3_BUCKET, key, expirySeconds);
}
