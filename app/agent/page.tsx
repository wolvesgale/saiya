import AgentDashboard from '@/components/AgentDashboard';

export default function AgentPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Agent</h1>
      <AgentDashboard />
    </div>
  );
}
