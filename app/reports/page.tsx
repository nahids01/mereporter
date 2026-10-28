export default function ReportsPage() {
  return (
    <div>
      <h1>Reports</h1>
      <p>
        Monthly reports are built only from stored rows (see lib/report.ts). Missing SERP, GBP or import data
        is labelled <strong>no-data</strong> and excluded from averages. A report with missing sections is labelled partial.
        Email sending is NOT wired up in this skeleton: it needs a Resend key and verified sender, which the owner has not supplied.
      </p>
      <p>Generate a report via POST /api/report with a project id and month (YYYY-MM) after signing in as an approved user who owns that project.</p>
    </div>
  );
}
