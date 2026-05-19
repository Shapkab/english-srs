import SubmissionsList from '@/components/SubmissionsList';
import { Topbar } from '@/components/Topbar';

export default function SubmissionsPage() {
  return (
    <main className="px-10 py-9 max-w-[1280px]">
      <Topbar
        title="Submissions"
        subtitle="Everything you've submitted for analysis."
      />
      <SubmissionsList limit={50} />
    </main>
  );
}
