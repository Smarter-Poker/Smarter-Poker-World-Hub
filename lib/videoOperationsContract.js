'use strict';

const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isVideoOperationsOperationId(value) {
  return typeof value === 'string' && OPERATION_ID_PATTERN.test(value);
}

module.exports = { isVideoOperationsOperationId };
