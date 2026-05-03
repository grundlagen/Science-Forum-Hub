import { Layout } from "@/components/layout";
import { useParams, Link } from "wouter";
import { 
  useGetPaper, 
  useListPaperComments, 
  useCreatePaperComment, 
  useCastPaperReview,
  getGetPaperQueryKey,
  getListPaperCommentsQueryKey,
  PaperStage
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { BrainCircuit, CheckCircle2, AlertCircle, XCircle, ChevronRight, PenTool } from "lucide-react";
import { SignedIn, SignedOut, useUser } from "@clerk/react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export default function PaperDetail() {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const { user } = useUser();
  const queryClient = useQueryClient();
  
  const { data: detail, isLoading } = useGetPaper(paperId, { query: { enabled: !!paperId } });
  const { data: comments, isLoading: isCommentsLoading } = useListPaperComments(paperId, { query: { enabled: !!paperId } });
  
  const createComment = useCreatePaperComment();
  const castReview = useCastPaperReview();
  
  const [commentBody, setCommentBody] = useState("");
  const [reviewJustification, setReviewJustification] = useState("");
  const [reviewStance, setReviewStance] = useState<"endorse" | "challenge" | "reject" | null>(null);

  if (isLoading || !detail) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/4 mb-8" />
          <Skeleton className="h-64 w-full mb-8" />
        </div>
      </Layout>
    );
  }

  const { paper, author, rigorReport, aiSurvey, voteBreakdown, promotionThresholds } = detail;
  const isAuthor = user?.id === author.id;

  const handleComment = () => {
    if (!commentBody.trim()) return;
    createComment.mutate(
      { id: paperId, data: { body: commentBody, parentId: null } },
      {
        onSuccess: () => {
          setCommentBody("");
          queryClient.invalidateQueries({ queryKey: getListPaperCommentsQueryKey(paperId) });
          toast.success("Comment posted");
        }
      }
    );
  };

  const handleReview = () => {
    if (!reviewStance || !reviewJustification.trim()) return;
    castReview.mutate(
      { id: paperId, data: { stance: reviewStance, justification: reviewJustification } },
      {
        onSuccess: () => {
          setReviewStance(null);
          setReviewJustification("");
          queryClient.invalidateQueries({ queryKey: getGetPaperQueryKey(paperId) });
          toast.success("Review cast successfully");
        }
      }
    );
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'draft': return 'bg-stage-draft/10 text-stage-draft border-stage-draft/20';
      case 'under_review': return 'bg-stage-under-review/10 text-stage-under-review border-stage-under-review/20';
      case 'promoted': return 'bg-stage-promoted/10 text-stage-promoted border-stage-promoted/20';
      case 'published': return 'bg-stage-published/10 text-stage-published border-stage-published/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Simple progress calc based on combinedScore relative to next threshold
  const currentScore = voteBreakdown.combinedScore;
  const nextThreshold = paper.stage === PaperStage.draft ? promotionThresholds.underReview 
                      : paper.stage === PaperStage.under_review ? promotionThresholds.promoted
                      : paper.stage === PaperStage.promoted ? promotionThresholds.published
                      : promotionThresholds.published;
  const progressPct = Math.min(100, Math.max(0, (currentScore / nextThreshold) * 100));

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="outline" className={`font-mono text-sm capitalize ${getStageColor(paper.stage)}`}>
              {paper.stage.replace('_', ' ')}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Published {formatDistanceToNow(new Date(paper.createdAt), { addSuffix: true })}
            </span>
            {paper.revisionCount > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">Revision {paper.revisionCount}</Badge>
            )}
            {isAuthor && (
              <Button variant="outline" size="sm" asChild className="ml-auto">
                <Link href={`/papers/${paper.id}/edit`}><PenTool className="h-4 w-4 mr-2" /> Edit Paper</Link>
              </Button>
            )}
          </div>
          
          <h1 className="text-4xl font-serif font-bold text-foreground mb-6 leading-tight">
            {paper.title}
          </h1>

          <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg">
            <Avatar className="h-10 w-10">
              <AvatarImage src={author.avatarUrl || undefined} />
              <AvatarFallback>{author.displayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium text-foreground">{author.displayName}</div>
              <div className="text-sm text-muted-foreground">{author.bio || "Citizen Scientist"}</div>
            </div>
          </div>
        </div>

        {/* Two column layout: Body vs Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-10">
            {/* Abstract */}
            <div className="prose dark:prose-invert max-w-none">
              <h3 className="text-xl font-bold font-serif mb-2">Abstract</h3>
              <p className="text-lg leading-relaxed text-muted-foreground bg-muted/20 p-6 rounded-lg border-l-4 border-primary">
                {paper.abstract}
              </p>
            </div>

            {/* Body */}
            <div className="prose dark:prose-invert max-w-none">
              <h3 className="text-xl font-bold font-serif mb-4">Paper</h3>
              <div className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                {paper.body}
              </div>
            </div>

            {/* References */}
            {paper.references.length > 0 && (
              <div className="prose dark:prose-invert max-w-none">
                <h3 className="text-xl font-bold font-serif mb-4">References</h3>
                <ul className="space-y-2">
                  {paper.references.map((ref, idx) => (
                    <li key={idx} className="text-sm">
                      {ref.url ? <a href={ref.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{ref.citation}</a> : ref.citation}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Comments */}
            <div className="pt-10 border-t">
              <h3 className="text-2xl font-bold font-serif mb-6">Community Thread</h3>
              
              <SignedIn>
                <div className="bg-card border rounded-lg p-4 mb-8">
                  <Textarea 
                    placeholder="Add to the discussion..." 
                    className="mb-4 min-h-[100px]"
                    value={commentBody}
                    onChange={e => setCommentBody(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleComment} disabled={createComment.isPending || !commentBody.trim()}>
                      Post Comment
                    </Button>
                  </div>
                </div>
              </SignedIn>
              
              <SignedOut>
                <div className="bg-muted p-6 rounded-lg text-center mb-8">
                  <p className="text-muted-foreground mb-4">Sign in to participate in the discussion.</p>
                  <Button asChild>
                    <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`}>Sign In</a>
                  </Button>
                </div>
              </SignedOut>

              <div className="space-y-6">
                {isCommentsLoading ? <Skeleton className="h-20 w-full" /> : 
                 comments?.length === 0 ? <p className="text-muted-foreground italic">No comments yet.</p> :
                 comments?.map(comment => (
                  <div key={comment.id} className="flex gap-4">
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarImage src={comment.author.avatarUrl || undefined} />
                      <AvatarFallback>{comment.author.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-muted/20 border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{comment.author.displayName}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar (AI Reports & Voting) */}
          <div className="space-y-6">
            {/* Stage Progress */}
            <div className="bg-card border rounded-xl p-6">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                Stage Progress
              </h4>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Combined Score</span>
                  <span className="font-mono font-bold">{voteBreakdown.combinedScore.toFixed(1)}</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Current: {paper.stage.replace('_', ' ')}</span>
                  <span>Next: {nextThreshold}</span>
                </div>
              </div>
            </div>

            {/* AI Rigor Report */}
            {rigorReport && (
              <div className="bg-card border rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-primary" />
                    AI Rigor Score
                  </h4>
                  <span className="text-3xl font-mono font-bold text-primary">{rigorReport.overallScore}</span>
                </div>
                
                <div className="space-y-3 mb-6">
                  {[
                    { label: "Logic", score: rigorReport.logicScore },
                    { label: "Methodology", score: rigorReport.methodologyScore },
                    { label: "Citations", score: rigorReport.citationsScore },
                    { label: "Falsifiability", score: rigorReport.falsifiabilityScore },
                    { label: "Novelty", score: rigorReport.noveltyScore }
                  ].map(metric => (
                    <div key={metric.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{metric.label}</span>
                        <span className="font-mono">{metric.score}/100</span>
                      </div>
                      <Progress value={metric.score} className="h-1.5" />
                    </div>
                  ))}
                </div>

                <div className="text-sm text-muted-foreground mb-4 italic">
                  "{rigorReport.critique}"
                </div>

                <div className="space-y-4">
                  {rigorReport.strengths.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-green-600 uppercase">Strengths</span>
                      <ul className="list-disc pl-4 mt-1 text-xs space-y-1">
                        {rigorReport.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {rigorReport.weaknesses.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-orange-600 uppercase">Weaknesses</span>
                      <ul className="list-disc pl-4 mt-1 text-xs space-y-1">
                        {rigorReport.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Personas */}
            {aiSurvey && (
              <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h4 className="font-bold mb-4">Multi-Persona Survey</h4>
                <div className="space-y-4">
                  {aiSurvey.passes.map((pass, i) => (
                    <div key={i} className="border-b last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{pass.persona}</span>
                        <Badge variant="outline" className={
                          pass.verdict === 'endorse' ? 'text-green-600 border-green-200 bg-green-50' :
                          pass.verdict === 'challenge' || pass.verdict === 'mixed' ? 'text-orange-500 border-orange-200 bg-orange-50' :
                          'text-red-600 border-red-200 bg-red-50'
                        }>
                          {pass.verdict}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{pass.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cast Review */}
            <div className="bg-card border rounded-xl p-6 shadow-sm">
              <h4 className="font-bold mb-4">Community Review</h4>
              <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="text-center p-2 bg-green-50 rounded border border-green-100">
                  <div className="text-green-600 font-bold text-xl">{voteBreakdown.endorse}</div>
                  <div className="text-xs text-green-700">Endorse</div>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded border border-orange-100">
                  <div className="text-orange-500 font-bold text-xl">{voteBreakdown.challenge}</div>
                  <div className="text-xs text-orange-700">Challenge</div>
                </div>
                <div className="text-center p-2 bg-red-50 rounded border border-red-100">
                  <div className="text-red-600 font-bold text-xl">{voteBreakdown.reject}</div>
                  <div className="text-xs text-red-700">Reject</div>
                </div>
              </div>

              <SignedIn>
                {!isAuthor && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <Button 
                        variant={reviewStance === "endorse" ? "default" : "outline"} 
                        className={reviewStance === "endorse" ? "bg-green-600 hover:bg-green-700" : ""}
                        onClick={() => setReviewStance("endorse")}
                        size="sm"
                      >
                        Endorse
                      </Button>
                      <Button 
                        variant={reviewStance === "challenge" ? "default" : "outline"}
                        className={reviewStance === "challenge" ? "bg-orange-500 hover:bg-orange-600" : ""}
                        onClick={() => setReviewStance("challenge")}
                        size="sm"
                      >
                        Challenge
                      </Button>
                      <Button 
                        variant={reviewStance === "reject" ? "default" : "outline"}
                        className={reviewStance === "reject" ? "bg-red-600 hover:bg-red-700" : ""}
                        onClick={() => setReviewStance("reject")}
                        size="sm"
                      >
                        Reject
                      </Button>
                    </div>
                    {reviewStance && (
                      <div className="animate-in slide-in-from-top-2">
                        <Textarea 
                          placeholder="Justify your review (required)..." 
                          value={reviewJustification}
                          onChange={e => setReviewJustification(e.target.value)}
                          className="mb-2 text-sm h-24"
                        />
                        <Button 
                          className="w-full" 
                          onClick={handleReview}
                          disabled={castReview.isPending || !reviewJustification.trim()}
                        >
                          Submit Review
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {isAuthor && (
                  <p className="text-sm text-center text-muted-foreground italic">Authors cannot review their own papers.</p>
                )}
              </SignedIn>
              <SignedOut>
                <div className="text-center text-sm text-muted-foreground">
                  Sign in to cast a review.
                </div>
              </SignedOut>
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}