export default function HomePage() {
  return (
    <main>
      <h1>English SRS MVP</h1>
      <p>
        This is a starter project for an AI + spaced repetition system centered on learning targets.
      </p>

      <div className="card">
        <h2>Implemented skeleton</h2>
        <ul>
          <li>Submission intake endpoint</li>
          <li>Structured AI analysis service</li>
          <li>Learning target normalization</li>
          <li>Card generation service</li>
          <li>Review queue and review submission endpoints</li>
          <li>Supabase schema and worker scaffold</li>
        </ul>
      </div>

      <div className="card">
        <h2>Next step</h2>
        <p>Wire auth, run the SQL schema in Supabase, then start the job worker.</p>
      </div>
    </main>
  );
}
