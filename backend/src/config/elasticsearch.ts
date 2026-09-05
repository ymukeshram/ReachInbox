import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const esNode = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

export const esClient = new Client({
  node: esNode,
  ...(process.env.ES_USERNAME && process.env.ES_PASSWORD
    ? { auth: { username: process.env.ES_USERNAME, password: process.env.ES_PASSWORD } }
    : {}),
});

export async function setupElasticsearch() {
  try {
    const indexExists = await esClient.indices.exists({ index: 'email_logs' });
    if (!indexExists) {
      await esClient.indices.create({
        index: 'email_logs',
        mappings: {
          properties: {
            emailId: { type: 'keyword' },
            userId: { type: 'keyword' },
            recipientEmail: { type: 'keyword' },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            timestamp: { type: 'date' }
          }
        }
      });
      logger.info('Created Elasticsearch index: email_logs');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to setup Elasticsearch index');
  }
}
