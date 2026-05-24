import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Layout/Sidebar';
import Dashboard from './components/Dashboard/Dashboard';
import Contacts from './components/Contacts/Contacts';
import Conversations from './components/Conversations/Conversations';
import CalendarView from './components/Calendar/CalendarView';
import Pipelines from './components/Pipelines/Pipelines';
import Marketing from './components/Marketing/Marketing';
import Funnels from './components/Funnels/Funnels';
import Websites from './components/Websites/Websites';
import SitePreview from './components/Websites/SitePreview';
import Scheduling from './components/Scheduling/Scheduling';
import BookingPage from './components/Scheduling/BookingPage';
import Analytics from './components/Analytics/Analytics';
import Reputation from './components/Reputation/Reputation';
import Settings from './components/Settings/Settings';

function AppLayout() {
  const location = useLocation();
  const isBooking = location.pathname.startsWith('/book');
  const isPreview = location.pathname.startsWith('/preview');

  if (isBooking) {
    return (
      <Routes>
        <Route path="/book/:slug" element={<BookingPage />} />
        <Route path="/book" element={<BookingPage />} />
      </Routes>
    );
  }

  if (isPreview) {
    return (
      <Routes>
        <Route path="/preview/:siteId" element={<SitePreview />} />
      </Routes>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar />
      <main style={{ marginLeft: '240px', flex: 1, minHeight: '100vh', overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/funnels" element={<Funnels />} />
          <Route path="/websites" element={<Websites />} />
          <Route path="/scheduling" element={<Scheduling />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reputation" element={<Reputation />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/calude">
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </BrowserRouter>
  );
}
