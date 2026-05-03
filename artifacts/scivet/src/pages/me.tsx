import { Layout } from "@/components/layout";
import { useGetMe, useListPapers } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PaperCard } from "@/components/paper-card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useUser } from "@clerk/react";

export default function Me() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { data: meData, isLoading: isLoadingMe } = useGetMe();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  const authorId = meData?.user?.id;
  const { data: myPapers, isLoading: isLoadingPapers } = useListPapers(
    { authorId }, 
    { query: { enabled: !!authorId } }
  );

  if (!isLoaded || !isSignedIn) return null;

  if (isLoadingMe || isLoadingPapers) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">My Portal</h1>
            <p className="text-muted-foreground mt-1">Manage your papers and track their progress.</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" asChild>
              <Link href={`/profile/${authorId}`}>View Public Profile</Link>
            </Button>
            <Button asChild>
              <Link href="/submit"><Plus className="h-4 w-4 mr-2" /> New Paper</Link>
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4 border-b pb-2">My Submissions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myPapers?.map(paper => <PaperCard key={paper.id} paper={paper} />)}
            
            {myPapers?.length === 0 && (
              <div className="col-span-full py-16 text-center border border-dashed rounded-lg bg-muted/10">
                <p className="text-muted-foreground mb-4">You haven't submitted any papers yet.</p>
                <Button asChild>
                  <Link href="/submit">Start Your First Paper</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}