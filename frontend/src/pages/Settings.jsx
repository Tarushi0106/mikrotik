import { FiSave } from 'react-icons/fi';
import PageHeader from '../components/ui/PageHeader';
import DataNotice from '../components/ui/DataNotice';
import { useDevice } from '../context/DeviceContext';

function Field({ label, defaultValue }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">{label}</span>
      <input
        type="text"
        defaultValue={defaultValue}
        className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

export default function Settings() {
  const { system, error, loading, live, refresh } = useDevice();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Router identity and company details. Editing is read-only here; RouterOS config changes aren't wired up yet."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <h3 className="font-bold text-sm text-ink-900">Router Identity</h3>
          <Field label="Identity" defaultValue={system.identity} />
          <Field label="Model" defaultValue={system.model} />
          <Field label="RouterOS Version" defaultValue={system.routerOS} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            <FiSave size={16} /> Save changes
          </button>
        </form>

        <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5">
          <h3 className="font-bold text-sm text-ink-900 mb-4">Company Profile</h3>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-lg bg-brand-600 text-white font-bold flex items-center justify-center">ST</div>
            <div>
              <p className="font-medium text-ink-900">Shaurrya Teleservices</p>
              <p className="text-xs text-ink-500">Network Control Center</p>
            </div>
          </div>
          <dl className="text-sm divide-y divide-black/[0.06]">
            <div className="flex justify-between py-2">
              <dt className="text-ink-500">Application</dt>
              <dd className="text-ink-900 font-medium">NetControl</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-ink-500">Theme</dt>
              <dd className="text-ink-900 font-medium">Red &amp; White</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-ink-500">Stack</dt>
              <dd className="text-ink-900 font-medium">MongoDB · Express · React · Node</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-ink-500">Frontend status</dt>
              <dd className="text-ink-900 font-medium">{live ? 'Connected to router' : 'Showing demo data'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
