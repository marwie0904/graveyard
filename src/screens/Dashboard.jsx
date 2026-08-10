import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis,
  ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import { DAY, fmt, nightAxis, nightTick } from "../time.js";
import { FONT_DISPLAY, FONT_TEXT, DOMAIN, tint } from "../tokens.js";
import { RANGES, rangeStats, readPatterns, dayOffsetOf } from "../stats.js";
import { Card, Btn, Display, RangeControl } from "../ui/index.jsx";
import { Info } from "../icons.jsx";

/* ============================================================================
   DASHBOARD

   One hero figure, one trio, then the lists. Everything on this screen is
   derived from the NightRecords handed in as `nights`, which arrive newest
   first: dayOffset 0 is tonight, dayOffset 1 is last night. A range is
   therefore the FRONT of that array, and the charts get a reversed copy so
   bars read oldest to newest, left to right.

   Nothing here is a score and nothing here is graded, so no figure is ever
   fabricated: a missing value prints as "-" and its meter is simply absent.
============================================================================ */

const num = (v, digits = 1) => (v === null || v === undefined ? "-" : v.toFixed(digits));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/* null, not 0, when the figure is unknown or has no denominator: an unlogged
   night must draw no meter at all, and 0/8 resets is a real empty meter while
   "no sleep logged" is not a meter at all. */
export const share = (a, b) =>
  (a === null || a === undefined || !b ? null : Math.min(1, a / b));

const CARD = { borderRadius: 16, marginBottom: 10 };

/* One figure: label, number, optional denominator, one thin meter. The number
   stays ink-coloured and the meter carries the domain hue, so size sets the
   hierarchy and colour only ever means "which part of the plan". */
function Stat({ T, hue, k, v, of, note, fill, big }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.muted, flex: 1 }}>{k}</span>
        {note && <span style={{ fontFamily: FONT_TEXT, fontSize: 11.5, color: T.faint }}>{note}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 3 }}>
        <span style={{
          fontFamily: FONT_DISPLAY, fontSize: big ? 27 : 18, fontWeight: 700,
          color: T.ink, letterSpacing: "-0.025em",
        }}>{v}</span>
        {of && (
          <span style={{
            fontFamily: FONT_TEXT, fontSize: big ? 14 : 12, color: T.faint,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>/ {of}</span>
        )}
      </div>
      {fill !== null && fill !== undefined && (
        <div style={{
          height: 5, borderRadius: 3, marginTop: 8, overflow: "hidden",
          background: tint(hue, 0.16),
        }}>
          <div style={{ width: `${Math.round(fill * 100)}%`, height: "100%", background: hue }} />
        </div>
      )}
    </div>
  );
}

function Head({ T, children, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "18px 4px 8px" }}>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, flex: 1 }}>
        {children}
      </span>
      {action && (
        <button onClick={onAction} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontFamily: FONT_TEXT, fontSize: 13, fontWeight: 600, color: DOMAIN.sleep.hue,
        }}>{action}</button>
      )}
    </div>
  );
}

function Panel({ T, title, sub, children, height = 150 }) {
  return (
    <Card T={T} style={{ ...CARD, padding: "13px 10px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 6px 8px" }}>
        <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600, color: T.ink }}>{title}</span>
        <span style={{
          fontFamily: FONT_TEXT, fontSize: 11.5, color: T.faint, flex: 1,
          textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{sub}</span>
      </div>
      <div style={{ height }}>{children}</div>
    </Card>
  );
}

/* one plain figure: what it is on the left, what it was on the right */
function Figure({ T, k, v }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 12, padding: "10px 2px",
      borderTop: `1px solid ${T.hair}`,
    }}>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, flex: 1 }}>{k}</span>
      <span style={{
        fontFamily: FONT_TEXT, fontSize: 13.5, fontWeight: 600, color: T.ink, textAlign: "right",
      }}>{v}</span>
    </div>
  );
}

/* One muted line under the hero: the single thing worth reading first. */
function Lead({ T, children }) {
  return (
    <p style={{
      fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.45, color: T.muted,
      margin: "0 4px 4px",
    }}>{children}</p>
  );
}

/* The next few things due tonight, so the home screen answers "what now?"
   without making the user cross to the Plan tab to find out. */
function MiniPlan({ T, plan, status, now, onOpenPlan }) {
  if (!plan || !plan.items || !plan.items.length) return null;
  const open = plan.items.filter((i) => status(i.id) === "open");
  const next = open.filter((i) => i.at >= now).slice(0, 3);
  const shown = next.length ? next : open.slice(-3);
  const doneCount = plan.items.length - open.length;
  if (!shown.length) return null;

  return (
    <>
      <Head T={T} action="See all" onAction={onOpenPlan}>
        {next.length ? "Coming up" : "Tonight so far"}
        <span style={{ fontWeight: 400, color: T.faint }}>{"  "}{doneCount}/{plan.items.length} done</span>
      </Head>
      <Card T={T} style={{ ...CARD, padding: "2px 14px" }}>
        {shown.map((it, k) => {
          const d = DOMAIN[it.category] || DOMAIN.shift;
          return (
            <div key={it.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 2px",
              borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: d.hue, flexShrink: 0 }} />
              <span style={{
                fontFamily: FONT_TEXT, fontSize: 14, color: T.ink, flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{it.title}</span>
              <span style={{
                fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 600, color: T.faint,
                fontVariantNumeric: "tabular-nums", flexShrink: 0,
              }}>{fmt(it.at)}</span>
            </div>
          );
        })}
      </Card>
    </>
  );
}

export default function Dashboard({
  T, profile, nights, rangeKey, setRangeKey, say, setProfile,
  plan, status, now, onOpenPlan,
}) {
  /* A number means one night off the strip, null means a multi-night window. */
  const off = dayOffsetOf(rangeKey);
  const spec = RANGES.find((r) => r.key === rangeKey) || RANGES[1];
  const goal = profile.sleepGoalHours;
  /* which offsets the strip can actually offer a record for */
  const have = new Set(nights.map((x) => x.dayOffset));

  /* One night means that night and only that night. Without a record the range
     is empty, which is the honest answer; it must never fall through to the
     night next to it. */
  const night = off === null ? null : nights.find((x) => x.dayOffset === off) || null;
  const hist = off === null
    ? nights.slice(0, spec.nights)
    : (night ? [night] : []);

  const st = rangeStats(profile, hist);
  const pat = readPatterns(profile, st);

  const rests = st.naps + st.quiets;

  /* ----------------------------- one night -------------------------------- */
  if (off !== null) {
    if (!night) {
      return (
        <div style={{ padding: "4px 20px 0" }}>
          <RangeControl T={T} value={rangeKey} onChange={setRangeKey} have={have} />
          <Display T={T} size={26} style={{ marginBottom: 8 }}>
            {off === 0 ? "Nothing logged yet." : "No record for this night."}
          </Display>
          <Lead T={T}>
            {off === 0
              ? "Log caffeine, water, rest, or your sleep and tonight will appear here."
              : "Nothing was logged that night, so there is nothing to read back."}
          </Lead>
        </div>
      );
    }

    const lateDrinks = night.cutoff === null
      ? 0
      : night.caffeine.filter((c) => nightAxis(c) >= nightAxis(night.cutoff)).length;
    const restTaken = night.restMin > 0 ? 1 : 0;

    return (
      <div style={{ padding: "4px 20px 0" }}>
        <RangeControl T={T} value={rangeKey} onChange={setRangeKey} have={have} />

        <Card T={T} style={{ ...CARD, padding: 15 }}>
          <Stat T={T} big hue={DOMAIN.sleep.hue} k="Sleep"
            note={night.sleepEstimated ? "estimated" : undefined}
            v={night.sleepHours === null ? "-" : `${num(night.sleepHours)}h`}
            of={`${goal}h goal`} fill={share(night.sleepHours, goal)} />
        </Card>

        <Card T={T} style={{ ...CARD, padding: 15, display: "flex", gap: 14 }}>
          <Stat T={T} hue={DOMAIN.caffeine.hue} k="Past cutoff"
            v={night.cutoff === null ? "-" : lateDrinks}
            of={night.cutoff === null ? "no cutoff" : plural(night.caffeine.length, "drink", "drinks")}
            fill={night.cutoff === null ? null : share(lateDrinks, night.caffeine.length)} />
          <Stat T={T} hue={DOMAIN.movement.hue} k="Resets"
            v={night.moveDone} of={night.moveTotal} fill={share(night.moveDone, night.moveTotal)} />
          <Stat T={T} hue={DOMAIN.recovery.hue} k="Rest"
            v={night.restMin > 0 ? `${night.restMin}m` : "-"}
            of={night.restKind === "nap" ? "nap" : night.restKind === "quiet" ? "quiet" : "none"}
            fill={restTaken ? 1 : null} />
        </Card>

        <Lead T={T}>One night on its own is a snapshot, not a pattern.</Lead>

        {/* the plan belongs to tonight, so it only shows on tonight */}
        {off === 0 && (
          <MiniPlan T={T} plan={plan} status={status} now={now} onOpenPlan={onOpenPlan} />
        )}

        <Head T={T}>In figures</Head>
        <Card T={T} style={{ ...CARD, padding: "0 15px 4px" }}>
          <Figure T={T} k="Caffeine"
            v={night.cutoff === null
              ? plural(night.caffeine.length, "drink", "drinks")
              : `${plural(night.caffeine.length, "drink", "drinks")}, cutoff ${fmt(night.cutoff)}`} />
          <Figure T={T} k="Water" v={plural(night.water, "log", "logs")} />
          <Figure T={T} k="Movement resets" v={`${night.moveDone} of ${night.moveTotal} done`} />
        </Card>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 7, margin: "14px 4px 8px",
          fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, lineHeight: 1.4,
        }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          Charts need more than one night. Pick a window from Trends to see them.
        </div>
      </div>
    );
  }

  /* ------------------------------- range ---------------------------------- */
  const chrono = [...hist].reverse();
  const thin = Math.max(0, Math.floor(hist.length / 7) - 1);
  const axis = { fill: T.faint, fontSize: 10, fontFamily: FONT_TEXT };
  const dayLabel = (h) => (h.dayOffset === 0 ? "Now" : `${h.dayOffset}d`);

  const sleep = chrono.filter((h) => h.sleepStart !== null && h.sleepHours !== null).map((h) => ({
    id: h.id, day: dayLabel(h), base: nightAxis(h.sleepStart), len: h.sleepHours * 60,
    hours: h.sleepHours, estimated: !!h.sleepEstimated,
  }));
  /* Math.min/Math.max over [] return +/-Infinity, which used to reach the DOM
     as <YAxis domain={[Infinity, -Infinity]}> and blank the chart. */
  const bases = sleep.map((d) => d.base);
  const lo = bases.length ? Math.min(...bases) - 40 : 0;
  const hi = bases.length ? Math.max(...sleep.map((d) => d.base + d.len)) + 40 : DAY;
  const anyEstimated = sleep.some((d) => d.estimated);

  const caff = chrono.map((h) => {
    const row = { day: dayLabel(h), cutoff: h.cutoff === null ? null : nightAxis(h.cutoff) };
    h.caffeine.slice(0, 5).forEach((c, k) => { row[`c${k + 1}`] = nightAxis(c); });
    return row;
  });

  return (
    <div style={{ padding: "4px 20px 0" }}>
      <RangeControl T={T} value={rangeKey} onChange={setRangeKey} have={have} />

      <Card T={T} style={{ ...CARD, padding: 15 }}>
        <Stat T={T} big hue={DOMAIN.sleep.hue} k="Average sleep"
          note={`${plural(st.n, "night", "nights")}`}
          v={st.avgSleep === null ? "-" : `${num(st.avgSleep)}h`}
          of={`${goal}h goal`} fill={share(st.avgSleep, goal)} />
      </Card>

      <Card T={T} style={{ ...CARD, padding: 15, display: "flex", gap: 14 }}>
        <Stat T={T} hue={DOMAIN.caffeine.hue} k="Past cutoff"
          v={st.lateCount} of={plural(st.n, "night", "nights")} fill={share(st.lateCount, st.n)} />
        <Stat T={T} hue={DOMAIN.movement.hue} k="Resets"
          v={st.movePct === null ? "-" : st.moveDone} of={st.moveTotal}
          fill={st.movePct === null ? null : st.movePct / 100} />
        <Stat T={T} hue={DOMAIN.recovery.hue} k="Rests"
          v={rests} of={rests + st.missed || undefined} fill={share(rests, rests + st.missed)} />
      </Card>

      <Lead T={T}>{pat.mainPattern}</Lead>

      <MiniPlan T={T} plan={plan} status={status} now={now} onOpenPlan={onOpenPlan} />

      <div style={{ height: 8 }} />
      <Panel T={T} title="When you slept" height={158}
        sub={anyEstimated ? "faded bars are estimated" : "start to wake"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sleep} margin={{ left: -18, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke={T.hair} vertical={false} />
            <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
            <YAxis domain={[lo, hi]} tickFormatter={nightTick} tick={axis}
              axisLine={false} tickLine={false} width={38} />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="len" stackId="a" radius={[4, 4, 4, 4]}>
              {/* keyed by night id, not index: the range changes length as the
                  user switches windows, and index keys would recolour bars */}
              {sleep.map((d) => (
                <Cell key={d.id} fill={d.estimated ? tint(DOMAIN.sleep.hue, 0.35)
                  : d.hours < 5 ? DOMAIN.food.hue : DOMAIN.sleep.hue} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel T={T} title="Caffeine against cutoff" sub="dots above the line landed late">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={caff} margin={{ left: -16, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke={T.hair} vertical={false} />
            <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
            <YAxis tickFormatter={nightTick} tick={axis} axisLine={false} tickLine={false} width={38} />
            <Line dataKey="cutoff" stroke={DOMAIN.sleep.hue} strokeWidth={1.6}
              strokeDasharray="5 5" dot={false} />
            {["c1", "c2", "c3", "c4", "c5"].map((k) => (
              <Line key={k} dataKey={k} stroke="none"
                dot={{ r: hist.length > 20 ? 2.8 : 4, fill: DOMAIN.caffeine.hue, strokeWidth: 0 }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <Head T={T}>What the plan noticed</Head>
      <Card T={T} style={{ ...CARD, padding: "0 15px 2px" }}>
        {pat.noticed.map((nn, k) => (
          <div key={nn} style={{
            display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 0",
            borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: 3, background: DOMAIN.recovery.hue,
              flexShrink: 0, marginTop: 7,
            }} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.ink, lineHeight: 1.45 }}>{nn}</span>
          </div>
        ))}
        <Figure T={T} k="Sleep window drift" v={st.spread === null ? "-" : `${num(st.spread)}h`} />
        <Figure T={T} k="Water per shift" v={st.waterAvg === null ? "-" : num(st.waterAvg)} />
      </Card>

      <Head T={T}>Next plan adjustment</Head>
      <Card T={T} style={{ ...CARD, padding: 15 }}>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.ink, margin: 0 }}>
          {pat.adjustment.text}
        </p>
        {pat.adjustment.apply && (
          <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
            <Btn T={T} style={{ flex: 1.4, fontSize: 14, padding: "12px 16px" }} onClick={() => {
              setProfile(pat.adjustment.apply(profile));
              say(pat.adjustment.done);
            }}>Apply to next plan</Btn>
            <Btn T={T} kind="quiet" style={{ flex: 1, fontSize: 14, padding: "12px 16px" }}
              onClick={() => say("Keeping your current plan.")}>Keep current</Btn>
          </div>
        )}
      </Card>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 7, margin: "14px 4px 8px",
        fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, lineHeight: 1.4,
      }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
        Nothing here is a score, and nothing here is graded.
      </div>
    </div>
  );
}
