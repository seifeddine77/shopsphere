const { getGateway } = require('./gateways');
const logger = require('../config/logger');

/**
 * Payment service - thin orchestrator over the gateway abstraction.
 * Card data flows in memory to the gateway and is never stored or logged.
 */
async function processPayment({ method, amount, card }) {
  const gateway = getGateway(method);
  try {
    const result = await gateway.processPayment({ method, amount, card });
    logger.info(`Payment ${result.status} via ${gateway.name} (${result.transactionId}) - $${amount}`);
    return { ...result, provider: gateway.name };
  } catch (error) {
    logger.error(`Payment gateway error (${gateway.name}): ${error.message}`);
    return {
      status: 'FAILED',
      transactionId: '',
      message: 'The payment processor could not be reached. Please try again.',
      provider: gateway.name,
    };
  }
}

module.exports = { processPayment };
