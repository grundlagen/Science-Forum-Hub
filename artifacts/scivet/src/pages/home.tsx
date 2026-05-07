import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/react";
import { SignedOut } from "@/lib/clerk-compat";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { ArrowRight, BrainCircuit, Globe, Users, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { useGetTrendingFeed } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  
  const { data: trending, isLoading: isLoadingTrending } = useGetTrendingFeed();

  // Redirect signed-in users to feed
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setLocation("/feed");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || isSignedIn) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted"></div>
            <div className="h-4 w-32 bg-muted rounded"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25 dark:[mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.5))]" />
        <div className="container relative mx-auto px-4 text-center">
          <Badge variant="outline" className="mb-6 border-primary/20 bg-primary/5 text-primary px-3 py-1 text-sm font-medium">
            Open Science Protocol
          </Badge>
          <h1 className="mx-auto max-w-4xl font-serif text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Publish your wildest ideas. <br className="hidden sm:block" />
            <span className="text-primary">Get rigorous critique instantly.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground font-sans leading-relaxed">
            A modern open commons for curious minds. Submit short scientific papers from any field, receive instant AI rigor analysis, and engage in structured community debate.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <a href={`${basePath}/sign-up`}>
                Start Publishing <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <Link href="/explore">Explore Papers</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-card p-6 rounded-xl border shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Instant AI Rigor Analysis</h3>
              <p className="text-muted-foreground">
                Every submission gets evaluated on logic, methodology, citations, falsifiability, and novelty by a Principia Mathematica-style system.
              </p>
            </div>
            
            <div className="bg-card p-6 rounded-xl border shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary mb-4">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Multi-Persona Survey</h3>
              <p className="text-muted-foreground">
                Get instant feedback from 5 simulated personas: The Skeptic, Domain Expert, Generalist, Methodologist, and Outsider.
              </p>
            </div>
            
            <div className="bg-card p-6 rounded-xl border shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600 mb-4">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Structured Community Critique</h3>
              <p className="text-muted-foreground">
                Progress from Draft to Published based on structured Endorse, Challenge, and Reject votes from real humans.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trending Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-serif font-bold">Trending Discussions</h2>
              <p className="text-muted-foreground mt-2">The most active debates right now.</p>
            </div>
            <Button variant="ghost" asChild>
              <Link href="/explore" className="hidden sm:flex">View all <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>

          <div className="space-y-4">
            {isLoadingTrending ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <div className="flex gap-4 pt-4">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </div>
              ))
            ) : trending && trending.length > 0 ? (
              trending.slice(0, 3).map((paper) => (
                <Link key={paper.id} href={`/papers/${paper.id}`}>
                  <div className="group bg-card border rounded-lg p-6 shadow-sm hover:shadow-md transition-all cursor-pointer">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="font-mono text-xs capitalize bg-muted/50">
                        {paper.stage.replace('_', ' ')}
                      </Badge>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {formatDistanceToNow(new Date(paper.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-bold group-hover:text-primary transition-colors line-clamp-2 mb-2">
                      {paper.title}
                    </h3>
                    
                    <p className="text-muted-foreground line-clamp-2 text-sm mb-4">
                      {paper.abstract}
                    </p>
                    
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={paper.author.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">{paper.author.displayName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{paper.author.displayName}</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {paper.rigorScore !== null && (
                          <div className="flex items-center gap-1" title="AI Rigor Score">
                            <BrainCircuit className="h-4 w-4 text-primary" />
                            <span className="font-mono font-medium text-foreground">{paper.rigorScore}/100</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1" title="Endorsements">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span>{paper.endorseCount}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Challenges">
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          <span>{paper.challengeCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-12 border border-dashed rounded-lg bg-muted/10">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground">No papers yet</h3>
                <p className="text-muted-foreground mt-1">Be the first to publish a paper.</p>
              </div>
            )}
          </div>
          
          <Button variant="outline" className="w-full mt-6 sm:hidden" asChild>
            <Link href="/explore">View all papers</Link>
          </Button>
        </div>
      </section>
    </Layout>
  );
}