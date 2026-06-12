import { Layout } from "@/components/layout";
import { useGetTrendingFeed, useGetPromotedFeed, useGetPublishedFeed, useListPapers, useGetActiveFocusSession } from "@workspace/api-client-react";
import { PaperCard } from "@/components/paper-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Star, Award, Clock, Timer } from "lucide-react";
import { useUser } from "@clerk/react";
import { SignedIn } from "@/lib/clerk-compat";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export default function Feed() {
  const { isSignedIn, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const [focusBypassed, setFocusBypassed] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  const { data: activeFocus } = useGetActiveFocusSession({
    query: { enabled: isLoaded && !!isSignedIn, staleTime: 30_000 },
  });
  const guarding = !!activeFocus?.session && activeFocus.quietFeed && !focusBypassed;

  const { data: trending, isLoading: isLoadingTrending } = useGetTrendingFeed({ query: { enabled: !guarding } });
  const { data: promoted, isLoading: isLoadingPromoted } = useGetPromotedFeed({ query: { enabled: !guarding } });
  const { data: published, isLoading: isLoadingPublished } = useGetPublishedFeed({ query: { enabled: !guarding } });
  const { data: recent, isLoading: isLoadingRecent } = useListPapers({ sort: 'recent', limit: 10 }, { query: { enabled: !guarding } });

  if (!isLoaded || !isSignedIn) return null;

  // Quiet shell: while a focus session is active, the feed steps aside and
  // hands you back your own words (docs/FOCUS_GUARD.md §1.4, §1.11).
  if (guarding && activeFocus?.session) {
    const session = activeFocus.session;
    const ulysses = session.lockMode === "ulysses";
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 max-w-xl">
          <Card className="text-center">
            <CardContent className="pt-10 pb-8 space-y-5">
              <Timer className="h-8 w-8 mx-auto text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground uppercase tracking-widest">You said you would</p>
              <p className="text-lg font-serif italic">“{session.intention}”</p>
              <p className="text-sm text-muted-foreground">
                The feed will still be here afterward — it always is. Your session won't be.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <Button asChild size="lg">
                  <Link href="/focus">Back to my session</Link>
                </Button>
                {ulysses ? (
                  <Button variant="ghost" asChild>
                    <Link href="/focus">End the session properly first</Link>
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setFocusBypassed(true)}>
                    Break my focus and browse anyway
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array(6).fill(0).map((_, i) => (
        <div key={i} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm h-64">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-4 pt-4 mt-auto">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground">Your Feed</h1>
          <p className="text-muted-foreground">Discover the latest ideas and rigorous debates.</p>
        </div>

        <Tabs defaultValue="trending" className="w-full">
          <TabsList className="mb-6 w-full justify-start overflow-x-auto">
            <TabsTrigger value="trending" className="gap-2"><Flame className="h-4 w-4" /> Trending</TabsTrigger>
            <TabsTrigger value="promoted" className="gap-2"><Star className="h-4 w-4" /> Promoted</TabsTrigger>
            <TabsTrigger value="published" className="gap-2"><Award className="h-4 w-4" /> Published</TabsTrigger>
            <TabsTrigger value="recent" className="gap-2"><Clock className="h-4 w-4" /> Recent</TabsTrigger>
          </TabsList>
          
          <TabsContent value="trending" className="animate-in fade-in duration-300">
            {isLoadingTrending ? renderSkeleton() : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trending?.map(paper => <PaperCard key={paper.id} paper={paper} />)}
                {trending?.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No trending papers found.</div>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="promoted" className="animate-in fade-in duration-300">
            {isLoadingPromoted ? renderSkeleton() : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {promoted?.map(paper => <PaperCard key={paper.id} paper={paper} />)}
                {promoted?.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No promoted papers found.</div>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="published" className="animate-in fade-in duration-300">
            {isLoadingPublished ? renderSkeleton() : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {published?.map(paper => <PaperCard key={paper.id} paper={paper} />)}
                {published?.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No published papers found.</div>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recent" className="animate-in fade-in duration-300">
            {isLoadingRecent ? renderSkeleton() : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recent?.map(paper => <PaperCard key={paper.id} paper={paper} />)}
                {recent?.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No recent papers found.</div>}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}