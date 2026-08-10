import { useState } from 'react';
import { FiPlus, FiTrash2, FiCheckCircle, FiSearch, FiCheck } from 'react-icons/fi';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import { useResource } from '../hooks/useResource';
import { api } from '../api/client';

const MODE_OPTIONS = [
  { key: 'auto', label: 'Auto-detect', needsPorts: null },
  { key: 'rest', label: 'REST API', needsPorts: ['rest', 'rest-ssl'] },
  { key: 'binary', label: 'Binary API', needsPorts: ['binary', 'binary-ssl'] },
];

const emptyForm = { name: '', host: '', user: '', password: '', apiMode: 'auto' };

function ServiceDot({ open }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${open ? 'text-emerald-600' : 'text-ink-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-ink-300'}`} />
      {open ? 'Open' : 'Closed'}
    </span>
  );
}

export default function Devices() {
  const devices = useResource('/devices', { fallback: [], refreshMs: 30000 });

  const [form, setForm] = useState(emptyForm);
  const [services, setServices] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          {row.name}
          {row.active && (
            <span
              title="This device is currently powering the dashboard"
              className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 bg-brand-50 rounded-full px-2 py-0.5"
            >
              Viewing
            </span>
          )}
        </span>
      ),
    },
    { key: 'host', header: 'IP Address' },
    { key: 'apiMode', header: 'API' },
    { key: 'rest', header: 'REST API', render: (row) => <ServiceDot open={row.services?.rest} /> },
    { key: 'binary', header: 'Binary API', render: (row) => <ServiceDot open={row.services?.binary} /> },
    { key: 'winbox', header: 'WinBox', render: (row) => <ServiceDot open={row.services?.winbox} /> },
    { key: 'ssh', header: 'SSH', render: (row) => <ServiceDot open={row.services?.ssh} /> },
    {
      key: 'online',
      header: 'Status',
      render: (row) => (
        <span title={row.offlineReason ?? undefined}>
          <StatusPill status={row.online ? 'online' : 'offline'} />
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          {!row.active && (
            <button
              type="button"
              title="Switch the dashboard to view this device"
              disabled={rowBusyId === row.id}
              onClick={() => activate(row)}
              className="p-1.5 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
            >
              <FiCheckCircle size={14} />
            </button>
          )}
          <button
            type="button"
            title="Remove"
            disabled={rowBusyId === row.id}
            onClick={() => remove(row)}
            className="p-1.5 rounded-md text-brand-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  async function activate(row) {
    setRowBusyId(row.id);
    try {
      await api.post(`/devices/${encodeURIComponent(row.id)}/activate`);
      await devices.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Remove device "${row.name}"?`)) return;
    setRowBusyId(row.id);
    try {
      await api.delete(`/devices/${encodeURIComponent(row.id)}`);
      await devices.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleScan() {
    if (!form.host.trim()) {
      setScanError('Enter an IP address first.');
      return;
    }
    setScanning(true);
    setScanError('');
    setServices(null);
    try {
      const result = await api.post('/connection/probe', { host: form.host.trim() });
      setServices(result.services);
      const isOpen = (key) => result.services.find((s) => s.key === key)?.open;
      if (isOpen('rest') || isOpen('rest-ssl')) setForm((f) => ({ ...f, apiMode: 'rest' }));
      else if (isOpen('binary') || isOpen('binary-ssl')) setForm((f) => ({ ...f, apiMode: 'binary' }));
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  }

  function isModeAvailable(option) {
    if (!services || !option.needsPorts) return true;
    return option.needsPorts.some((key) => services.find((s) => s.key === key)?.open);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.host || !form.user || !form.password) {
      setFormError('IP address, username, and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/devices', form);
      setForm(emptyForm);
      setServices(null);
      await devices.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Devices"
        description="MikroTik routers this dashboard can connect to. All are monitored for reachability; pick one to view its full dashboard."
      />

      <div className="mb-6">
        <DataTable columns={columns} rows={devices.data ?? []} />
      </div>

      <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 max-w-2xl">
        <h3 className="font-bold text-sm text-ink-900 mb-4">Add a Device</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Office Router" />
            <label className="block">
              <span className="text-xs font-medium text-ink-700">IP Address</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={form.host}
                  onChange={(e) => {
                    setForm({ ...form, host: e.target.value });
                    setServices(null);
                  }}
                  placeholder="192.168.88.1"
                  className="flex-1 min-w-0 border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={scanning}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2.5 text-xs font-medium text-ink-700 hover:bg-ink-900/5 disabled:opacity-60 transition-colors"
                >
                  <FiSearch size={14} /> {scanning ? 'Scanning…' : 'Scan'}
                </button>
              </div>
            </label>
          </div>

          {scanError && <p className="text-xs text-brand-700">{scanError}</p>}

          {services && (
            <div className="rounded-lg border border-black/[0.06] p-3 space-y-1.5">
              <p className="text-xs font-medium text-ink-700 mb-1.5">Services found on this router:</p>
              {services.map((s) => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <span className="text-ink-600">{s.label}</span>
                  <span className={s.open ? 'text-emerald-600 font-medium' : 'text-ink-400'}>
                    {s.open ? 'Open' : 'Closed'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div>
            <span className="text-xs font-medium text-ink-700 block mb-1.5">API to use</span>
            <div className="flex gap-2">
              {MODE_OPTIONS.map((option) => {
                const available = isModeAvailable(option);
                const selected = form.apiMode === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!available}
                    onClick={() => setForm({ ...form, apiMode: option.key })}
                    title={!available ? 'Not open on this router (scan to check)' : undefined}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      selected
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-black/10 text-ink-600 hover:bg-ink-900/5'
                    }`}
                  >
                    {selected && <FiCheck size={13} />} {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label="Username" value={form.user} onChange={(v) => setForm({ ...form, user: v })} required />
            <TextField label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
          </div>

          {formError && <p className="text-xs text-brand-700">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            <FiPlus size={16} /> {submitting ? 'Connecting…' : 'Add Device'}
          </button>
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
