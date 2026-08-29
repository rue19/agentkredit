"use client";

import { useEffect, useState } from "react";

/*
  Wallet state is restored on the client, so anything that renders it must
  wait for mount or the server and client markup disagree.
*/
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
