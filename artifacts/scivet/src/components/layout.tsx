import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { SignedIn, SignedOut } from "@/lib/clerk-compat";
import { useGetActiveFocusSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookOpen, Compass, Plus, LogOut, User, Timer } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  // Quiet shell: while a focus session is active, the feed link steps back
  // (attentional residue — see docs/FOCUS_GUARD.md §1.3, §1.11).
  const { data: activeFocus } = useGetActiveFocusSession({
    query: { enabled: !!isSignedIn, staleTime: 30_000, refetchInterval: 60_000 },
  });
  const focusing = !!activeFocus?.session;
  const quietFeed = focusing && activeFocus.quietFeed;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <img src={`${window.location.origin}${basePath}/logo.svg`} alt="SciVet Logo" className="h-8 w-8 rounded-md" />
              <span className="font-serif font-bold text-xl tracking-tight hidden sm:inline-block">SciVet</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link 
                href="/explore" 
                className={`flex items-center gap-2 transition-colors hover:text-foreground/80 ${location.startsWith("/explore") ? "text-foreground" : "text-foreground/60"}`}
              >
                <Compass className="h-4 w-4" />
                Explore
              </Link>
              <SignedIn>
                <Link
                  href="/feed"
                  className={`flex items-center gap-2 transition-colors hover:text-foreground/80 ${quietFeed ? "opacity-30 pointer-events-none" : ""} ${location === "/feed" ? "text-foreground" : "text-foreground/60"}`}
                  aria-disabled={quietFeed}
                  title={quietFeed ? "Quiet during your focus session" : undefined}
                >
                  <BookOpen className="h-4 w-4" />
                  Feed
                </Link>
                <Link
                  href="/focus"
                  className={`flex items-center gap-2 transition-colors hover:text-foreground/80 ${location === "/focus" ? "text-foreground" : "text-foreground/60"}`}
                >
                  <Timer className="h-4 w-4" />
                  Focus
                </Link>
              </SignedIn>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {focusing && location !== "/focus" && (
              <Link href="/focus">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                  <Timer className="h-3 w-3 animate-pulse" />
                  Focusing
                </span>
              </Link>
            )}
            <SignedIn>
              <Link href="/submit">
                <Button variant="default" size="sm" className="hidden sm:flex gap-2">
                  <Plus className="h-4 w-4" />
                  Submit Paper
                </Button>
              </Link>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.imageUrl} alt={user?.fullName || ""} />
                      <AvatarFallback>{user?.firstName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                      <p className="text-xs text-muted-foreground leading-none">{user?.primaryEmailAddress?.emailAddress}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/me" className="w-full cursor-pointer flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      My Portal
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/submit" className="w-full cursor-pointer flex items-center sm:hidden">
                      <Plus className="mr-2 h-4 w-4" />
                      Submit Paper
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SignedIn>
            
            <SignedOut>
              <div className="flex items-center gap-2">
                <Button variant="ghost" asChild>
                  <a href={`${basePath}/sign-in`}>Sign In</a>
                </Button>
                <Button asChild>
                  <a href={`${basePath}/sign-up`}>Get Started</a>
                </Button>
              </div>
            </SignedOut>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
      
      <footer className="border-t py-6 md:py-0 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 md:h-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <img src={`${window.location.origin}${basePath}/logo.svg`} alt="SciVet" className="h-5 w-5 grayscale opacity-50" />
            <p>SciVet Open Commons</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Rigor is a craft. Disagreement is a feature.
          </p>
        </div>
      </footer>
    </div>
  );
}