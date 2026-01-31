import BrokerDashboard from '@/components/BrokerDashboard';

export default function BrokerPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Broker</h1>
      <BrokerDashboard />
    </div>
  );
}
