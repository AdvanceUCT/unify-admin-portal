/**
 * @fileoverview Loads the local font families used by the portal theme.
 * @module lib/fonts
 */

import { Geist_Mono, Inter } from "next/font/google";

/**
 * Single source of truth for the portal's typefaces.
 *
 * To change the app typeface, swap the import and the function call here — the
 * CSS variable names stay the same, so nothing else needs to change. The
 * variables are consumed by `--font-sans` / `--font-mono` in globals.css.
 */
export const appSans = Inter({
  variable: "--font-app-sans",
  subsets: ["latin"],
  display: "swap",
});

export const appMono = Geist_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
  display: "swap",
});

export const fontVariables = `${appSans.variable} ${appMono.variable}`;
