import { NavLink, Route, Routes } from 'react-router-dom';
import { AddressPage } from './pages/AddressPage';
import { AdminPage } from './pages/AdminPage';

function App() {
  return (
    <div>
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl gap-4 p-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`
            }
          >
            Alamat
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`
            }
          >
            Admin CRUD
          </NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<AddressPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

export default App;
