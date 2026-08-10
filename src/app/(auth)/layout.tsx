/**
 * @fileoverview Provides the shared layout for `/`.
 * @module app/(auth)/layout
 */

import { requireAdminSession } from "@/lib/auth/session";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSession();
  return <>{children}</>;
}
