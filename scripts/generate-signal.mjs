import { mkdir, writeFile } from "node:fs/promises";

const login = process.env.PROFILE_LOGIN || "Mistborn-01";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  throw new Error("Set GITHUB_TOKEN or GH_TOKEN before generating the contribution signal.");
}

const query = `
  query ProfileSignal($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": `${login}-profile-signal`,
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) {
  throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`No contribution calendar found for ${login}.`);
}

const weeks = calendar.weeks.slice(-53);
const counts = weeks.flatMap((week) => week.contributionDays.map((day) => day.contributionCount));
const max = Math.max(1, ...counts);
const colors = ["#171a24", "#312e81", "#4f46e5", "#7c3aed", "#c4b5fd"];
const levelFor = (count) => {
  if (count === 0) return 0;
  const normalized = count / max;
  if (normalized <= 0.25) return 1;
  if (normalized <= 0.5) return 2;
  if (normalized <= 0.75) return 3;
  return 4;
};

const cell = 12;
const gap = 4;
const left = 36;
const top = 78;
const width = 960;
const height = 224;
const cells = [];

weeks.forEach((week, weekIndex) => {
  week.contributionDays.forEach((day) => {
    const x = left + weekIndex * (cell + gap);
    const y = top + day.weekday * (cell + gap);
    const level = levelFor(day.contributionCount);
    cells.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colors[level]}">` +
        `<title>${day.date}: ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}</title>` +
      `</rect>`,
    );
  });
});

const refreshed = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date());

const signalSummary = calendar.totalContributions > 0
  ? `${calendar.totalContributions} public contributions · refreshed ${refreshed}`
  : `Public signal initializing · private work stays private`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${login} contribution signal</title>
  <desc id="description">Public GitHub contribution activity over the last year.</desc>
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1018" />
      <stop offset="0.55" stop-color="#111522" />
      <stop offset="1" stop-color="#171329" />
    </linearGradient>
    <radialGradient id="glow" cx="88%" cy="0%" r="70%">
      <stop offset="0" stop-color="#7c3aed" stop-opacity="0.22" />
      <stop offset="1" stop-color="#7c3aed" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect x="1" y="1" width="958" height="222" rx="18" fill="url(#panel)" stroke="#312e81" stroke-opacity="0.72" />
  <rect x="1" y="1" width="958" height="222" rx="18" fill="url(#glow)" />
  <text x="36" y="37" fill="#f5f3ff" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15" font-weight="700" letter-spacing="2">CONTRIBUTION SIGNAL</text>
  <text x="36" y="59" fill="#9ca3af" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12">${signalSummary}</text>
  ${cells.join("\n  ")}
  <text x="36" y="205" fill="#6b7280" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11">LESS</text>
  ${colors.map((color, index) => `<rect x="${76 + index * 20}" y="194" width="12" height="12" rx="3" fill="${color}" />`).join("\n  ")}
  <text x="181" y="205" fill="#6b7280" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11">MORE</text>
  <circle cx="906" cy="34" r="4" fill="#a78bfa" />
  <text x="918" y="38" fill="#a78bfa" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11" text-anchor="end">LIVE</text>
</svg>
`;

await mkdir(new URL("../assets/", import.meta.url), { recursive: true });
await writeFile(new URL("../assets/contribution-signal.svg", import.meta.url), svg, "utf8");
console.log(`Generated contribution signal for ${login}: ${calendar.totalContributions} contributions.`);
