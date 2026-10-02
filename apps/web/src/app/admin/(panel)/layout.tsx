import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isValidSession } from '@/lib/admin-auth';

async function logoutAction() {
  'use server';
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
  redirect('/admin/login');
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!isValidSession(session)) redirect('/admin/login');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ background: '#111', color: '#fff', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.05em' }}>GEOTRACK ADMIN</span>
        <a href="/admin" style={{ color: '#ccc', textDecoration: 'none', fontSize: '0.875rem' }}>Dashboard</a>
        <a href="/admin/audits" style={{ color: '#ccc', textDecoration: 'none', fontSize: '0.875rem' }}>All audits</a>
        <form action={logoutAction} style={{ marginLeft: 'auto' }}>
          <button type="submit" style={{ background: 'transparent', border: '1px solid #555', color: '#ccc', borderRadius: 4, padding: '0.25rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>
            Sign out
          </button>
        </form>
      </nav>
      <main style={{ flex: 1, padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {children}
      </main>
    </div>
  );
}
