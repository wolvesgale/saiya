import ChangePasswordForm from '@/components/ChangePasswordForm';

export default function ResetPasswordPage() {
  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-xl font-semibold mb-4">パスワード変更</h1>
      <ChangePasswordForm />
    </div>
  );
}
