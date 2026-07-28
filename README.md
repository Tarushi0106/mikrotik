# NetControl — MikroTik RouterOS Monitoring Dashboard

Full-stack application for monitoring a MikroTik RouterOS device.

## Project Structure

```
NetControl/
├── backend/          # Express API server (Node.js)
│   ├── package.json
│   ├── index.js          # Entry point
│   ├── auth.js           # Session management
│   ├── config.js         # Environment configuration
│   ├── routes.js         # All /api/* endpoints
│   ├── mappers.js        # RouterOS response transformers
│   ├── probe.js          # Connectivity diagnostic tool
│   ├── trafficSampler.js # In-memory traffic history poller
│   ├── lib/format.js     # Formatting helpers
│   ├── routeros/
│   │   ├── index.js      # Client factory (auto-detect REST/Binary)
│   │   ├── restClient.js # RouterOS v7 REST client
│   │   └── binaryClient.js # RouterOS v6+ binary API client
│   └── .env.example
├── frontend/         # React + Vite dashboard
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example
│   ├── .oxlintrc.json
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css
│       ├── api/
│       │   └── client.js
│       ├── components/
│       │   ├── layout/
│       │   │   ├── DashboardLayout.jsx
│       │   │   ├── Sidebar.jsx
│       │   │   ├── Topbar.jsx
│       │   │   └── ProtectedRoute.jsx
│       │   ├── ui/
│       │   │   ├── DataTable.jsx
│       │   │   ├── StatusPill.jsx
│       │   │   ├── DataNotice.jsx
│       │   │   ├── PageHeader.jsx
│       │   │   └── StatCard.jsx
│       ├── context/
│       │   ├── AuthContext.jsx
│       │   └── DeviceContext.jsx
│       ├── hooks/
│       │   ├── useCountUp.js
│       │   └── useResource.js
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Login.jsx
│       │   ├── Dhcp.jsx
│       │   ├── Firewall.jsx
│       │   ├── Interfaces.jsx
│       │   ├── IpAddresses.jsx
│       │   ├── Logs.jsx
│       │   ├── Settings.jsx
│       │   ├── Users.jsx
│       │   └── Wireless.jsx
│       ├── data/
│       │   └── mockData.js
│       └── public/
└── .gitignore
```

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env    # Edit with your MikroTik device details
npm start                # Starts the Express API server on port 4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev              # Starts Vite dev server
```

### Combined (from repo root)

Open two terminals and run both commands above.

## MikroTik Device Connection

See [MIKROTIK CONNECTIVITY](#mikrotik-device-connection) below.

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` (backend) | Start the Express API server |
| `npm run probe` (backend) | Diagnose connectivity to the MikroTik device |
| `npm run dev` (frontend) | Start the Vite development server with HMR |
| `npm run build` (frontend) | Build for production (outputs to frontend/dist) |
| `npm run preview` (frontend) | Preview the production build |

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MIKROTIK_HOST` | `192.168.88.1` | IP address of the MikroTik device |
| `MIKROTIK_USER` | `admin` | RouterOS username |
| `MIKROTIK_PASSWORD` | *(empty)* | RouterOS password |
| `MIKROTIK_API` | `auto` | `auto`, `rest`, or `binary` |
| `MIKROTIK_REST_PROTOCOL` | `https` | Protocol for REST API |
| `MIKROTIK_TLS_VERIFY` | `false` | Whether to verify TLS certificates |
| `MIKROTIK_TIMEOUT_MS` | `8000` | Connection timeout in milliseconds |
| `PORT` | `4000` | Express server port |
| `AUTH_MODE` | `router` | `router` (verify credentials against device) or `bypass` |
| `TRAFFIC_INTERFACE` | *(auto)* | Interface to chart traffic for (blank = auto) |
| `TRAFFIC_INTERVAL_MS` | `10000` | Polling interval for traffic data |
| `TRAFFIC_HISTORY_POINTS` | `60` | Number of history points to keep |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_TARGET` | `http://localhost:4000` | Backend API URL for the Vite proxy |
