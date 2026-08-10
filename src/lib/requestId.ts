/**
 * @fileoverview Creates and propagates correlation IDs across portal and agent requests.
 * @module lib/requestId
 */

import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function requestIdFrom(value: string | null | undefined) {
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}
