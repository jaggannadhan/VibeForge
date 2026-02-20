import { ProjectWorkspace } from "@/components/layout/ProjectWorkspace";

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return <ProjectWorkspace initialProjectId={projectId} />;
}
