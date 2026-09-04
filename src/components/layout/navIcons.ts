/**
 * @fileoverview Provides the reusable nav Icons used by portal navigation and page chrome.
 * @module components/layout/navIcons
 */

import {
  Building2,
  ClipboardList,
  Gauge,
  KeyRound,
  Layers3,
  CircleHelp,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Nav icons are referenced by name rather than by component so that nav item
 * arrays stay plain serializable data. The sidebar is a client component and
 * the layouts that define the nav are server components — function references
 * cannot cross that boundary, but strings can.
 */
export const NAV_ICONS = {
  application: ClipboardList,
  audit: ScrollText,
  billing: Receipt,
  branches: Building2,
  help: CircleHelp,
  integrations: KeyRound,
  overview: Gauge,
  profile: UserCog,
  schemas: Layers3,
  settings: Settings,
  staff: Users,
  students: Users,
  users: UserCog,
  verifications: ShieldCheck,
  vendors: Store,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
