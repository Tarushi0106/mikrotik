import { useState } from 'react';
import { FiPlus, FiTrash2, FiPower } from 'react-icons/fi';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { api } from '../api/client';
import { pppActive as demoPppActive, pppSecrets as demoPppSecrets } from '../data/mockData';

const activeColumns = [
  { key: 'name', header: 'Name' },
  { key: 'service', header: 'Service' },
  { key: 'callerId', header: 'Caller ID' },
  { key: 'address', header: 'Address' },
  { key: 'uptime', header: 'Uptime' },
];

const SERVICES = ['any', 'pppoe', 'l2tp', 'pptp', 'sstp', 'ovpn'];

const emptyForm = {
  name: '',
  password: '',
  service: 'any',
  profile: 'default',
  localAddress: '',
  remoteAddress: '',
  comment: '',
};

export default function Ppp() {
  const active = useResource('/ppp/active', { fallback: demoPppActive, refreshMs: 10000 });
  const secrets = useResource('/ppp/secrets', { fallback: demoPppSecrets, refreshMs: 15000 });

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);

  const secretColumns = [
    { key: 'name', header: 'Name' },
    { key: 'service', header: 'Service' },
    { key: 'profile', header: 'Profile' },
    { key: 'localAddress', header: 'Local Address' },
    { key: 'remoteAddress', header: 'Remote Address' },
    { key: 'comment', header: 'Comment', render: (row) => row.comment || <span className="text-ink-500/60">&mdash;</span> },
    {
      key: 'disabled',
      header: 'State',
      render: (row) => <StatusPill status={row.disabled ? 'disabled' : 'active'} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={row.disabled ? 'Enable' : 'Disable'}
            disabled={rowBusyId === row.id}
            onClick={() => toggleSecret(row)}
            className="p-1.5 rounded-md text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 disabled:opacity-40 transition-colors"
          >
            <FiPower size={14} />
          </button>
          <button
            type="button"
            title="Delete"
            disabled={rowBusyId === row.id}
            onClick={() => deleteSecret(row)}
            className="p-1.5 rounded-md text-brand-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  async function toggleSecret(row) {
    setRowBusyId(row.id);
    try {
      await api.patch(`/ppp/secrets/${encodeURIComponent(row.id)}`, { disabled: !row.disabled });
      await secrets.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  async function deleteSecret(row) {
    if (!window.confirm(`Delete PPP secret "${row.name}"?`)) return;
    setRowBusyId(row.id);
    try {
      await api.delete(`/ppp/secrets/${encodeURIComponent(row.id)}`);
      await secrets.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.name || !form.password) {
      setFormError('Name and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/ppp/secrets', form);
      setForm(emptyForm);
      await secrets.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="PPP"
        description="Point-to-point connections: active sessions and configured secrets."
      />

      <h3 className="font-bold text-sm text-ink-900 mb-2">Active Connections</h3>
      <DataNotice error={active.error} live={active.live} loading={active.loading} onRetry={active.refresh} />
      <div className="mb-6">
        <DataTable columns={activeColumns} rows={active.data ?? []} />
      </div>

      <h3 className="font-bold text-sm text-ink-900 mb-2">Secrets</h3>
      <DataNotice error={secrets.error} live={secrets.live} loading={secrets.loading} onRetry={secrets.refresh} />
      <div className="mb-4">
        <DataTable columns={secretColumns} rows={secrets.data ?? []} />
      </div>

      <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 max-w-2xl">
        <h3 className="font-bold text-sm text-ink-900 mb-4">Add PPP Secret</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <TextField label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
          <SelectField label="Service" value={form.service} options={SERVICES} onChange={(v) => setForm({ ...form, service: v })} />
          <TextField label="Profile" value={form.profile} onChange={(v) => setForm({ ...form, profile: v })} />
          <TextField label="Local Address" value={form.localAddress} onChange={(v) => setForm({ ...form, localAddress: v })} placeholder="optional" />
          <TextField label="Remote Address" value={form.remoteAddress} onChange={(v) => setForm({ ...form, remoteAddress: v })} placeholder="optional" />
          <div className="sm:col-span-2">
            <TextField label="Comment" value={form.comment} onChange={(v) => setForm({ ...form, comment: v })} placeholder="optional" />
          </div>
          {formError && <p className="sm:col-span-2 text-xs text-brand-700">{formError}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              <FiPlus size={16} /> {submitting ? 'Adding…' : 'Add Secret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', required = false, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}
