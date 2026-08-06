import { FiX } from 'react-icons/fi';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import StatusPill from './StatusPill';

const TX_COLOR = '#2563eb'; // blue, matches WinBox's Tx color
const RX_COLOR = '#16a34a'; // green, matches WinBox's Rx color

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900 font-medium font-mono text-xs">{value}</span>
    </div>
  );
}

function PairRow({ label, tx, rx }) {
  return (
    <div className="grid grid-cols-3 items-center py-2 text-sm gap-2">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900 font-medium font-mono text-xs text-right">{tx}</span>
      <span className="text-ink-900 font-medium font-mono text-xs text-right">{rx}</span>
    </div>
  );
}

/** One WinBox-style graph: thin lines, gridlines, axis on the right, live value legend below. */
function TrafficGraph({ title, history, txKey, rxKey, txLabel, rxLabel, unit, formatTick }) {
  const hasData = history.length >= 2;

  return (
    <div className="mt-4 pt-3 border-t border-black/[0.06]">
      <h4 className="text-xs font-semibold text-ink-700 mb-2">{title}</h4>
      {!hasData ? (
        <p className="h-36 flex items-center justify-center text-xs text-ink-500 bg-ink-900/[0.02] rounded-lg">
          Collecting live samples&hellip; graph fills in as the page stays open.
        </p>
      ) : (
        <>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#00000012" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={{ stroke: '#00000015' }}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={formatTick}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: '#00000015', fontSize: 12 }}
                  formatter={(value) => [`${value} ${unit}`]}
                />
                <Line type="linear" dataKey={txKey} name="Tx" stroke={TX_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey={rxKey} name="Rx" stroke={RX_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TX_COLOR }} />
              <span className="font-medium text-ink-900">{txLabel}</span>
              <span className="text-ink-500">Tx</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RX_COLOR }} />
              <span className="font-medium text-ink-900">{rxLabel}</span>
              <span className="text-ink-500">Rx</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Modal detail view for one interface, mirroring WinBox's Interface > Traffic tab. */
export default function InterfaceDetail({ iface, history = [], onClose }) {
  if (!iface) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl shadow-black/20 animate-page max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] sticky top-0 bg-white rounded-t-xl">
          <div>
            <h3 className="font-bold text-sm text-ink-900">{iface.name}</h3>
            <p className="text-xs text-ink-500">{iface.type}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={iface.status} />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 transition-colors"
            >
              <FiX size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-3 text-xs font-semibold text-ink-500 pb-1 border-b border-black/[0.06]">
            <span>Traffic</span>
            <span className="text-right">TX (out)</span>
            <span className="text-right">RX (in)</span>
          </div>
          <PairRow label="Rate" tx={iface.txRate} rx={iface.rxRate} />
          <PairRow label="Packet Rate" tx={iface.txPacketRate} rx={iface.rxPacketRate} />
          <PairRow label="Total Bytes" tx={iface.txBytes} rx={iface.rxBytes} />
          <PairRow label="Total Packets" tx={iface.txPackets?.toLocaleString()} rx={iface.rxPackets?.toLocaleString()} />
          <PairRow label="Drops" tx={iface.txDrops?.toLocaleString()} rx={iface.rxDrops?.toLocaleString()} />
          <PairRow label="Errors" tx={iface.txErrors?.toLocaleString()} rx={iface.rxErrors?.toLocaleString()} />

          <TrafficGraph
            title="Byte Graph"
            history={history}
            txKey="tx"
            rxKey="rx"
            txLabel={iface.txRate}
            rxLabel={iface.rxRate}
            unit="Mbps"
            formatTick={(v) => `${v} Mb`}
          />

          <TrafficGraph
            title="Packet Graph"
            history={history}
            txKey="txPps"
            rxKey="rxPps"
            txLabel={iface.txPacketRate}
            rxLabel={iface.rxPacketRate}
            unit="p/s"
            formatTick={(v) => `${v} p/s`}
          />

          <div className="mt-3 pt-3 border-t border-black/[0.06]">
            <Row label="TX Queue Drops" value={iface.txQueueDrops?.toLocaleString()} />
            <Row label="MAC Address" value={iface.mac || '—'} />
            <Row label="MTU" value={iface.mtu} />
            <Row label="Comment" value={iface.comment || '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}
