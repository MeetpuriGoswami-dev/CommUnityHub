// Email sending is not configured for this deployment.
// Credentials are returned in API responses for admins to share securely.

export interface CredentialEmailOptions {
  to: string;
  volunteerName: string;
  username: string;
  temporaryPassword: string;
  type: "welcome" | "reset";
}

/**
 * Email delivery is disabled — no third-party service required.
 * Returns a resolved promise so callers treat it as a no-op.
 */
export async function sendCredentialEmail(_opts: CredentialEmailOptions): Promise<void> {
  // No-op: credentials are returned directly to the admin via the API response.
}
