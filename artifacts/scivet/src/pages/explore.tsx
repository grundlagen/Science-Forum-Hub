import { Layout } from "@/components/layout";
import { useListPapers, useListFields, ListPapersStage, ListPapersSort } from "@workspace/api-client-react";
import { PaperCard } from "@/components/paper-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Search } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce"; // Assuming standard debounce hook exists, will implement below

// Simple local debounce hook for search
function useLocalDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  import("react").then(React => {
    React.useEffect(() => {
      const timer = setTimeout(() => setDebouncedValue(value), delay);
      return () => clearTimeout(timer);
    }, [value, delay]);
  });
  return debouncedValue;
}

export default function Explore() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useLocalDebounce(search, 300);
  const [stage, setStage] = useState<ListPapersStage | "all">("all");
  const [field, setField] = useState<string>("all");
  const [sort, setSort] = useState<ListPapersSort>("trending");

  const { data: fields } = useListFields();
  
  const { data: papers, isLoading } = useListPapers({
    q: debouncedSearch || undefined,
    stage: stage !== "all" ? stage : undefined,
    field: field !== "all" ? field : undefined,
    sort,
    limit: 50
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground">Explore Papers</h1>
          <p className="text-muted-foreground">Browse the full archive of citizen science papers.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search title or abstract..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={stage} onValueChange={(v: any) => setStage(v)}>
            <SelectTrigger>
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="promoted">Promoted</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>

          <Select value={field} onValueChange={setField}>
            <SelectTrigger>
              <SelectValue placeholder="All Fields" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fields</SelectItem>
              {fields?.map(f => (
                <SelectItem key={f.slug} value={f.slug}>{f.name} ({f.paperCount})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v: any) => setSort(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trending">Trending</SelectItem>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="top">Top Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm h-64">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {papers?.map(paper => <PaperCard key={paper.id} paper={paper} />)}
            {papers?.length === 0 && (
              <div className="col-span-full text-center py-20 border border-dashed rounded-lg bg-muted/10">
                <p className="text-muted-foreground text-lg">No papers match your filters.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}