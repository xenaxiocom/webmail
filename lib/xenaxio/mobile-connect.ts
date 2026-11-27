// Step 152 R1: the XenRooms app's sign-in request, as the platform's /api/mobile/authorize
// hands it to the page /mobile/connect (which companies go to the phone).

/** The only app that is sent here; anything else is not this page's request. */
export const ROOMS_APP = "xenrooms://auth/callback";

/** The app's request as the platform's sign-in received it; null when incomplete. */
export function readMobileRequest(query: URLSearchParams) {
  const redirect_uri = query.get("redirect_uri");
  const state = query.get("state");
  const code_challenge = query.get("code_challenge");
  const code_challenge_method = query.get("code_challenge_method");
  if (redirect_uri !== ROOMS_APP || !state || !code_challenge || code_challenge_method !== "S256") return null;
  const have = new Set((query.get("have") ?? "").split(",").filter(Boolean));
  return { request: { redirect_uri, state, code_challenge, code_challenge_method }, have };
}
