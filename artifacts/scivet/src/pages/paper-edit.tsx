import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGetPaper, useUpdatePaper, useRerunPaperAi, useListPaperRevisions, getGetPaperQueryKey, PaperUpdateInput } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RotateCw, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export default function PaperEdit() {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useGetPaper(paperId, { query: { enabled: !!paperId } });
  const { data: revisions } = useListPaperRevisions(paperId, { query: { enabled: !!paperId } });
  const updatePaper = useUpdatePaper();
  const rerunAi = useRerunPaperAi();

  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [body, setBody] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [fieldInput, setFieldInput] = useState("");
  const [references, setReferences] = useState<{ citation: string; url: string }[]>([]);
  const [revisionSummary, setRevisionSummary] = useState("");

  useEffect(() => {
    if (detail?.paper) {
      setTitle(detail.paper.title);
      setAbstract(detail.paper.abstract);
      setBody(detail.paper.body);
      setFields(detail.paper.fields);
      setReferences(detail.paper.references.length ? detail.paper.references.map(r => ({ citation: r.citation, url: r.url || "" })) : [{ citation: "", url: "" }]);
    }
  }, [detail]);

  if (isLoading || !detail) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton className="h-12 w-1/2 mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }

  const handleAddField = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && fieldInput.trim()) {
      e.preventDefault();
      if (!fields.includes(fieldInput.trim().toLowerCase())) {
        setFields([...fields, fieldInput.trim().toLowerCase()]);
      }
      setFieldInput("");
    }
  };

  const removeField = (f: string) => setFields(fields.filter(x => x !== f));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !abstract || !body || fields.length === 0 || !revisionSummary) {
      toast.error("Please fill in all required fields including the revision summary.");
      return;
    }

    const cleanRefs = references.filter(r => r.citation.trim()).map(r => ({
      citation: r.citation.trim(),
      url: r.url.trim() || null
    }));

    const payload: PaperUpdateInput = {
      title,
      abstract,
      body,
      fields,
      references: cleanRefs,
      revisionSummary
    };

    updatePaper.mutate({ id: paperId, data: payload }, {
      onSuccess: () => {
        toast.success("Paper updated successfully! AI Rigor check is running.");
        queryClient.invalidateQueries({ queryKey: getGetPaperQueryKey(paperId) });
        setLocation(`/papers/${paperId}`);
      },
      onError: (err) => {
        toast.error("Failed to update: " + (err?.data?.error || "Unknown error"));
      }
    });
  };

  const handleRerunAi = () => {
    rerunAi.mutate({ id: paperId }, {
      onSuccess: () => {
        toast.success("Fresh AI Rigor pass triggered.");
        queryClient.invalidateQueries({ queryKey: getGetPaperQueryKey(paperId) });
      },
      onError: (err) => {
        toast.error("Failed to trigger AI: " + (err?.data?.error || "Unknown error"));
      }
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-serif font-bold">Revise Paper</h1>
          <Button variant="outline" onClick={handleRerunAi} disabled={rerunAi.isPending}>
            <RotateCw className={`h-4 w-4 mr-2 ${rerunAi.isPending ? 'animate-spin' : ''}`} />
            Rerun AI Analysis
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-8 bg-card p-6 md:p-8 rounded-xl border shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title <span className="text-red-500">*</span></label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Abstract <span className="text-red-500">*</span></label>
                  <Textarea value={abstract} onChange={e => setAbstract(e.target.value)} className="h-24" required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Fields / Tags <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {fields.map(f => (
                      <span key={f} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                        {f} <button type="button" onClick={() => removeField(f)} className="hover:text-primary/70">&times;</button>
                      </span>
                    ))}
                  </div>
                  <Input 
                    placeholder="Press Enter to add" 
                    value={fieldInput}
                    onChange={e => setFieldInput(e.target.value)}
                    onKeyDown={handleAddField}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Paper Body <span className="text-red-500">*</span></label>
                  <Textarea 
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-4 flex justify-between items-center">
                    References
                    <Button type="button" variant="outline" size="sm" onClick={() => setReferences([...references, { citation: "", url: "" }])}>
                      <Plus className="h-4 w-4 mr-1" /> Add Reference
                    </Button>
                  </label>
                  
                  <div className="space-y-3">
                    {references.map((ref, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <Input 
                            placeholder={`Citation ${idx + 1}`}
                            value={ref.citation}
                            onChange={e => {
                              const n = [...references];
                              n[idx].citation = e.target.value;
                              setReferences(n);
                            }}
                          />
                          <Input 
                            placeholder="URL (optional)"
                            type="url"
                            value={ref.url}
                            onChange={e => {
                              const n = [...references];
                              n[idx].url = e.target.value;
                              setReferences(n);
                            }}
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => {
                          setReferences(references.filter((_, i) => i !== idx));
                        }} disabled={references.length === 1}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <label className="block text-sm font-medium mb-1 text-primary">Revision Summary <span className="text-red-500">*</span></label>
                  <Textarea 
                    placeholder="Briefly describe what changed in this revision..." 
                    value={revisionSummary}
                    onChange={e => setRevisionSummary(e.target.value)}
                    className="h-20"
                    required
                  />
                </div>
              </div>

              <div className="pt-6 border-t flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setLocation(`/papers/${paperId}`)}>Cancel</Button>
                <Button type="submit" disabled={updatePaper.isPending}>
                  {updatePaper.isPending ? "Saving..." : "Save Revision"}
                </Button>
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="bg-muted/30 border rounded-xl p-6">
              <h3 className="font-bold flex items-center gap-2 mb-4">
                <History className="h-4 w-4" /> Revision History
              </h3>
              {revisions?.length ? (
                <div className="space-y-4">
                  {revisions.map((rev) => (
                    <div key={rev.id} className="text-sm border-b last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">Revision {rev.revisionNumber}</span>
                        <span className="text-muted-foreground text-xs">{formatDistanceToNow(new Date(rev.createdAt), { addSuffix: true })}</span>
                      </div>
                      <p className="text-muted-foreground italic">{rev.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No previous revisions.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}