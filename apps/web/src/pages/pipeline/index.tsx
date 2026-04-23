import { withAuth } from "@/lib/auth";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { Plus } from "lucide-react";

export default function PipelinePage() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Pipeline</h1>
          <p className="text-sm text-text-muted mt-1">
            Drag leads between columns to update their stage
          </p>
        </div>
        <button className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Add Lead
        </button>
      </div>

      <PipelineBoard />
    </div>
  );
}

export const getServerSideProps = withAuth();
