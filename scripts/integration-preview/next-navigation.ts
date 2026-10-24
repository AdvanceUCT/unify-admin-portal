export function usePathname() { return window.location.pathname; }

const router = { refresh: () => window.dispatchEvent(new Event("fixture-router-refresh")) };
export function useRouter() { return router; }
