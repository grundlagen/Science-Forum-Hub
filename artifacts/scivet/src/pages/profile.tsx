import { Layout } from "@/components/layout";
import { useGetUserProfile } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PaperCard } from "@/components/paper-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, MessageSquareQuote, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { data: profile, isLoading } = useGetUserProfile(id || "");

  if (isLoading || !profile) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="flex items-center gap-6 mb-12">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }

  const { user, stats, papers, reviews } = profile;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-12 bg-card p-8 rounded-xl border shadow-sm">
          <Avatar className="h-24 w-24 border-4 border-background">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="text-3xl">{user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl font-serif font-bold mb-2">{user.displayName}</h1>
            <p className="text-muted-foreground max-w-2xl mb-6">
              {user.bio || "Citizen Scientist"}
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.papersSubmitted}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Submitted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{stats.papersPublished}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Published</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-secondary">{stats.reviewsCast}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Reviews</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.commentsPosted}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Comments</div>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="papers" className="w-full">
          <TabsList className="mb-6 w-full justify-start border-b rounded-none bg-transparent p-0">
            <TabsTrigger value="papers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <FileText className="h-4 w-4 mr-2" /> Papers
            </TabsTrigger>
            <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <MessageSquareQuote className="h-4 w-4 mr-2" /> Reviews Cast
            </TabsTrigger>
          </TabsList>

          <TabsContent value="papers">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {papers.map(paper => <PaperCard key={paper.id} paper={paper} />)}
              {papers.length === 0 && (
                <div className="col-span-full py-12 text-center border border-dashed rounded-lg text-muted-foreground">
                  No papers published yet.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="reviews">
            <div className="space-y-4">
              {reviews.map(review => (
                <div key={review.id} className="bg-card border rounded-lg p-6 flex flex-col md:flex-row gap-6">
                  <div className="md:w-48 shrink-0">
                    <div className={`inline-flex items-center justify-center px-3 py-1 rounded text-sm font-medium border
                      ${review.stance === 'endorse' ? 'bg-green-50 text-green-700 border-green-200' :
                        review.stance === 'challenge' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-red-50 text-red-700 border-red-200'}`}>
                      {review.stance.toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Paper ID #{review.paperId}</h4>
                    <p className="text-sm italic border-l-2 pl-4 border-muted">"{review.justification}"</p>
                  </div>
                </div>
              ))}
              {reviews.length === 0 && (
                <div className="py-12 text-center border border-dashed rounded-lg text-muted-foreground">
                  No reviews cast yet.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}