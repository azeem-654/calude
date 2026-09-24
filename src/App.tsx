import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import TopNav, { IconRail } from './components/Layout/TopNav';
import LoginScreen from './components/Auth/LoginScreen';
import { getSession } from './services/auth';
import { getActiveAccountId, setActiveAccountId, activeBranding } from './services/tenancy';
import { isAppHost, isMarketingHost, markWhiteLabelHost } from './services/hosts';
import { cachedHost, resolveHost, type ResolvedHost } from './services/whitelabel';
import { initCloudSync, startCloudRefresh } from './services/serverData';
import { Loader } from 'lucide-react';
import ErrorBoundary from './components/shared/ErrorBoundary';
import DueWorkRunner from './components/shared/DueWorkRunner';
import Dashboard from './components/Dashboard/Dashboard';
import Contacts from './components/Contacts/Contacts';
import Conversations from './components/Conversations/Conversations';
import CalendarView from './components/Calendar/CalendarView';
import Pipelines from './components/Pipelines/Pipelines';
import Marketing from './components/Marketing/Marketing';
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
import Autopilot from './components/Autopilot/Autopilot';
import Commerce from './components/Commerce/Commerce';
import ShopPage from './components/Shop/ShopPage';
import Engagement from './components/Engagement/Engagement';
import ClientReport from './components/Portal/ClientReport';
import GoogleCallback from './components/Auth/GoogleCallback';
import ReviewQueue from './components/Moderation/ReviewQueue';
import PolicyPage from './components/Site/PolicyPage';
import TrustCenter from './components/Site/TrustCenter';
import StandingBanner from './components/shared/StandingBanner';
import StagingBanner from './components/shared/StagingBanner';
import { LogoMark } from './components/shared/Logo';

function AppLayout({ isClient }: { isClient: boolean }) {
  const location = useLocation();
  const isBooking = location.pathname.startsWith('/book');
  const isShop = location.pathname.startsWith('/shop');
  /* A reseller's client, opening a report link. Never a login form — they have
     no account here and are never going to have one. */
  const isReport = location.pathname.startsWith('/p/');
  const isPreview = location.pathname.startsWith('/preview');
  const isEditor = location.pathname.startsWith('/social-creator/editor');

  /* The Trust Center is public on every host, signed in or not. */
  if (location.pathname === '/security') {
    return (
      <Routes>
        <Route path="/security" element={<TrustCenter />} />
      </Routes>
    );
  }

  if (isBooking) {
    return (
      <Routes>
        <Route path="/book/:slug" element={<BookingPage />} />
        <Route path="/book" element={<BookingPage />} />
      </Routes>
    );
  }

  if (isShop) {
    return (
      <Routes>
        <Route path="/shop/:slug" element={<ShopPage />} />
      </Routes>
    );
  }

  if (isReport) {
    return (
      <Routes>
        <Route path="/p/:token" element={<ClientReport />} />
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
      {/* Above even the nav: "you are not on the live site" outranks everything
          else on the page, including the nav that makes it look like you are. */}
      <StagingBanner />
      <TopNav />
      {/* Above everything else, because it is the explanation for anything that
          refuses lower down the page. */}
      <StandingBanner />
      <IconRail />
      <DueWorkRunner />
      {/* The 62px is the floating icon rail's width. The rail is hidden below
          760px (see index.css), so on a phone that padding was 62px of nothing
          shoving every screen off-centre to the right; `app-main` takes it back
          there. */}
      <main className="app-main" style={{ minHeight: 'calc(100vh - 68px)' }}>
        {/* Keyed on the path so moving to another screen clears a crash rather
            than trapping the user on the error page. */}
        <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/engagement" element={<Engagement />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/marketing" element={<Marketing />} />
          {/* The Sales Agent's front door is gone — the module folded into AI
              Autopilot, which runs the same work per project. The detail route
              stays because campaigns it created are stamped with it in their
              provenance, and a traceable record that 404s is worse than a
              retired tab. */}
          <Route path="/ai-sales-agent" element={<Navigate to="/autopilot" replace />} />
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
          <Route path="/autopilot" element={<Autopilot />} />
          <Route path="/sell" element={<Commerce />} />
          <Route path="/settings" element={<Settings />} />
          {/* The screen itself checks who is asking, and so does every action
              behind it — a client login that guesses the address gets a
              sentence, not a queue. */}
          <Route path="/moderation" element={<ReviewQueue />} />
          <Route path="/terms" element={<PolicyPage />} />
          <Route path="/security" element={<TrustCenter />} />
          {/*
           * Every other Routes block in this file has a catch-all; this one did
           * not, and the result was a screen that looked broken rather than
           * missing: the nav and the rail rendered, `main` rendered nothing.
           *
           * The commonest way in is not a typo. `/login` and `/signup` are real
           * addresses — the marketing site's two buttons point at them, and
           * people bookmark them — but they are routes of the *signed-out*
           * tree. Arriving at either with a session already in hand fell
           * through to nothing at all.
           */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function SyncGate({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing] = useState(true);
  const [resolved, setResolved] = useState<ResolvedHost | null>(() => cachedHost());
  const local = activeBranding();

  /*
   * A reseller's branding wins over this browser's.
   *
   * Their client arrives at the reseller's address having never seen this
   * workspace, so there is nothing local worth preferring — and on a shared
   * computer the local copy belongs to whoever logged in last, which is exactly
   * the wrong logo to paint.
   */
  const brand = resolved
    ? {
        ...local,
        appName: resolved.appName || local.appName,
        logoUrl: resolved.logoUrl || local.logoUrl,
        loginHeadline: resolved.loginHeadline || local.loginHeadline,
      }
    : local;

  useEffect(() => {
    let alive = true;
    /*
     * Resolved before sync, not beside it.
     *
     * The hostname decides which workspace a visitor is even looking at, and
     * starting the data sync before that is settled means syncing the wrong one
     * and then correcting it on screen.
     */
    /* Kept so the refresh loop can be torn down with the rest of this effect —
       a second one started by a re-mount would double every request. */
    let stopRefresh: (() => void) | null = null;

    void (async () => {
      const match = await resolveHost();
      if (!alive) return;
      if (match) {
        setResolved(match);
        markWhiteLabelHost(true);
      }
      await initCloudSync();
      if (!alive) return;
      /* Autopilot writes to the database from the cron, with nobody's browser
         involved. Without this the customer sits on the page and watches
         nothing appear. */
      stopRefresh = startCloudRefresh();
      setSyncing(false);
    })();
    return () => { alive = false; stopRefresh?.(); };
  }, []);
  if (!syncing) return <>{children}</>;
  return (
    <div style={{ minHeight: '100vh', background: '#e9ebee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMark size={32} />
        <span style={{ fontSize: 22, fontWeight: 800, color: '#17191c', letterSpacing: '-0.03em' }}>{brand.appName}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8a8f98', fontSize: 13, fontWeight: 500 }}>
        <Loader size={15} className="spin" /> Loading your workspace…
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

  /*
   * An agency that signed up gets its own workspace id, and nothing was
   * pointing at it. The sync gives up when there is no active account
   * (`if (!session || !accountId) return null`), so a new customer would use
   * the product, see it working, and have none of it reach the server.
   *
   * Only when nothing is selected: an agency moves between its own
   * sub-accounts, and forcing this on every render would drag them back to
   * their own workspace every time they opened a client's.
   */
  useEffect(() => {
    if (session?.user.role === 'agency' && session.user.accountId && !getActiveAccountId()) {
      setActiveAccountId(session.user.accountId);
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
  /* A shopper and somebody booking a slot are the two visitors who arrive with
     no account and must never meet a login form. */
  const isPublicBooking = window.location.pathname.startsWith(`${base}/book`);
  const isPublicShop = window.location.pathname.startsWith(`${base}/shop`);
  /* The third anonymous visitor: somebody's client reading their own report. */
  const isPublicReport = window.location.pathname.startsWith(`${base}/p/`);

  /*
   * Coming back from Google, which is neither signed in nor signed out.
   *
   * Checked before either tree, and before the session is consulted. A visitor
   * with a stale session who signs in as somebody else lands here too, and the
   * signed-in tree's catch-all would have bounced them to the dashboard —
   * throwing away the code and leaving them in the account they were trying to
   * leave.
   */
  if (window.location.pathname === `${base}/auth/google`) {
    return <GoogleCallback onAuthed={signedIn} />;
  }
  if (!session && isPublicReport) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route path="/p/:token" element={<ClientReport />} />
        </Routes>
      </BrowserRouter>
    );
  }
  if (!session && isPublicShop) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route path="/shop/:slug" element={<ShopPage />} />
          <Route path="*" element={<ShopPage />} />
        </Routes>
      </BrowserRouter>
    );
  }
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
   * protectedcentral.com is the marketing site and nothing else. There is no
   * login form on it and no session to find — sessions belong to the app's own
   * origin — so every address on this host is the page, and the two ways in are
   * links across to app.protectedcentral.com.
   */
  if (isMarketingHost()) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          {/* The one address on the marketing host that is not the pitch. It is
              linked from the sign-up form, and a policy that opens a login
              screen is a policy nobody has read. */}
          <Route path="/terms" element={<PolicyPage />} />
          <Route path="/security" element={<TrustCenter />} />
          <Route path="*" element={<SiteHome />} />
        </Routes>
      </BrowserRouter>
    );
  }

  /*
   * A visitor who has never heard of this arrives at the marketing site, not at
   * a password box. The login form keeps its own address, so a bookmark to it
   * still works and so does anything that links people straight to signing in.
   *
   * On the app host the marketing page is a different site at a different
   * address, so a signed-out visitor gets the login form wherever they landed
   * rather than a second copy of the pitch under the wrong domain.
   */
  if (!session) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        {/* Before the sign-in form, not only after it. Somebody typing their
            password into the testing copy has already been misled. */}
        <StagingBanner />
        <Routes>
          {/* Two doors, because the marketing site has two buttons. What each
              one can actually do is still the server's call. */}
          <Route path="/terms" element={<PolicyPage />} />
          <Route path="/security" element={<TrustCenter />} />
          <Route path="/login" element={<LoginScreen onAuthed={signedIn} intent="signin" />} />
          <Route path="/signup" element={<LoginScreen onAuthed={signedIn} intent="signup" />} />
          <Route path="*" element={isAppHost() ? <LoginScreen onAuthed={signedIn} /> : <SiteHome />} />
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
