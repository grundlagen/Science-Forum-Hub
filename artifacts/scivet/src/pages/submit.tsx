import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePaper, PaperCreateInput } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { SignedIn, SignedOut } from "@/lib/clerk-compat";
import { Plus, Trash2 } from "lucide-react";

export default function Submit() {
  const [, setLocation] = useLocation();
  const createPaper = useCreatePaper();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [body, setBody] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [fieldInput, setFieldInput] = useState("");
  const [references, setReferences] = useState<{ citation: string; url: string }[]>([
    { citation: "", url: "" }
  ]);

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
    if (!title || !abstract || !body || fields.length === 0) {
      toast.error("Please fill in all required fields and at least one tag.");
      return;
    }

    const cleanRefs = references.filter(r => r.citation.trim()).map(r => ({
      citation: r.citation.trim(),
      url: r.url.trim() || null
    }));

    const payload: PaperCreateInput = {
      title,
      abstract,
      body,
      fields,
      references: cleanRefs
    };

    createPaper.mutate({ data: payload }, {
      onSuccess: (res) => {
        toast.success("Paper submitted successfully");
        setLocation(`/papers/${res.id}`);
      },
      onError: (err) => {
        toast.error("Failed to submit paper: " + (err?.data?.error || "Unknown error"));
      }
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-serif font-bold mb-8">Submit a New Paper</h1>

        <SignedOut>
          <div className="bg-muted p-8 rounded-lg text-center border">
            <h2 className="text-xl font-bold mb-4">Sign in to publish</h2>
            <p className="text-muted-foreground mb-6">You need an account to submit papers and participate in the community.</p>
            <Button asChild>
              <a href={`${basePath}/sign-in`}>Sign In</a>
            </Button>
          </div>
        </SignedOut>

        <SignedIn>
          <form onSubmit={handleSubmit} className="space-y-8 bg-card p-6 md:p-8 rounded-xl border shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title <span className="text-red-500">*</span></label>
                <Input 
                  placeholder="A Novel Approach to..." 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={150}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Abstract <span className="text-red-500">*</span></label>
                <Textarea 
                  placeholder="Briefly summarize your hypothesis and methodology..." 
                  value={abstract}
                  onChange={e => setAbstract(e.target.value)}
                  className="h-24"
                  maxLength={500}
                  required
                />
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
                  placeholder="e.g. biology, theoretical-physics (press Enter to add)" 
                  value={fieldInput}
                  onChange={e => setFieldInput(e.target.value)}
                  onKeyDown={handleAddField}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Paper Body <span className="text-red-500">*</span></label>
                <Textarea 
                  placeholder="Write your full paper here (markdown supported)..." 
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
                          placeholder={`Citation ${idx + 1} (e.g. Author, YYYY. Title.)`}
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
            </div>

            <div className="pt-6 border-t flex justify-end">
              <Button type="submit" size="lg" disabled={createPaper.isPending}>
                {createPaper.isPending ? "Submitting..." : "Submit Paper"}
              </Button>
            </div>
          </form>
        </SignedIn>
      </div>
    </Layout>
  );
}