import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Interfaces from './pages/Interfaces';
import Wireless from './pages/Wireless';
import Dhcp from './pages/Dhcp';
import Ppp from './pages/Ppp';
import Wireguard from './pages/Wireguard';
import Firewall from './pages/Firewall';
import IpAddresses from './pages/IpAddresses';
import Logs from './pages/Logs';
import Users from './pages/Users';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/interfaces" element={<Interfaces />} />
              <Route path="/wireless" element={<Wireless />} />
              <Route path="/dhcp" element={<Dhcp />} />
              <Route path="/ppp" element={<Ppp />} />
              <Route path="/wireguard" element={<Wireguard />} />
              <Route path="/firewall" element={<Firewall />} />
              <Route path="/ip-addresses" element={<IpAddresses />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/users" element={<Users />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
