/**
 * @fileoverview Defines the root HTML shell, metadata, fonts, and global providers.
 * @module app/layout
 */

import type { Metadata } from "next";
import "./globals.css";

import { UnsavedChangesDialogProvider } from "@/components/layout/UnsavedChangesDialogProvider";
import { fontVariables } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "UNIFY Admin Portal",
  description: "Administrative portal scaffold for UNIFY credential lifecycle operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body>
        {children}
        <UnsavedChangesDialogProvider />
      </body>
    </html>
  );
}
