import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import HomePage from '@/pages/home';
import HowItWorksPage from '@/pages/how-it-works';
import PricingPage from '@/pages/pricing';
import SampleReportPage from '@/pages/sample-report';
import DashboardPage from '@/pages/dashboard';
import QuotesPage from '@/pages/quotes';
import VendorsPage from '@/pages/vendors';
import InsightsPage from '@/pages/insights';
import AccountPage from '@/pages/account';
import LoginPage from '@/pages/login';
import NewAnalysisPage from '@/pages/analysis-new';
import AnalysisProcessingPage from '@/pages/analysis-processing';
import AnalysisReportPage from '@/pages/analysis-report';
import AnalysisQuotePage from '@/pages/analysis-quote';
import AnalysisCompletePage from '@/pages/analysis-complete';
import { AuthProvider } from '@/context/auth-context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/sample-report" component={SampleReportPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/vendors" component={VendorsPage} />
        <Route path="/insights" component={InsightsPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/login" component={LoginPage} />
        
        <Route path="/analysis/new" component={NewAnalysisPage} />
        <Route path="/analysis/:id/processing" component={AnalysisProcessingPage} />
        <Route path="/analysis/:id/report" component={AnalysisReportPage} />
        <Route path="/analysis/:id/quote" component={AnalysisQuotePage} />
        <Route path="/analysis/:id/complete" component={AnalysisCompletePage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
