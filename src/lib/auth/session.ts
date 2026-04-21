export type MockAdminSession = {
  id: string;
  name: string;
  role: "Admin";
};

export function getCurrentSession(): MockAdminSession {
  return {
    id: "admin-demo-001",
    name: "Demo Admin",
    role: "Admin",
  };
}
