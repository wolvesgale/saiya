import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-xl font-semibold mb-4">ログイン</h1>
      <LoginForm />
    </div>
  );
}
