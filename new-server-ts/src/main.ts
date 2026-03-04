import { createStreamingGateway, initialize } from './composition-root.js';
import { logger } from './shared/logger.js';

async function main(): Promise<void> {
  try {
    initialize();

    const gateway = createStreamingGateway();
    await gateway.start();

    logger.info('Server started successfully');

    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down...');
      await gateway.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
