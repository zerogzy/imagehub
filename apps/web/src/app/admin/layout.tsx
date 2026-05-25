import { AdminLayout } from '@/components/admin-layout';

export default function AdminRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
