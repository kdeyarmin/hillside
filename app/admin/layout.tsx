import AdminUploadEnhancer from '@/components/AdminUploadEnhancer';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminUploadEnhancer />
      {children}
    </>
  );
}
