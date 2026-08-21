import AdminUploadEnhancer from '@/components/AdminUploadEnhancer';

export const metadata = {
  robots: { index: false, follow: false }
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminUploadEnhancer />
      {children}
    </>
  );
}
