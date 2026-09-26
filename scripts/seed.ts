/* =====================================================================
   Seed the prototype's mock data into Supabase (run once):
     npm run seed
   Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
   (service role bypasses RLS — never ship this key to the browser).
   ===================================================================== */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { buildSetupPayload, snakeAssign, teamAvg, type DraftTeam } from '../lib/engine';
import type { GroupConfig, PlayerRow } from '../lib/types';

// Minimal .env.local loader (no extra dependency)
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* rely on real env */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const sb = createClient(url, key, { auth: { persistSession: false } });

const CG = 'Nhóm Cầu Giấy';
const BDS = 'Nhóm BĐS Partner';
const ROSTER: [string, number, string, 'M' | 'F'][] = [
  ['Minh Tuấn', 3.5, CG, 'M'], ['Hoàng Nam', 4.2, BDS, 'M'], ['Quốc Anh', 3.0, CG, 'M'], ['Đức Thắng', 4.0, BDS, 'M'],
  ['Văn Hải', 3.8, CG, 'M'], ['Thành Long', 3.2, BDS, 'M'], ['Tiến Dũng', 4.5, BDS, 'M'], ['Bảo Khánh', 2.9, CG, 'M'],
  ['Trung Kiên', 3.6, CG, 'M'], ['Việt Hùng', 3.4, BDS, 'M'], ['Gia Huy', 4.1, CG, 'M'], ['Anh Khoa', 3.1, BDS, 'M'],
  ['Hữu Phước', 3.9, CG, 'M'], ['Công Sơn', 3.3, BDS, 'M'], ['Đình Phúc', 2.8, CG, 'M'], ['Mạnh Cường', 3.7, BDS, 'M'],
  ['Thu Hà', 3.3, CG, 'F'], ['Mai Linh', 3.7, BDS, 'F'], ['Ngọc Ánh', 3.0, CG, 'F'], ['Phương Thảo', 3.9, BDS, 'F'],
  ['Lan Anh', 3.5, CG, 'F'], ['Hồng Nhung', 3.2, BDS, 'F'],
];

// Pairs by roster index (1-based), exactly as in the prototype
const PAIRS: Record<string, number[][]> = {
  dn: [[7, 15], [2, 8], [11, 3], [4, 12], [13, 6], [5, 14], [16, 10], [9, 1]],
  dnn: [[5, 17], [1, 18], [9, 19], [10, 20], [14, 21], [16, 22]],
  don: [[7], [2], [11], [4], [13], [5]],
};
const EVENTS = [
  { code: 'dn', name: 'Đôi Nam', short_name: 'ĐN', match_format: 'doubles', group_config: { groupsEnabled: true, numGroups: 2, advance: 2 } },
  { code: 'dnn', name: 'Đôi Nam Nữ', short_name: 'ĐNN', match_format: 'doubles', group_config: { groupsEnabled: true, numGroups: 2, advance: 1 } },
  { code: 'don', name: 'Đơn Nam', short_name: 'ĐƠN', match_format: 'singles', group_config: { groupsEnabled: false, numGroups: 1, advance: 2 } },
] as const;
const DONE: Record<string, number> = { dn: 8, dnn: 4, don: 6 };

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const rnd = rng(2026);
  const { data: players, error: pe } = await sb
    .from('players')
    .insert(ROSTER.map(([name, rating, group_tag, gender]) => ({ name, rating, group_tag, gender })))
    .select('*');
  if (pe) throw pe;
  const byIdx = (i: number) => (players as PlayerRow[])[i - 1];
  const P = (players as PlayerRow[]).map((p) => ({ ...p, rating: Number(p.rating) }));

  const start = new Date();
  start.setHours(8, 0, 0, 0);
  const { data: t, error: te } = await sb
    .from('tournaments')
    .insert({
      title: 'Giải Pickleball Hà Nội Open 2026 - Mở Rộng',
      venue: 'CLB Pickleball Cầu Giấy',
      status: 'ongoing',
      format: 'group_knockout',
      starts_at: start.toISOString(),
      rules_config: { target: 11, winBy: 2, pointsPerWin: 2, tieBreakers: ['wins', 'h2h', 'diff', 'pf'], courts: ['Sân 1', 'Sân 2'] },
    })
    .select('*')
    .single();
  if (te) throw te;

  const liveCourts = ['Sân 1', 'Sân 2'];
  for (const [ei, e] of EVENTS.entries()) {
    const { data: ev, error: ee } = await sb.from('tournament_events').insert({ ...e, tournament_id: t.id, sort_order: ei }).select('*').single();
    if (ee) throw ee;
    const cfg = e.group_config as GroupConfig;

    let teams: DraftTeam[] = PAIRS[e.code].map((idx, i) => ({ key: `t${i + 1}`, pids: idx.map((n) => byIdx(n).id), group: null }));
    if (cfg.groupsEnabled) {
      const asg = snakeAssign(teams.map((x) => ({ id: x.key, pids: x.pids })), cfg.numGroups, P);
      teams = teams.map((x) => ({ ...x, group: asg[x.key] }));
    }
    const payload = buildSetupPayload({
      teams, config: cfg, players: P, start: new Date(start.getTime() + ei * 160 * 60_000), courts: 2, orderOffset: ei * 1000,
    });

    const groupIds: Record<string, string> = {};
    const teamIds: Record<string, string> = {};
    for (const [gi, g] of payload.groups.entries()) {
      const { data: gr, error: ge } = await sb.from('tournament_groups').insert({ tournament_id: t.id, event_id: ev.id, group_name: g.name, sort_order: gi }).select('*').single();
      if (ge) throw ge;
      groupIds[g.name] = gr.id;
      for (const tm of g.teams) {
        const { data: row, error: tErr } = await sb.from('group_teams').insert({ group_id: gr.id, player_1_id: tm.player_1_id, player_2_id: tm.player_2_id, team_name: tm.team_name, seed: tm.seed }).select('*').single();
        if (tErr) throw tErr;
        teamIds[tm.key] = row.id;
      }
    }

    const rows = payload.matches.map((m, i) => {
      const base = {
        tournament_id: t.id, event_id: ev.id, group_id: groupIds[m.group], team_a_id: teamIds[m.a], team_b_id: teamIds[m.b],
        round: m.round, match_order: m.order, scheduled_at: m.scheduled_at, match_type: 'group', status: 'upcoming' as string,
        score_a: 0, score_b: 0, court_name: null as string | null,
      };
      if (i < DONE[e.code]) {
        const A = teams.find((x) => x.key === m.a)!;
        const B = teams.find((x) => x.key === m.b)!;
        const pA = Math.min(0.85, Math.max(0.15, 0.5 + (teamAvg(A, P) - teamAvg(B, P)) * 0.9));
        const aWins = rnd() < pA;
        const lose = 2 + Math.floor(rnd() * 9);
        const win = lose >= 10 ? lose + 2 : 11;
        return { ...base, status: 'completed', score_a: aWins ? win : lose, score_b: aWins ? lose : win, completed_at: new Date().toISOString() };
      }
      if (i === DONE[e.code] && liveCourts.length && e.code !== 'don') {
        const court = liveCourts.shift()!;
        return { ...base, status: 'live', court_name: court, score_a: e.code === 'dn' ? 6 : 3, score_b: e.code === 'dn' ? 4 : 7, started_at: new Date().toISOString() };
      }
      return base;
    });
    const { error: me } = await sb.from('matches').insert(rows);
    if (me) throw me;
    console.log(`✓ ${e.name}: ${teams.length} đội, ${rows.length} trận`);
  }
  console.log(`\nĐã tạo giải: ${t.title}\nTV: /tv/${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
