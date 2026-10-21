/** Compose public landing and application routes with persistent navigation. */
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Header } from './components/Header';
import Home from './features/home/Home';
import Apply from './features/apply/Apply';

/**
 * Keep declared navigation URLs usable while later slices register their pages.
 * Returns:
 *   The shared header, home content, and candidate application form.
 * Notes:
 *   Session persistence and credential handling belong to the later auth slice.
 */
export default function App() {
  const navigate = useNavigate();

  /** Return to the public route; the home slice has no authenticated session. */
  function onLogout() {
    navigate('/');
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header authenticated={false} onLogout={onLogout} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/admin" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}
