"use client";

// xenaxio step 78: video meetings. The platform serves this page for every
// /meet/<code> address; the page reads the code itself. Guests need no account.
import { MeetingPage } from "@/components/xenaxio/meet/meeting-page";

export default function Page() {
  return <MeetingPage />;
}
