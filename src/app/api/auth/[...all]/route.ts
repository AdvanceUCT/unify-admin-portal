/**
 * @fileoverview Handles the `/api/auth/[...all]` API boundary, including its authorization and request validation.
 * @module app/api/auth/[...all]/route
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
