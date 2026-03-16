import { appendFileSync, writeFileSync } from "fs";

const EXPLORER_BASE = "https://explorer.solana.com/tx";
const LOG_FILE = "transactions.txt";

export function initTxLog(cluster: string) {
  const header = [
    `# Trolley — devnet transactions`,
    `# Cluster : ${cluster}`,
    `# Run at  : ${new Date().toISOString()}`,
    ``,
  ].join("\n");
  writeFileSync(LOG_FILE, header, "utf8");
}

export function logTx(description: string, signature: string, cluster: string) {
  const clusterParam =
    cluster === "localnet" ? "custom&customUrl=http%3A%2F%2Flocalhost%3A8899" : 'devnet';
  const url = `${EXPLORER_BASE}/${signature}?cluster=${clusterParam}`;
  appendFileSync(LOG_FILE, `${description} = ${url}\n`, "utf8");
}