// The full list of gateable capabilities a Package can include/exclude.
// Adding a new gateable feature to the app means adding an entry here and
// wiring the matching guard where it's enforced — no schema change, since
// Package.features is stored as a JSON array of these keys.
//
// Enforcement is always two-sided: the UI hides the control, AND the API
// route behind it calls orgHasFeature(). Hiding a button alone would leave
// the endpoint reachable by anyone who knows the URL.
//
// Anything NOT listed here is always-on for every organization: viewing and
// editing student records, uploading documents, and each user's own profile
// and password. Those are the product's floor — a package that removed them
// would leave nothing usable.
export interface FeatureDef {
  key: string
  label: string
  /** What the org loses when this is off — shown under the checkbox. */
  hint: string
  group: string
}

export const FEATURE_GROUPS = ['Students', 'Finance', 'Operations', 'Communication', 'Administration'] as const

export const FEATURES: FeatureDef[] = [
  // Students
  { key: 'student_create', label: 'Add Student', hint: 'The Add Student page and manual student creation', group: 'Students' },
  { key: 'intake_link', label: 'Application Link', hint: 'Public self-apply link students fill in themselves', group: 'Students' },
  { key: 'student_import', label: 'Import from Excel', hint: 'Bulk-create students from a spreadsheet', group: 'Students' },
  { key: 'student_template', label: 'Download Excel Template', hint: 'The blank import spreadsheet', group: 'Students' },
  { key: 'student_export', label: 'Export Student', hint: 'Download one student as Excel', group: 'Students' },
  { key: 'document_batch_download', label: 'Batch Document Download', hint: 'Download many students’ documents as one zip', group: 'Students' },
  { key: 'official_documents', label: 'Official Documents', hint: 'Admission letters, JW forms and other official files', group: 'Students' },

  // Finance
  { key: 'finance', label: 'Finance', hint: 'The whole Finance section and all transactions', group: 'Finance' },
  { key: 'finance_export', label: 'Export Transactions', hint: 'Download the transaction list as Excel', group: 'Finance' },
  { key: 'finance_receipt', label: 'Payment Receipts', hint: 'Printable per-payment receipts', group: 'Finance' },

  // Operations
  { key: 'tasks', label: 'Tasks', hint: 'Task assignment and deadline reminders', group: 'Operations' },
  { key: 'offers', label: 'Offers', hint: 'Promotional offers shown on the login page and chatbot', group: 'Operations' },
  { key: 'universities', label: 'Universities', hint: 'The partner-university catalog and its document filing', group: 'Operations' },
  { key: 'university_portals', label: 'University Portal Scanning', hint: 'Automatic status scanning of university application portals', group: 'Operations' },
  { key: 'portal_student_export', label: 'Export Portal Students', hint: 'Download scanned portal students as Excel', group: 'Operations' },

  // Communication
  { key: 'messages', label: 'Messages', hint: 'Internal messaging between staff', group: 'Communication' },
  { key: 'chatbot', label: 'AI Chatbot', hint: 'The floating assistant widget', group: 'Communication' },

  // Administration
  { key: 'manage_accounts', label: 'Manage Accounts', hint: 'Creating and editing agent/admin accounts', group: 'Administration' },
  { key: 'agent_invite_link', label: 'Agent Invite Link', hint: 'Self-signup link for new staff', group: 'Administration' },
  { key: 'document_requirements', label: 'Document Requirements', hint: 'Customising which documents students must upload', group: 'Administration' },
  { key: 'field_requirements', label: 'Field Requirements', hint: 'Customising which form fields are required', group: 'Administration' },
  { key: 'visitor_analytics', label: 'Visitor Analytics', hint: 'Traffic and visitor statistics', group: 'Administration' },
  { key: 'shared_resources', label: 'Shared Resources', hint: 'Sharing documents and links with your admins and tracking who opened them', group: 'Administration' },
  { key: 'alert_settings', label: 'Alert Settings', hint: 'Choosing which admins receive system alert emails', group: 'Administration' },
  { key: 'backup_export', label: 'Download Full Backup', hint: 'Full export of every student, document and transaction', group: 'Administration' },
  { key: 'data_export', label: 'Export All Data', hint: 'Bulk student data export as Excel', group: 'Administration' },
]

export const FEATURE_KEYS = FEATURES.map((f) => f.key)
export type FeatureKey = string

export function parseFeatures(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
