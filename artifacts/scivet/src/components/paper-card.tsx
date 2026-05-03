import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Globe, BrainCircuit, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PaperSummary } from "@workspace/api-client-react";

export function PaperCard({ paper }: { paper: PaperSummary }) {
  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'draft': return 'bg-stage-draft/10 text-stage-draft border-stage-draft/20';
      case 'under_review': return 'bg-stage-under-review/10 text-stage-under-review border-stage-under-review/20';
      case 'promoted': return 'bg-stage-promoted/10 text-stage-promoted border-stage-promoted/20';
      case 'published': return 'bg-stage-published/10 text-stage-published border-stage-published/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Link href={`/papers/${paper.id}`}>
      <div className="group bg-card border rounded-lg p-6 shadow-sm hover:shadow-md transition-all cursor-pointer h-full flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className={`font-mono text-xs capitalize ${getStageColor(paper.stage)}`}>
            {paper.stage.replace('_', ' ')}
          </Badge>
          <div className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
            <Globe className="h-3 w-3" />
            {formatDistanceToNow(new Date(paper.createdAt), { addSuffix: true })}
          </div>
        </div>
        
        <h3 className="text-xl font-bold group-hover:text-primary transition-colors line-clamp-2 mb-2">
          {paper.title}
        </h3>
        
        <p className="text-muted-foreground line-clamp-2 text-sm mb-4 flex-1">
          {paper.abstract}
        </p>

        {paper.fields.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {paper.fields.slice(0, 3).map(field => (
              <Badge key={field} variant="secondary" className="text-xs">{field}</Badge>
            ))}
            {paper.fields.length > 3 && (
              <Badge variant="secondary" className="text-xs">+{paper.fields.length - 3}</Badge>
            )}
          </div>
        )}
        
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4 mt-auto">
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
  );
}