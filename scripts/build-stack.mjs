import { readFile, writeFile } from 'node:fs/promises';

const OUTPUT = new URL('../stack.svg', import.meta.url);
const FONT = new URL('./manrope-latin-variable.woff2', import.meta.url);
const WIDTH = 1000;
const PILL_HEIGHT = 34;
const GAP = 10;
const PADDING_X = 14;
const DOT_SPACE = 16;

const GROUPS = [
    { label: 'Backend', color: '#82aaff', items: ['Laravel', 'PHP', 'Livewire', 'MariaDB', 'PostgreSQL'] },
    { label: 'Mobile', color: '#c3e88d', items: ['Flutter', 'Dart', 'Firebase'] },
    { label: 'Frontend', color: '#ffcb6b', items: ['TypeScript', 'JavaScript', 'React', 'Astro', 'Tailwind CSS'] },
    { label: 'AI', color: '#c792ea', items: ['LLMs', 'OCR', 'Google ML Kit', 'Claude Code', 'MCP'] },
    { label: 'Quality & tools', color: '#f78c6c', items: ['PHPUnit', 'Vitest', 'pgTAP', 'Git', 'Docker'] },
];

const TEXT_WIDTHS = {
    Laravel: 50.9, PHP: 29.5, Livewire: 58.7, MariaDB: 59.3, PostgreSQL: 85, Flutter: 47.5, Dart: 31,
    Firebase: 61, TypeScript: 77.7, JavaScript: 75.1, React: 42, Astro: 39, 'Tailwind CSS': 92.5,
    LLMs: 36.6, OCR: 31.8, 'Google ML Kit': 97.5, 'Claude Code': 91.9, MCP: 33.1, PHPUnit: 59.7,
    Vitest: 42.4, pgTAP: 45.5, Git: 21.2, Docker: 50.5, Backend: 61.1, Mobile: 47.9, Frontend: 64.7,
    AI: 13.8, 'Quality & tools': 103.3,
};

const escape = (text) => text.replace(/&/g, '&amp;');

const layoutPills = () => {
    const pills = [];
    let x = 0;
    let y = 0;
    for (const group of GROUPS) {
        for (const item of group.items) {
            const width = TEXT_WIDTHS[item] + PADDING_X * 2 + DOT_SPACE;
            if (x > 0 && x + width > WIDTH) {
                x = 0;
                y += PILL_HEIGHT + GAP;
            }
            pills.push({ item, color: group.color, x, y, width });
            x += width + GAP;
        }
    }
    return { pills, height: y + PILL_HEIGHT };
};

const render = (fontBase64) => {
    const { pills, height } = layoutPills();
    const legendY = height + 30;
    let legendX = 2;
    const legend = GROUPS.map((group) => {
        const entry = `<circle cx="${legendX + 4}" cy="${legendY - 4.5}" r="4" fill="${group.color}"/>`
            + `<text x="${legendX + 14}" y="${legendY}" class="legend">${escape(group.label)}</text>`;
        legendX += 14 + TEXT_WIDTHS[group.label] * (13 / 15) + 24;
        return entry;
    }).join('');
    const body = pills.map((pill) => `<g transform="translate(${pill.x.toFixed(1)} ${pill.y})">
    <rect width="${pill.width.toFixed(1)}" height="${PILL_HEIGHT}" rx="${PILL_HEIGHT / 2}" fill="#161a38" stroke="#2a3060"/>
    <circle cx="${PADDING_X + 4}" cy="${PILL_HEIGHT / 2}" r="4" fill="${pill.color}"/>
    <text x="${PADDING_X + DOT_SPACE}" y="${PILL_HEIGHT / 2 + 5}" class="pill">${escape(pill.item)}</text>
  </g>`).join('\n  ');
    const totalHeight = legendY + 8;
    const names = GROUPS.flatMap((group) => group.items).join(', ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${WIDTH + 2} ${totalHeight + 2}" width="${WIDTH + 2}" height="${totalHeight + 2}" role="img" aria-labelledby="title">
  <title id="title">Stack: ${escape(names)}</title>
  <style>
    @font-face { font-family: 'Manrope'; src: url(data:font/woff2;base64,${fontBase64}) format('woff2'); font-weight: 200 800; }
    text { font-family: 'Manrope', 'Segoe UI', sans-serif; }
    .pill { font-size: 15px; font-weight: 600; fill: #eef0fb; }
    .legend { font-size: 13px; font-weight: 600; fill: #737a9c; }
  </style>
  ${body}
  ${legend}
</svg>
`;
};

const font = (await readFile(FONT)).toString('base64');
await writeFile(OUTPUT, render(font));
