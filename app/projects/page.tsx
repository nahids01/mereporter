export default function ProjectsPage() {
  return (
    <div>
      <h1>Projects</h1>
      <p>
        Add a project from the dashboard flow (API: POST /api/projects). SERP keywords and GBP keywords
        are stored separately — never merged. A project with no keywords shows no ranks, not estimated ranks.
      </p>
      <p>Use the API or the Supabase table editor until the full project form is built in a later step. No demo data is included.</p>
    </div>
  );
}
