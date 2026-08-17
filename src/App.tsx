import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import TopNav, { IconRail } from './components/Layout/TopNav';
import LoginScreen from './components/Auth/LoginScreen';
import { getSession } from './services/auth';
import { getActiveAccountId, setActiveAccountId, activeBranding } from './services/tenancy';
import { initCloudSync } from './services/serverData';
import { Layers, Loader } from 'lucide-react';
import ErrorBoundary from './components/shared/ErrorBoundary';
import DueWorkRunner from './components/shared/DueWorkRunner';
import Dashboard from './components/Dashboard/Dashboard';
import Contacts from './components/Contacts/Contacts';
import Conversations from './components/Conversations/Conversations';
import CalendarView from './components/Calendar/CalendarView';
import Pipelines from './components/Pipelines/Pipelines';
import Marketing from './components/Marketing/Marketing';
import AISalesAgent from './components/AISalesAgent/AISalesAgent';
import CampaignDetail from './components/AISalesAgent/CampaignDetail';
import Funnels from './components/Funnels/Funnels';
import Websites from './components/Websites/Websites';
import SitePreview from './components/Websites/SitePreview';
import BlogAutomation from './components/BlogAutomation/BlogAutomation';
import FunnelPreview from './components/Funnels/FunnelPreview';
import Scheduling from './components/Scheduling/Scheduling';
import BookingPage from './components/Scheduling/BookingPage';
import Analytics from './components/Analytics/Analytics';
import Reputation from './components/Reputation/Reputation';
import Settings from './components/Settings/Settings';
import VideoShorts from './components/VideoShorts/VideoShorts';
import SocialAutomation from './components/SocialAutomation/SocialAutomation';
import SocialCreator from './components/SocialCreator/SocialCreator';
import PostEditor from './components/SocialCreator/PostEditor';
import AgencyDashboard from './components/Agency/AgencyDashboard';
import ClientBilling from './components/Billing/ClientBilling';
import SiteHome from './components/Site/SiteHome';

function AppLayout({ isClient }: { isClient: boolean }) {
  const location = useLocation();
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
        <Route path="/preview-funnel/:funnelId" element={<FunnelPreview />} />
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
    <div style={{ minHeight: '100vh', backgroundColor: '#e9ebee' }}>
      <TopNav />
      <IconRail />
      <DueWorkRunner />
      <main style={{ minHeight: 'calc(100vh - 68px)', paddingLeft: 62 }}>
        {/* Keyed on the path so moving to another screen clears a crash rather
            than trapping the user on the error page. */}
        <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/ai-sales-agent" element={<AISalesAgent />} />
          <Route path="/ai-sales-agent/:id" element={<CampaignDetail />} />
          <Route path="/funnels" element={<Funnels />} />
          <Route path="/blog-automation" element={<BlogAutomation />} />
          <Route path="/websites" element={<Websites />} />
          <Route path="/scheduling" element={<Scheduling />} />
          <Route path="/ai-shorts" element={<VideoShorts />} />
          <Route path="/social-automation" element={<SocialAutomation />} />
          <Route path="/social-creator" element={<SocialCreator />} />
          <Route path="/social-creator/editor/:id" element={<PostEditor />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reputation" element={<Reputation />} />
          {/* Agency dashboard is off-limits to client logins */}
          <Route path="/agency" element={isClient ? <Navigate to="/" replace /> : <AgencyDashboard />} />
          <Route path="/billing" element={<ClientBilling />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function SyncGate({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing] = useState(true);
  const brand = activeBranding();
  useEffect(() => {
    let alive = true;
    initCloudSync().finally(() => { if (alive) setSyncing(false); });
    return () => { alive = false; };
  }, []);
  if (!syncing) return <>{children}</>;
  return (
    <div style={{ minHeight: '100vh', background: '#e9ebee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Layers size={26} color="#17191c" strokeWidth={2.4} />
        <span style={{ fontSize: 22, fontWeight: 800, color: '#17191c', letterSpacing: '-0.03em' }}>{brand.appName}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8a8f98', fontSize: 13, fontWeight: 500 }}>
        <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading your workspace…
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(getSession());

  // Clients are locked to their own workspace — force the active account.
  useEffect(() => {
    if (session?.user.role === 'client' && session.user.accountId && getActiveAccountId() !== session.user.accountId) {
      setActiveAccountId(session.user.accountId);
      window.location.reload();
    }
  }, [session]);

  /* Signing in at /login leaves that address in the bar, and it is not a route
     the signed-in app has. Put the workspace root back before the tree swaps. */
  const signedIn = () => {
    const root = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/`;
    if (window.location.pathname !== root) window.history.replaceState(null, '', root);
    setSession(getSession());
  };

  // The public booking page must work for anonymous visitors — never gate it
  // behind the login screen.
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const isPublicBooking = window.location.pathname.startsWith(`${base}/book`);
  if (!session && isPublicBooking) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <AppProvider>
          <Routes>
            <Route path="/book/:slug" element={<BookingPage />} />
            <Route path="*" element={<BookingPage />} />
          </Routes>
        </AppProvider>
      </BrowserRouter>
    );
  }

  /*
   * A visitor who has never heard of this arrives at the marketing site, not at
   * a password box. The login form keeps its own address, so a bookmark to it
   * still works and so does anything that links people straight to signing in.
   */
  if (!session) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route path="/login" element={<LoginScreen onAuthed={signedIn} />} />
          <Route path="*" element={<SiteHome />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <SyncGate>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <AppProvider>
          <AppLayout isClient={session.user.role === 'client'} />
        </AppProvider>
      </BrowserRouter>
    </SyncGate>
  );
}
