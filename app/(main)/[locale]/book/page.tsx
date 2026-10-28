"use client";

// xenaxio step 56: public booking pages. The platform serves this page for
// every /book/… address (/book/<employee>/<type>, /book/manage/); the page
// reads the address itself and needs no sign-in.
import { BookingPage } from "@/components/xenaxio/booking-page";

export default function Page() {
  return <BookingPage />;
}
