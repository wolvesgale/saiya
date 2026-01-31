import AdminDashboard from '@/components/AdminDashboard';

export default function AdminPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-slate-600 mt-2">
          左側の代理店選択は次のUI改修でモーダル化予定です。現在はID入力で紐付けできます。
        </p>
      </div>
      <AdminDashboard />
    </div>
  );
}
