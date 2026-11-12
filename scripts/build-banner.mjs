import { readFile, writeFile } from 'node:fs/promises';

const LOGIN = process.env.GH_LOGIN || 'FranBas6';
const OUTPUT = new URL('../banner.svg', import.meta.url);
const FONT = new URL('./manrope-latin-variable.woff2', import.meta.url);
const DAY_MS = 86400000;

const QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    createdAt
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

const graphql = async (token, variables) => {
    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables }),
    });
    const body = await response.json();
    if (!response.ok || body.errors) {
        throw new Error(`GraphQL request failed: ${JSON.stringify(body.errors || body)}`);
    }
    return body.data.user;
};

const fetchDays = async (token) => {
    const now = new Date();
    const firstPage = await graphql(token, {
        login: LOGIN,
        from: new Date(now.getTime() - 364 * DAY_MS).toISOString(),
        to: now.toISOString(),
    });
    const days = new Map();
    const firstYear = new Date(firstPage.createdAt).getUTCFullYear();
    for (let year = firstYear; year <= now.getUTCFullYear(); year++) {
        const page = await graphql(token, {
            login: LOGIN,
            from: `${year}-01-01T00:00:00Z`,
            to: year === now.getUTCFullYear() ? now.toISOString() : `${year}-12-31T23:59:59Z`,
        });
        for (const week of page.contributionsCollection.contributionCalendar.weeks) {
            for (const day of week.contributionDays) {
                days.set(day.date, day.contributionCount);
            }
        }
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
};

const readDaysFile = async (path) => {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
};

const isoDay = (date) => date.toISOString().slice(0, 10);

export const computeStats = (days, today = isoDay(new Date())) => {
    const pastDays = days.filter(([date]) => date <= today);
    const yearAgo = new Date(`${today}T00:00:00Z`);
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    yearAgo.setUTCDate(yearAgo.getUTCDate() - yearAgo.getUTCDay());
    const windowStart = isoDay(yearAgo);
    const lastYear = pastDays.filter(([date]) => date >= windowStart);

    let longest = 0;
    let run = 0;
    for (const [, count] of pastDays) {
        run = count > 0 ? run + 1 : 0;
        longest = Math.max(longest, run);
    }

    let current = 0;
    const reversed = [...pastDays].reverse();
    const startIndex = reversed[0]?.[1] > 0 ? 0 : 1;
    for (const [, count] of reversed.slice(startIndex)) {
        if (count === 0) {
            break;
        }
        current++;
    }

    return {
        contributions: lastYear.reduce((sum, [, count]) => sum + count, 0),
        currentStreak: current,
        longestStreak: longest,
        activeDays: lastYear.filter(([, count]) => count > 0).length,
    };
};

const makeCodeLines = (seed) => {
    let state = seed;
    const random = () => (state = (state * 9301 + 49297) % 233280) / 233280;
    const palette = ['#c792ea', '#82aaff', '#89ddff', '#c3e88d', '#f78c6c', '#ffcb6b', '#4b5a7a'];
    const lines = [];
    let indent = 0;
    for (let i = 0; i < 16; i++) {
        if (random() < 0.12) {
            lines.push({ indent: 0, tokens: [] });
            continue;
        }
        const tokens = Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({
            width: 8 + Math.floor(random() * 34),
            color: palette[Math.floor(random() * palette.length)],
        }));
        lines.push({ indent: indent * 10, tokens });
        const move = random();
        if (move < 0.3 && indent < 3) {
            indent++;
        } else if (move > 0.72 && indent > 0) {
            indent--;
        }
    }
    return lines;
};

const monitorFrame = (x, id) => `
    <rect x="${x + 123}" y="258" width="14" height="32" fill="url(#stand)"/>
    <rect x="${x + 95}" y="288" width="70" height="6" rx="3" fill="#1d2342"/>
    <rect class="screen-glow" x="${x}" y="92" width="260" height="166" rx="6" fill="#161b30" filter="url(#glow)"/>
    <rect x="${x}" y="92" width="260" height="166" rx="6" fill="#161b30"/>
    <rect x="${x + 5}" y="97" width="250" height="156" rx="3" fill="#0b0f1f"/>
    <rect x="${x + 5}" y="97" width="250" height="12" fill="#0f1428"/>
    <rect x="${x + 33}" y="100" width="46" height="9" fill="#0b0f1f"/>
    <rect x="${x + 33}" y="100" width="46" height="1" fill="#7f8cff"/>
    <rect x="${x + 83}" y="100" width="40" height="9" fill="#0d1224"/>
    <clipPath id="${id}"><rect x="${x + 5}" y="97" width="250" height="156" rx="3"/></clipPath>`;

const codeScreen = (x) => {
    const lines = makeCodeLines(7);
    let cursor = { x: x + 30, y: 116 };
    const rows = lines.map((line, index) => {
        const y = 116 + index * 9;
        let tokenX = x + 31 + line.indent;
        const tokens = line.tokens.map((token) => {
            const rect = `<rect x="${tokenX}" y="${y}" width="${token.width}" height="4" rx="2" fill="${token.color}"/>`;
            tokenX += token.width + 4;
            return rect;
        }).join('');
        if (line.tokens.length) {
            cursor = { x: tokenX, y: y - 1 };
        }
        return `<rect x="${x + 9}" y="${y}" width="14" height="3" rx="1" fill="#273052"/>`
            + `<g class="ln" style="animation-delay:${(index * 0.45).toFixed(2)}s">${tokens}</g>`;
    }).join('\n      ');
    return `<g clip-path="url(#code-clip)">
      ${rows}
      <rect class="cursor" x="${cursor.x}" y="${cursor.y}" width="2" height="6" fill="#eef0fb"/>
    </g>`;
};

const formatNumber = (value) => value.toLocaleString('en-GB');

const statsScreen = (x, stats) => {
    const cells = [
        { value: formatNumber(stats.contributions), unit: '', label: 'contributions', color: '#82aaff' },
        { value: formatNumber(stats.activeDays), unit: '', label: 'active days', color: '#c3e88d' },
        { value: formatNumber(stats.currentStreak), unit: stats.currentStreak === 1 ? ' day' : ' days', label: 'current streak', color: '#ffcb6b' },
        { value: formatNumber(stats.longestStreak), unit: stats.longestStreak === 1 ? ' day' : ' days', label: 'longest streak', color: '#c792ea' },
    ];
    const grid = cells.map((cell, index) => {
        const cellX = x + 16 + (index % 2) * 112;
        const cellY = 145 + Math.floor(index / 2) * 45;
        return `<g class="stat" style="animation-delay:${(0.3 + index * 0.15).toFixed(2)}s">
        <circle cx="${cellX + 3}" cy="${cellY - 7}" r="2.5" fill="${cell.color}"/>
        <text x="${cellX + 10}" y="${cellY}" class="num">${cell.value}<tspan class="unit">${cell.unit}</tspan></text>
        <text x="${cellX + 10}" y="${cellY + 14}" class="label">${cell.label}</text>
      </g>`;
    }).join('\n      ');
    return `<g clip-path="url(#stats-clip)">
      <text x="${x + 16}" y="122" class="caption">LAST 12 MONTHS</text>
      ${grid}
    </g>`;
};

const lampAndDesk = `
    <polygon class="beam" points="923.7,186.1 950.3,215.9 905,297 765,297" fill="url(#beam)"/>
    <ellipse class="beam" cx="835" cy="298" rx="95" ry="13" fill="url(#pool)"/>
    <rect x="738" y="287" width="104" height="9" rx="2.5" fill="#151a33"/>
    <rect x="738" y="287" width="104" height="1.5" rx="0.75" fill="#ffcf96" opacity="0.45"/>
    <g fill="#232a4d">
      <rect x="770" y="290" width="8" height="3" rx="1"/><rect x="781" y="290" width="8" height="3" rx="1"/>
      <rect x="792" y="290" width="8" height="3" rx="1"/><rect x="803" y="290" width="8" height="3" rx="1"/>
      <rect x="814" y="290" width="8" height="3" rx="1"/><rect x="825" y="290" width="12" height="3" rx="1"/>
    </g>
    <ellipse cx="866" cy="292" rx="9" ry="5" fill="#1a1f3a"/>
    <path d="M858 290 Q866 285 874 290" stroke="#ffcf96" stroke-width="1.2" fill="none" opacity="0.6"/>
    <ellipse cx="1000" cy="295" rx="24" ry="5" fill="#1c1a2a"/>
    <path d="M1000 293 L1016 222" stroke="#24223a" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M1016 222 L972 172" stroke="#24223a" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="1016" cy="222" r="4" fill="#2e2b46"/>
    <polygon points="963.2,164.2 976.6,179.2 950.3,215.9 923.7,186.1" fill="url(#shade)" stroke="#45406a" stroke-width="1"/>
    <circle cx="972" cy="172" r="4" fill="#2e2b46"/>
    <ellipse class="bulb" cx="937" cy="201" rx="22" ry="7" fill="#ffb46b" opacity="0.28" transform="rotate(48.2 937 201)"/>
    <ellipse cx="937" cy="201" rx="19" ry="3.2" fill="#ffe2b4" transform="rotate(48.2 937 201)"/>`;

const mug = `
    <rect x="455" y="276" width="16" height="20" rx="3" fill="#232044"/>
    <path d="M471 280 h4 a5 5 0 0 1 0 10 h-4" stroke="#252845" stroke-width="2" fill="none"/>
    <rect x="469" y="276" width="2" height="20" fill="#82a0ff" opacity="0.35"/>
    <path class="steam" d="M460 270 q-4 -6 0 -12 q4 -6 0 -12" stroke="#b8bedb" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path class="steam" style="animation-delay:1.6s" d="M466 270 q4 -6 0 -12 q-4 -6 0 -12" stroke="#b8bedb" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

const person = `
    <g transform="translate(-3 0)">
      <path d="M592 300 Q596 268 632 262 L748 262 Q784 268 788 300 L788 330 L592 330 Z" fill="#0b0e20"/>
      <path d="M606 290 Q612 270 640 266" stroke="#7d9bff" stroke-width="2" fill="none" opacity="0.45"/>
      <path d="M774 290 Q768 270 740 266" stroke="#ffb36b" stroke-width="2" fill="none" opacity="0.35"/>
      <circle cx="690" cy="232" r="30" fill="#0a0c17"/>
      <path d="M661 224 Q664 196 692 194 Q720 196 721 224 Q708 208 690 210 Q672 210 661 224 Z" fill="#05060d"/>
      <path d="M663 238 Q660 214 676 202" stroke="#8ca2ff" stroke-width="2" fill="none" opacity="0.55"/>
      <path d="M718 238 Q721 216 706 203" stroke="#ffb36b" stroke-width="1.5" fill="none" opacity="0.3"/>
      <path d="M656 232 Q654 186 690 184 Q726 186 724 232" stroke="#1a1f38" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M660 220 Q662 190 690 188 Q718 190 720 220" stroke="#c792ea" stroke-width="1.5" fill="none" opacity="0.5"/>
      <rect x="644" y="222" width="18" height="32" rx="8" fill="#1a1f38"/>
      <rect x="718" y="222" width="18" height="32" rx="8" fill="#1a1f38"/>
      <rect class="led" x="646" y="226" width="4" height="24" rx="2" fill="#89ddff"/>
      <rect class="led" style="animation-delay:1.5s" x="730" y="226" width="4" height="24" rx="2" fill="#c792ea"/>
      <ellipse class="led" cx="648" cy="238" rx="10" ry="16" fill="#89ddff" opacity="0.14"/>
      <ellipse class="led" style="animation-delay:1.5s" cx="732" cy="238" rx="10" ry="16" fill="#c792ea" opacity="0.14"/>
      <path d="M612 396 L614 300 Q616 258 652 252 L666 252 Q690 262 714 252 L728 252 Q764 258 766 300 L768 396 Z" fill="url(#chair)"/>
      <path d="M622 396 L624 304 Q626 270 656 264" stroke="#7d5cff" stroke-width="5" fill="none" opacity="0.55"/>
      <path d="M758 396 L756 304 Q754 270 724 264" stroke="#7d5cff" stroke-width="5" fill="none" opacity="0.55"/>
      <path d="M652 252 Q690 270 728 252" stroke="#2a3360" stroke-width="2" fill="none"/>
      <rect x="664" y="300" width="52" height="20" rx="6" fill="#161b38"/>
      <path d="M676 310 h28" stroke="#7d5cff" stroke-width="2" opacity="0.6"/>
      <rect x="574" y="336" width="44" height="10" rx="5" fill="#10132b"/>
      <rect x="762" y="336" width="44" height="10" rx="5" fill="#10132b"/>
    </g>`;

export const renderBanner = (stats, fontBase64) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" width="1200" height="420" role="img" aria-labelledby="title desc">
  <title id="title">Francisco José Bas Guil · Full stack Software Developer</title>
  <desc id="desc">Night desk scene. One monitor types code, the other shows ${formatNumber(stats.contributions)} contributions in the last 12 months, ${formatNumber(stats.activeDays)} active days, a ${stats.currentStreak}-day current streak and a ${stats.longestStreak}-day longest streak.</desc>
  <style>
    @font-face { font-family: 'Manrope'; src: url(data:font/woff2;base64,${fontBase64}) format('woff2'); font-weight: 200 800; }
    text { font-family: 'Manrope', 'Segoe UI', sans-serif; }
    .num { font-size: 24px; font-weight: 800; fill: #eef0fb; }
    .unit { font-size: 12px; font-weight: 600; fill: #b8bedb; }
    .label { font-size: 11px; font-weight: 600; fill: #8f96b8; }
    .caption { font-size: 8px; font-weight: 700; fill: #6a7299; letter-spacing: 0.12em; }
    .ln { transform-box: fill-box; transform-origin: left center; animation: type 16s ease-out infinite backwards; }
    .cursor { animation: blink 1.1s steps(1) infinite; }
    .stat { animation: fade 0.8s ease-out backwards; }
    .beam { animation: breathe 7s ease-in-out infinite; }
    .bulb { animation: flicker 7s ease-in-out infinite; }
    .led { animation: pulse 3.2s ease-in-out infinite; }
    .screen-glow { animation: breathe 9s ease-in-out infinite; }
    .steam { opacity: 0; animation: steam 3.2s ease-out infinite; }
    @keyframes type { 0% { transform: scaleX(0); } 4% { transform: scaleX(1); } 82% { opacity: 1; } 92%, 100% { opacity: 0; transform: scaleX(1); } }
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } }
    @keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.72; } }
    @keyframes flicker { 0%, 100% { opacity: 0.28; } 50% { opacity: 0.4; } }
    @keyframes pulse { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.35; } }
    @keyframes steam { 0% { opacity: 0; transform: translateY(4px); } 30% { opacity: 0.45; } 100% { opacity: 0; transform: translateY(-14px); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .steam { opacity: 0.3; } }
  </style>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0" stop-color="#0a0f24"/><stop offset="0.45" stop-color="#120d2b"/><stop offset="0.7" stop-color="#0b0a1c"/><stop offset="1" stop-color="#06060f"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#466eff" stop-opacity="0.3"/><stop offset="0.55" stop-color="#5a3cc8" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="warm" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffaa5a" stop-opacity="0.2"/><stop offset="0.6" stop-color="#ff8c46" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="deskTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141a33"/><stop offset="0.3" stop-color="#0a0d1c"/><stop offset="1" stop-color="#07080f"/>
    </linearGradient>
    <linearGradient id="deskLight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6e8cff" stop-opacity="0"/><stop offset="0.3" stop-color="#6e8cff" stop-opacity="0.12"/><stop offset="0.55" stop-color="#6e8cff" stop-opacity="0.12"/><stop offset="0.85" stop-color="#ffaa5a" stop-opacity="0.14"/><stop offset="1" stop-color="#ffaa5a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="stand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#141933"/><stop offset="0.5" stop-color="#232a4a"/><stop offset="1" stop-color="#141933"/>
    </linearGradient>
    <linearGradient id="beam" gradientUnits="userSpaceOnUse" x1="937" y1="201" x2="835" y2="296">
      <stop offset="0" stop-color="#ffd7a0" stop-opacity="0.3"/><stop offset="1" stop-color="#ffb46b" stop-opacity="0.06"/>
    </linearGradient>
    <radialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffc98a" stop-opacity="0.55"/><stop offset="0.6" stop-color="#ffb46b" stop-opacity="0.16"/><stop offset="1" stop-color="#ffb46b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34304c"/><stop offset="1" stop-color="#1a1828"/>
    </linearGradient>
    <linearGradient id="chair" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#07080f"/><stop offset="0.5" stop-color="#10132b"/><stop offset="1" stop-color="#07080f"/>
    </linearGradient>
    <linearGradient id="fadeRight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#06060f" stop-opacity="0"/><stop offset="0.25" stop-color="#06060f" stop-opacity="0.85"/><stop offset="0.5" stop-color="#06060f"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.42" cy="0.4" r="0.75">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="22" flood-color="#5082ff" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="1200" height="420" fill="url(#sky)"/>
  <g transform="translate(-476 -40) scale(1.3)">
    <ellipse cx="686" cy="140" rx="400" ry="320" fill="url(#halo)"/>
    <ellipse cx="850" cy="295" rx="150" ry="125" fill="url(#warm)"/>
    <rect x="330" y="296" width="740" height="100" fill="url(#deskTop)"/>
    <rect x="330" y="296" width="740" height="2" fill="#2a3360"/>
    <rect x="330" y="298" width="740" height="40" fill="url(#deskLight)"/>
    ${monitorFrame(420, 'code-clip')}
    ${monitorFrame(694, 'stats-clip')}
    ${codeScreen(420)}
    ${statsScreen(694, stats)}
    ${mug}
    ${lampAndDesk}
    ${person}
  </g>
  <rect x="800" y="0" width="400" height="420" fill="url(#fadeRight)"/>
  <rect width="1200" height="420" fill="url(#vignette)"/>
  <text x="874" y="182" style="font-size:32px;font-weight:800;fill:#ffffff;letter-spacing:-0.02em">Software Developer</text>
  <text x="877" y="216" style="font-size:22px;font-weight:600;fill:#a5b4fc">Full Stack</text>
  <text x="877" y="250" style="font-size:15px;font-weight:500;fill:#c3c8d6">Web &amp; mobile development · AI integration</text>
</svg>
`;

const main = async () => {
    const daysFile = process.argv.indexOf('--days');
    const days = daysFile > -1
        ? await readDaysFile(process.argv[daysFile + 1])
        : await fetchDays(process.env.GITHUB_TOKEN);
    const today = process.env.STATS_TODAY || isoDay(new Date());
    const stats = computeStats(days, today);
    const font = (await readFile(FONT)).toString('base64');
    await writeFile(OUTPUT, renderBanner(stats, font));
    console.log(JSON.stringify({ today, ...stats }));
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
