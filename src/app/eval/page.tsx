import type { Metadata } from "next";
import { EvalPage } from "@/components/eval/EvalPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Evaluation results | ChatPDF",
  description:
    "How ChatPDF scores on a fixed benchmark of 60 questions across 237 pages of real public documents, graded for correctness, grounding and citation accuracy.",
};

export default function Page() {
  return <EvalPage />;
}
