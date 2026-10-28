// Access model carried over from the verified MeReporter spec:
// - Two initial admins ONLY. A user who signs up with one of these emails
//   becomes admin/approved automatically; everyone else starts Pending.
// - Pending users see ONLY a locked pending screen.
// - Approved non-admin users see ONLY their own projects.
// - Admins see all projects/users and the Setup page; API keys are admin-only.
export const INITIAL_ADMIN_EMAILS = [
  'nurulnahid468@gmail.com',
  'amranspixel09@gmail.com',
] as const;

export type ProfileStatus = 'pending' | 'approved' | 'rejected';
export type ProfileRole = 'admin' | 'user';

export type Profile = {
  id: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
};

export function isInitialAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return (INITIAL_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase());
}

export function canAccessApp(profile: Profile | null): profile is Profile & { status: 'approved' } {
  return profile !== null && profile.status === 'approved';
}

export function canViewProject(profile: Profile | null, projectOwnerId: string): boolean {
  if (!profile || profile.status !== 'approved') return false;
  if (profile.role === 'admin') return true;
  return profile.id === projectOwnerId;
}
