import { Switch, Route, Router as WouterRouter } from "wouter";
import { navigate } from "wouter/use-browser-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignIn, SignUp } from "@clerk/react";
import { dark } from "@clerk/themes";
import { publishableKeyFromHost } from "@clerk/shared/keys";

import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Feed from "@/pages/feed";
import Explore from "@/pages/explore";
import Submit from "@/pages/submit";
import PaperDetail from "@/pages/paper-detail";
import PaperEdit from "@/pages/paper-edit";
import Profile from "@/pages/profile";
import Me from "@/pages/me";
import Focus from "@/pages/focus";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const PUBLISHABLE_KEY = rawKey || publishableKeyFromHost(window.location.hostname);
const PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL || undefined;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/feed" component={Feed} />
      <Route path="/explore" component={Explore} />
      <Route path="/submit" component={Submit} />
      <Route path="/papers/:id" component={PaperDetail} />
      <Route path="/papers/:id/edit" component={PaperEdit} />
      <Route path="/profile/:id" component={Profile} />
      <Route path="/me" component={Me} />
      <Route path="/focus" component={Focus} />
      
      <Route path="/sign-in/*">
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        </div>
      </Route>
      <Route path="/sign-up/*">
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        </div>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        proxyUrl={PROXY_URL}
        routerPush={(to) => navigate(to.replace(basePath, ''))}
        routerReplace={(to) => navigate(to.replace(basePath, ''), { replace: true })}
        appearance={{
          baseTheme: dark,
          variables: { colorPrimary: 'hsl(220, 70%, 40%)' },
          layout: {
            logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
          }
        }}
      >
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ClerkProvider>
    </QueryClientProvider>
  );
}

export default App;