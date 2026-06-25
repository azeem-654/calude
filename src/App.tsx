import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Layout/Sidebar';
import Dashboard from './components/Dashboard/Dashboard';
import Contacts from './components/Contacts/Contacts';
import Conversations from './components/Conversations/Conversations';
import CalendarView from './components/Calendar/CalendarView';
import Pipelines from './components/Pipelines/Pipelines';
import Marketing from './components/Marketing/Marketing';
import Funnels from './components/Funnels/Funnels';
import SitePreview from './components/Websites/SitePreview';
import Scheduling from './components/Scheduling/Scheduling';
import BookingPage from './components/Scheduling/BookingPage';
import Analytics from './components/Analytics/Analytics';
import Reputation from './components/Reputation/Reputation';
import Settings from './components/Settings/Settings';
import VideoShorts from './components/VideoShorts/VideoShorts';
import SocialCreator from './components/SocialCreator/SocialCreator';
import PostEditor from './components/SocialCreator/PostEditor';

const SIDEBAR_WIDTHS = { full: 240, icons: 64, hidden: 0 };

function AppLayout() {
  const location = useLocation();
  const { sidebarMode } = useApp();
  const isBooking = location.pathname.startsWith('/book');
  const isPreview = location.pathname.startsWith('/preview');
  const isEditor = location.pathname.startsWith('/social-creator/editor');

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

  if (isEditor) {
    return (
      <Routes>
        <Route path="/social-creator/editor/:id" element={<PostEditor />} />
      </Routes>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar />
      <main style={{
        marginLeft: `${SIDEBAR_WIDTHS[sidebarMode]}px`,
        flex: 1,
        minHeight: '100vh',
        overflow: 'auto',
        transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/funnels" element={<Funnels />} />
          <Route path="/scheduling" element={<Scheduling />} />
          <Route path="/ai-shorts" element={<VideoShorts />} />
          <Route path="/social-creator" element={<SocialCreator />} />
          <Route path="/social-creator/editor/:id" element={<PostEditor />} />
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
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </BrowserRouter>
  );
}
