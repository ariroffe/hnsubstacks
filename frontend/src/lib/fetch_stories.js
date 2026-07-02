const WORKER_URL = "https://worker.hnsubstacks.workers.dev";

export async function fetchStories(sort = "top") {
  const res = await fetch(`${WORKER_URL}/api/stories?sort=${sort}`);
  if (!res.ok) throw new Error("Failed to fetch stories");
  await new Promise(resolve => setTimeout(resolve, 80000)); // debug: simulate slow network
  return res.json(); // has shape { hits: [...], updatedAt: "..." }
}
