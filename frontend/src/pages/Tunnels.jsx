import { useState } from 'react';
import { FiTrash2, FiLink, FiCheck } from 'react-icons/fi';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import DataNotice from '../components/ui/DataNotice';
import StatusPill from '../components/ui/StatusPill';
import { useResource } from '../hooks/useResource';
import { api } from '../api/client';

const TUNNEL_TYPES = [
  {
    key: 'wireguard',
    label: 'WireGuard',
    note: 'Already supported today. Ongoing improvements are planned as other tunnel types are added.',
  },
  {
    key: 'pptp',
    label: 'PPTP',
    note: 'Set up and manage PPTP tunnels, for older devices that still rely on it.',
  },
  {
    key: 'l2tp',
    label: 'L2TP',
    note: 'Set up and manage L2TP tunnels.',
  },
  {
    key: 'sstp',
    label: 'SSTP',
    note: 'Set up and manage SSTP tunnels.',
  },
];

const emptyForm = { name: '', type: 'wireguard', deviceAId: '', deviceBId: '' };

function SideCell({ side }) {
  if (side.missing) {
    return (
      <div>
        <p className="font-medium text-brand-600">{side.name}</p>
        <p className="text-xs text-ink-500/60">device removed</p>
      </div>
    );
  }
  return (
    <div>
      <p className="font-medium text-ink-900">
        {side.name}
        {side.role && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500/70">{side.role}</span>}
      </p>
      <p className="text-xs text-ink-500">{side.host} &middot; {side.address}</p>
    </div>
  );
}

export default function Tunnels() {
  const tunnels = useResource('/tunnels', { fallback: [], refreshMs: 15000 });
  const devices = useResource('/devices', { fallback: [], refreshMs: 0 });

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);

  const deviceList = devices.data ?? [];

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'type', header: 'Type', render: (row) => <span className="uppercase text-xs font-semibold text-ink-600">{row.type}</span> },
    { key: 'deviceA', header: 'Device A', render: (row) => <SideCell side={row.deviceA} /> },
    { key: 'deviceB', header: 'Device B', render: (row) => <SideCell side={row.deviceB} /> },
    { key: 'subnet', header: 'Tunnel Subnet' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const up = row.deviceA.status && row.deviceB.status;
        return <StatusPill status={up ? 'active' : 'waiting'} />;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <button
          type="button"
          title="Tear down this tunnel"
          disabled={rowBusyId === row.id}
          onClick={() => remove(row)}
          className="p-1.5 rounded-md text-brand-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors"
        >
          <FiTrash2 size={14} />
        </button>
      ),
    },
  ];

  async function remove(row) {
    if (!window.confirm(`Tear down the tunnel "${row.name}"? This removes the configuration on both devices.`)) return;
    setRowBusyId(row.id);
    try {
      await api.delete(`/tunnels/${encodeURIComponent(row.id)}`);
      await tunnels.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.deviceAId || !form.deviceBId) {
      setFormError('Pick both devices to tunnel between.');
      return;
    }
    if (form.deviceAId === form.deviceBId) {
      setFormError('Pick two different devices.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/tunnels', form);
      setForm(emptyForm);
      await tunnels.refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedType = TUNNEL_TYPES.find((t) => t.key === form.type) ?? TUNNEL_TYPES[0];
  const isClientServer = form.type !== 'wireguard';

  return (
    <div>
      <PageHeader
        title="Tunnels"
        description="Site-to-site links between two devices in your fleet, provisioned end-to-end from here."
      />

      <DataNotice error={tunnels.error} live={tunnels.live} loading={tunnels.loading} onRetry={tunnels.refresh} />

      <div className="mb-6">
        <DataTable columns={columns} rows={tunnels.data ?? []} />
      </div>

      <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 max-w-2xl">
        <h3 className="font-bold text-sm text-ink-900 mb-1">Create a Tunnel</h3>
        <p className="text-xs text-ink-500 mb-4">
          Pick a tunnel type and two devices from your fleet. NetControl configures both ends and
          cross-connects them &mdash; nothing to set up by hand on either router.
        </p>

        {deviceList.length < 2 ? (
          <p className="text-sm text-ink-500">
            You need at least two devices in your fleet to create a tunnel. Add another on the Devices page first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <span className="text-xs font-medium text-ink-700 block mb-1.5">Tunnel Type</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TUNNEL_TYPES.map((t) => {
                  const selected = form.type === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setForm({ ...form, type: t.key })}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-black/10 text-ink-600 hover:bg-ink-900/5'
                      }`}
                    >
                      {selected && <FiCheck size={13} />} {t.label}
                    </button>
                  );
                })}
              </div>
              {selectedType && <p className="mt-2 text-xs text-ink-500">{selectedType.note}</p>}
            </div>

            <label className="block">
              <span className="text-xs font-medium text-ink-700">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Office <-> Warehouse"
                className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-ink-700">
                  Device A{isClientServer && <span className="text-ink-500/60 font-normal"> &middot; server</span>}
                </span>
                <select
                  value={form.deviceAId}
                  onChange={(e) => setForm({ ...form, deviceAId: e.target.value })}
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Select a device&hellip;</option>
                  {deviceList.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id === form.deviceBId}>
                      {d.name} ({d.host})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-700">
                  Device B{isClientServer && <span className="text-ink-500/60 font-normal"> &middot; client</span>}
                </span>
                <select
                  value={form.deviceBId}
                  onChange={(e) => setForm({ ...form, deviceBId: e.target.value })}
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Select a device&hellip;</option>
                  {deviceList.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id === form.deviceAId}>
                      {d.name} ({d.host})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {isClientServer && (
              <p className="text-xs text-ink-500 -mt-2">
                {selectedType.label} is a client/server protocol: Device A hosts the tunnel, Device B dials into it.
              </p>
            )}

            {formError && <p className="text-xs text-brand-700">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              <FiLink size={16} /> {submitting ? 'Creating tunnel…' : 'Create Tunnel'}
            </button>
            {submitting && (
              <p className="text-xs text-ink-500">
                Connecting to both devices and configuring the tunnel &mdash; this can take a few seconds.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
