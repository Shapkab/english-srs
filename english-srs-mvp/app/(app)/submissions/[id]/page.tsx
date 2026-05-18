import { SubmissionDetail } from '@/components/SubmissionDetail';

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SubmissionDetail id={id} />;
}
