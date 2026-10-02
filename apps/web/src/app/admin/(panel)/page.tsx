import { redirect } from 'next/navigation';

export default function AdminPage() {
  redirect('/admin/audits?status=needs_attention');
}
