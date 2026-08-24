import { useState } from 'react';
import { FiPlus, FiTrash2, FiPower } from 'react-icons/fi';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { api } from '../api/client';

function truncateKey(key) {
  if (!key || key === '—') return key;
  return `${key.slice(0, 10)}…${key.slice(-6)}`;
}

const emptyInterfaceForm = { name: '', listenPort: '', comment: '' };
const emptyPeerForm = { interface: '', publicKey: '', allowedAddress: '', endpointAddress: '', endpointPort: '', comment: '' };

export default function Wireguard() {
  const interfaces = useResource('/wireguard/interfaces', { fallback: [], refreshMs: 15000 });
  const peers = useResource('/wireguard/peers', { fallback: [], refreshMs: 10000 });

  const [ifaceForm, setIfaceForm] = useState(emptyInterfaceForm);
  const [ifaceSubmitting, setIfaceSubmitting] = useState(false);
  const [ifaceError, setIfaceError] = useState(null);
  const [ifaceBusyId, setIfaceBusyId] = useState(null);

  const [peerForm, setPeerForm] = useState(emptyPeerForm);
  const [peerSubmitting, setPeerSubmitting] = useState(false);
  const [peerError, setPeerError] = useState(null);
  const [peerBusyId, setPeerBusyId] = useState(null);

  const interfaceNames = (interfaces.data ?? []).map((i) => i.name);

  const interfaceColumns = [
    { key: 'name', header: 'Name' },
    { key: 'mtu', header: 'MTU' },
    { key: 'listenPort', header: 'Listen Port' },
    { key: 'publicKey', header: 'Public Key', render: (row) => <span title={row.publicKey} className="font-mono text-xs">{truncateKey(row.publicKey)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
    { key: 'comment', header: 'Comment', render: (row) => row.comment || <span className="text-ink-500/60">&mdash;</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <button
          type="button"
          title="Delete"
          disabled={ifaceBusyId === row.id}
          onClick={() => deleteInterface(row)}
          className="p-1.5 rounded-md text-brand-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors"
        >
          <FiTrash2 size={14} />
        </button>
      ),
    },
  ];

  const peerColumns = [
    { key: 'interface', header: 'Interface' },
    { key: 'publicKey', header: 'Public Key', render: (row) => <span title={row.publicKey} className="font-mono text-xs">{truncateKey(row.publicKey)}</span> },
    { key: 'endpoint', header: 'Endpoint' },
    { key: 'allowedAddress', header: 'Allowed Address' },
    { key: 'rx', header: 'RX' },
    { key: 'tx', header: 'TX' },
    { key: 'lastHandshake', header: 'Last Handshake' },
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
            disabled={peerBusyId === row.id}
            onClick={() => togglePeer(row)}
            className="p-1.5 rounded-md text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 disabled:opacity-40 transition-colors"
          >
            <FiPower size={14} />
          </button>
          <button
            type="button"
            title="Delete"
            disabled={peerBusyId === row.id}
            onClick={() => deletePeer(row)}
            className="p-1.5 rounded-md text-brand-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  async function deleteInterface(row) {
    if (!window.confirm(`Delete WireGuard interface "${row.name}"? Its peers will stop working.`)) return;
    setIfaceBusyId(row.id);
    try {
      await api.delete(`/wireguard/interfaces/${encodeURIComponent(row.id)}`);
      await interfaces.refresh();
    } catch (err) {
      setIfaceError(err.message);
    } finally {
      setIfaceBusyId(null);
    }
  }

  async function togglePeer(row) {
    setPeerBusyId(row.id);
    try {
      await api.patch(`/wireguard/peers/${encodeURIComponent(row.id)}`, { disabled: !row.disabled });
      await peers.refresh();
    } catch (err) {
      setPeerError(err.message);
    } finally {
      setPeerBusyId(null);
    }
  }

  async function deletePeer(row) {
    if (!window.confirm('Delete this WireGuard peer?')) return;
    setPeerBusyId(row.id);
    try {
      await api.delete(`/wireguard/peers/${encodeURIComponent(row.id)}`);
      await peers.refresh();
    } catch (err) {
      setPeerError(err.message);
    } finally {
      setPeerBusyId(null);
    }
  }

  async function submitInterface(e) {
    e.preventDefault();
    setIfaceError(null);
    if (!ifaceForm.name) {
      setIfaceError('Name is required.');
      return;
    }
    setIfaceSubmitting(true);
    try {
      await api.post('/wireguard/interfaces', ifaceForm);
      setIfaceForm(emptyInterfaceForm);
      await interfaces.refresh();
    } catch (err) {
      setIfaceError(err.message);
    } finally {
      setIfaceSubmitting(false);
    }
  }

  async function submitPeer(e) {
    e.preventDefault();
    setPeerError(null);
    if (!peerForm.interface || !peerForm.publicKey || !peerForm.allowedAddress) {
      setPeerError('Interface, public key, and allowed address are required.');
      return;
    }
    setPeerSubmitting(true);
    try {
      await api.post('/wireguard/peers', peerForm);
      setPeerForm(emptyPeerForm);
      await peers.refresh();
    } catch (err) {
      setPeerError(err.message);
    } finally {
      setPeerSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="WireGuard"
        description="WireGuard VPN interfaces and their connected peers."
      />

      <h3 className="font-bold text-sm text-ink-900 mb-2">Interfaces</h3>
      <DataNotice error={interfaces.error} live={interfaces.live} loading={interfaces.loading} onRetry={interfaces.refresh} />
      <div className="mb-4">
        <DataTable columns={interfaceColumns} rows={interfaces.data ?? []} />
      </div>

      <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 max-w-2xl mb-8">
        <h3 className="font-bold text-sm text-ink-900 mb-4">Add WireGuard Interface</h3>
        <p className="text-xs text-ink-500 mb-4">RouterOS generates the key pair automatically; the public key appears in the table above once created.</p>
        <form onSubmit={submitInterface} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Name" value={ifaceForm.name} onChange={(v) => setIfaceForm({ ...ifaceForm, name: v })} placeholder="wg-staff" required />
          <TextField label="Listen Port" value={ifaceForm.listenPort} onChange={(v) => setIfaceForm({ ...ifaceForm, listenPort: v })} placeholder="13231" />
          <div className="sm:col-span-2">
            <TextField label="Comment" value={ifaceForm.comment} onChange={(v) => setIfaceForm({ ...ifaceForm, comment: v })} placeholder="optional" />
          </div>
          {ifaceError && <p className="sm:col-span-2 text-xs text-brand-700">{ifaceError}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={ifaceSubmitting}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              <FiPlus size={16} /> {ifaceSubmitting ? 'Adding…' : 'Add Interface'}
            </button>
          </div>
        </form>
      </div>

      <h3 className="font-bold text-sm text-ink-900 mb-2">Peers</h3>
      <DataNotice error={peers.error} live={peers.live} loading={peers.loading} onRetry={peers.refresh} />
      <div className="mb-4">
        <DataTable columns={peerColumns} rows={peers.data ?? []} />
      </div>

      <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 max-w-2xl">
        <h3 className="font-bold text-sm text-ink-900 mb-4">Add WireGuard Peer</h3>
        <form onSubmit={submitPeer} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-ink-700">Interface</span>
            <select
              value={peerForm.interface}
              onChange={(e) => setPeerForm({ ...peerForm, interface: e.target.value })}
              className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Select…</option>
              {interfaceNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <TextField label="Allowed Address" value={peerForm.allowedAddress} onChange={(v) => setPeerForm({ ...peerForm, allowedAddress: v })} placeholder="10.30.0.4/32" required />
          <div className="sm:col-span-2">
            <TextField label="Public Key" value={peerForm.publicKey} onChange={(v) => setPeerForm({ ...peerForm, publicKey: v })} placeholder="the peer device's public key" required />
          </div>
          <TextField label="Endpoint Address" value={peerForm.endpointAddress} onChange={(v) => setPeerForm({ ...peerForm, endpointAddress: v })} placeholder="optional" />
          <TextField label="Endpoint Port" value={peerForm.endpointPort} onChange={(v) => setPeerForm({ ...peerForm, endpointPort: v })} placeholder="optional" />
          <div className="sm:col-span-2">
            <TextField label="Comment" value={peerForm.comment} onChange={(v) => setPeerForm({ ...peerForm, comment: v })} placeholder="optional" />
          </div>
          {peerError && <p className="sm:col-span-2 text-xs text-brand-700">{peerError}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={peerSubmitting}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              <FiPlus size={16} /> {peerSubmitting ? 'Adding…' : 'Add Peer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, required = false, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">{label}</span>
      <input
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink-900 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
