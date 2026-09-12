import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, hashSecret } from '@/lib/admin-auth';

async function loginAction(formData: FormData) {
  'use server';
  const secret = formData.get('secret') as string;
  const next = formData.get('next') as string | null;

  const expected = process.env['ADMIN_SECRET'];
  if (!expected || secret !== expected) {
    redirect('/admin/login?error=1');
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, hashSecret(secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  redirect(next || '/admin');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <form
        action={loginAction}
        style={{ background: '#fff', padding: '2rem', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: 320 }}
      >
        <h1 style={{ marginTop: 0, fontSize: '1.25rem' }}>GeoTrack Admin</h1>
        {params.error && (
          <p style={{ color: '#c00', marginBottom: '1rem', fontSize: '0.875rem' }}>Invalid secret. Try again.</p>
        )}
        <input type="hidden" name="next" value={params.next ?? ''} />
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
          Admin secret
        </label>
        <input
          type="password"
          name="secret"
          required
          autoFocus
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '1rem', boxSizing: 'border-box' }}
        />
        <button
          type="submit"
          style={{ marginTop: '1rem', width: '100%', padding: '0.625rem', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: '1rem', cursor: 'pointer' }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
