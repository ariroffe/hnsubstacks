// @ts-nocheck
const LOCAL = false  // we should use an env variable for this, but I'm too lazy
const WORKER_URL = LOCAL ? "http://127.0.0.1:8787" : "https://worker.hnsubstacks.workers.dev";

export async function fetchStories(sort = "top") {
  const res = await fetch(`${WORKER_URL}/api/stories?sort=${sort}`);
  if (!res.ok) throw new Error("Failed to fetch stories");
  // await new Promise(resolve => setTimeout(resolve, 8000)); // debug: simulate slow network
  return res.json(); // has shape { hits: [...], updatedAt: "..." }
}

export async function submitDomain(domain) {
  try {
    const res = await fetch(`${WORKER_URL}/api/domains/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    return res.ok ? data : { error: data.error || "Something went wrong" };
  } catch {
    return { error: "Network error, please try again" };
  }
}

export async function flagDomain(domain) {
  try {
    const res = await fetch(`${WORKER_URL}/api/domains/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    return res.ok ? data : { error: data.error || "Something went wrong" };
  } catch {
    return { error: "Network error, please try again" };
  }
}