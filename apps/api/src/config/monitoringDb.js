import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

function deriveMonitoringUri(mongodbUri) {
  const url = new URL(mongodbUri);
  const dbName = url.pathname.replace(/^\//, '') || 'rooted';
  url.pathname = `/${dbName}_monitoring`;
  return url.toString();
}

export const monitoringConnection = mongoose.createConnection();

export async function connectMonitoringDB() {
  const uri = env.MONITORING_MONGODB_URI || deriveMonitoringUri(env.MONGODB_URI);

  monitoringConnection.on('error', (err) => logger.error({ err }, 'Monitoring MongoDB error'));
  monitoringConnection.on('disconnected', () => logger.warn('Monitoring MongoDB disconnected'));

  await monitoringConnection.openUri(uri, { serverSelectionTimeoutMS: 5000 });

  logger.info('Monitoring MongoDB connected');
}
